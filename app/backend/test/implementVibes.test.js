const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const I = require('../lib/inspireImplement');
const { makeApp, listen } = require('./support/implementApp');

const lib = (name) => import(pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', name)).href);

const BASE = {
  use_case_id: 'N01-U01',
  use_case_name: 'Predict churn',
  config: { warehouse_id: 'wh1', result_table: 'main.inspire.churn_out' },
  outputs: { dashboard: true, genie_space: true, app: true, app_name: 'churn-desk', app_access: 'sp', alert: true, alert_recipients: ['owner@example.com'] },
};
const LABELS = { dashboard: 'Dashboard', genie_space: 'Genie Agent', app: 'App', alert: 'Alert' };

function spec(outputs = {}, top = {}) {
  return I.validateImplementSpec({ ...JSON.parse(JSON.stringify(BASE)), ...top, outputs: { ...BASE.outputs, ...outputs } });
}

async function call(base, route, body) {
  const resp = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: resp.status, data: await resp.json() };
}

const submitBody = (s) => ({ inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: s });

function versionRow(version, { vibes = '', snapshot = {}, status = 'ready' } = {}) {
  const outputs = { ...BASE.outputs, dashboard_vibes: vibes };
  const asset = (name) => ({ state: 'ready', spec_version: version, ...(snapshot[name] === undefined ? {} : { snapshot: snapshot[name] }) });
  return {
    session_id: '42', use_case_id: 'N01-U01', spec_version: version, status, change_classes: version === 1 ? 'initial' : 'outputs',
    updated_at: `2026-10-2${version}T04:00:00Z`, spec_json: JSON.stringify({ ...BASE, outputs }), job_id: '77',
    dashboard_id: 'd1', genie_space_id: 'g1', app_name: 'churn-desk', alert_id: 'a1',
    asset_status: JSON.stringify({ dashboard: asset('dashboard'), genie_space: asset('genie_space'), app: asset('app'), alert: asset('alert') }),
  };
}

