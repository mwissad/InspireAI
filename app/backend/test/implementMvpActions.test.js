const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../lib/inspireImplement');
const { makeApp, listen } = require('./support/implementApp');

const BASE = {
  use_case_id: 'N01-U01',
  use_case_name: 'Predict churn',
  config: { warehouse_id: 'wh1', result_table: 'main.inspire.churn_out' },
  outputs: { dashboard: true, genie_space: true, app: true, app_name: 'churn-desk', app_access: 'sp', alert: true, alert_recipients: ['owner@example.com'] },
};

function spec(top = {}) {
  const out = I.validateImplementSpec({ ...JSON.parse(JSON.stringify(BASE)), ...top });
  assert.deepEqual(out.errors, [], JSON.stringify(top));
  return out.spec;
}

const live = (version) => ({ state: 'ready', spec_version: version });

function row(version, { status = 'ready', ids = true, assets = null, kept = undefined } = {}) {
  const asset_status = assets || { dashboard: live(version), genie_space: live(version), app: live(version), alert: live(version), notebook: live(version) };
  if (kept !== undefined) asset_status.kept = { state: 'kept', assets: kept };
  return {
    session_id: '42', use_case_id: 'N01-U01', spec_version: version, status, spec_json: JSON.parse(JSON.stringify(BASE)),
    notebook_path: ids ? '/W/impl/N01-U01' : null, job_id: ids ? '77' : null,
    dashboard_id: ids ? 'd1' : null, genie_space_id: ids ? 'g1' : null, app_name: ids ? 'churn-desk' : null, alert_id: ids ? 'a1' : null,
    asset_status,
  };
}

const keptDashboard = (version, keptIn) => ({ output: 'dashboard', id: `d${version}`, url: `https://x/d${version}`, title: `Churn v${version}`, version, kept_in: keptIn });

const uninstalledRow = (version) => row(version, {
  status: I.IMPLEMENT_UNINSTALLED, ids: false, kept: [],
  assets: { dashboard: { state: 'deleted' }, genie_space: { state: 'deleted' }, app: { state: 'deleted' }, alert: { state: 'deleted' }, notebook: { state: 'deleted' } },
});

test('a vibe, a kept version removal and an uninstall are each a change class of their own, in the shared order', () => {
  const previous = spec();
  const classes = I.IMPLEMENT_CHANGE_CLASSES;
  assert.deepEqual(classes.slice(classes.indexOf('retry')), ['retry', 'rollback', 'vibe', 'remove_kept', 'uninstall']);
  assert.deepEqual(I.classifyImplementChange(previous, spec({ vibes: 'Put the riskiest first', vibe_previous: 'keep' })), ['vibe']);
  assert.deepEqual(I.classifyImplementChange(previous, spec({ remove_kept: [2] })), ['remove_kept']);
  assert.deepEqual(I.classifyImplementChange(previous, spec({ uninstall: true })), ['uninstall']);
  assert.deepEqual(I.classifyImplementChange(previous, spec({ remove_kept: [] })), [], 'an empty removal list is no change');
  assert.deepEqual(I.classifyImplementChange(previous, spec()), []);
});

test('the kept assets come from the newest version that lists them, and an emptied list means nothing is kept', () => {
  assert.deepEqual(I.keptAssets([]), []);
  assert.deepEqual(I.keptAssets([row(2)]), [], 'a version that never kept anything keeps nothing');
  const older = row(2, { kept: [keptDashboard(1, 2)] });
  assert.deepEqual(I.keptAssets([row(3), older]), [keptDashboard(1, 2)], 'a newer version without a kept list leaves the older list in place');
  assert.deepEqual(I.keptAssets([older, row(3, { kept: [] })]), [], 'the newest list wins even when it is empty, in any input order');
  const junk = row(3, { kept: [keptDashboard(2, 3), { output: 'notebook', id: 'n1', version: 1 }, { output: 'app', version: 1 }, 'x', null] });
  assert.deepEqual(I.keptAssets([junk]), [keptDashboard(2, 3)], 'only outputs with an id are listed');
});

test('a vibe needs a built output, an uninstall needs something built and not yet removed, and a removal needs a kept version', () => {
  const vibe = spec({ vibes: 'Put the riskiest first', vibe_previous: 'remove' });
  assert.deepEqual(I.mvpActionProblems([row(1)], vibe), []);
  assert.deepEqual(I.mvpActionProblems([row(1, { ids: false })], vibe),
    ['Inspire has built no dashboard, Genie Agent, App or alert on this MVP yet, so a vibe has nothing to change; build one first']);
  assert.deepEqual(I.mvpActionProblems([uninstalledRow(2), row(1)], vibe).length, 1, 'an uninstalled MVP has nothing a vibe can change');

  const uninstall = spec({ uninstall: true });
  assert.deepEqual(I.mvpActionProblems([row(1)], uninstall), []);
  assert.deepEqual(I.mvpActionProblems([row(1, { ids: false, assets: {} })], uninstall),
    ['Inspire has built nothing for this use case yet, so there is nothing to uninstall']);
  const notebookOnly = { ...row(1, { ids: false, assets: {} }), notebook_path: '/W/impl/N01-U01', job_id: '77' };
  assert.deepEqual(I.mvpActionProblems([notebookOnly], uninstall), [], 'a notebook and its job are worth uninstalling on their own');
  assert.deepEqual(I.mvpActionProblems([uninstalledRow(2), row(1)], uninstall),
    ['this MVP was uninstalled in v2, so there is nothing left to remove']);
  assert.deepEqual(I.mvpActionProblems([row(1), uninstalledRow(2)], uninstall).length, 1, 'the newest version decides, in any input order');

  const withKept = [row(3, { kept: [keptDashboard(2, 3)] }), row(2)];
  assert.deepEqual(I.mvpActionProblems(withKept, spec({ remove_kept: [2] })), []);
  assert.deepEqual(I.mvpActionProblems(withKept, spec({ remove_kept: [1, 2] })), ['v1 has nothing kept live, so there is nothing of it to remove']);
  assert.deepEqual(I.mvpActionProblems([row(2)], spec({ remove_kept: [1] })), ['v1 has nothing kept live, so there is nothing of it to remove']);
});

