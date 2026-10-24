const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const INSTALLER = path.resolve(__dirname, '..', '..', '..', 'installer_workspace.py');

const PROBE = String.raw`
import ast, sys
path = sys.argv[1]
tree = ast.parse(open(path, encoding="utf-8").read())
wanted = {"_is_own_service_principal", "_app_service_principal_ids", "_deletable_service_principals"}
module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted], type_ignores=[])
ns = {}
exec(compile(module, path, "exec"), ns)
pages = {
    "/api/2.0/apps": {"apps": [{"name": "inspire-ai", "service_principal_client_id": "MEHDI"},
                               {"name": "inspire-ai-v130", "service_principal_client_id": "LIVE"}],
                      "next_page_token": "p2"},
    "/api/2.0/apps?page_token=p2": {"apps": [{"name": "other", "service_principal_client_id": "OTHER"}, {"name": "no-sp"}]},
}
in_use = ns["_app_service_principal_ids"](lambda p: pages[p])
assert in_use == {"MEHDI", "LIVE", "OTHER"}, in_use
sps = [{"displayName": "app-p50o0f inspire-ai-v130", "applicationId": "LIVE", "id": "1"},
       {"displayName": "app-p50o0f inspire-ai-v130", "applicationId": "STALE", "id": "2"},
       {"displayName": "app-p50o0f inspire-ai", "applicationId": "MEHDI", "id": "3"},
       {"displayName": "inspire-ai-v130-sp", "applicationId": "OLD", "id": "4"},
       {"displayName": "inspire-ai-cicd", "applicationId": "CICD", "id": "5"}]
deletable = ns["_deletable_service_principals"](sps, "inspire-ai-v130", "inspire-ai-v130-sp", in_use)
assert [sp["id"] for sp in deletable] == ["2", "4"], deletable
assert ns["_deletable_service_principals"](sps, "inspire-ai-v130", "inspire-ai-v130-sp", None) == []
print("ok")
`;

test('the installer never deletes a service principal an existing app still uses', (t) => {
  if (spawnSync('python3', ['--version']).status !== 0) {
    t.skip('python3 is not installed');
    return;
  }
  const run = spawnSync('python3', ['-c', PROBE, INSTALLER], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), 'ok');
});

const GRANTS_PROBE = String.raw`
import ast, sys, types
path = sys.argv[1]
tree = ast.parse(open(path, encoding="utf-8").read())
module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "step_grant_permissions"], type_ignores=[])
class StatementState:
    SUCCEEDED = "SUCCEEDED"
executed = []
class Statements:
    def execute_statement(self, warehouse_id, statement, wait_timeout):
        executed.append(statement)
        return types.SimpleNamespace(status=types.SimpleNamespace(state=StatementState.SUCCEEDED, error=None))
class Catalogs:
    def list(self):
        return [types.SimpleNamespace(name="sales"), types.SimpleNamespace(name="samples")]
ns = {"StatementState": StatementState}
exec(compile(module, path, "exec"), ns)
ctx = {"NEW_SP_APP_ID": "SP", "WAREHOUSE_ID": "wh", "CATALOG": "main", "SCHEMA": "_inspire", "available_catalogs": ["main"],
       "w": types.SimpleNamespace(statement_execution=Statements(), catalogs=Catalogs()),
       "api": lambda method, url, body=None: types.SimpleNamespace(status_code=200, text="")}
ns["step_grant_permissions"](ctx)
volume = sorted(s for s in executed if "VOLUME" in s)
assert volume == sorted(f"GRANT {p} VOLUME ON SCHEMA \x60main\x60.\x60_inspire\x60 TO \x60SP\x60" for p in ("CREATE", "READ", "WRITE")), volume
assert "GRANT MODIFY ON SCHEMA \x60main\x60.\x60_inspire\x60 TO \x60SP\x60" in executed, executed
assert "GRANT BROWSE ON CATALOG \x60sales\x60 TO \x60SP\x60" in executed, executed
assert not [s for s in executed if "samples" in s], executed
print("ok")
`;

