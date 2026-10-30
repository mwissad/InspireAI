const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const INSTALLER = path.resolve(__dirname, '..', '..', '..', 'installer_workspace.py');

const PROBE = String.raw`
import ast, sys
path = sys.argv[1]
tree = ast.parse(open(path, encoding="utf-8").read())
wanted = {"_is_own_service_principal", "_list_apps", "_app_service_principal_ids", "_deletable_service_principals"}
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
sps = [{"displayName": "app-q7k2m9 inspire-ai-v130", "applicationId": "LIVE", "id": "1"},
       {"displayName": "app-q7k2m9 inspire-ai-v130", "applicationId": "STALE", "id": "2"},
       {"displayName": "app-q7k2m9 inspire-ai", "applicationId": "MEHDI", "id": "3"},
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
wanted = {"step_grant_permissions", "_catalog_access_for_new_apps", "_lakebase_project_access", "_app_folder_access"}
module = ast.Module(body=[n for n in tree.body if (isinstance(n, ast.FunctionDef) and n.name in wanted)
                          or (isinstance(n, ast.Assign) and [t.id for t in n.targets if isinstance(t, ast.Name)][:1] in (["LAKEBASE_PROJECT"], ["LAKEBASE_CATALOG"]))],
                    type_ignores=[])
import contextlib, io
class StatementState:
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
def run(catalog_grants, owner="amr@x", show_fails=False, lakebase=(200, ""), lakebase_catalog=False, folder=(200, 77), folder_grant=(200, "")):
    executed, patched = [], []
    def ok(rows=None):
        manifest = types.SimpleNamespace(schema=types.SimpleNamespace(columns=[types.SimpleNamespace(name=n) for n in ("Principal", "ActionType", "ObjectType", "ObjectKey")]))
        return types.SimpleNamespace(status=types.SimpleNamespace(state=StatementState.SUCCEEDED, error=None), manifest=manifest,
                                     result=types.SimpleNamespace(data_array=rows))
    class Statements:
        def execute_statement(self, warehouse_id, statement, wait_timeout):
            executed.append(statement)
            if statement.startswith("SHOW GRANTS ON CATALOG"):
                if show_fails:
                    return types.SimpleNamespace(status=types.SimpleNamespace(state=StatementState.FAILED,
                                                 error=types.SimpleNamespace(message="PERMISSION_DENIED: not the owner")))
                return ok([[p, a, "CATALOG", "main"] for p, a in catalog_grants])
            return ok()
    class Catalogs:
        def list(self):
            return [types.SimpleNamespace(name=n) for n in ["sales", "samples"] + (["inspire_lakebase"] if lakebase_catalog else [])]
        def get(self, name):
            return types.SimpleNamespace(name=name, owner=owner)
    def api(method, url, body=None):
        patched.append((method, url, body))
        if "/database-projects/" in url:
            return types.SimpleNamespace(status_code=lakebase[0], text=lakebase[1])
        if "/workspace/get-status" in url:
            return types.SimpleNamespace(status_code=folder[0], text="" if folder[0] == 200 else str(folder[1]),
                                         json=lambda: {"object_id": folder[1]})
        if "/permissions/directories/" in url:
            return types.SimpleNamespace(status_code=folder_grant[0], text=folder_grant[1])
        return types.SimpleNamespace(status_code=200, text="")
    ns = {"StatementState": StatementState}
    exec(compile(module, path, "exec"), ns)
    ctx = {"NEW_SP_APP_ID": "SP", "APP_NAME": "inspire-ai", "WAREHOUSE_ID": "wh", "CATALOG": "main", "SCHEMA": "_inspire", "available_catalogs": ["main"],
           "w": types.SimpleNamespace(statement_execution=Statements(), catalogs=Catalogs()), "api": api}
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        ns["step_grant_permissions"](ctx)
    return executed, patched, out.getvalue()
executed, patched, said = run([("account users", "BROWSE"), ("SP", "USE CATALOG")])
volume = sorted(s for s in executed if "VOLUME" in s)
assert volume == sorted(f"GRANT {p} VOLUME ON SCHEMA \x60main\x60.\x60_inspire\x60 TO \x60SP\x60" for p in ("CREATE", "READ", "WRITE")), volume
assert "GRANT MODIFY ON SCHEMA \x60main\x60.\x60_inspire\x60 TO \x60SP\x60" in executed, executed
assert "GRANT CREATE MODEL ON SCHEMA \x60main\x60.\x60_inspire\x60 TO \x60SP\x60" in executed, executed
assert "GRANT MANAGE ON SCHEMA \x60main\x60.\x60_inspire\x60 TO \x60SP\x60" in executed, executed
assert "GRANT BROWSE ON CATALOG \x60sales\x60 TO \x60SP\x60" in executed, executed
assert not [s for s in executed if "samples" in s], executed
assert not [s for s in executed if s.startswith("GRANT MANAGE ON CATALOG")], executed
assert not [s for s in executed if "inspire_lakebase" in s], executed
lakebase_sql = [s for s in run([], lakebase_catalog=True)[0] if "inspire_lakebase" in s]
assert lakebase_sql == [f"GRANT {p} ON CATALOG \x60inspire_lakebase\x60 TO \x60SP\x60" for p in
                        ("USE_CATALOG", "BROWSE", "ALL PRIVILEGES")], lakebase_sql
manage = {"access_control_list": [{"service_principal_name": "SP", "permission_level": "CAN_MANAGE"}]}
assert patched == [("PATCH", "/api/2.0/permissions/sql/warehouses/wh", manage),
                   ("PATCH", "/api/2.0/permissions/database-projects/inspire-apps", manage),
                   ("GET", "/api/2.0/workspace/get-status?path=/Shared/inspire-ai", None),
                   ("PATCH", "/api/2.0/permissions/directories/77", manage)], patched
assert "CAN_MANAGE on /Shared/inspire-ai, so Implement can save every MVP there: ✅" in said, said
missing = run([], folder=(404, '{"error_code":"RESOURCE_DOES_NOT_EXIST"}'))
assert not [p for p in missing[1] if "/permissions/directories/" in p[1]], missing[1]
assert ("⚠️ Could not find /Shared/inspire-ai ({\"error_code\":\"RESOURCE_DOES_NOT_EXIST\"}), so SP may not be able to save MVPs there. "
        "A workspace admin can give SP Can Manage on that folder") in missing[2], missing[2]
refused = run([], folder_grant=(403, '{"error_code":"PERMISSION_DENIED"}'))[2]
assert ("⚠️ SP cannot save MVPs in /Shared/inspire-ai yet ({\"error_code\":\"PERMISSION_DENIED\"}). "
        "A workspace admin can give SP Can Manage on that folder") in refused, refused
assert "save every MVP there: ✅" not in refused, refused
assert "CAN_MANAGE on warehouse, so Implement can attach it to the Apps it creates: ✅" in said, said
assert "CAN_MANAGE on Lakebase project inspire-apps, so the Apps Implement builds can read Lakebase: ✅" in said, said
absent = run([], lakebase=(404, '{"error_code":"NOT_FOUND","message":"Database project is not found."}'))[2]
assert "No Lakebase project inspire-apps yet: the first App that reads Lakebase creates it ✅" in absent, absent
assert "⚠️ Apps cannot read" not in absent, absent
denied = run([], lakebase=(403, '{"error_code":"PERMISSION_DENIED","message":"no CAN_MANAGE on the project"}'))[2]
assert ("⚠️ Apps cannot read Lakebase project inspire-apps yet ({\"error_code\":\"PERMISSION_DENIED\",\"message\":\"no CAN_MANAGE on the project\"}). "
        "A workspace admin can give SP Can Manage on that project; until then the Apps read Delta tables") in denied, denied
assert "Lakebase: ✅" not in denied and "creates it ✅" not in denied, denied
blocked = ("⚠️ Apps that Implement creates cannot read result tables in \x60main\x60 yet: their service principals need USE CATALOG, "
           "which account users do not hold, and Inspire can grant it only with MANAGE on the catalog. A catalog owner can run "
           "GRANT MANAGE ON CATALOG \x60main\x60 TO \x60SP\x60, or GRANT USE CATALOG ON CATALOG \x60main\x60 TO \x60account users\x60")
assert blocked in said, said
assert "New Apps can use catalog \x60main\x60: account users hold USE CATALOG ✅" in run([("Account Users", "USE_CATALOG")])[2]
assert "New Apps can use catalog \x60main\x60: account users hold USE CATALOG ✅" in run([("account users", "ALL PRIVILEGES")])[2]
assert "New Apps can use catalog \x60main\x60: Inspire can grant them USE CATALOG ✅" in run([("SP", "MANAGE")])[2]
assert "New Apps can use catalog \x60main\x60: Inspire can grant them USE CATALOG ✅" in run([], owner="SP")[2]
assert blocked in run([("someone@x", "MANAGE"), ("account users", "SELECT")])[2]
failed = run([], show_fails=True)[2]
assert "⚠️ Could not check who can use catalog \x60main\x60: PERMISSION_DENIED: not the owner" in failed, failed
print("ok")
`;

