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
const PAGE = 'app:page:decisions';
const CHART = 'dashboard:w1a2b3c4';
const ASKED = '  Put the rows to act on first,\n  then a map by region  ';
const NOT_BUILT = (label) => `Inspire has not built the ${label} on this MVP, so it cannot rebuild it with your vibes; pick an asset the Control tower lists`;

function spec(outputs = {}, top = {}) {
  return I.validateImplementSpec({ ...JSON.parse(JSON.stringify(BASE)), ...top, outputs: { ...BASE.outputs, ...outputs } });
}

async function call(base, route, body) {
  const resp = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: resp.status, data: await resp.json() };
}

const submitBody = (s) => ({ inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: s });

const PARTS = {
  [PAGE]: { state: 'ready', spec_version: 2, name: 'Decisions' },
  'app:page:detail': { state: 'ready', spec_version: 1, title: 'Row detail page' },
  [CHART]: { state: 'ready_with_warnings', spec_version: 2, name: 'Weekly trend' },
  ai_reasoning: { state: 'ready', spec_version: 2 },
  value_formula: { state: 'failed', spec_version: 2, error: 'no amount column' },
  'app:page:gone': { state: 'deleted', spec_version: 2 },
};

function versionRow(version, { outputs = {}, assets = {}, status = 'ready', top = {} } = {}) {
  const asset = () => ({ state: 'ready', spec_version: version, snapshot: true });
  return {
    session_id: '42', use_case_id: 'N01-U01', spec_version: version, status, change_classes: version === 1 ? 'initial' : 'outputs',
    updated_at: `2026-10-2${version}T04:00:00Z`, spec_json: JSON.stringify({ ...BASE, ...top, outputs: { ...BASE.outputs, ...outputs } }), job_id: '77',
    dashboard_id: 'd1', genie_space_id: 'g1', app_name: 'churn-desk', alert_id: 'a1',
    asset_status: JSON.stringify({ dashboard: asset(), genie_space: asset(), app: asset(), alert: asset(), notebook: { spec_version: 1, modified_at: 1 }, ...assets }),
  };
}