const BUNDLE_PROBE = String.raw`
import ast, os, sys, tempfile, types, zipfile
path = sys.argv[1]
tree = ast.parse(open(path, encoding="utf-8").read())
wanted = {"_folder_has_app_yaml", "_normalize_bundle_root", "_unpack_bundle", "_remove_old_bundles"}
module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted], type_ignores=[])
import shutil, time
ns = {"os": os, "shutil": shutil, "time": time, "zipfile": zipfile, "print": lambda *a, **k: None}
exec(compile(module, path, "exec"), ns)
work = tempfile.mkdtemp()
bundle = os.path.join(work, "bundle.zip")
with zipfile.ZipFile(bundle, "w") as zf:
    zf.writestr("app/app.yaml", "command: [node]\n")
    zf.writestr("app/backend/server.js", "x")
root = os.path.join(work, "InspireAI")
first = ns["_unpack_bundle"](bundle, root, stage=os.path.join(work, "stage"))
second = ns["_unpack_bundle"](bundle, root, stage=os.path.join(work, "stage"))
assert first != second and os.path.basename(first).startswith("bundle_"), (first, second)
assert os.path.exists(os.path.join(first, "app.yaml")) and os.path.exists(os.path.join(second, "backend", "server.js"))
empty = os.path.join(work, "empty.zip")
with zipfile.ZipFile(empty, "w") as zf:
    zf.writestr("readme.txt", "no app")
try:
    ns["_unpack_bundle"](empty, root, stage=os.path.join(work, "stage"))
except FileNotFoundError as exc:
    assert "No app.yaml" in str(exc), exc
else:
    raise AssertionError("a zip without app.yaml must stop the install")
deleted = []
def delete(p, recursive=False):
    if p.endswith("broken"):
        raise RuntimeError("permission denied")
    deleted.append(p)
entries = [types.SimpleNamespace(path=p) for p in ("/Users/me/InspireAI/bundle_1", "/Users/me/InspireAI/bundle_2",
                                                   "/Users/me/InspireAI/app.yaml", "/Users/me/InspireAI/broken")]
w = types.SimpleNamespace(workspace=types.SimpleNamespace(list=lambda p: entries if p == "/Users/me/InspireAI" else [], delete=delete))
removed = ns["_remove_old_bundles"](w, "/Workspace/Users/me/InspireAI", "/Workspace/Users/me/InspireAI/bundle_2")
assert removed == deleted == ["/Users/me/InspireAI/bundle_1", "/Users/me/InspireAI/app.yaml"], removed
def unlistable(p):
    raise RuntimeError("not found")
quiet = types.SimpleNamespace(workspace=types.SimpleNamespace(list=unlistable, delete=delete))
assert ns["_remove_old_bundles"](quiet, "/Workspace/Users/me/InspireAI", "/x/bundle_2") == []
print("ok")
`;

const MAIN_PROBE = String.raw`
import ast, sys, types
path = sys.argv[1]
tree = ast.parse(open(path, encoding="utf-8").read())
entry = [n for n in tree.body if isinstance(n, ast.Try) and any(
    isinstance(s, ast.Expr) and isinstance(s.value, ast.Call) and getattr(s.value.func, "id", "") == "main" for s in n.body)]
assert len(entry) == 1, "one main entry point"
shown = []
class HTTPError(Exception):
    pass
def failing_main():
    raise RuntimeError("Deploy FAILED: app did not start")
ns = {"main": failing_main, "show_warning_banner": lambda title, detail: shown.append((title, detail)),
      "requests": types.SimpleNamespace(exceptions=types.SimpleNamespace(HTTPError=HTTPError))}
try:
    exec(compile(ast.Module(body=entry, type_ignores=[]), path, "exec"), ns)
except RuntimeError as exc:
    assert "Deploy FAILED" in str(exc)
else:
    raise AssertionError("a failed install must fail the job, not end as a success")
assert shown == [("Setup incomplete", "Deploy FAILED: app did not start")], shown
print("ok")
`;

for (const [name, probe] of [
  ['a reinstall unpacks into a new bundle folder and removes the older ones through the API', BUNDLE_PROBE],
  ['an incomplete install shows its banner and fails the job', MAIN_PROBE],
]) {
  test(name, (t) => {
    if (spawnSync('python3', ['--version']).status !== 0) {
      t.skip('python3 is not installed');
      return;
    }
    const run = spawnSync('python3', ['-c', probe, INSTALLER], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(run.stdout.trim().split('\n').pop(), 'ok');
  });
}

test('the installer lets the app service principal create, read and write volumes in the Inspire schema only', (t) => {
  if (spawnSync('python3', ['--version']).status !== 0) {
    t.skip('python3 is not installed');
    return;
  }
  const run = spawnSync('python3', ['-c', GRANTS_PROBE, INSTALLER], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(run.stdout.trim().split('\n').pop(), 'ok');
});