const BUNDLE_PROBE = String.raw`
import ast, os, sys, tempfile, types, zipfile
path = sys.argv[1]
tree = ast.parse(open(path, encoding="utf-8").read())
wanted = {"_folder_has_app_yaml", "_normalize_bundle_root", "_unpack_bundle", "_workspace_api_path", "_remove_old_bundles"}
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
removed = ns["_remove_old_bundles"](w, "/Workspace/Users/me/InspireAI", "/Workspace/Users/me/InspireAI/bundle_2", {})
assert removed == deleted == ["/Users/me/InspireAI/bundle_1", "/Users/me/InspireAI/app.yaml"], removed
def unlistable(p):
    raise RuntimeError("not found")
quiet = types.SimpleNamespace(workspace=types.SimpleNamespace(list=unlistable, delete=delete))
assert ns["_remove_old_bundles"](quiet, "/Workspace/Users/me/InspireAI", "/x/bundle_2", {}) == []
print("ok")
`;

const IN_USE_BUNDLE_PROBE = String.raw`
import ast, os, sys, types
path = sys.argv[1]
tree = ast.parse(open(path, encoding="utf-8").read())
wanted = {"_workspace_api_path", "_list_apps", "_app_source_paths", "_remove_old_bundles"}
module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted], type_ignores=[])
ns = {"os": os, "print": lambda *a, **k: None}
exec(compile(module, path, "exec"), ns)
pages = {
    "/api/2.0/apps": {"apps": [{"name": "inspire-ai-v130", "default_source_code_path": "/Workspace/Users/me/InspireAI/bundle_old",
                                "active_deployment": {"source_code_path": "/Workspace/Users/me/InspireAI/bundle_old/"}},
                               {"name": "stopped", "default_source_code_path": "/Workspace/Users/me/InspireAI/bundle_stopped"}],
                      "next_page_token": "p2"},
    "/api/2.0/apps?page_token=p2": {"apps": [
        {"name": "nested", "pending_deployment": {"source_code_path": "/Workspace/Users/me/InspireAI/bundle_nested/app"}},
        {"name": "elsewhere", "active_deployment": {"source_code_path": "/Workspace/Users/other/InspireAI-main"}},
        {"name": "suffixed", "active_deployment": {"source_code_path": "/Workspace/Users/me/InspireAI/bundle_stale_1"}},
        {"name": "never-deployed", "active_deployment": None}]},
}
in_use = ns["_app_source_paths"](lambda p: pages[p])
assert in_use == {"/Users/me/InspireAI/bundle_old": "inspire-ai-v130", "/Users/me/InspireAI/bundle_stopped": "stopped",
                  "/Users/me/InspireAI/bundle_nested/app": "nested", "/Users/other/InspireAI-main": "elsewhere",
                  "/Users/me/InspireAI/bundle_stale_1": "suffixed"}, in_use
deleted, listed = [], []
names = ("bundle_new", "bundle_old", "bundle_stopped", "bundle_nested", "bundle_old_2", "bundle_stale", "bundle_stale_1")
def listing(root):
    listed.append(root)
    return [types.SimpleNamespace(path=f"{root}/{name}") for name in names]
w = types.SimpleNamespace(workspace=types.SimpleNamespace(list=listing, delete=lambda p, recursive=False: deleted.append(p)))
removed = ns["_remove_old_bundles"](w, "/Workspace/Users/me/InspireAI", "/Workspace/Users/me/InspireAI/bundle_new", in_use)
assert listed == ["/Users/me/InspireAI"], listed
assert removed == deleted == ["/Users/me/InspireAI/bundle_old_2", "/Users/me/InspireAI/bundle_stale"], removed
listed.clear()
assert ns["_remove_old_bundles"](w, "/Workspace/Users/me/InspireAI", "/Workspace/Users/me/InspireAI/bundle_new", None) == []
assert listed == [] and deleted == ["/Users/me/InspireAI/bundle_old_2", "/Users/me/InspireAI/bundle_stale"], (listed, deleted)
print("ok")
`;