test('a vibe, a removal or an uninstall of a built version is never refused as unchanged, and an action with nothing to act on is', () => {
  for (const top of [{ vibes: 'Put the riskiest first', vibe_previous: 'keep' }, { remove_kept: [2] }, { uninstall: true }]) {
    const plan = I.planSubmission([row(3, { kept: [keptDashboard(2, 3)] }), row(2)], { ...spec(top), based_on_version: 3 });
    assert.equal(plan.unchanged, false, JSON.stringify(top));
    assert.equal(plan.nextVersion, 4);
    assert.equal(plan.summary.refill, false, `${JSON.stringify(top)} rebuilds no notebook`);
    I.refuseUnchanged(plan);
  }
  assert.equal(I.planSubmission([row(3)], { ...spec(), based_on_version: 3 }).unchanged, true, 'the same choices are still refused');
  assert.throws(() => I.planSubmission([row(1, { ids: false })], spec({ vibes: 'Put the riskiest first', vibe_previous: 'keep' })),
    (err) => err.statusCode === 400 && /a vibe has nothing to change/.test(err.message));
});

test('the first MVP after an uninstall builds every output and the notebook from scratch, and is never unchanged', () => {
  const plan = I.planSubmission([uninstalledRow(4), row(3)], { ...spec(), based_on_version: 4 });
  assert.equal(plan.unchanged, false);
  assert.equal(plan.nextVersion, 5);
  assert.deepEqual(plan.summary.classes, ['initial']);
  assert.equal(plan.summary.refill, true);
  assert.deepEqual(plan.summary.build, ['dashboard', 'genie_space', 'app', 'alert']);
  assert.deepEqual(I.carriedAssets([uninstalledRow(4), row(3)]), {}, 'nothing of the uninstalled versions is carried');
  const before = I.planSubmission([row(3)], { ...spec(), based_on_version: 3 });
  assert.deepEqual([before.summary.classes, before.unchanged], [[], true], 'without the uninstall the same choices are no change');
});

async function call(base, route, body) {
  const resp = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: resp.status, data: await resp.json() };
}

const stringRow = (r) => ({ ...r, spec_json: JSON.stringify(r.spec_json), asset_status: JSON.stringify(r.asset_status) });
const submitBody = (s) => ({ inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: s });

function storedSpec(sqlCalls) {
  const insert = sqlCalls.find((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'));
  return insert ? { spec: JSON.parse(insert.parameters.find((p) => p.name === 'spec').value), classes: insert.parameters.find((p) => p.name === 'classes').value } : null;
}

test('submit stores a vibe with its choice for the version before, an uninstall on its own, and launches one run each', async () => {
  for (const [top, classes] of [[{ vibes: '  Put the riskiest first  ', vibe_previous: 'Keep' }, 'vibe'], [{ uninstall: true }, 'uninstall']]) {
    const { app, sqlCalls, jobs } = makeApp({ history: [stringRow(row(1))] });
    const srv = await listen(app);
    try {
      const got = await call(srv.url, '/api/inspire/implement/submit', submitBody({ ...BASE, based_on_version: 1, ...top }));
      assert.equal(got.status, 200, JSON.stringify(got.data));
      assert.equal(got.data.spec_version, 2);
      const stored = storedSpec(sqlCalls);
      assert.equal(stored.classes, classes);
      if (top.vibes) assert.deepEqual([stored.spec.vibes, stored.spec.vibe_previous], ['Put the riskiest first', 'keep']);
      else assert.equal(stored.spec.uninstall, true);
      assert.equal(jobs.length, 1);
    } finally {
      await srv.close();
    }
  }
});

test('submit refuses a second uninstall and a removal of a version that kept nothing, and writes and launches nothing', async () => {
  for (const [history, top, message] of [
    [[uninstalledRow(2), row(1)], { uninstall: true, based_on_version: 2 }, 'this MVP was uninstalled in v2, so there is nothing left to remove'],
    [[row(1)], { remove_kept: [1], based_on_version: 1 }, 'v1 has nothing kept live, so there is nothing of it to remove'],
    [[row(1)], { uninstall: true, vibes: 'x', vibe_previous: 'keep' }, 'Uninstall All removes everything this use case built, so it cannot also '
      + 'rebuild, vibe, roll back or remove a kept version in the same version'],
  ]) {
    const { app, sqlCalls, jobs } = makeApp({ history: history.map(stringRow) });
    const srv = await listen(app);
    try {
      const got = await call(srv.url, '/api/inspire/implement/submit', submitBody({ ...BASE, ...top }));
      assert.equal(got.status, 400, JSON.stringify(got.data));
      assert.ok(String(got.data.error).includes(message), got.data.error);
      assert.equal(storedSpec(sqlCalls), null);
      assert.equal(jobs.length, 0);
    } finally {
      await srv.close();
    }
  }
});