function storedSpec(sqlCalls) {
  const insert = sqlCalls.find((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'));
  return insert ? { spec: JSON.parse(insert.parameters.find((p) => p.name === 'spec').value), classes: insert.parameters.find((p) => p.name === 'classes').value } : null;
}

async function served(history, run) {
  const made = makeApp({ history });
  const srv = await listen(made.app);
  try {
    await run(srv.url, made);
  } finally {
    await srv.close();
  }
}

test('vibes for a part of an output are kept exactly as typed under that part id, only while its output is ticked', () => {
  const { spec: out, errors } = spec({
    [`${PAGE}_vibes`]: ASKED, [`${CHART}_vibes`]: 'Weekly bars', ai_reasoning_vibes: 'Name the two columns behind each decision',
    value_formula_vibes: ' Price each row at its open order value ',
  });
  assert.deepEqual(errors, []);
  assert.equal(out.outputs[`${PAGE}_vibes`], ASKED, 'not trimmed and not rewritten');
  assert.equal(out.outputs[`${CHART}_vibes`], 'Weekly bars');
  assert.equal(out.outputs.ai_reasoning_vibes, 'Name the two columns behind each decision');
  assert.equal(out.outputs.value_formula_vibes, ' Price each row at its open order value ');
  const off = spec({ app: false, genie_space: false, [`${PAGE}_vibes`]: 'x'.repeat(5000), ai_reasoning_vibes: 'kept' });
  assert.deepEqual(off.errors, []);
  assert.equal(`${PAGE}_vibes` in off.spec.outputs, false, 'an unticked App drops the vibes of its pages, unchecked');
  assert.equal(off.spec.outputs.ai_reasoning_vibes, 'kept', 'the notebook parts belong to every build');
  const blank = spec({ [`${PAGE}_vibes`]: '   ', [`${CHART}_vibes`]: null });
  assert.deepEqual(blank.errors, []);
  assert.deepEqual(Object.keys(blank.spec.outputs).filter((k) => k.includes(':')), [], 'blank vibes are no vibes');
  const strange = spec({
    pdf_vibes: 'x', 'app:page:two words_vibes': 'x', 'app:page:_vibes': 'x', dashboard_vibes_vibes: 'x', [`app:page:${'p'.repeat(65)}_vibes`]: 'x', 'app:pages:x_vibes': 'x',
  });
  assert.deepEqual(strange.errors, []);
  assert.deepEqual(Object.keys(strange.spec.outputs).filter((k) => k.endsWith('_vibes')).sort(), ['alert_vibes', 'app_vibes', 'dashboard_vibes', 'genie_space_vibes'],
    'a key that is not an asset id is dropped like any unknown option');
});

test('part vibes over 2000 characters or not text are errors that name the part, and are never cut', () => {
  assert.deepEqual(spec({ [`${PAGE}_vibes`]: ` ${'a'.repeat(2000)} ` }).errors, []);
  assert.deepEqual(spec({ [`${PAGE}_vibes`]: 'a'.repeat(2001) }).errors, ['the App page decisions vibes are 2001 characters; at most 2000 are allowed']);
  const long = spec({ [`${CHART}_vibes`]: 'b'.repeat(2001) });
  assert.deepEqual(long.errors, ['the dashboard chart w1a2b3c4 vibes are 2001 characters; at most 2000 are allowed']);
  assert.equal(long.spec.outputs[`${CHART}_vibes`].length, 2001, 'kept whole');
  assert.deepEqual(spec({ value_formula_vibes: 'c'.repeat(2001) }).errors, ['the money at stake formula vibes are 2001 characters; at most 2000 are allowed']);
  assert.deepEqual(spec({ ai_reasoning_vibes: 5 }).errors, ['outputs.ai_reasoning_vibes must be text, not 5']);
  assert.deepEqual(spec({ [`${PAGE}_vibes`]: ['a'] }).errors, [`outputs.${PAGE}_vibes must be text, not ["a"]`]);
});

test('a part is rebuilt on its own through retry_outputs, needs its output ticked, and cannot rebuild while that output rolls back', () => {
  const ok = spec({}, { retry_outputs: [PAGE, ` ${PAGE} `, 'ai_reasoning', CHART] });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.spec.retry_outputs, [PAGE, 'ai_reasoning', CHART]);
  assert.deepEqual(spec({ app: false, genie_space: false }, { retry_outputs: [PAGE] }).errors, ['the App page decisions cannot be rebuilt: the App is not selected']);
  assert.deepEqual(spec({ dashboard: false }, { retry_outputs: [CHART] }).errors, ['the dashboard chart w1a2b3c4 cannot be rebuilt: the Dashboard is not selected']);
  assert.deepEqual(spec({}, { retry_outputs: ['app:page:two words'] }).errors, ["retry output 'app:page:two words' is not one of notebook, genie_space, dashboard, app, alert"]);
  assert.deepEqual(spec({}, { retry_outputs: [PAGE], rollback_outputs: { app: 1 } }).errors, ['the App cannot be retried and rolled back in the same version']);
  assert.deepEqual(spec({}, { retry_outputs: [CHART], rollback_outputs: { app: 1 } }).errors, [], 'a chart rebuilt while the App rolls back is fine');
});

test('rebuilding a part refreshes only its output, a notebook part reruns the notebook, and part vibes never rebuild an output whole', () => {
  const assets = { dashboard: 'd1', genie_space: 'g1', app: 'churn-desk', alert: 'a1' };
  const before = spec().spec;
  const page = I.implementChangeSummary(before, spec({ [`${PAGE}_vibes`]: 'x' }, { retry_outputs: [PAGE] }).spec, assets);
  assert.deepEqual([page.classes, page.refresh, page.build, page.refill], [['retry'], ['app'], [], false]);
  const formula = I.implementChangeSummary(before, spec({}, { retry_outputs: ['value_formula'] }).spec, assets);
  assert.deepEqual([formula.classes, formula.refill], [['retry'], true]);
  assert.deepEqual([...formula.refresh].sort(), Object.keys(assets).sort());
  assert.deepEqual(I.classifyImplementChange(before, spec({ [`${PAGE}_vibes`]: 'x' }).spec), [], 'page vibes are not an option of the whole App');
});

test('submit rebuilds one built part with the vibes exactly as typed, and plan says the same', async () => {
  const history = [versionRow(2, { assets: PARTS }), versionRow(1)];
  await served(history, async (url, { sqlCalls, jobs }) => {
    const sent = { ...BASE, based_on_version: 2, outputs: { ...BASE.outputs, [`${PAGE}_vibes`]: ASKED }, retry_outputs: [PAGE] };
    const plan = await call(url, '/api/inspire/implement/plan', submitBody(sent));
    assert.equal(plan.status, 200, JSON.stringify(plan.data));
    assert.deepEqual([plan.data.summary.classes, plan.data.summary.refresh, plan.data.summary.refill], [['retry'], ['app'], false]);
    const got = await call(url, '/api/inspire/implement/submit', submitBody(sent));
    assert.equal(got.status, 200, JSON.stringify(got.data));
    const stored = storedSpec(sqlCalls);
    assert.equal(stored.spec.outputs[`${PAGE}_vibes`], ASKED, 'the agent spec carries the ask untouched');
    assert.deepEqual(stored.spec.retry_outputs, [PAGE]);
    assert.equal(stored.classes, 'retry');
    assert.deepEqual([stored.spec.outputs.app_vibes, stored.spec.outputs.dashboard_vibes], ['', ''], 'no other asset gets an ask');
    assert.equal(jobs.length, 1);
  });
  for (const [id, field] of [[CHART, `${CHART}_vibes`], ['value_formula', 'value_formula_vibes'], ['app:page:detail', 'app:page:detail_vibes']]) {
    await served(history, async (url, { sqlCalls }) => {
      const got = await call(url, '/api/inspire/implement/submit', submitBody({ ...BASE, based_on_version: 2, outputs: { ...BASE.outputs, [field]: 'Bigger' }, retry_outputs: [id] }));
      assert.equal(got.status, 200, `${id}: ${JSON.stringify(got.data)}`);
      assert.deepEqual(storedSpec(sqlCalls).spec.retry_outputs, [id], `${id}: a part with warnings, a failed part and a carried part can be rebuilt`);
    });
  }
});

test('submit and plan refuse a part that is not a built asset with a clear 400, and write and launch nothing', async () => {
  const history = [versionRow(2, { assets: PARTS }), versionRow(1)];
  const cases = [
    [{ retry_outputs: ['app:page:missing'] }, NOT_BUILT('App page missing')],
    [{ retry_outputs: ['app:page:gone'] }, NOT_BUILT('App page gone')],
    [{ outputs: { ...BASE.outputs, 'dashboard:nope_vibes': 'x' }, retry_outputs: ['dashboard:nope'] }, NOT_BUILT('dashboard chart nope')],
    [{ outputs: { ...BASE.outputs, [`${PAGE}_vibes`]: 'Bigger' } }, `the vibes for the App page decisions changed, so list ${PAGE} in retry_outputs to rebuild it with them`],
    [{ retry_outputs: ['app:page:missing', 'ai_reasoning', 'dashboard:nope'] }, `${NOT_BUILT('App page missing')}; ${NOT_BUILT('dashboard chart nope')}`],
  ];
  for (const [patch, message] of cases) {
    await served(history, async (url, { sqlCalls, jobs }) => {
      for (const route of ['/api/inspire/implement/plan', '/api/inspire/implement/submit']) {
        const got = await call(url, route, submitBody({ ...BASE, based_on_version: 2, ...patch }));
        assert.equal(got.status, 400, `${route}: ${JSON.stringify(got.data)}`);
        assert.equal(got.data.error, message, route);
      }
      assert.equal(storedSpec(sqlCalls), null);
      assert.equal(jobs.length, 0);
    });
  }
  await served([versionRow(1, { status: 'failed' })], async (url, { jobs }) => {
    const got = await call(url, '/api/inspire/implement/submit', submitBody({ ...BASE, based_on_version: 1, retry_outputs: ['ai_reasoning'] }));
    assert.deepEqual([got.status, got.data.error], [400, NOT_BUILT('AI reasoning')], 'with no built version nothing can be rebuilt');
    assert.equal(jobs.length, 0);
  });
});

test('vibes carried for a part that is gone never block an unrelated change, and rolling an output back takes the part vibes of that version', async () => {
  const carried = { [`app:page:gone_vibes`]: 'an old ask', [`${PAGE}_vibes`]: 'v2 page ask', [`${CHART}_vibes`]: 'v2 chart ask' };
  const history = [
    versionRow(2, { assets: PARTS, outputs: carried }),
    versionRow(1, { outputs: { [`${PAGE}_vibes`]: '  v1 page ask ', 'app:page:old_vibes': 'v1 old page ask', [`${CHART}_vibes`]: 'v1 chart ask' } }),
  ];
  await served(history, async (url, { sqlCalls }) => {
    const got = await call(url, '/api/inspire/implement/submit', submitBody({ ...BASE, based_on_version: 2, outputs: { ...BASE.outputs, ...carried }, schedule: { enabled: true, cron: '0 0 6 ? * MON' } }));
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.equal(storedSpec(sqlCalls).spec.outputs['app:page:gone_vibes'], 'an old ask', 'kept as it was');
  });
  await served(history, async (url, { sqlCalls }) => {
    const got = await call(url, '/api/inspire/implement/submit', submitBody({ ...BASE, based_on_version: 2, outputs: { ...BASE.outputs, ...carried }, rollback_outputs: { app: 1 } }));
    assert.equal(got.status, 200, JSON.stringify(got.data));
    const { outputs } = storedSpec(sqlCalls).spec;
    assert.deepEqual([outputs[`${PAGE}_vibes`], outputs['app:page:old_vibes'], 'app:page:gone_vibes' in outputs], ['  v1 page ask ', 'v1 old page ask', false],
      'the App pages get the asks of v1 exactly, and a page v1 did not have loses its ask');
    assert.equal(outputs[`${CHART}_vibes`], 'v2 chart ask', 'the dashboard is not rolled back, so its chart keeps its ask');
  });
});

test('the wizard names, limits and sends part vibes the way the backend reads them', async () => {
  const w = await lib('implementWizard.js');
  const c = await lib('implementControl.js');
  for (const id of [PAGE, CHART, 'ai_reasoning', 'value_formula', 'notebook', 'dashboard', 'app:page:', 'app:page:two words', 'pdf', '', null]) {
    const mine = w.partOf(id);
    assert.deepEqual(mine && { output: mine.output, label: mine.label }, I.implementPart(id), String(id));
  }
  assert.deepEqual([w.vibesProblem(PAGE, 'a'.repeat(2001))], spec({ [`${PAGE}_vibes`]: 'a'.repeat(2001) }).errors);
  assert.equal(w.vibesProblem(PAGE, 'a'.repeat(2001), 'Decisions page'), 'the Decisions page vibes are 2001 characters; at most 2000 are allowed');
  assert.equal(w.vibesLabel(CHART), 'Vibes for the dashboard chart w1a2b3c4');
  assert.deepEqual([w.partLabel(PAGE, 'Decisions'), w.partLabel(PAGE, 'Row detail page'), w.partLabel(CHART, ' '), w.partLabel('value_formula', 'x')],
    ['Decisions page', 'Row detail page', 'dashboard chart w1a2b3c4', 'money at stake formula']);
  const latest = { spec_json: { outputs: { app: true, app_vibes: 'Dark header', [`${PAGE}_vibes`]: 'Rows first' } } };
  assert.deepEqual(c.vibeChanges(latest, PAGE, ASKED), { outputs: { ...latest.spec_json.outputs, [`${PAGE}_vibes`]: ASKED }, retry_outputs: [PAGE] },
    'the ask goes as typed, with only that part to rebuild');
  assert.deepEqual(c.vibeChanges(latest, PAGE, ' Rows first '), { retry_outputs: [PAGE] });
  assert.deepEqual(c.vibeChanges(latest, 'ai_reasoning', ''), { retry_outputs: ['ai_reasoning'] });
  const sent = I.validateImplementSpec({ ...JSON.parse(JSON.stringify(BASE)), ...c.vibeChanges(latest, PAGE, ASKED), outputs: { ...BASE.outputs, ...c.vibeChanges(latest, PAGE, ASKED).outputs } });
  assert.deepEqual([sent.errors, sent.spec.outputs[`${PAGE}_vibes`], sent.spec.retry_outputs], [[], ASKED, [PAGE]]);
});

test('the control tower lists every built asset grouped by output with its parts, and a part with warnings or a failed one stays listed', async () => {
  const c = await lib('implementControl.js');
  const rows = [versionRow(2, { assets: PARTS, outputs: { [`${PAGE}_vibes`]: ASKED } }), versionRow(1)].map(I.parseImplementRow);
  rows[0].dashboard_url = 'https://workspace.example.com/dashboardsv3/d1/published';
  const cards = c.vibeCards(rows, rows[0], null, 'https://host/#workspace/nb');
  assert.deepEqual(cards.map((x) => [x.id, x.output]), [
    ['notebook', 'notebook'], ['ai_reasoning', 'notebook'], ['value_formula', 'notebook'],
    ['dashboard', 'dashboard'], [CHART, 'dashboard'], ['genie_space', 'genie_space'], ['app', 'app'], [PAGE, 'app'], ['app:page:detail', 'app'], ['alert', 'alert'],
  ], 'a deleted page is not a built asset');
  const page = cards.find((x) => x.id === PAGE);
  assert.deepEqual([page.label, page.name, page.vibes, page.rebuild, page.live.version, page.state.label, page.versions],
    ['Decisions page', 'Decisions', ASKED, true, 2, 'Ready', []]);
  assert.equal(cards.find((x) => x.id === 'app:page:detail').live.version, 1, 'a carried page names the version that built it');
  const chart = cards.find((x) => x.id === CHART);
  assert.deepEqual([chart.label, chart.state, chart.url, chart.what, chart.noun], ['Weekly trend chart', { label: 'Ready with warnings', tone: 'warning' }, rows[0].dashboard_url,
    'A chart on the dashboard', 'chart']);
  const formula = cards.find((x) => x.id === 'value_formula');
  assert.deepEqual([formula.label, formula.live, formula.state.label, formula.url], ['money at stake formula', null, 'Failed', 'https://host/#workspace/nb']);
  assert.equal(c.vibeCards([{ ...rows[0], asset_status: { ...rows[0].asset_status, [PAGE]: { ...PARTS[PAGE], what: 'The rows to act on today' } } }, rows[1]],
    { ...rows[0], asset_status: { ...rows[0].asset_status, [PAGE]: { ...PARTS[PAGE], what: 'The rows to act on today' } } }).find((x) => x.id === PAGE).what,
  'The rows to act on today', 'the build status may say what a part is');
  assert.deepEqual(cards.map((x) => x.building), cards.map(() => null), 'nothing is rebuilding when no version builds');
  const unticked = { ...rows[0], spec_json: { ...rows[0].spec_json, outputs: { ...rows[0].spec_json.outputs, app: false } } };
  assert.equal(c.vibeCards(rows, unticked).some((x) => x.output === 'app'), false, 'an unticked App lists no pages');

  const live = [{ id: 'app', name: 'churn-desk' }, { id: 'dashboard', name: 'Churn dashboard' }, { id: 'alert', name: 'Churn over 25' }];
  const groups = c.assetGroups(cards, live);
  assert.deepEqual(groups.map((g) => [g.key, g.label, g.assets.map((a) => [a.title, a.group])]), [
    ['notebook', 'Genie Code notebook', [['Notebook', 'Genie Code notebook']]],
    ['results', 'Results', [['AI reasoning', 'Results'], ['Money at stake', 'Results']]],
    ['app', 'App', [['Page: Decisions', 'App'], ['Page: Row detail page', 'App']]],
    ['dashboard', 'Dashboard', [['Chart: Weekly trend', 'Dashboard']]],
    ['genie_space', 'Genie Agent', [['Instructions', 'Genie Agent']]],
    ['alert', 'Alert', [['Alert: Churn over 25', 'Alert']]],
  ], 'one row per page and per chart, and the results of the notebook in their own group');
  assert.deepEqual(groups[2].assets.map((a) => a.parent && a.parent.id), ['app', 'app'], 'a page rolls back with its App');
  const bare = c.assetGroups(cards.filter((x) => !x.id.includes(':')), []);
  assert.deepEqual(bare.find((g) => g.key === 'app').assets.map((a) => [a.title, a.parent]), [['The whole App', null]], 'with no pages in the build status the App itself is listed');
  assert.deepEqual(bare.find((g) => g.key === 'alert').assets.map((a) => a.title), ['Alert']);
  assert.deepEqual(c.assetGroups([], live), []);
});

test('an asset that a missing ask left ready_with_warnings is still built: it can be rebuilt, it stays live, and the App keeps its backend', async () => {
  const w = await lib('implementWizard.js');
  const c = await lib('implementControl.js');
  const rows = [versionRow(2, { assets: { app: { state: 'ready_with_warnings', spec_version: 2, snapshot: true }, dashboard: { state: 'ready_with_warnings', spec_version: 2 } } })]
    .map(I.parseImplementRow);
  rows[0].status = 'ready_with_warnings';
  assert.deepEqual(w.rebuildableOutputs(rows[0]).map((o) => o.id), ['dashboard', 'genie_space', 'app', 'alert']);
  const app = c.vibeCards(rows, rows[0]).find((x) => x.id === 'app');
  assert.deepEqual([app.rebuild, app.live && app.live.version], [true, 2]);
  assert.equal(c.appBackendFacts(rows[0]).backend, c.APP_BACKEND_FACTS.delta, 'an App built before the backend choice still reads Delta tables');
});

const checksOf = (...pairs) => pairs.map(([ask, status, evidence = '']) => ({ ask, status, evidence }));

test('the build record vibes_checks read as a list of asks, each done or missing with its evidence, from an array or its JSON text', async () => {
  const c = await lib('implementControl.js');
  const raw = checksOf(['Rows to act on first', 'done', 'the first widget lists them'], ['A map by region', 'missing', 'no region column'], ['Dark header', ' DONE ']);
  const read = [{ ask: 'Rows to act on first', done: true, evidence: 'the first widget lists them' }, { ask: 'A map by region', done: false, evidence: 'no region column' },
    { ask: 'Dark header', done: true, evidence: '' }];
  assert.deepEqual(c.vibeChecks(raw), read);
  assert.deepEqual(c.vibeChecks(JSON.stringify(raw)), read, 'the agent may store the list as JSON text');
  assert.deepEqual(c.vibeChecks([{ ask: '  ', status: 'done' }, null, 'text', { ask: 'Bigger', status: 'skipped' }, { ask: 'Blue' }]),
    [{ ask: 'Bigger', done: false, evidence: '' }, { ask: 'Blue', done: false, evidence: '' }], 'only a done status counts as done; an empty ask is dropped');
  for (const bad of [undefined, null, '', 'not json', '{"ask":"x"}', 5, {}]) assert.deepEqual(c.vibeChecks(bad), [], JSON.stringify(bad));
  assert.equal(c.checksSummary(c.vibeChecks(raw)), 'You asked for 3 things. Done: 2 of 3.');
  assert.equal(c.checksSummary([{ ask: 'x', done: true, evidence: '' }]), 'You asked for 1 thing. Done: 1 of 1.');
  assert.deepEqual(c.missingAsks(c.vibeChecks([...raw, { ask: 'Bigger bars', status: 'missing' }])), ['A map by region', 'Bigger bars']);
});

test('every asset shows the checklist of the version that built it, a missing ask marks it with warnings, and the old warning lines give way to it', async () => {
  const c = await lib('implementControl.js');
  const pageChecks = checksOf(['Rows to act on first', 'done', 'first widget'], ['A map by region', 'missing', 'no region column']);
  const rows = [
    versionRow(3, { status: 'ready_with_warnings', assets: {
      app: { state: 'ready', spec_version: 3, snapshot: true, vibes_checks: JSON.stringify(checksOf(['Dark header', 'done', 'header is #111'])) },
      [PAGE]: { state: 'ready_with_warnings', spec_version: 3, name: 'Decisions', vibes_checks: pageChecks },
      dashboard: { state: 'ready', spec_version: 2, snapshot: true },
      notebook: { spec_version: 3, vibes_checks: checksOf(['Hold out the last month', 'done', 'cell 4']) },
      ai_reasoning: { state: 'ready', spec_version: 3, vibes_checks: checksOf(['Name two columns', 'missing', 'it names one']) },
    } }),
    versionRow(2, { assets: { dashboard: { state: 'ready', spec_version: 2, snapshot: true, vibes_checks: checksOf(['Weekly bars', 'done', 'grain is week']) } } }),
    versionRow(1),
  ].map(I.parseImplementRow);
  rows[0].status_message = 'App vibe not done: a logo: no logo file was given';
  const cards = c.vibeCards(rows, rows[0]);
  const byId = (id) => cards.find((x) => x.id === id);
  assert.deepEqual(byId(PAGE).checks.map((x) => [x.ask, x.done]), [['Rows to act on first', true], ['A map by region', false]]);
  assert.equal(byId(PAGE).state.label, 'Ready with warnings');
  assert.deepEqual([byId(PAGE).checkedOn, byId('dashboard').checkedOn], [3, 2], 'each checklist says the version that built it');
  assert.deepEqual([byId('app').checks.length, byId('app').state.label, byId('app').warnings], [1, 'Ready', []], 'the checklist replaces the old warning lines');
  assert.deepEqual(byId('dashboard').checks.map((x) => x.ask), ['Weekly bars'], 'a carried dashboard shows the checklist of v2, which built it');
  assert.deepEqual([byId('notebook').checks.length, byId('ai_reasoning').state.label], [1, 'Ready with warnings'], 'a ready part with a missing ask reads Ready with warnings');
  assert.deepEqual(byId('genie_space').checks, []);
  assert.deepEqual(byId('genie_space').warnings, [], 'no checks and no warning lines');
  const legacy = c.vibeCards([{ ...rows[0], asset_status: { ...rows[0].asset_status, app: { state: 'ready', spec_version: 3, snapshot: true } } }, ...rows.slice(1)],
    { ...rows[0], asset_status: { ...rows[0].asset_status, app: { state: 'ready', spec_version: 3, snapshot: true } } });
  assert.deepEqual(legacy.find((x) => x.id === 'app').warnings, ['App vibe not done: a logo: no logo file was given'], 'with no checklist the old warning lines still show');
});

test('a rolled back output, and its parts, show the checklist of the version they rolled back to, and each earlier version shows its own', async () => {
  const c = await lib('implementControl.js');
  const v1 = checksOf(['Put the trend first', 'done', 'first widget'], ['Arabic labels', 'missing', 'no Arabic font']);
  const rows = [
    versionRow(4, { top: { rollback_outputs: { dashboard: 2 } }, assets: {
      dashboard: { state: 'ready', spec_version: 4, snapshot: true, vibes_checks: [] }, [CHART]: { state: 'ready', spec_version: 4, name: 'Trend' } } }),
    versionRow(3, { assets: { dashboard: { state: 'ready', spec_version: 3, snapshot: true, vibes_checks: checksOf(['Make it blue', 'done', 'blue']) } } }),
    versionRow(2, { top: { rollback_outputs: { dashboard: 1 } }, assets: { dashboard: { state: 'ready', spec_version: 2, snapshot: true } } }),
    versionRow(1, { assets: { dashboard: { state: 'ready', spec_version: 1, snapshot: true, vibes_checks: v1 }, [CHART]: { state: 'ready', spec_version: 1, vibes_checks: checksOf(['Weekly', 'done', 'week']) } } }),
  ].map(I.parseImplementRow);
  const cards = c.vibeCards(rows, rows[0]);
  const dash = cards.find((x) => x.id === 'dashboard');
  assert.deepEqual(dash.checks.map((x) => x.ask), ['Put the trend first', 'Arabic labels'], 'v4 rolled back to v2, which rolled back to v1');
  assert.deepEqual([dash.state.label, dash.checkedOn], ['Ready with warnings', 1]);
  assert.deepEqual(cards.find((x) => x.id === CHART).checks.map((x) => x.ask), ['Weekly'], 'the chart came back with its dashboard, with the asks of v1');
  assert.deepEqual(dash.versions.map((v) => [v.version, c.checksSummary(v.checks)]),
    [[3, 'You asked for 1 thing. Done: 1 of 1.'], [2, 'You asked for 2 things. Done: 1 of 2.'], [1, 'You asked for 2 things. Done: 1 of 2.']]);
  assert.deepEqual(c.tryAgainChanges('dashboard', c.missingAsks(dash.checks)), { retry_outputs: ['dashboard'], retry_asks: { dashboard: ['Arabic labels'] } },
    'Try again names the missing asks and leaves the vibes as the user wrote them');
});

test('Try again sends retry_asks for an asset it rebuilds, which never carries into the next version and never changes the vibes', async () => {
  const w = await lib('implementWizard.js');
  const c = await lib('implementControl.js');
  const ok = spec({ [`${CHART}_vibes`]: 'Bars by week\nA map by region' }, { retry_outputs: [CHART, 'dashboard'], retry_asks: { [CHART]: [' A map by region ', ''], dashboard: ['Arabic labels'] } });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.spec.retry_asks, { [CHART]: ['A map by region'], dashboard: ['Arabic labels'] });
  assert.equal(ok.spec.outputs[`${CHART}_vibes`], 'Bars by week\nA map by region', 'the vibes stay as typed');
  assert.equal('retry_asks' in spec().spec, false, 'no asks to try again, no key');
  assert.deepEqual(spec({}, { retry_asks: { [CHART]: ['x'] } }).errors, [`retry_asks names '${CHART}', which this version does not rebuild; list it in retry_outputs too`]);
  assert.deepEqual(spec({}, { retry_outputs: ['app'], retry_asks: { app: [] } }).errors, ['retry_asks.app must list at least one ask to try again']);
  assert.deepEqual(spec({}, { retry_outputs: ['app'], retry_asks: { app: 'x' } }).errors, ['retry_asks.app must be a list']);
  assert.deepEqual(spec({}, { retry_outputs: ['app'], retry_asks: ['app'] }).errors, ['retry_asks must be an object']);
  assert.deepEqual(spec({}, { retry_outputs: [PAGE], retry_asks: { [PAGE]: ['y'.repeat(2001)] } }).errors, ['each ask to try again on the App page decisions must be at most 2000 characters']);
  assert.deepEqual(spec({}, { retry_outputs: ['app'], retry_asks: { app: [5] } }).errors, ['each item of retry_asks.app must be text, not 5']);
  const fallback = w.defaultSpecFromUseCase({ id: 'N01-U01', Name: 'Predict churn' }, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  const latest = { spec_version: 4, spec_json: { ...fallback, ...c.tryAgainChanges('dashboard', ['Arabic labels']) } };
  assert.equal('retry_asks' in w.nextSpecFrom(latest, { schedule: { enabled: true } }), false);
  assert.equal('retry_asks' in w.specFromLatest(latest, fallback), false, 'Edit never carries asks to try again');

  const history = [versionRow(2, { assets: PARTS, outputs: { [`${CHART}_vibes`]: 'Bars by week\nA map by region' } }), versionRow(1)];
  await served(history, async (url, { sqlCalls, jobs }) => {
    const got = await call(url, '/api/inspire/implement/submit', submitBody({
      ...BASE, based_on_version: 2, outputs: { ...BASE.outputs, [`${CHART}_vibes`]: 'Bars by week\nA map by region' }, ...c.tryAgainChanges(CHART, ['A map by region']),
    }));
    assert.equal(got.status, 200, JSON.stringify(got.data));
    const stored = storedSpec(sqlCalls);
    assert.deepEqual([stored.spec.retry_outputs, stored.spec.retry_asks, stored.spec.outputs[`${CHART}_vibes`], stored.classes],
      [[CHART], { [CHART]: ['A map by region'] }, 'Bars by week\nA map by region', 'retry']);
    assert.equal(jobs.length, 1);
  });
});

test('while a version builds, the assets it rebuilds read Rebuilding with the asks it is reading, and the rest stay as they were', async () => {
  const c = await lib('implementControl.js');
  const built = versionRow(2, { assets: PARTS, outputs: { [`${CHART}_vibes`]: 'Bars by week' } });
  const building = (top, outputs = {}, extra = {}) => ({
    ...versionRow(3, { status: 'building_outputs', top, outputs: { [`${CHART}_vibes`]: 'Bars by week', ...outputs }, assets: {} }), implement_run_id: '1066', ...extra,
  });
  const states = (row) => {
    const rows = [row, built, versionRow(1)].map(I.parseImplementRow);
    return Object.fromEntries(c.vibeCards(rows, rows[0]).map((x) => [x.id, x.building ? `${x.state.label} ${x.building.step} ${x.building.asks}` : x.state.label]));
  };
  const page = states(building({ retry_outputs: [PAGE] }, { [`${PAGE}_vibes`]: 'Rows first, then a map by region and a filter' }));
  assert.equal(page[PAGE], 'Rebuilding 1 3', 'the page reads its 3 asks');
  assert.deepEqual([page.app, page['app:page:detail'], page[CHART], page.dashboard], ['Ready', 'Ready', 'Ready with warnings', 'Ready'], 'nothing else changes');
  const queued = states(building({ retry_outputs: [CHART], retry_asks: { [CHART]: ['A map by region'] } }, {}, { status: 'queued' }));
  assert.equal(queued[CHART], 'Rebuilding 0 1', 'Try again reads only the missing ask');
  const checking = states(building({ retry_outputs: [PAGE] }, { [`${PAGE}_vibes`]: 'Rows first, then a map by region and a filter' }, { status: 'checking' }));
  assert.equal(checking[PAGE], 'Rebuilding 2 3', 'while the notebook checks the asks, the third step is the one running');
  assert.equal(checking[CHART], 'Ready with warnings', 'checking one asset leaves the others as they were');
  const wholeApp = states(building({}, { app_vibes: 'Dark header' }));
  assert.deepEqual([wholeApp.app, wholeApp[PAGE], wholeApp['app:page:detail'], wholeApp.alert], ['Rebuilding 1 1', 'Rebuilding 1 0', 'Rebuilding 1 0', 'Ready'],
    'new App vibes rebuild the App and its pages');
  const edit = states({ ...building({}), change_classes: 'data,outputs' });
  assert.ok(Object.values(edit).every((s) => s.startsWith('Rebuilding')), 'an edit of the data rebuilds every asset');
  const rolled = states(building({ rollback_outputs: { dashboard: 1 } }));
  assert.deepEqual([rolled.dashboard, rolled[CHART], rolled.app], ['Rebuilding 1 0', 'Rebuilding 1 0', 'Ready'], 'a roll back asks Genie nothing');
  const rollRows = [building({ rollback_outputs: { dashboard: 1 } }), built, versionRow(1)].map(I.parseImplementRow);
  assert.deepEqual(c.vibeCards(rollRows, rollRows[0]).filter((x) => x.building).map((x) => [x.id, x.building.rollback]), [['dashboard', 1], [CHART, 1]]);
  const stopped = [building({ retry_outputs: [PAGE] }), built].map(I.parseImplementRow);
  assert.deepEqual(c.vibeCards(stopped, stopped[0], { reason: 'stopped' }), [], 'a stopped version offers nothing until it is edited');
  assert.deepEqual([c.askCount('Show the biggest first, add a filter, and hide small ones'), c.askCount('one'), c.askCount(''), c.askCount('Rows first\nA map')], [3, 0, 0, 2]);
});

test('an output whose options an edit changed reads Rebuilding with its parts while that version builds, for every option the backend knows', async () => {
  const c = await lib('implementControl.js');
  const built = versionRow(2, { assets: PARTS });
  const rebuilding = (outputs) => {
    const rows = [{ ...versionRow(3, { status: 'building_outputs', outputs, assets: {} }), implement_run_id: '1066' }, built].map(I.parseImplementRow);
    return c.vibeCards(rows, rows[0]).filter((x) => x.building).map((x) => x.id).sort();
  };
  const partsOf = { dashboard: ['dashboard', CHART], genie_space: ['genie_space'], app: ['app', PAGE, 'app:page:detail'], alert: ['alert'] };
  const changed = { dashboard_name: 'Churn board', dashboard_filters: ['region'], genie_space_name: 'Churn agent', genie_questions: ['Who left?'], app_purpose: 'Act on churn',
    app_access: 'user', app_look: { style: 'b' }, app_options: { modify: true }, app_backend: 'lakebase', app_owners: ['b@example.com'],
    app_charts: ['trend', 'bars', 'split'], app_pages: { impact: false },
    alert_name: 'Churn alert', alert_tiers: 'act_now_review',
    alert_operator: '>', alert_threshold: 9, alert_threshold_basis: 'baseline', alert_condition_text: 'more than nine', alert_recipients: ['b@example.com'],
    alert_destinations: [{ id: 'abcdef12', name: 'Ops' }], dashboard_vibes: 'x', genie_space_vibes: 'x', app_vibes: 'x', alert_vibes: 'x' };
  for (const name of I.IMPLEMENT_OUTPUTS) {
    for (const option of I.IMPLEMENT_OUTPUT_OPTIONS[name]) {
      assert.ok(Object.hasOwn(changed, option), `the test changes ${option}`);
      assert.deepEqual(rebuilding({ [option]: changed[option] }), [...partsOf[name]].sort(), `${option} rebuilds the ${name} and its parts only`);
    }
  }
  assert.deepEqual(rebuilding({ merge: { app: 'other-app' } }), [...partsOf.app].sort(), 'moving the App into another rebuilds it');
  assert.deepEqual(rebuilding({}), [], 'an unchanged version rebuilds nothing');
});