const DEPLOY_PROBE = String.raw`
import ast, os, sys, types
path = sys.argv[1]
tree = ast.parse(open(path, encoding="utf-8").read())
wanted = {"step_deploy_and_find_sp", "_workspace_api_path", "_list_apps", "_app_source_paths", "_remove_old_bundles",
          "_is_own_service_principal"}
module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted], type_ignores=[])
ns = {"os": os, "print": lambda *a, **k: None, "time": types.SimpleNamespace(sleep=lambda s: None),
      "write_app_yaml_deploy": lambda *a: None}
exec(compile(module, path, "exec"), ns)
source = "/Workspace/Users/me/InspireAI/bundle_new"
app = {"compute_status": {"state": "ACTIVE"}, "url": "https://app", "service_principal_client_id": "SPNEW",
       "service_principal_name": "app-sp",
       "active_deployment": {"deployment_id": "d1", "status": {"state": "SUCCEEDED"}, "source_code_path": source}}
def run(list_apps):
    deleted = []
    def api(method, url, body=None):
        payload = {"url": "https://app"} if url == "/api/2.0/apps" else {"deployment_id": "d1"}
        return types.SimpleNamespace(status_code=200, json=lambda: payload, text="")
    def api_get(url):
        if url == "/api/2.0/apps":
            return list_apps()
        if url == "/api/2.0/apps/inspire-ai-implement":
            return app
        if url.startswith("/api/2.0/preview/scim/v2/ServicePrincipals?filter=applicationId"):
            return {"Resources": [{"id": "1"}]}
        return {"Resources": []}
    entries = [types.SimpleNamespace(path=f"/Users/me/InspireAI/{name}") for name in ("bundle_new", "bundle_old", "bundle_stale")]
    w = types.SimpleNamespace(workspace=types.SimpleNamespace(list=lambda p: entries,
                                                              delete=lambda p, recursive=False: deleted.append(p)))
    ctx = {"api": api, "api_get": api_get, "SOURCE_FOLDER": source, "INSPIRE_DB": "main._inspire", "WAREHOUSE_ID": "wh",
           "NOTEBOOK_PATH": "/Shared/inspire-ai-implement/dbx_inspire_ai_agent", "SP_NAME": "inspire-ai-implement-sp",
           "APP_NAME": "inspire-ai-implement", "CATALOG": "main", "BUNDLE_ROOT": "/Workspace/Users/me/InspireAI", "w": w}
    ns["step_deploy_and_find_sp"](ctx)
    assert ctx["NEW_SP_APP_ID"] == "SPNEW" and ctx["app_url"] == "https://app", ctx
    return deleted
apps = {"apps": [{"name": "inspire-ai-v130", "active_deployment": {"source_code_path": "/Workspace/Users/me/InspireAI/bundle_old"}},
                 {"name": "inspire-ai-implement", "active_deployment": {"source_code_path": source}}]}
assert run(lambda: apps) == ["/Users/me/InspireAI/bundle_stale"]
def forbidden():
    raise RuntimeError("apps list forbidden")
assert run(forbidden) == []
print("ok")
`;

