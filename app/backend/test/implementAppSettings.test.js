const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const I = require('../lib/inspireImplement');
const S = require('../lib/appShell');
const { makeApp, listen } = require('./support/implementApp');

const BASE = {
  use_case_id: 'N01-U01',
  use_case_name: 'Predict churn',
  config: { warehouse_id: 'wh1', result_table: 'main.inspire.n01_u01_out' },
  outputs: { dashboard: true, app: true, app_name: 'churn-desk', app_access: 'sp' },
};

const withOutputs = (outputs) => ({ ...BASE, outputs: { ...BASE.outputs, ...outputs } });
const check = (outputs, options) => I.validateImplementSpec(withOutputs(outputs), options);
const SHELL = S.appShellCatalog();

test('the bundled agent notebook carries the App shell, and its lists and palettes are the ones the shell validates against', () => {
  assert.equal(SHELL.ok, true, SHELL.error);
  assert.deepEqual(SHELL.styles, ['a', 'b', 'c']);
  assert.deepEqual(SHELL.layouts, ['sidebar', 'tabs', 'home']);
  assert.deepEqual(SHELL.auths, ['user', 'sp']);
  assert.deepEqual(SHELL.themes, ['light', 'dark']);
  assert.equal(I.IMPLEMENT_APP_OPTION_KEYS.includes('download'), false, 'the App offers no data downloads');
  assert.deepEqual(SHELL.options.filter((o) => o !== 'download'), I.IMPLEMENT_APP_OPTION_KEYS, 'the C1 option keys are the shell OPTIONS, less the download it no longer offers');
  assert.equal(SHELL.palettes.length, 13);
  assert.equal(SHELL.palettes[0], 'default');
  assert.deepEqual(SHELL.palette_colors.map((p) => p.id), SHELL.palettes);
  for (const p of SHELL.palette_colors) {
    for (const theme of ['light', 'dark']) {
      assert.match(p[theme].base.bg, /^#[0-9a-f]{3,8}$/i, `${p.id} ${theme}`);
      assert.equal(Object.keys(p[theme].hues).length, 9, `${p.id} ${theme} hues`);
      for (const hue of Object.values(p[theme].hues)) assert.match(hue.line, /^#[0-9a-f]{6}$/i);
    }
  }
  assert.notDeepEqual(SHELL.palette_colors[0].light.hues, SHELL.palette_colors[1].light.hues, 'each palette has its own colours');
  for (const [key, list] of Object.entries({ style: 'styles', layout: 'layouts', palette: 'palettes', theme: 'themes' })) {
    assert.ok(SHELL[list].includes(I.IMPLEMENT_APP_LOOK_DEFAULT[key]), `the default ${key} is one the shell offers`);
  }
  const core = S.appShellPayload(S.bundledNotebookText()).files['shell_core.py'];
  assert.deepEqual(S.pythonTuple(core, 'PALETTES'), SHELL.palettes);
  if (SHELL.user_off) {
    assert.deepEqual(SHELL.user_off.filter((o) => o !== 'download'), I.IMPLEMENT_PER_USER_OFF, 'the options a per-user App turns off are the shell\'s');
  }
  const userOff = S.appShellLook({ version: 1, files: { 'shell_core.py': `${core.replace(/^USER_OFF = .*$/m, '')}\nUSER_OFF = ("decisions", "alerts")\n`, 'static/assets/app.js': S.appShellPayload(S.bundledNotebookText()).files['static/assets/app.js'] } });
  assert.deepEqual(userOff.user_off, I.IMPLEMENT_PER_USER_OFF);
});

test('the palettes come from the payload when the notebook carries them, and from the built bundle otherwise, never from a copy', () => {
  const ids = ['default', 'mono'];
  const one = (bg) => ({ light: { base: { bg, line: '#e3e7ec' }, hues: { blue: { line: '#365691' } } }, dark: { base: { bg: '#0c1015' }, hues: { blue: { line: '#6c8fd0' } } } });
  const js = `var q=1;const Ab={light:{base:{bg:"#111111","line-strong":"#cfd5dc"},hues:{blue:{line:"#123456"}}},dark:{base:{bg:"#000000"},hues:{blue:{line:"#654321"}}}},`
    + `Zz={default:{light:{base:{bg:"#f4f6f8"},hues:{blue:{line:"#365691"}}},dark:{base:{bg:"#0c1015"},hues:{blue:{line:"#6c8fd0"}}}},mono:Ab},Fu=["blue"];`;
  const fromBundle = S.palettesFromBundle(js, ids);
  assert.equal(fromBundle.default.light.base.bg, '#f4f6f8');
  assert.equal(fromBundle.mono.light.base['line-strong'], '#cfd5dc');
  assert.equal(fromBundle.mono.dark.hues.blue.line, '#654321');
  assert.throws(() => S.palettesFromBundle(js, ['default', 'mono', 'neon']), /holds no colours for the palettes default, mono, neon/);
  assert.throws(() => S.palettesFromBundle('const a={default:1}', ids), /holds no colours/);
  const core = 'STYLES = ("a", "b", "c")\nLAYOUTS = ("sidebar", "tabs", "home")\nAUTHS = ("user", "sp")\nTHEMES = ("light", "dark")\n'
    + 'PALETTES = ("default", "mono")\nOPTIONS = ("modify", "replace_edits", "decisions")\n';
  const viaPayload = S.appShellLook({ version: 1, files: { 'shell_core.py': core, 'static/assets/app.js': 'nothing here' }, palettes: { default: one('#abcdef'), mono: one('#fedcba') } });
  assert.equal(viaPayload.palette_source, 'payload');
  assert.deepEqual(viaPayload.palette_colors.map((p) => p.light.base.bg), ['#abcdef', '#fedcba']);
  const viaBundle = S.appShellLook({ version: 1, files: { 'shell_core.py': core, 'static/assets/app.js': js } });
  assert.equal(viaBundle.palette_source, 'bundle');
  assert.deepEqual(viaBundle.palette_colors.map((p) => p.light.base.bg), ['#f4f6f8', '#111111']);
  assert.throws(() => S.appShellLook({ version: 1, files: { 'shell_core.py': core.replace(/^PALETTES.*$/m, '') } }), /defines no PALETTES/);
});

test('the backends come from the shell\'s Postgres layer: a shell without it reads only Delta tables, and one whose list has no Delta is refused', () => {
  assert.deepEqual(SHELL.backends, ['lakebase', 'delta'], 'the bundled shell reads Lakebase or Delta tables, Delta last as the default');
  const payload = S.appShellPayload(S.bundledNotebookText());
  assert.deepEqual(S.pythonTuple(payload.files['shell_pg.py'], 'KINDS'), SHELL.backends);
  const { 'shell_pg.py': _pg, ...older } = payload.files;
  assert.deepEqual(S.appShellLook({ ...payload, files: older }).backends, ['delta']);
  const noDelta = { ...payload.files, 'shell_pg.py': payload.files['shell_pg.py'].replace(/^KINDS = .*$/m, 'KINDS = ("lakebase",)') };
  assert.throws(() => S.appShellLook({ ...payload, files: noDelta }), /KINDS has no delta/);
});

test('the App backend is lakebase or delta, Delta when unset so a stored spec keeps the backend it was built on, and an App that is not built has none', () => {
  const backend = (outputs) => check(outputs).spec.outputs.app_backend;
  assert.equal(backend({}), 'delta');
  assert.equal(backend({ app_backend: '' }), 'delta');
  assert.equal(backend({ app_access: 'sp', app_backend: '' }), 'delta');
  assert.equal(backend({ app_backend: ' Lakebase ' }), 'lakebase');
  assert.equal(backend({ app_backend: 'DELTA' }), 'delta');
  assert.equal(backend({ app: false, app_backend: 'postgres' }), '');
  const refused = check({ app_backend: 'postgres' });
  assert.equal(refused.spec.outputs.app_backend, 'delta');
  assert.deepEqual(refused.errors.filter((e) => e.includes('reads its data')),
    ["choose where the App reads its data: 'lakebase' (its pages load instantly) or 'delta' (Delta tables, its pages take a few seconds to load), not 'postgres'"]);
  const old = check({ app_backend: 'lakebase' }, { shell: { ...SHELL, backends: ['delta'] } });
  assert.ok(old.errors.some((e) => e.endsWith("not 'lakebase'")), 'a shell that reads only Delta tables refuses Lakebase');
  assert.equal(I.classifyImplementChange(check({ app_backend: 'delta' }).spec, check({ app_backend: 'lakebase' }).spec).join(), 'outputs');
});

test('a notebook without the App shell, or with a broken one, is refused with the reason', () => {
  const notebook = (line) => JSON.stringify({ cells: [{ source: [] }, { source: ['x = 1\n', ...(line === null ? [] : [line])] }] });
  const encode = (data) => zlib.deflateSync(Buffer.from(JSON.stringify(data))).toString('base64');
  assert.throws(() => S.appShellPayload(notebook(null)), /carries no App shell \(0 _INSPIRE_APP_SHELL lines\)/);
  assert.throws(() => S.appShellPayload(notebook(`${S.APP_SHELL_CONSTANT}""`)), /App shell is empty/);
  assert.throws(() => S.appShellPayload(notebook(`${S.APP_SHELL_CONSTANT}"bm90IHpsaWI="`)), /does not decode/);
  assert.throws(() => S.appShellPayload(notebook(`${S.APP_SHELL_CONSTANT}"${encode({ version: 2, files: {} })}"`)), /is not version 1/);
  assert.throws(() => S.appShellPayload('{nope'), /not valid JSON/);
  assert.equal(S.appShellPayload(notebook(`${S.APP_SHELL_CONSTANT}"${encode({ version: 1, files: { a: 'b' } })}"`)).files.a, 'b');
  const { errors } = check({}, { shell: { ok: false, error: 'the bundled agent notebook carries no App shell' } });
  assert.ok(errors.includes('the App cannot be built: the bundled agent notebook carries no App shell'), JSON.stringify(errors));
  assert.deepEqual(I.validateImplementSpec({ ...BASE, outputs: { dashboard: true } }, { shell: { ok: false, error: 'x' } }).errors, [],
    'a spec without an App never needs the shell');
});

test('an App needs its access chosen: a missing or unknown app_access is an error, and per-user turns record decisions off', () => {
  const choose = "choose who the App reads its data as: 'user' (each person sees only the rows and columns their Unity Catalog grants allow) or 'sp' (everyone sees the same data through the App's service principal)";
  const missing = check({ app_access: undefined });
  assert.ok(missing.errors.includes(choose), JSON.stringify(missing.errors));
  assert.ok(check({ app_access: '' }).errors.includes(choose));
  assert.ok(check({ app_access: '  ' }).errors.includes(choose));
  assert.ok(check({ app_access: 'everyone' }).errors.includes(`${choose}, not 'everyone'`));
  assert.ok(check({ app_access: 3 }).errors.includes(`${choose}, not 3`));
  const all = { modify: true, replace_edits: true, decisions: true, alerts: true };
  const sp = check({ app_options: all });
  assert.deepEqual(sp.errors, []);
  assert.deepEqual(sp.spec.outputs.app_options, all);
  const user = check({ app_access: 'USER', app_options: all });
  assert.deepEqual(user.errors, []);
  assert.equal(user.spec.outputs.app_access, 'user');
  assert.deepEqual(user.spec.outputs.app_options, { modify: true, replace_edits: true, decisions: false, alerts: false }, 'per-user sends no alerts and records no decisions');
  assert.deepEqual(check({ app_options: { replace_edits: true } }).spec.outputs.app_options,
    { modify: false, replace_edits: false, decisions: false, alerts: false }, 'replacing edits means nothing while edits are off');
  const off = I.validateImplementSpec({ ...BASE, outputs: { dashboard: true, app: false, app_access: 'nobody', app_options: { download: 'yes' } } });
  assert.deepEqual(off.errors, [], 'App settings are not checked while the App is unticked');
  assert.deepEqual([off.spec.outputs.app_access, off.spec.outputs.app_look, off.spec.outputs.app_options], ['', {}, {}]);
});

test('App options are true or false only, and an unknown option, download among them, is an error', () => {
  const unknown = (key) => `the App has no option '${key}'; its options are modify, replace_edits, decisions, alerts`;
  assert.ok(check({ app_options: { modify: 'yes' } }).errors.includes("the App option modify must be true or false, not 'yes'"));
  assert.ok(check({ app_options: { decisions: 1 } }).errors.includes('the App option decisions must be true or false, not 1'));
  assert.ok(check({ app_options: { export: true } }).errors.includes(unknown('export')));
  for (const value of [true, false, 'yes', null]) {
    const got = check({ app_options: { download: value, modify: true } });
    assert.deepEqual(got.errors, [unknown('download')], `download ${JSON.stringify(value)} is refused as an option the App does not have`);
    assert.deepEqual(got.spec.outputs.app_options, { modify: true, replace_edits: false, decisions: false, alerts: false });
  }
  assert.deepEqual(check({ app_access: 'user', app_options: { download: false } }).errors, [unknown('download')], 'per-user refuses it too');
  assert.ok(check({ app_options: ['modify'] }).errors.includes('outputs.app_options must be an object'));
  assert.deepEqual(check({ app_options: { modify: null } }).errors, []);
});

test('the App look defaults to style A, sidebar, the default palette and light, and an unknown value is an error', () => {
  assert.deepEqual(check({}).spec.outputs.app_look, { style: 'a', layout: 'sidebar', palette: 'default', theme: 'light' });
  assert.deepEqual(check({ app_look: { style: '', palette: null } }).spec.outputs.app_look, I.IMPLEMENT_APP_LOOK_DEFAULT);
  const picked = check({ app_look: { style: 'C', layout: 'home', palette: 'Nordic', theme: 'dark' } });
  assert.deepEqual(picked.errors, []);
  assert.deepEqual(picked.spec.outputs.app_look, { style: 'c', layout: 'home', palette: 'nordic', theme: 'dark' });
  const unknownPalette = check({ app_look: { palette: 'rainbow' } });
  assert.ok(unknownPalette.errors.includes(`the App palette 'rainbow' is not one Inspire offers; pick one of ${SHELL.palettes.join(', ')}`), JSON.stringify(unknownPalette.errors));
  assert.equal(unknownPalette.spec.outputs.app_look.palette, 'default');
  assert.ok(check({ app_look: { style: 'd' } }).errors.includes("the App style 'd' is not one Inspire offers; pick one of a, b, c"));
  assert.ok(check({ app_look: { layout: 'grid' } }).errors.includes("the App layout 'grid' is not one Inspire offers; pick one of sidebar, tabs, home"));
  assert.ok(check({ app_look: { theme: 'sepia' } }).errors.includes("the App theme 'sepia' is not one Inspire offers; pick one of light, dark"));
  assert.ok(check({ app_look: { font: 'serif' } }).errors.includes("the App look has no setting 'font'; it sets only style, layout, palette, theme"));
  assert.ok(check({ app_look: 'dark' }).errors.includes('outputs.app_look must be an object'));
});

test('ticking the App ticks the Genie Agent, since Ask Genie in the App needs one', () => {
  const { spec, errors } = check({ genie_space: false });
  assert.deepEqual(errors, []);
  assert.equal(spec.outputs.genie_space, true);
  assert.equal(I.validateImplementSpec({ ...BASE, outputs: { dashboard: true, genie_space: false } }).spec.outputs.genie_space, false,
    'without the App the Genie Agent stays as chosen');
});

test('a merge names an existing App, dashboard or Genie Agent, "" creates a new one, and a merge into an unticked output is dropped', () => {
  const fresh = check({});
  assert.deepEqual(fresh.spec.outputs.merge, { app: '', dashboard: '', genie_space: '' });
  const merged = check({ app_name: 'predict-churn', merge: { app: 'Churn-Desk', dashboard: '01ef2a3b4c5d6e7f', genie_space: '01abc_def-9' } });
  assert.deepEqual(merged.errors, []);
  assert.deepEqual(merged.spec.outputs.merge, { app: 'churn-desk', dashboard: '01ef2a3b4c5d6e7f', genie_space: '01abc_def-9' });
  assert.equal(merged.spec.outputs.app_name, 'churn-desk', 'joining an App deploys to that App');
  assert.ok(check({ merge: { app: 'Churn_Desk' } }).errors.includes("outputs.merge.app 'Churn_Desk' must name an existing Inspire App"));
  assert.ok(check({ merge: { dashboard: 'a b' } }).errors.includes("outputs.merge.dashboard 'a b' must name an existing Inspire dashboard"));
  assert.ok(check({ merge: { genie_space: 'x'.repeat(65) } }).errors.includes(`outputs.merge.genie_space '${'x'.repeat(65)}' must name an existing Inspire Genie Agent`));
  assert.ok(check({ merge: { alert: 'a1' } }).errors.includes('outputs.merge.alert is not one of dashboard, genie_space, app'));
  for (const [name, label] of [['app', 'App'], ['dashboard', 'dashboard'], ['genie_space', 'Genie Agent']]) {
    for (const value of [7, true, ['d1']]) {
      assert.ok(check({ merge: { [name]: value } }).errors.includes(`outputs.merge.${name} must be text: the ${label} to add to, or "" for a new one`), `${name} ${JSON.stringify(value)}`);
    }
  }
  const unticked = I.validateImplementSpec({ ...BASE, outputs: { dashboard: false, alert: false, app: false, genie_space: true, merge: { dashboard: 'd1', app: 'churn-desk' } } });
  assert.deepEqual(unticked.spec.outputs.merge, { app: '', dashboard: '', genie_space: '' });
});

test('a change of access, look or options refreshes only the App, and a new merge target rebuilds that output there', () => {
  const before = check({ merge: { dashboard: '' } }).spec;
  const assets = { dashboard: 'd1', genie_space: 'g1', app: 'churn-desk' };
  for (const outputs of [{ app_access: 'user' }, { app_look: { palette: 'ocean' } }, { app_options: { modify: true } }]) {
    const summary = I.implementChangeSummary(before, check(outputs).spec, assets);
    assert.deepEqual([summary.classes, summary.refresh, summary.build, summary.refill], [['outputs'], ['app'], [], false], JSON.stringify(outputs));
  }
  const moved = I.implementChangeSummary(before, check({ merge: { dashboard: '01ef2a3b4c5d6e7f' } }).spec, assets);
  assert.deepEqual([moved.classes, moved.build, moved.refresh], [['outputs'], ['dashboard'], []]);
  assert.deepEqual(I.classifyImplementChange(before, check({}).spec), [], 'the same App settings are no change');
});

test('a version built before the access choice keeps its service principal when a retry or a removal re-submits it', () => {
  const legacy = { spec_version: 2, status: 'ready', spec_json: { ...BASE, outputs: { dashboard: true, app: true, app_name: 'churn-desk' } } };
  assert.equal(I.legacyAppAccess([legacy]), 'sp');
  assert.equal(I.legacyAppAccess([{ ...legacy, spec_json: withOutputs({ app_access: 'user' }) }]), '', 'a version that chose access has no legacy default');
  assert.equal(I.legacyAppAccess([{ ...legacy, status: 'failed' }]), '', 'only a built App carries a mode to keep');
  assert.equal(I.legacyAppAccess([{ ...legacy, spec_json: { ...BASE, outputs: { dashboard: true } } }]), '');
  assert.equal(I.legacyAppAccess([]), '');
  const resubmit = { ...BASE, outputs: { dashboard: false, app: true, app_name: 'churn-desk' } };
  assert.ok(I.validateImplementSpec(resubmit).errors.some((e) => e.startsWith('choose who the App reads its data as')), 'without the history the access stays required');
  const kept = I.validateImplementSpec(resubmit, { legacyAccess: 'sp' });
  assert.deepEqual(kept.errors, []);
  assert.equal(kept.spec.outputs.app_access, 'sp');
  assert.ok(I.validateImplementSpec({ ...resubmit, outputs: { ...resubmit.outputs, app_access: '' } }, { legacyAccess: 'sp' }).errors
    .some((e) => e.startsWith('choose who the App reads its data as')), 'the wizard sends the key, so its empty choice is never filled in');
});

test('an Edit that only states the service principal an older App already had is no change', () => {
  const legacy = { spec_version: 1, status: 'ready', spec_json: { ...BASE, outputs: { dashboard: true, app: true, app_name: 'churn-desk' } } };
  const same = check({ app_access: 'sp' }).spec;
  assert.equal(I.planSubmission([legacy], { ...same, based_on_version: 1 }).unchanged, true);
  const plan = I.planSubmission([legacy], { ...check({ app_access: 'user' }).spec, based_on_version: 1 });
  assert.deepEqual([plan.summary.classes, plan.summary.build, plan.summary.refresh], [['outputs'], ['dashboard', 'genie_space', 'app'], []]);
});

const row = (sid, uc, version, extra = {}) => ({
  session_id: sid, use_case_id: uc, spec_version: version, status: 'ready', updated_at: `2026-10-2${version}T00:00:00Z`,
  spec_json: JSON.stringify(withOutputs({ app_access: 'sp' })), asset_status: null, dashboard_id: null, genie_space_id: null, app_name: null, ...extra,
});
const named = (name, outputs = {}) => JSON.stringify({ ...withOutputs(outputs), use_case_name: name });

test('the merge registry lists the assets other use cases hold, with their use cases and the App sign-in, never the use case\'s own', () => {
  const rows = [
    row('42', 'N01-U02', 1, { app_name: 'churn-desk', dashboard_id: 'd1', spec_json: named('Forecast demand') }),
    row('42', 'N01-U03', 2, { app_name: 'churn-desk', spec_json: named('Score suppliers', { app_access: 'user' }) }),
    row('42', 'N01-U03', 1, { status: 'failed', app_name: 'old-app' }),
    row('7', 'N01-U01', 1, { genie_space_id: 'g9', spec_json: named('Other session churn') }),
    row('42', 'N01-U01', 1, { app_name: 'own-app', dashboard_id: 'own-dash' }),
    row('42', 'N02-U01', 2, { asset_status: JSON.stringify({ dashboard: { state: 'deleted' } }), spec_json: named('Deleted one') }),
    row('42', 'N02-U01', 1, { dashboard_id: 'gone-dash' }),
  ].map(I.parseImplementRow);
  const reg = I.mergeRegistry(rows, { sessionId: '42', useCaseId: 'N01-U01' });
  assert.deepEqual(reg.app.map((e) => e.id), ['churn-desk']);
  assert.deepEqual(reg.app[0].holders.map((h) => [h.use_case_id, h.use_case_name, h.app_access]),
    [['N01-U02', 'Forecast demand', 'sp'], ['N01-U03', 'Score suppliers', 'user']]);
  assert.deepEqual(reg.dashboard.map((e) => e.id), ['d1'], 'a deleted dashboard and the use case\'s own are not targets');
  assert.deepEqual(reg.genie_space.map((e) => [e.id, e.holders[0].session_id]), [['g9', '7']], 'other sessions count too');
  const only = I.mergeRegistry(rows, { sessionId: '42', useCaseId: 'N01-U01', only: { app: 'churn-desk', dashboard: '', genie_space: '' } });
  assert.deepEqual([only.app.length, only.dashboard.length, only.genie_space.length], [1, 0, 0]);
  const app = I.mergeTarget('app', reg.app[0], { ok: true, data: { name: 'churn-desk', url: 'https://churn-desk.example.com',
    description: 'Inspire use case N01-U02 (session 42): Forecast demand' } });
  assert.deepEqual([app.access, app.use_cases.map((u) => u.name)], ['user', ['Forecast demand', 'Score suppliers']], 'one per-user holder makes a per-user App');
  assert.equal(I.mergeTarget('app', reg.app[0], { ok: true, data: { name: 'churn-desk', description: 'Sales forecasting tool' } }), null,
    'an App whose description is not an Inspire owner tag is not Inspire-built');
  assert.equal(I.mergeTarget('app', reg.app[0], { ok: false, status: 404, data: {} }), null);
  assert.equal(I.mergeTarget('dashboard', reg.dashboard[0], { ok: true, data: { lifecycle_state: 'TRASHED' } }), null);
  assert.deepEqual(I.mergeTarget('dashboard', reg.dashboard[0], { ok: true, data: { display_name: 'Demand' } }, 'https://w.example.com/'),
    { id: 'd1', name: 'Demand', url: 'https://w.example.com/dashboardsv3/d1/published', use_cases: [{ session_id: '42', use_case_id: 'N01-U02', name: 'Forecast demand' }] });
  assert.equal(I.mergeTarget('genie_space', reg.genie_space[0], { ok: true, data: { title: 'Churn agent' } }).name, 'Churn agent');
  const statement = I.implementRegistryStatement('`main`.`inspire`.`__inspire_implement`', new Set(['session_id', 'app_name']));
  assert.match(statement.sql, /WHERE `app_name` IS NOT NULL ORDER BY/);
  assert.match(statement.sql, /NULL AS `dashboard_id`/);
  assert.match(I.implementRegistryStatement('t').sql, /WHERE `app_name` IS NOT NULL OR `dashboard_id` IS NOT NULL OR `genie_space_id` IS NOT NULL OR `asset_status` IS NOT NULL/);
});

test('a per-user use case cannot join a service-principal App, and a merge target must be one Inspire listed', () => {
  const sp = { id: 'churn-desk', name: 'churn-desk', access: 'sp', use_cases: [] };
  const user = { id: 'care-desk', name: 'care-desk', access: 'user', use_cases: [] };
  const targets = { app: [sp, user], dashboard: [{ id: 'd1' }], genie_space: [] };
  const spec = (outputs) => check(outputs).spec;
  assert.deepEqual(I.mergeProblems(spec({ merge: { app: 'churn-desk' } }), targets), []);
  const blocked = I.mergeProblems(spec({ app_access: 'user', merge: { app: 'churn-desk' } }), targets);
  assert.deepEqual(blocked, ['churn-desk signs everyone in with its own service principal, so a per-user (sensitive) use case cannot join it: '
    + 'create a new App, or choose Internal data']);
  assert.equal(I.appMergeBlock(sp, 'user'), blocked[0]);
  assert.deepEqual(I.mergeProblems(spec({ app_access: 'user', merge: { app: 'care-desk' } }), targets), [], 'per-user into per-user is fine');
  assert.deepEqual(I.mergeProblems(spec({ merge: { app: 'care-desk' } }), targets), [], 'an internal use case may join a per-user App');
  assert.deepEqual(I.mergeProblems(spec({ merge: { dashboard: 'd2', genie_space: 'g1' } }), targets), [
    'd2 is not a dashboard Inspire built that you can open: pick one Inspire lists, or create a new one',
    'g1 is not a Genie Agent Inspire built that you can open: pick one Inspire lists, or create a new one',
  ]);
  assert.deepEqual(I.mergeProblems(spec({ merge: { dashboard: 'd2' } }), targets, { dashboard: 'd2' }), [], 'the dashboard it already holds is not re-checked');
});

const Q = 'inspire_database=main.inspire&warehouse_id=wh1&session_id=42&use_case_id=N01-U01';

async function call(base, path, body) {
  const resp = await fetch(base + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return { status: resp.status, data: await resp.json() };
}

const REGISTRY = [
  row('42', 'N01-U02', 1, { app_name: 'churn-desk', dashboard_id: 'd1', genie_space_id: 'g1', spec_json: named('Forecast demand') }),
  row('42', 'N01-U03', 1, { app_name: 'not-ours', spec_json: named('Score suppliers') }),
];
const REST = {
  appsByName: {
    'churn-desk': { name: 'churn-desk', url: 'https://churn-desk.example.com', description: 'Inspire use case N01-U02 (session 42): Forecast demand' },
    'not-ours': { name: 'not-ours', description: 'Somebody else built this' },
  },
  responses: { 'GET /api/2.0/genie/spaces/g1': [{ space_id: 'g1', title: 'Demand agent' }] },
};

test('a merge target App shows the look of the use case that built it, never a joiner\'s look', () => {
  const look = (style, palette) => ({ app_access: 'sp', app_look: { style, layout: 'tabs', palette, theme: 'light' } });
  const rows = [
    row('77', 'N04-U01', 1, { app_name: 'churn-desk', spec_json: named('Route trucks', look('b', 'ocean')) }),
    row('42', 'N01-U02', 1, { app_name: 'churn-desk', spec_json: named('Forecast demand', look('a', 'forest')) }),
    row('42', 'N01-U05', 1, { app_name: 'churn-desk', spec_json: named('Plan shifts') }),
  ].map(I.parseImplementRow);
  const [entry] = I.mergeRegistry(rows, { sessionId: '42', useCaseId: 'N01-U01' }).app;
  assert.deepEqual(entry.holders.map((h) => h.use_case_id), ['N04-U01', 'N01-U02', 'N01-U05'], 'the joiner is listed first');
  const owned = (description) => I.mergeTarget('app', entry, { ok: true, data: { name: 'churn-desk', description } });
  assert.deepEqual(owned('Inspire use case N01-U02 (session 42): Forecast demand').look, look('a', 'forest').app_look);
  assert.deepEqual(owned('Inspire use case N04-U01 (session 77): Route trucks').look, look('b', 'ocean').app_look);
  assert.equal(owned('Inspire use case N01-U05 (session 42): Plan shifts').look, null, 'an owner with no recorded look shows none');
});

test('the App lists the merge targets Inspire built and confirms each one live', async () => {
  const { app, fetches } = makeApp({ registry: REGISTRY, ...REST });
  const srv = await listen(app);
  try {
    const got = await call(srv.url, `/api/inspire/implement/merge-targets?${Q}`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(got.data.targets.app.map((t) => [t.id, t.access, t.use_cases.map((u) => u.name)]), [['churn-desk', 'sp', ['Forecast demand']]]);
    assert.match(got.data.targets.app[0].per_user_block, /^churn-desk signs everyone in with its own service principal/);
    assert.deepEqual(got.data.targets.dashboard.map((t) => [t.id, t.name]), [['d1', 'Dashboard']]);
    assert.deepEqual(got.data.targets.genie_space.map((t) => [t.id, t.name]), [['g1', 'Demand agent']]);
    assert.ok(fetches.some((f) => f.path === '/api/2.0/apps/not-ours'), 'every recorded App is checked live');
  } finally {
    await srv.close();
  }
});

test('an App target carries where each of its use cases was placed and when, and the wizard learns their business and domain from Inspire\'s tables', () => {
  const rows = [
    row('42', 'N01-U02', 2, { app_name: 'churn-desk', dashboard_id: 'd1', spec_json: named('Forecast demand', { app_placement: 'domain' }) }),
    row('77', 'N04-U01', 1, { app_name: 'churn-desk', spec_json: named('Route trucks', { app_placement: 'team' }) }),
  ].map(I.parseImplementRow);
  const reg = I.mergeRegistry(rows, { sessionId: '42', useCaseId: 'N01-U01' });
  const description = 'Inspire use case N01-U02 (session 42): Forecast demand';
  const app = I.mergeTarget('app', reg.app[0], { ok: true, data: { name: 'churn-desk', description } });
  assert.deepEqual(app.use_cases.map((u) => [u.use_case_id, u.placement, u.updated_at]),
    [['N01-U02', 'domain', '2026-10-22T00:00:00Z'], ['N04-U01', '', '2026-10-21T00:00:00Z']], 'a placement Inspire does not know reads as none');
  const dash = I.mergeTarget('dashboard', reg.dashboard[0], { ok: true, data: { display_name: 'Demand' } });
  assert.deepEqual(Object.keys(dash.use_cases[0]), ['session_id', 'use_case_id', 'name'], 'App placement means nothing to a dashboard');
  const many = [{ use_cases: Array.from({ length: 150 }, (_, i) => ({ session_id: String(1000 + i) })) }];
  assert.deepEqual(I.scopeSessions([{ use_cases: [{ session_id: '42' }, { session_id: '42' }, { session_id: 'x; DROP' }, { session_id: '' }] }, { use_cases: [{ session_id: '77' }] }]), ['42', '77'],
    'only whole-number sessions, once each');
  assert.equal(I.scopeSessions(many).length, I.IMPLEMENT_SCOPE_SESSION_CAP);
  assert.deepEqual(I.scopeSessions(undefined), []);
  const statement = I.useCaseScopeStatement('main', 'inspire', ['42', '77']);
  assert.match(statement.sql, /FROM `main`\.`inspire`\.`__inspire_usecases` u LEFT JOIN \(SELECT session_id, max\(business_name\) AS business_name FROM `main`\.`inspire`\.`__inspire_session` GROUP BY session_id\) s/);
  assert.match(statement.sql, /WHERE u\.session_id IN \(:s0, :s1\)$/);
  assert.deepEqual(statement.parameters, [{ name: 's0', value: '42', type: 'BIGINT' }, { name: 's1', value: '77', type: 'BIGINT' }]);
  const scoped = I.withUseCaseScope([app], [
    { session_id: '42', use_case_id: 'N01-U02', business: ' Acme ', domain: 'Customer ' },
    { session_id: '77', use_case_id: 'N04-U02', business: 'Globex', domain: 'Logistics' },
  ]);
  assert.deepEqual(scoped[0].use_cases.map((u) => [u.use_case_id, u.business, u.domain]), [['N01-U02', 'Acme', 'Customer'], ['N04-U01', null, null]],
    'a use case Inspire cannot find has no business or domain, so the wizard never recommends its App');
  assert.deepEqual(I.withUseCaseScope([{ use_cases: [{ session_id: '42', use_case_id: 'N01-U02' }] }], [{ session_id: '42', use_case_id: 'N01-U02', business: null, domain: null }])[0].use_cases[0],
    { session_id: '42', use_case_id: 'N01-U02', business: '', domain: '' });
  assert.deepEqual(I.withUseCaseScope(null, []), []);
});

test('the merge targets route adds each App use case\'s business and domain, and a missing Inspire table leaves them unknown instead of failing', async () => {
  const useCaseScope = [{ session_id: '42', use_case_id: 'N01-U02', business: 'Acme', domain: 'Customer' }];
  const { app, sqlCalls } = makeApp({ registry: REGISTRY, ...REST, useCaseScope });
  const srv = await listen(app);
  try {
    const got = await call(srv.url, `/api/inspire/implement/merge-targets?${Q}`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(got.data.targets.app[0].use_cases.map((u) => [u.use_case_id, u.business, u.domain, u.placement]), [['N01-U02', 'Acme', 'Customer', '']]);
    const scopeCall = sqlCalls.find((c) => c.sql.includes('u.business_domain AS domain'));
    assert.deepEqual(scopeCall.parameters, [{ name: 's0', value: '42', type: 'BIGINT' }]);
  } finally {
    await srv.close();
  }
  for (const [message, status] of [['[TABLE_OR_VIEW_NOT_FOUND] __inspire_session', 200], ['[UNRESOLVED_COLUMN] business_domain', 200], ['warehouse is stopped', 500]]) {
    const broken = makeApp({ registry: REGISTRY, ...REST, useCaseScope, sqlErrors: { 'u.business_domain AS domain': message } });
    const server = await listen(broken.app);
    try {
      const got = await call(server.url, `/api/inspire/implement/merge-targets?${Q}`);
      assert.equal(got.status, status, message);
      if (status === 200) assert.deepEqual(got.data.targets.app[0].use_cases.map((u) => [u.business, u.domain]), [[null, null]], message);
    } finally {
      await server.close();
    }
  }
  const empty = makeApp({ registry: [], ...REST });
  const server = await listen(empty.app);
  try {
    assert.equal((await call(server.url, `/api/inspire/implement/merge-targets?${Q}`)).status, 200);
    assert.equal(empty.sqlCalls.some((c) => c.sql.includes('u.business_domain AS domain')), false, 'no App, no scope lookup');
  } finally {
    await server.close();
  }
});

test('plan and submit refuse a per-user use case joining a service-principal App, and accept the internal one', async () => {
  const { app, jobs, fetches } = makeApp({ registry: REGISTRY, ...REST });
  const srv = await listen(app);
  const body = (outputs) => ({ inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: withOutputs({ merge: { app: 'churn-desk' }, ...outputs }) });
  try {
    const refused = await call(srv.url, '/api/inspire/implement/plan', body({ app_access: 'user' }));
    assert.equal(refused.status, 400);
    assert.match(refused.data.error, /churn-desk signs everyone in with its own service principal, so a per-user \(sensitive\) use case cannot join it/);
    const notListed = await call(srv.url, '/api/inspire/implement/submit', body({ merge: { app: 'not-ours' } }));
    assert.equal(notListed.status, 400);
    assert.match(notListed.data.error, /not-ours is not an App Inspire built that you can open/);
    assert.equal(jobs.length, 0);
    fetches.length = 0;
    const ok = await call(srv.url, '/api/inspire/implement/plan', body({}));
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.deepEqual(fetches.filter((f) => f.path.startsWith('/api/2.0/apps/') && !f.path.includes('?')).map((f) => f.path), ['/api/2.0/apps/churn-desk'],
      'a plan checks only the App it joins, not every App Inspire built');
    assert.deepEqual(ok.data.summary.build, ['dashboard', 'genie_space', 'app']);
  } finally {
    await srv.close();
  }
});

test('a re-submission of an App built before the access choice keeps its service principal, and a new App without one is refused', async () => {
  const legacySpec = { ...BASE, outputs: { dashboard: true, app: true, app_name: 'churn-desk' } };
  const history = [{ session_id: '42', use_case_id: 'N01-U01', spec_version: 1, status: 'ready', spec_json: JSON.stringify(legacySpec), app_name: 'churn-desk' }];
  const { app, sqlCalls } = makeApp({ history });
  const srv = await listen(app);
  try {
    const retry = await call(srv.url, '/api/inspire/implement/submit', {
      inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: { ...legacySpec, based_on_version: 1, retry_outputs: ['app'] },
    });
    assert.equal(retry.status, 200, JSON.stringify(retry.data));
    const insert = sqlCalls.find((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(JSON.parse(insert.parameters.find((p) => p.name === 'spec').value).outputs.app_access, 'sp');
  } finally {
    await srv.close();
  }
  const fresh = makeApp();
  const srv2 = await listen(fresh.app);
  try {
    const refused = await call(srv2.url, '/api/inspire/implement/submit', {
      inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: withOutputs({ app_access: '' }),
    });
    assert.equal(refused.status, 400);
    assert.match(refused.data.error, /choose who the App reads its data as: 'user'/);
    assert.equal(fresh.jobs.length, 0);
  } finally {
    await srv2.close();
  }
});

test('the App look endpoint serves the shell\'s 13 palettes, and preflight checks a joined App\'s access without a name check', async () => {
  const { app } = makeApp({ appsByName: REST.appsByName });
  const srv = await listen(app);
  try {
    const look = await call(srv.url, '/api/inspire/implement/app-look');
    assert.equal(look.status, 200);
    assert.deepEqual(look.data.palettes, SHELL.palettes);
    assert.equal(look.data.palette_colors.length, 13);
    const joined = await call(srv.url, `/api/inspire/implement/preflight?${Q}&result_table=main.inspire.n01_u01_out&app_name=&merge_app=churn-desk&genie=1`);
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    assert.ok(joined.data.checks.app_access, 'the joined App must read the result table');
    assert.equal(joined.data.checks.app_name, undefined, 'joining an App never checks its name as a new one');
    assert.equal(joined.data.checks.genie_spaces.detail, 'you can create Genie Agents');
  } finally {
    await srv.close();
  }
});

test('a version saved while the App offered downloads is read without them, so Edit and every re-submission of it are accepted', async () => {
  const saved = (options) => withOutputs({ app_options: options });
  const old = { spec_version: '1', status: 'ready', use_case_id: 'N01-U01', app_name: 'churn-desk',
    spec_json: JSON.stringify(saved({ download: true, modify: true, replace_edits: false, decisions: false })) };
  const parsed = I.parseImplementRow(old);
  assert.deepEqual(parsed.spec_json.outputs.app_options, { modify: true, replace_edits: false, decisions: false });
  assert.deepEqual(I.validateImplementSpec(parsed.spec_json).errors, []);
  assert.deepEqual(I.parseImplementRow({ spec_json: JSON.stringify({ outputs: { app_options: 'odd' } }) }).spec_json, { outputs: { app_options: 'odd' } },
    'a saved value that is not an object is left for the check to report');
  assert.deepEqual(I.parseImplementRow({ spec_json: JSON.stringify({ outputs: { dashboard: true } }) }).spec_json, { outputs: { dashboard: true } });
  assert.equal(I.parseImplementRow({ spec_json: null }).spec_json, null);
  const offRow = I.parseImplementRow({ ...old, spec_json: JSON.stringify(saved({ download: false, modify: false, replace_edits: false, decisions: false })) });
  assert.equal(I.planSubmission([offRow], { ...check({}).spec, based_on_version: 1 }).unchanged, true, 'the same choices without the download are no change');

  const { app, sqlCalls, jobs } = makeApp({ history: [old] });
  const srv = await listen(app);
  try {
    const context = await call(srv.url, `/api/inspire/implement/context?${Q}`);
    assert.equal(context.status, 200, JSON.stringify(context.data));
    assert.deepEqual(context.data.latest.spec_json.outputs.app_options, { modify: true, replace_edits: false, decisions: false });
    const rebuild = await call(srv.url, '/api/inspire/implement/submit', {
      inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42',
      spec: { ...context.data.latest.spec_json, based_on_version: 1, retry_outputs: ['app'] },
    });
    assert.equal(rebuild.status, 200, JSON.stringify(rebuild.data));
    const insert = sqlCalls.find((c) => String(c.sql).includes('INSERT INTO'));
    assert.deepEqual(JSON.parse(insert.parameters.find((p) => p.name === 'spec').value).outputs.app_options,
      { modify: true, replace_edits: false, decisions: false, alerts: false }, 'the re-submission is checked again, so alerts are set off');
    assert.equal(jobs.length, 1);
  } finally {
    await srv.close();
  }
});

test('alerts are off unless asked for, a shared App keeps them on, and a per-user App never sends them', () => {
  assert.equal(check({}).spec.outputs.app_options.alerts, false, 'alerts start off');
  const on = check({ app_options: { alerts: true } });
  assert.deepEqual(on.errors, []);
  assert.equal(on.spec.outputs.app_options.alerts, true);
  const user = check({ app_access: 'user', app_options: { alerts: true, decisions: true } });
  assert.deepEqual(user.errors, []);
  assert.deepEqual([user.spec.outputs.app_options.alerts, user.spec.outputs.app_options.decisions], [false, false]);
  assert.ok(check({ app_options: { alerts: 'yes' } }).errors.includes("the App option alerts must be true or false, not 'yes'"));
  assert.ok(SHELL.options.includes('alerts'), 'the bundled App shell offers alerts');
  assert.ok(SHELL.user_off.includes('alerts'), 'the bundled App shell turns alerts off for a per-user App');
});

test('the App charts and pages come from the shell: its kinds, Inspire\'s pick and the pages it can turn off', () => {
  const payload = S.appShellPayload(S.bundledNotebookText());
  const sql = payload.files['shell_sql.py'];
  assert.deepEqual(SHELL.chart_kinds, ['trend', 'bars', 'split', 'pareto', 'scatter']);
  assert.deepEqual(SHELL.chart_kinds, S.pythonTuple(sql, 'CHART_KINDS'));
  assert.deepEqual(SHELL.chart_pick, S.pythonTuple(sql, 'CHART_PICK'));
  assert.ok(SHELL.chart_pick.length >= I.IMPLEMENT_APP_CHARTS_MIN, 'Inspire\'s pick meets the minimum');
  assert.deepEqual(SHELL.screens, S.pythonTuple(payload.files['shell_core.py'], 'SCREENS'));
  assert.deepEqual(SHELL.screens, ['runs', 'impact']);
  const stray = { ...payload.files, 'shell_sql.py': sql.replace(/^CHART_PICK = .*$/m, 'CHART_PICK = ("trend", "pie", "bars")') };
  assert.throws(() => S.appShellLook({ ...payload, files: stray }), /CHART_PICK names pie, which CHART_KINDS does not have/);
});

test('picked charts are ordered the shell\'s way and need at least 3 kinds, and only Runs and Impact can be turned off', () => {
  const picked = check({ app_charts: ['scatter', 'Trend', 'bars', 'trend'] });
  assert.deepEqual(picked.errors, []);
  assert.deepEqual(picked.spec.outputs.app_charts, ['trend', 'bars', 'scatter']);
  assert.deepEqual(check({}).spec.outputs.app_charts, [], 'no pick is Inspire\'s pick');
  assert.deepEqual(check({}).spec.outputs.app_pages, { runs: true, impact: true });
  assert.deepEqual(check({ app_charts: ['trend', 'bars'] }).errors, ['pick at least 3 kinds of chart for the App, not 2']);
  assert.deepEqual(check({ app_charts: 'trend' }).errors, ['the App charts must be a list of the kinds of chart the App draws, from trend, bars, split, pareto, scatter']);
  assert.ok(check({ app_charts: ['trend', 'bars', 'pie'] }).errors.includes("the App has no kind of chart 'pie'; its kinds are trend, bars, split, pareto, scatter"));
  const pages = check({ app_pages: { impact: false } });
  assert.deepEqual([pages.errors, pages.spec.outputs.app_pages], [[], { runs: true, impact: false }]);
  assert.deepEqual(check({ app_pages: { genie: false } }).errors,
    ["the App has no page 'genie' to turn on or off; Things to fix and Ask Genie are always on, and only runs, impact can be turned off"]);
  assert.deepEqual(check({ app_pages: { runs: 'off' } }).errors, ["the App page runs must be true or false, not 'off'"]);
  const off = check({ app: false, app_charts: ['pie'], app_pages: { impact: 'no' } });
  assert.deepEqual([off.errors, off.spec.outputs.app_charts, off.spec.outputs.app_pages], [[], [], {}], 'an App that is not built takes no charts or pages');
});

test('a shell without chart kinds or screens refuses a pick it cannot honour instead of dropping it, and takes Inspire\'s pick', () => {
  const payload = S.appShellPayload(S.bundledNotebookText());
  const core = payload.files['shell_core.py'].replace(/^SCREENS = .*$/m, '');
  const { 'shell_sql.py': _sql, ...files } = { ...payload.files, 'shell_core.py': core };
  const older = S.appShellLook({ ...payload, files });
  assert.equal(older.chart_kinds, undefined);
  assert.equal(older.screens, undefined);
  const plain = check({}, { shell: older });
  assert.deepEqual(plain.errors, []);
  assert.equal(Object.prototype.hasOwnProperty.call(plain.spec.outputs, 'app_charts'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(plain.spec.outputs, 'app_pages'), false);
  assert.deepEqual(check({ app_charts: [], app_pages: { runs: true } }, { shell: older }).errors, []);
  assert.deepEqual(check({ app_charts: ['trend', 'bars', 'pareto'] }, { shell: older }).errors,
    ['this Inspire agent notebook draws the charts Genie picks, so it cannot take the kinds of chart you picked; update Inspire to pick them']);
  assert.deepEqual(check({ app_pages: { impact: false } }, { shell: older }).errors,
    ['this Inspire agent notebook shows every App page, so it cannot turn one off; update Inspire to turn pages off']);
});