function storedSpec(sqlCalls) {
  const insert = sqlCalls.find((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'));
  return insert ? { spec: JSON.parse(insert.parameters.find((p) => p.name === 'spec').value), classes: insert.parameters.find((p) => p.name === 'classes').value } : null;
}

test('each ticked output keeps its vibes trimmed, an unticked one keeps none, and every vibes key is an option of its own output only', () => {
  const { spec: out, errors } = spec({ dashboard_vibes: '  Put the trend first  ', genie_space_vibes: 'Answer in plain words', app_vibes: '', alert_vibes: '\n' });
  assert.deepEqual(errors, []);
  assert.deepEqual([out.outputs.dashboard_vibes, out.outputs.genie_space_vibes, out.outputs.app_vibes, out.outputs.alert_vibes],
    ['Put the trend first', 'Answer in plain words', '', '']);
  const off = spec({ alert: false, alert_vibes: 'only on new rows', dashboard: false, dashboard_vibes: 'x'.repeat(5000) });
  assert.deepEqual(off.errors, [], 'vibes of an unticked output are dropped, never validated');
  assert.deepEqual([off.spec.outputs.alert_vibes, off.spec.outputs.dashboard_vibes], ['', '']);
  for (const name of I.IMPLEMENT_OUTPUTS) {
    assert.ok(I.IMPLEMENT_OUTPUT_OPTIONS[name].includes(`${name}_vibes`), name);
    for (const other of I.IMPLEMENT_OUTPUTS.filter((n) => n !== name)) assert.ok(!I.IMPLEMENT_OUTPUT_OPTIONS[other].includes(`${name}_vibes`), `${other} has ${name}_vibes`);
  }
  assert.equal(I.IMPLEMENT_VIBES_MAX, 2000);
});

test('vibes of 2000 characters pass and 2001 is an error that names the output and the count, never a cut', () => {
  for (const name of I.IMPLEMENT_OUTPUTS) {
    const key = `${name}_vibes`;
    const fits = spec({ [key]: ` ${'a'.repeat(2000)} ` });
    assert.deepEqual(fits.errors, [], name);
    assert.equal(fits.spec.outputs[key].length, 2000, `${name} keeps every character`);
    const over = spec({ [key]: 'a'.repeat(2001) });
    assert.deepEqual(over.errors, [`the ${LABELS[name]} vibes are 2001 characters; at most 2000 are allowed`], name);
  }
  const emoji = '\u{1F600}';
  assert.deepEqual(spec({ app_vibes: emoji.repeat(2000) }).errors, [], 'a character is a code point, the way the agent counts it');
  assert.deepEqual(spec({ app_vibes: emoji.repeat(2001) }).errors, ['the App vibes are 2001 characters; at most 2000 are allowed']);
  assert.equal(I.vibesLength(`${emoji}ab`), 3);
});

test('vibes that are not text are refused with the shared message, and a missing value is no vibes', () => {
  for (const [bad, shown] of [[5, '5'], [true, 'true'], [['a'], '["a"]'], [{ ask: 'a' }, '{"ask":"a"}']]) {
    assert.deepEqual(spec({ genie_space_vibes: bad }).errors, [`outputs.genie_space_vibes must be text, not ${shown}`], JSON.stringify(bad));
  }
  const missing = spec({ dashboard_vibes: null });
  assert.deepEqual(missing.errors, []);
  assert.equal(missing.spec.outputs.dashboard_vibes, '');
  const { app_vibes: _gone, ...noKey } = BASE.outputs;
  assert.equal(I.validateImplementSpec({ ...BASE, outputs: noKey }).spec.outputs.app_vibes, '');
});

test('a vibe change refreshes only that output, and the rollback class sits right after retry', () => {
  const classes = I.IMPLEMENT_CHANGE_CLASSES;
  assert.deepEqual(classes.slice(classes.indexOf('retry')), ['retry', 'rollback', 'vibe', 'remove_kept', 'uninstall']);
  const assets = { dashboard: 'd1', genie_space: 'g1', app: 'churn-desk', alert: 'a1' };
  const before = spec({ dashboard_vibes: 'weekly bars' }).spec;
  for (const name of I.IMPLEMENT_OUTPUTS) {
    const after = spec({ dashboard_vibes: 'weekly bars', [`${name}_vibes`]: 'a new ask' }).spec;
    const summary = I.implementChangeSummary(before, after, assets);
    assert.deepEqual(summary.classes, ['outputs'], name);
    assert.deepEqual(summary.refresh, [name], `${name}: only the vibed output is refreshed`);
    assert.deepEqual([summary.build, summary.rollback, summary.refill], [[], [], false], name);
  }
  assert.deepEqual(I.classifyImplementChange(before, spec({ dashboard_vibes: '  weekly bars ' }).spec), [], 'trimmed vibes that read the same are no change');
});

test('rollback outputs validate with the shared messages and normalize to whole versions', () => {
  const errorsOf = (rollback, top = {}, outputs = {}) => spec(outputs, { ...top, rollback_outputs: rollback }).errors;
  assert.deepEqual(errorsOf({ pdf: 1 }), ["rollback output 'pdf' is not one of genie_space, dashboard, app, alert"]);
  assert.deepEqual(errorsOf({ alert: 1 }, {}, { alert: false }), ['the Alert cannot be rolled back: it is not selected']);
  for (const [value, shown] of [[0, '0'], [-1, '-1'], [1.5, '1.5'], ['abc', "'abc'"], [true, 'true'], [null, 'null'], ['', "''"], [[2], '[2]']]) {
    assert.deepEqual(errorsOf({ app: value }), [`rollback_outputs.app ${shown} must be a version number, 1 or more`], JSON.stringify(value));
  }
  assert.deepEqual(errorsOf({ dashboard: 1 }, { retry_outputs: ['dashboard'] }), ['the Dashboard cannot be retried and rolled back in the same version']);
  assert.deepEqual(errorsOf(['dashboard']), ['rollback_outputs must be an object']);
  const ok = spec({}, { rollback_outputs: { dashboard: 2, genie_space: '3' } });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.spec.rollback_outputs, { dashboard: 2, genie_space: 3 });
  assert.deepEqual(spec().spec.rollback_outputs, {});
  const retried = spec({}, { retry_outputs: ['app'], rollback_outputs: { dashboard: 1 } });
  assert.deepEqual(retried.errors, [], 'one output retried and another rolled back is fine');
});

test('a rollback is its own change: it rolls the output back and refreshes nothing', () => {
  const before = spec({ dashboard_vibes: 'weekly bars' }).spec;
  const after = spec({ dashboard_vibes: 'weekly bars' }, { rollback_outputs: { dashboard: 1 } }).spec;
  const summary = I.implementChangeSummary(before, after, { dashboard: 'd1', genie_space: 'g1', app: 'churn-desk', alert: 'a1' });
  assert.deepEqual(summary.classes, ['rollback']);
  assert.deepEqual([summary.rollback, summary.refresh, summary.build, summary.nothing_to_do], [['dashboard'], [], [], false]);
  const plan = I.planSubmission([{ ...versionRow(2), spec_json: before, asset_status: null }], { ...after, based_on_version: 2 });
  assert.equal(plan.nextVersion, 3, 'a rollback of an unchanged ready version is a real change');
});

test('a rollback needs a saved snapshot on an earlier version, and copies that version\'s vibes', () => {
  const history = [2, 1].map((v) => I.parseImplementRow(versionRow(v, { vibes: v === 1 ? '  Put the trend first  ' : 'Make it blue', snapshot: { dashboard: true, app: v === 1 ? true : 'true' } })));
  const asked = spec({ dashboard_vibes: 'what the browser sent' }, { rollback_outputs: { dashboard: 1 } }).spec;
  const rolled = I.rollbackSpec(history, asked);
  assert.equal(rolled.outputs.dashboard_vibes, 'Put the trend first', 'the vibes come from the version rolled back to, not from the request');
  assert.equal(asked.outputs.dashboard_vibes, 'what the browser sent', 'the asked spec is not changed in place');
  assert.equal(I.rollbackSpec(history, spec({ dashboard_vibes: 'x' }, { rollback_outputs: { dashboard: 2 } }).spec).outputs.dashboard_vibes, 'Make it blue',
    'the live version itself is below the version being submitted');
  const refused = (rollback, rows = history) => {
    try {
      I.rollbackSpec(rows, spec({}, { rollback_outputs: rollback }).spec);
    } catch (err) {
      return [err.statusCode, err.message];
    }
    return null;
  };
  assert.deepEqual(refused({ app: 2 }), [400, 'v2 has no saved App to roll back to'], 'a snapshot flag that is not true is no snapshot');
  assert.deepEqual(refused({ genie_space: 1 }), [400, 'v1 has no saved Genie Agent to roll back to']);
  assert.deepEqual(refused({ dashboard: 3 }), [400, 'v3 has no saved Dashboard to roll back to'], 'the version being submitted is not earlier');
  assert.deepEqual(refused({ dashboard: 7 }), [400, 'v7 has no saved Dashboard to roll back to']);
  assert.deepEqual(refused({ dashboard: 1 }, []), [400, 'v1 has no saved Dashboard to roll back to'], 'no history, nothing to roll back to');
  assert.deepEqual(refused({ alert: 1, app: 2 }), [400, 'v1 has no saved Alert to roll back to; v2 has no saved App to roll back to']);
  const plain = spec().spec;
  assert.equal(I.rollbackSpec(history, plain), plain, 'a spec without a rollback passes through untouched');
});

test('submit rolls an output back with the vibes of that version, and names the change rollback', async () => {
  const history = [versionRow(2, { vibes: 'Make it blue', snapshot: { dashboard: true } }), versionRow(1, { vibes: 'Put the trend first', snapshot: { dashboard: true } })];
  const { app, sqlCalls, jobs } = makeApp({ history });
  const srv = await listen(app);
  try {
    const sent = { ...BASE, based_on_version: 2, outputs: { ...BASE.outputs, dashboard_vibes: 'Make it blue' }, rollback_outputs: { dashboard: 1 } };
    const got = await call(srv.url, '/api/inspire/implement/submit', submitBody(sent));
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.equal(got.data.spec_version, 3);
    assert.deepEqual(got.data.summary.rollback, ['dashboard']);
    assert.deepEqual(got.data.summary.refresh, [], 'Genie rebuilds nothing on a rollback');
    const stored = storedSpec(sqlCalls);
    assert.equal(stored.spec.outputs.dashboard_vibes, 'Put the trend first');
    assert.deepEqual(stored.spec.rollback_outputs, { dashboard: 1 });
    assert.deepEqual(stored.classes.split(','), ['outputs', 'rollback']);
    assert.equal(jobs.length, 1);
  } finally {
    await srv.close();
  }
});

test('submit and plan refuse a rollback to a version with no saved asset with the shared 400, and write and launch nothing', async () => {
  const history = [versionRow(2), versionRow(1, { snapshot: { dashboard: false } })];
  for (const [rollback, message] of [[{ dashboard: 1 }, 'v1 has no saved Dashboard to roll back to'], [{ app: 3 }, 'v3 has no saved App to roll back to']]) {
    const { app, sqlCalls, jobs } = makeApp({ history });
    const srv = await listen(app);
    try {
      for (const route of ['/api/inspire/implement/plan', '/api/inspire/implement/submit']) {
        const got = await call(srv.url, route, submitBody({ ...BASE, based_on_version: 2, rollback_outputs: rollback }));
        assert.equal(got.status, 400, `${route}: ${JSON.stringify(got.data)}`);
        assert.equal(got.data.error, message, route);
      }
      assert.equal(storedSpec(sqlCalls), null);
      assert.equal(jobs.length, 0);
    } finally {
      await srv.close();
    }
  }
});

test('a vibe edit submitted on its own refreshes only its output', async () => {
  const { app, sqlCalls } = makeApp({ history: [versionRow(1, { vibes: 'Put the trend first' })] });
  const srv = await listen(app);
  try {
    const outputs = { ...BASE.outputs, dashboard_vibes: 'Put the trend first', app_vibes: '  One page, the list on the left ' };
    const got = await call(srv.url, '/api/inspire/implement/submit', submitBody({ ...BASE, based_on_version: 1, outputs }));
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual([got.data.summary.classes, got.data.summary.refresh, got.data.summary.build], [['outputs'], ['app'], []]);
    const stored = storedSpec(sqlCalls);
    assert.deepEqual([stored.spec.outputs.app_vibes, stored.spec.outputs.dashboard_vibes], ['One page, the list on the left', 'Put the trend first']);
    assert.equal(stored.classes, 'outputs');
  } finally {
    await srv.close();
  }
});

test('asset_snapshots is created, added to an older table, and never read by the status and history reads', async () => {
  assert.deepEqual(I.IMPLEMENT_COLUMNS[I.IMPLEMENT_COLUMNS.length - 1], ['asset_snapshots', 'STRING']);
  assert.ok(I.implementTableCreateSql('`c`.`s`.`__inspire_implement`').includes('`asset_snapshots` STRING'));
  assert.ok(!I.implementHistoryStatement('`t`', '42', 'N01-U01').sql.includes('asset_snapshots'));
  const older = new Set(I.IMPLEMENT_COLUMNS.map(([n]) => n).filter((n) => n !== 'asset_snapshots'));
  assert.ok(!I.implementHistoryStatement('`t`', '42', null, older).sql.includes('asset_snapshots'), 'a missing snapshot column is not read as NULL either');
  assert.deepEqual(I.implementMissingColumns(older), [['asset_snapshots', 'STRING']]);
  assert.ok(!I.implementRegistryStatement('`t`').sql.includes('asset_snapshots'));

  const { app, sqlCalls, altered, state } = makeApp({ history: [versionRow(1, { snapshot: { dashboard: true } })] });
  state.implementColumns = state.implementColumns.filter((c) => c !== 'asset_snapshots');
  const srv = await listen(app);
  try {
    const q = 'inspire_database=main.inspire&warehouse_id=wh1&session_id=42&use_case_id=N01-U01';
    for (const route of [`/api/inspire/implement/status?${q}`, `/api/inspire/implement/history?${q}`, `/api/inspire/implement/context?${q}`]) {
      const resp = await fetch(srv.url + route);
      assert.equal(resp.status, 200, `${route}: ${await resp.text()}`);
    }
    assert.deepEqual(altered, [], 'a read never adds the column');
    const got = await call(srv.url, '/api/inspire/implement/submit', submitBody({ ...BASE, based_on_version: 1, outputs: { ...BASE.outputs, dashboard_vibes: 'weekly bars' } }));
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(altered, [{ table: '`main`.`inspire`.`__inspire_implement`', columns: [['asset_snapshots', 'STRING']] }]);
    const reads = sqlCalls.filter((c) => String(c.sql).startsWith('SELECT') && String(c.sql).includes('__inspire_implement'));
    assert.ok(reads.length >= 4, `${reads.length} reads`);
    assert.deepEqual(reads.filter((c) => c.sql.includes('asset_snapshots')), [], 'no read selects the snapshots');
  } finally {
    await srv.close();
  }
});

test('the wizard counts, limits and words vibes the way the backend does, and a rollback never carries into the next version', async () => {
  const w = await lib('implementWizard.js');
  assert.equal(w.VIBES_MAX, I.IMPLEMENT_VIBES_MAX);
  for (const name of I.IMPLEMENT_OUTPUTS) {
    const over = 'b'.repeat(2001);
    assert.deepEqual([w.vibesProblem(name, over)], spec({ [`${name}_vibes`]: over }).errors, name);
    assert.equal(w.vibesProblem(name, ` ${'b'.repeat(2000)} `), '', name);
  }
  assert.equal(w.vibesLength(' \u{1F600}ab '), I.vibesLength('\u{1F600}ab'));
  assert.deepEqual(I.IMPLEMENT_OUTPUTS.map(w.vibesLabel), ['Vibes for the Dashboard', 'Vibes for the Genie Agent', 'App vibes', 'Vibes for the Alert']);
  assert.equal(w.vibesPreview('x'.repeat(100)), `${'x'.repeat(80)}…`);
  assert.equal(w.vibesPreview(' short '), 'short');
  const fallback = w.defaultSpecFromUseCase({ id: 'N01-U01', Name: 'Predict churn' }, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  const latest = { spec_version: 4, spec_json: { ...fallback, rollback_outputs: { dashboard: 2 }, retry_outputs: ['app'] } };
  assert.equal('rollback_outputs' in w.specFromLatest(latest, fallback), false, 'Edit never carries a rollback');
  assert.equal('rollback_outputs' in w.nextSpecFrom(latest, { schedule: { enabled: true } }), false);
  assert.deepEqual(w.nextSpecFrom(latest, { rollback_outputs: { app: 3 } }).rollback_outputs, { app: 3 });
  const ticked = { ...fallback, outputs: { ...fallback.outputs, genie_space: true, genie_space_vibes: 'c'.repeat(2001), alert_vibes: 'd'.repeat(2001) } };
  assert.deepEqual(w.stepErrors('vibes', ticked), ['the Genie Agent vibes are 2001 characters; at most 2000 are allowed'],
    'Start is blocked on a ticked output only');
  assert.deepEqual(w.stepErrors('delivery', ticked), [], 'the vibes are checked on the Vibes step, never on Delivery');
  assert.deepEqual(w.planLines({ classes: ['rollback'], refill: false, rollback: ['app', 'dashboard'] }).slice(-1), ['Rolls back: App, Dashboard']);
});

test('the Vibes step has one tab per box, the notebook first and then each picked output in Delivery order, with its text as typed', async () => {
  const w = await lib('implementWizard.js');
  const picked = { data: { notes: 'Score on held-out rows' }, outputs: { dashboard: true, genie_space: false, app: true, alert: true, dashboard_vibes: '  weekly  ', genie_space_vibes: 'never shown', alert_vibes: 7 } };
  assert.deepEqual(w.vibesEntries(picked), [
    { id: 'notebook', label: 'Notebook', value: 'Score on held-out rows' },
    { id: 'dashboard', label: 'Dashboard', value: '  weekly  ' },
    { id: 'app', label: 'App', value: '' },
    { id: 'alert', label: 'Alert', value: '7' },
  ], 'an unpicked output has no tab even when it holds text, and a missing value is an empty box');
  assert.deepEqual(w.vibesEntries(null), [{ id: 'notebook', label: 'Notebook', value: '' }], 'the notebook tab is always there');
  const over = { ...picked, outputs: { ...picked.outputs, app_vibes: 'a'.repeat(2001), genie_space_vibes: 'g'.repeat(2001) } };
  assert.deepEqual(w.vibesProblems(over), ['the App vibes are 2001 characters; at most 2000 are allowed'], 'only a tab that shows can block Start');
  assert.deepEqual(w.vibesEntries(over).filter((e) => w.vibesProblem(e.id, e.value)).map((e) => e.id), ['app'], 'Start opens the first tab with a problem');
});

test('the Vibes step says every box is optional with gray example text, and names each output that has no box', async () => {
  const w = await lib('implementWizard.js');
  assert.equal(w.VIBES_STEP_TITLE, 'Anything else Genie should build in?');
  assert.ok(w.VIBES_STEP_NOTE.startsWith(w.VIBES_HELP), 'the step opens with the same help the Build page vibes use');
  assert.match(w.VIBES_STEP_NOTE, /Each box is optional: leave it empty and Genie builds it the way Inspire would\. The gray text in a box is only an example\./);
  const all = { outputs: { dashboard: true, genie_space: true, app: true, alert: true } };
  assert.equal(w.vibesSkippedText(all), '', 'every output picked, nothing to name');
  assert.equal(w.vibesSkippedText({ outputs: { ...all.outputs, alert: false } }),
    'No box for Alert: Genie builds only what you picked in the Delivery step. To vibe it, go Back to Delivery and pick it.');
  assert.equal(w.vibesSkippedText({ outputs: { dashboard: true, alert: false } }),
    'No box for Genie Agent, App and Alert: Genie builds only what you picked in the Delivery step. To vibe them, go Back to Delivery and pick them.');
  assert.equal(w.vibesSkippedText(null), 'No box for Dashboard, Genie Agent, App and Alert: Genie builds only what you picked in the Delivery step. To vibe them, go Back to Delivery and pick them.');
  for (const text of [w.VIBES_STEP_TITLE, w.VIBES_STEP_NOTE, w.vibesSkippedText(null)]) assert.doesNotMatch(text, /[\u2013\u2014]|\bgrey\b/, text);
});

test('the Build page offers a vibe panel per built output and the earlier versions that kept a snapshot', async () => {
  const c = await lib('implementControl.js');
  const rows = [3, 2, 1].map((v) => I.parseImplementRow(versionRow(v, {
    vibes: { 1: 'first ask', 2: '', 3: 'third ask' }[v],
    snapshot: { dashboard: true, app: v !== 2 },
  })));
  const assets = (row, patch) => ({ ...row, asset_status: { ...row.asset_status, ...patch } });
  rows[0] = assets(rows[0], { app: { state: 'ready', spec_version: 1, snapshot: true }, alert: { state: 'failed', error: 'no email', spec_version: 3 } });
  rows[0].status = 'ready_with_warnings';
  rows[0].status_message = 'Dashboard vibe not done: put it in Arabic: the dashboard has no Arabic font; Schedule: no cron; '
    + 'App vibe not done: dark mode: the look has no dark palette';
  const cards = c.vibeCards(rows, rows[0]);
  assert.deepEqual(cards.map((x) => [x.id, x.rebuild]), [['dashboard', true], ['genie_space', true], ['app', true]],
    'the failed alert has no snapshot to roll back to, so it gets no card');
  const dash = cards[0];
  assert.deepEqual(dash.live, { version: 3, at: '2026-10-23T04:00:00Z' });
  assert.equal(dash.vibes, 'third ask');
  assert.deepEqual(dash.versions.map((v) => [v.version, v.vibes, v.status]), [[2, '', 'ready'], [1, 'first ask', 'ready']], 'the live v3 is skipped');
  assert.deepEqual(dash.warnings, ['Dashboard vibe not done: put it in Arabic: the dashboard has no Arabic font']);
  const appCard = cards.find((x) => x.id === 'app');
  assert.equal(appCard.live.version, 1, 'the App was last built on v1 and carried since');
  assert.deepEqual(appCard.versions, [], 'v3 carries the v1 App, v2 has no snapshot, and v1 is live');
  assert.deepEqual(appCard.warnings, ['App vibe not done: dark mode: the look has no dark palette']);
  assert.deepEqual(cards.find((x) => x.id === 'genie_space').versions, [], 'no snapshot flag, no version to roll back to');

  const running = [{ ...rows[0], spec_version: 4, status: 'building_outputs', asset_status: null, spec_json: { ...rows[0].spec_json, outputs: { ...rows[0].spec_json.outputs, dashboard_vibes: 'fourth ask' } } }, ...rows];
  const busy = c.vibeCards(running, running[0]);
  assert.deepEqual(busy.map((x) => x.id), ['dashboard', 'genie_space', 'app'], 'while a version builds, the cards stay on the last built version');
  assert.equal(busy[0].vibes, 'fourth ask', 'and show the asks being built');
  assert.deepEqual(c.vibeCards(running, running[0], { reason: 'stopped' }), [], 'a stopped version offers nothing until it is edited');
  assert.deepEqual(c.vibeCards([{ ...rows[0], status: 'failed' }, ...rows.slice(1)], { ...rows[0], status: 'failed' }), []);
  assert.deepEqual(c.vibeCards([], null), []);

  const latest = { spec_json: { outputs: { dashboard: true, dashboard_vibes: 'third ask', app: true } } };
  assert.deepEqual(c.vibeChanges(latest, 'dashboard', ' third ask '), { retry_outputs: ['dashboard'] }, 'unchanged text rebuilds as today');
  assert.deepEqual(c.vibeChanges(latest, 'dashboard', ' bigger bars '), { outputs: { ...latest.spec_json.outputs, dashboard_vibes: 'bigger bars' } });
  assert.deepEqual(c.vibeChanges(latest, 'app', ''), { retry_outputs: ['app'] }, 'an output with no vibes yet and an empty box rebuilds');
  assert.deepEqual(c.rollbackChanges(latest, 'dashboard', 1, 'first ask'),
    { rollback_outputs: { dashboard: 1 }, outputs: { ...latest.spec_json.outputs, dashboard_vibes: 'first ask' } });
  assert.deepEqual(c.vibeWarnings({ status_message: 'Genie Agent vibe not done: add a question; about EMEA: the space has 5; it is full' }, 'genie_space'),
    ['Genie Agent vibe not done: add a question; about EMEA: the space has 5; it is full'], 'a semicolon inside an ask stays in the warning');
  assert.deepEqual(c.vibeWarnings({ asset_status: { alert: { warnings: ['Alert vibe not done: weekly: alerts run per job run', 'Alert: other'] } } }, 'alert'),
    ['Alert vibe not done: weekly: alerts run per job run'], 'the control tower\'s own warnings list is read the same way');
  assert.deepEqual(c.vibeWarnings({ status_message: 'App: App vibe not done: a logo: no logo file was given; Schedule: no cron',
    asset_status: { app: { warnings: ['App vibe not done: a logo: no logo file was given'] } } }, 'app'),
    ['App vibe not done: a logo: no logo file was given'], 'a warning under its output\'s label shows once, from the vibe on');
  assert.deepEqual(c.vibeWarnings({ status_message: 'Dashboard vibe not done: big: no room' }, 'app'), [], 'another output\'s warning never shows');
  assert.equal(cards[0].url, '', 'no URL on the version, no link');
  const withUrl = { ...rows[0], dashboard_url: 'https://workspace.example.com/dashboardsv3/d1/published' };
  const linked = c.vibeCards([withUrl, ...rows.slice(1)], withUrl);
  assert.equal(linked[0].url, 'https://workspace.example.com/dashboardsv3/d1/published', 'the card links the live asset');
});

test('the notebook vibes hold 2000 characters, and longer or non-text ones are errors, never cut', () => {
  const noted = (notes) => I.validateImplementSpec({ ...JSON.parse(JSON.stringify(BASE)), data: { notes } });
  const ok = noted(`  ${'n'.repeat(2000)}\n`);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.spec.data.notes, 'n'.repeat(2000));
  const long = noted('n'.repeat(2001));
  assert.deepEqual(long.errors, ['the notebook vibes are 2001 characters; at most 2000 are allowed']);
  assert.equal(long.spec.data.notes.length, 2001);
  for (const [bad, shown] of [[5, '5'], [['a'], '["a"]'], [{ a: 1 }, '{"a":1}'], [true, 'true']]) {
    assert.deepEqual(noted(bad).errors, [`data.notes must be text, not ${shown}`], JSON.stringify(bad));
  }
  assert.equal(noted(null).spec.data.notes, '');
});

test('rebuilding the notebook refills it and refreshes every built output; retrying one output never touches the notebook', () => {
  const assets = { dashboard: 'd1', genie_space: 'g1', app: 'churn-desk', alert: 'a1' };
  const before = spec().spec;
  const rebuilt = spec({}, { retry_outputs: ['notebook', ' notebook '] });
  assert.deepEqual(rebuilt.errors, []);
  assert.deepEqual(rebuilt.spec.retry_outputs, ['notebook']);
  const summary = I.implementChangeSummary(before, rebuilt.spec, assets);
  assert.deepEqual([summary.classes, summary.refill, summary.schedule, summary.build], [['retry'], true, true, []]);
  assert.deepEqual([...summary.refresh].sort(), Object.keys(assets).sort());
  assert.equal(I.implementChangeSummary(before, spec({}, { retry_outputs: ['dashboard'] }).spec, assets).refill, false);
  assert.deepEqual(spec({}, { retry_outputs: ['pdf'] }).errors, ["retry output 'pdf' is not one of notebook, genie_space, dashboard, app, alert"]);
  assert.deepEqual(spec({ dashboard: false }, { retry_outputs: ['dashboard'] }).errors, ['the Dashboard cannot be retried: it is not selected']);
});

test('the Build page offers the notebook first once it is built, and its vibes or a plain rebuild go to the notebook', async () => {
  const c = await lib('implementControl.js');
  const w = await lib('implementWizard.js');
  const rows = [2, 1].map((v) => I.parseImplementRow(versionRow(v)));
  rows[0] = { ...rows[0], asset_status: { ...rows[0].asset_status, notebook: { spec_version: 1, modified_at: 1 } },
    spec_json: { ...rows[0].spec_json, data: { tables: {}, notes: '  hold out the last month  ' } } };
  const cards = c.vibeCards(rows, rows[0], null, 'https://host/#workspace/Users/me/nb');
  assert.equal(cards[0].id, 'notebook');
  assert.deepEqual([cards[0].vibes, cards[0].rebuild, cards[0].url, cards[0].live.version, cards[0].versions],
    ['hold out the last month', true, 'https://host/#workspace/Users/me/nb', 1, []]);
  assert.deepEqual(c.vibeCards([rows[1]], rows[1]).map((x) => x.id).includes('notebook'), false, 'no notebook card before the notebook is built');

  const latest = { spec_json: { data: { tables: { 'a.b.c': 'a.b.d' }, notes: 'hold out the last month' }, outputs: { app: true } } };
  assert.deepEqual(c.vibeChanges(latest, 'notebook', ' hold out the last month '), { retry_outputs: ['notebook'] });
  assert.deepEqual(c.vibeChanges(latest, 'notebook', 'score every model on the same rows'),
    { data: { tables: { 'a.b.c': 'a.b.d' }, notes: 'score every model on the same rows' } }, 'only the notes change; the data choices stay');
  const vibed = I.validateImplementSpec({ ...JSON.parse(JSON.stringify(BASE)), data: c.vibeChanges(latest, 'notebook', 'x').data });
  assert.deepEqual([vibed.errors, vibed.spec.data.notes], [[], 'x']);

  assert.equal(w.vibesLabel('notebook'), 'Notebook vibes');
  assert.equal(w.vibesProblem('notebook', 'n'.repeat(2001)), 'the notebook vibes are 2001 characters; at most 2000 are allowed');
  assert.deepEqual(w.vibesProblems({ data: { notes: 'n'.repeat(2001) }, outputs: {} }),
    ['the notebook vibes are 2001 characters; at most 2000 are allowed'], 'the notebook vibes are checked even with no output ticked');
});