const CLEANUP_PROBE = String.raw`
import ast, sys, types
path = sys.argv[1]
tree = ast.parse(open(path, encoding="utf-8").read())
wanted = {"step_cleanup", "_is_own_service_principal", "_list_apps", "_app_service_principal_ids", "_deletable_service_principals",
          "_implemented_use_case_job", "_app_kept_reason"}
module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted], type_ignores=[])
printed = []
ns = {"print": lambda *a, **k: printed.append(" ".join(str(x) for x in a)), "time": types.SimpleNamespace(sleep=lambda s: None)}
exec(compile(module, path, "exec"), ns)
class Resp:
    def __init__(self, code, payload=None):
        self.status_code, self.payload, self.text = code, payload or {}, ""
    def json(self):
        return self.payload
    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")
def job(job_id, creator, **tags):
    return {"job_id": job_id, "creator_user_name": creator, "settings": {"name": f"job {job_id}", "tags": tags}}
USE_CASE = {"dbx_inspire_ai_run_type": "implement", "dbx_inspire_ai_usecase": "basket"}
LAUNCHER = {"dbx_inspire_ai_run_type": "implement", "dbx_inspire_ai_usecases": "0"}
APP = "/api/2.0/apps/inspire-ai-implement"
def run(pages=None, app_status=200, sp="SPAPP", jobs_error=None):
    calls, state = [], {"app": app_status}
    def api(method, url, body=None):
        calls.append((method, url))
        if url == APP and method == "DELETE":
            if state["app"] == 404:
                return Resp(404)
            state["app"] = 404
            return Resp(200)
        if url == APP:
            return Resp(state["app"], {"name": "inspire-ai-implement", "service_principal_client_id": sp, "compute_status": {"state": "ACTIVE"}})
        return Resp(200)
    def api_get(url):
        calls.append(("GET", url))
        if url.startswith("/api/2.1/jobs/list"):
            if jobs_error:
                raise RuntimeError(jobs_error)
            token = url.split("page_token=")[1] if "page_token=" in url else ""
            return (pages or {}).get(token, {"jobs": []})
        if url.startswith("/api/2.0/apps"):
            return {"apps": [{"name": "inspire-ai-implement", "service_principal_client_id": sp}] if state["app"] == 200 else []}
        if url.startswith("/api/2.0/preview/scim/v2/ServicePrincipals"):
            return {"Resources": [{"id": "77", "displayName": "inspire-ai-implement-sp", "applicationId": sp}]}
        return {}
    printed.clear()
    ns["step_cleanup"]({"api": api, "api_get": api_get, "APP_NAME": "inspire-ai-implement", "SP_NAME": "inspire-ai-implement-sp"})
    return calls, list(printed)
deleted_app = lambda calls: ("DELETE", APP) in calls
listed_jobs = lambda calls: [u for m, u in calls if u.startswith("/api/2.1/jobs/list")]
on_page_two = {"": {"jobs": [job(1, "someone", **USE_CASE), job(2, "SPAPP", **LAUNCHER)], "next_page_token": "p2"},
               "p2": {"jobs": [job(3, "SPAPP", **USE_CASE)]}}
calls, out = run(on_page_two)
assert not deleted_app(calls), calls
assert not any(m == "DELETE" and "ServicePrincipals" in u for m, u in calls), calls
assert any("Keeping app 'inspire-ai-implement' and its service principal" in line and "job 3" in line for line in out), out
assert len(listed_jobs(calls)) == 2, calls
calls, out = run({"": {"jobs": [job(1, "someone", **USE_CASE), job(2, "SPAPP", **LAUNCHER),
                               job(4, "SPAPP", dbx_inspire_ai_run_type="discovery", dbx_inspire_ai_usecase="basket")]}})
assert deleted_app(calls), calls
assert not any("Keeping app" in line for line in out), out
calls, out = run({"": {"jobs": [job(3, "SPAPP", **USE_CASE)], "next_page_token": "p2"}, "p2": {"jobs": []}})
assert not deleted_app(calls) and len(listed_jobs(calls)) == 1, calls
calls, out = run(jobs_error="jobs list forbidden")
assert not deleted_app(calls), calls
assert any("could not be checked" in line and "jobs list forbidden" in line for line in out), out
calls, out = run(app_status=500)
assert not deleted_app(calls) and not listed_jobs(calls), calls
calls, out = run(on_page_two, app_status=404)
assert deleted_app(calls) and not listed_jobs(calls), calls
assert any("No existing app" in line for line in out), out
calls, out = run(on_page_two, sp=None)
assert deleted_app(calls) and not listed_jobs(calls), calls
print("ok")
`;

const START_PROBE = String.raw`
import ast, os, sys, types
path = sys.argv[1]
tree = ast.parse(open(path, encoding="utf-8").read())
wanted = {"step_deploy_and_find_sp", "_workspace_api_path", "_list_apps", "_app_source_paths", "_remove_old_bundles",
          "_is_own_service_principal"}
module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted], type_ignores=[])
ns = {"os": os, "print": lambda *a, **k: None, "time": types.SimpleNamespace(sleep=lambda s: None),
      "write_app_yaml_deploy": lambda *a: None}
exec(compile(module, path, "exec"), ns)
source = "/Workspace/Users/me/InspireAI/bundle_new"
def run(first_state):
    app = {"compute_status": {"state": first_state}, "url": "https://app", "service_principal_client_id": "SPKEPT",
           "service_principal_name": "app-sp",
           "active_deployment": {"deployment_id": "d1", "status": {"state": "SUCCEEDED"}, "source_code_path": source}}
    started = []
    def api(method, url, body=None):
        if url == "/api/2.0/apps/inspire-ai-implement/start":
            started.append(method)
            app["compute_status"] = {"state": "ACTIVE"}
        if url == "/api/2.0/apps":
            return types.SimpleNamespace(status_code=409, json=lambda: {}, text="App with name inspire-ai-implement already exists")
        return types.SimpleNamespace(status_code=200, json=lambda: {"deployment_id": "d1"}, text="")
    def api_get(url):
        if url == "/api/2.0/apps":
            return {"apps": [{"name": "inspire-ai-implement", "active_deployment": {"source_code_path": source}}]}
        if url == "/api/2.0/apps/inspire-ai-implement":
            return app
        if url.startswith("/api/2.0/preview/scim/v2/ServicePrincipals?filter=applicationId"):
            return {"Resources": [{"id": "1"}]}
        return {"Resources": []}
    w = types.SimpleNamespace(workspace=types.SimpleNamespace(list=lambda p: [], delete=lambda p, recursive=False: None))
    ctx = {"api": api, "api_get": api_get, "SOURCE_FOLDER": source, "INSPIRE_DB": "main._inspire", "WAREHOUSE_ID": "wh",
           "NOTEBOOK_PATH": "/Shared/inspire-ai-implement/dbx_inspire_ai_agent", "SP_NAME": "inspire-ai-implement-sp",
           "APP_NAME": "inspire-ai-implement", "CATALOG": "main", "BUNDLE_ROOT": "/Workspace/Users/me/InspireAI", "w": w}
    ns["step_deploy_and_find_sp"](ctx)
    assert ctx["NEW_SP_APP_ID"] == "SPKEPT", ctx
    return started
assert run("STOPPED") == ["POST"]
assert run("ACTIVE") == []
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
  ['a reinstall never removes a bundle folder an app still runs from, and removes none when the apps cannot be listed', IN_USE_BUNDLE_PROBE],
  ['the deploy step removes only the older bundles that no app runs from', DEPLOY_PROBE],
  ['an incomplete install shows its banner and fails the job', MAIN_PROBE],
  ['a reinstall keeps the app and its service principal while they run implemented use cases, and cleans up otherwise', CLEANUP_PROBE],
  ['a kept app whose compute is stopped is started before the new bundle is deployed', START_PROBE],
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

test('the installer gives the app service principal volumes, CREATE MODEL and MANAGE on the Inspire schema, CAN MANAGE on the warehouse and the Lakebase project, and names what new Apps need on the catalog', (t) => {
  if (spawnSync('python3', ['--version']).status !== 0) {
    t.skip('python3 is not installed');
    return;
  }
  const run = spawnSync('python3', ['-c', GRANTS_PROBE, INSTALLER], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(run.stdout.trim().split('\n').pop(), 'ok');
});

test('the installer grants the same Lakebase project and catalog the agent builds Apps in', () => {
  const fs = require('node:fs');
  const constant = (text, name) => (new RegExp(`^${name} = "([^"]+)"$`, 'm').exec(text) || [])[1];
  const notebook = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'dbx_inspire_ai_agent.ipynb'), 'utf8'));
  const agent = notebook.cells.map((cell) => [].concat(cell.source).join('')).join('\n');
  const installer = fs.readFileSync(INSTALLER, 'utf8');
  for (const [mine, theirs] of [['LAKEBASE_PROJECT', 'IMPLEMENT_LAKEBASE_PROJECT'], ['LAKEBASE_CATALOG', 'IMPLEMENT_LAKEBASE_CATALOG']]) {
    assert.ok(constant(installer, mine), `the installer names ${mine}`);
    assert.equal(constant(installer, mine), constant(agent, theirs));
  }
});
