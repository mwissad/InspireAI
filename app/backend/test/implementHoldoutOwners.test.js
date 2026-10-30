const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const I = require('../lib/inspireImplement');
const { makeApp, listen } = require('./support/implementApp');

const frontendLib = (name) => import(pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', name)).href);
const UC = { id: 'N01-U01', Name: 'Predict churn', statement: 'Cut churn in the top segment', sponsor: 'Head of Retention' };
const BASE = {
  use_case_id: 'N01-U01',
  use_case_name: 'Predict churn',
  config: { warehouse_id: 'wh1', result_table: 'main.inspire.n01_u01_out' },
  outputs: { dashboard: true, app: true, app_name: 'churn-desk', app_access: 'sp' },
};
const withOutputs = (outputs) => ({ ...BASE, outputs: { ...BASE.outputs, ...outputs } });
const SHARE_ERROR = (shown) => `holdout share ${shown} must be a share above 0 and at most 0.5, such as 0.1 for 10% of the records`;

async function call(base, route, body) {
  const resp = await fetch(base + route, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return { status: resp.status, data: await resp.json() };
}

const rawRow = (spec, assets = { dashboard_id: 'd1' }) => ({
  session_id: '42', use_case_id: 'N01-U01', spec_version: '1', status: 'ready', spec_json: JSON.stringify(spec), ...assets,
});
const builtRow = (spec, assets) => I.parseImplementRow(rawRow(spec, assets));
const ALL_ASSETS = { dashboard_id: 'd1', genie_space_id: 'g1', app_name: 'churn-desk' };

test('a spec without a holdout cleans without one, and a sent holdout is checked the way the agent checks it', () => {
  const none = I.validateImplementSpec(BASE);
  assert.deepEqual(none.errors, []);
  assert.equal(Object.prototype.hasOwnProperty.call(none.spec, 'holdout'), false, 'nothing is sent, nothing is kept');
  assert.equal(Object.prototype.hasOwnProperty.call(I.validateImplementSpec({ ...BASE, holdout: null }).spec, 'holdout'), false);
  const cases = [
    [{ enabled: true }, { enabled: true, share: 0.1 }, []],
    [{ enabled: true, share: 0.25 }, { enabled: true, share: 0.25 }, []],
    [{ enabled: false, share: '0.25' }, { enabled: false, share: 0.25 }, []],
    [{ share: 0.5 }, { enabled: false, share: 0.5 }, []],
    [{}, { enabled: false, share: 0.1 }, []],
    ['', { enabled: false, share: 0.1 }, []],
    [{ share: 0 }, { enabled: false, share: 0.1 }, [SHARE_ERROR('0')]],
    [{ enabled: true, share: 0.6 }, { enabled: true, share: 0.1 }, [SHARE_ERROR('0.6')]],
    [{ share: 'ten' }, { enabled: false, share: 0.1 }, [SHARE_ERROR("'ten'")]],
    [{ share: true }, { enabled: false, share: 0.1 }, [SHARE_ERROR('true')]],
    [{ enabled: 'yes' }, { enabled: false, share: 0.1 }, ["holdout.enabled must be true or false, not 'yes'"]],
    ['on', { enabled: false, share: 0.1 }, ['holdout must be an object']],
    [[], { enabled: false, share: 0.1 }, ['holdout must be an object']],
  ];
  for (const [given, kept, errors] of cases) {
    const got = I.validateImplementSpec({ ...BASE, holdout: given });
    assert.deepEqual(got.errors, errors, JSON.stringify(given));
    assert.deepEqual(got.spec.holdout, kept, JSON.stringify(given));
  }
  assert.deepEqual([I.IMPLEMENT_HOLDOUT_SHARE, I.IMPLEMENT_HOLDOUT_MAX_SHARE], [0.1, 0.5]);
  assert.deepEqual([I.implementHoldoutShare({ enabled: true, share: 0.2 }), I.implementHoldoutShare({ enabled: false, share: 0.2 }),
    I.implementHoldoutShare(undefined), I.implementHoldoutShare('on')], [0.2, 0, 0, 0]);
});

test('a holdout change is a change of its own: it rebuilds nothing, and an edit that only changes the holdout is not refused as unchanged', () => {
  const before = I.validateImplementSpec(withOutputs({ app: false })).spec;
  const rows = [builtRow(before)];
  const edit = (holdout) => ({ ...I.validateImplementSpec({ ...withOutputs({ app: false }), ...(holdout === undefined ? {} : { holdout }) }).spec,
    based_on_version: 1 });
  const on = I.planSubmission(rows, edit({ enabled: true, share: 0.15 }));
  assert.equal(on.unchanged, false, 'turning the holdout on is something to build');
  assert.deepEqual(on.summary.classes, ['holdout']);
  assert.deepEqual([on.summary.refill, on.summary.build, on.summary.refresh, on.summary.schedule], [false, [], [], false],
    'the notebook, the outputs and the schedule stay as they are; the next run reads the new share from the run controls');
  assert.equal(I.planSubmission(rows, edit(undefined)).unchanged, true, 'no holdout sent is no change');
  assert.equal(I.planSubmission(rows, edit({ enabled: false, share: 0.3 })).unchanged, true, 'a holdout sent switched off holds nothing back, like none');
  const held = [builtRow(edit({ enabled: true, share: 0.1 }))];
  assert.deepEqual(I.planSubmission(held, edit({ enabled: true, share: 0.2 })).summary.classes, ['holdout'], 'a new share is a change');
  assert.deepEqual(I.planSubmission(held, edit({ enabled: false, share: 0.1 })).summary.classes, ['holdout'], 'switching it off is a change');
  assert.equal(I.planSubmission(held, edit({ enabled: true, share: 0.1 })).unchanged, true);
  assert.equal(I.IMPLEMENT_CHANGE_CLASSES[I.IMPLEMENT_CHANGE_CLASSES.indexOf('schedule') + 1], 'holdout', 'the holdout class sits with the other run settings');
});

test('submit keeps the holdout the person sent and refuses a share above half the records with the agent message', async () => {
  const before = I.validateImplementSpec(withOutputs({ app: false })).spec;
  const { app, sqlCalls, jobs } = makeApp({ history: [rawRow(before)] });
  const srv = await listen(app);
  const body = (holdout) => ({ inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42',
    spec: { ...withOutputs({ app: false }), based_on_version: 1, holdout } });
  try {
    const refused = await call(srv.url, '/api/inspire/implement/submit', body({ enabled: true, share: 0.75 }));
    assert.equal(refused.status, 400);
    assert.match(refused.data.error, /holdout share 0\.75 must be a share above 0 and at most 0\.5/);
    assert.equal(jobs.length, 0);
    const ok = await call(srv.url, '/api/inspire/implement/submit', body({ enabled: true, share: 0.15 }));
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const insert = sqlCalls.find((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'));
    assert.deepEqual(JSON.parse(insert.parameters.find((p) => p.name === 'spec').value).holdout, { enabled: true, share: 0.15 });
    assert.equal(insert.parameters.find((p) => p.name === 'classes').value, 'holdout');
    assert.equal(jobs.length, 1);
  } finally {
    await srv.close();
  }
});

test('an App names at most 50 owners by email, de-duplicated, empty by default and cleared when the App is off', () => {
  const check = (outputs) => I.validateImplementSpec(withOutputs(outputs));
  assert.deepEqual(check({}).spec.outputs.app_owners, [], 'nobody unless named');
  const named = check({ app_owners: ['Pat@Example.com', ' pat@example.COM ', 'lee@example.com '] });
  assert.deepEqual(named.errors, []);
  assert.deepEqual(named.spec.outputs.app_owners, ['Pat@Example.com', 'lee@example.com'], 'the first spelling of each person is kept');
  assert.deepEqual(check({ app_owners: ['nope', 'lee@example.com'] }).errors, ["App owner 'nope' is not an email address"]);
  assert.deepEqual(check({ app_owners: ['nope', 'lee@example.com'] }).spec.outputs.app_owners, ['lee@example.com']);
  assert.deepEqual(check({ app_owners: [3] }).errors, ['App owner 3 is not an email address']);
  assert.deepEqual(check({ app_owners: 'lee@example.com' }).errors, ['outputs.app_owners must be a list']);
  const long = `${'a'.repeat(I.IMPLEMENT_EMAIL_MAX_CHARS - 'example.com'.length)}@example.com`;
  assert.equal(long.length, I.IMPLEMENT_EMAIL_MAX_CHARS + 1);
  assert.deepEqual(check({ app_owners: [long] }).errors, [`App owner '${long}' is not an email address`], 'the App shell takes names of at most 254 characters');
  const people = (n) => Array.from({ length: n }, (_, i) => `person${i}@example.com`);
  assert.deepEqual(check({ app_owners: people(50) }).errors, []);
  assert.deepEqual(check({ app_owners: [...people(50), 'PERSON0@example.com'] }).errors, [], 'a repeat does not count twice');
  assert.deepEqual(check({ app_owners: people(51) }).errors,
    ['an App can name at most 50 owners, the people who may change its money at stake assumptions']);
  const off = check({ app: false, app_owners: ['nope'] });
  assert.deepEqual([off.errors, off.spec.outputs.app_owners], [[], []], 'owners are not checked or kept while the App is unticked');
  assert.ok(I.IMPLEMENT_OUTPUT_OPTIONS.app.includes('app_owners'));
});

test('a change of App owners refreshes the App and nothing else', () => {
  const spec = (owners) => I.validateImplementSpec(withOutputs({ genie_space: true, app_owners: owners })).spec;
  const rows = [builtRow(spec([]), ALL_ASSETS)];
  const plan = I.planSubmission(rows, { ...spec(['lee@example.com']), based_on_version: 1 });
  assert.deepEqual(plan.summary.classes, ['outputs']);
  assert.deepEqual([plan.summary.refill, plan.summary.build, plan.summary.refresh], [false, [], ['app']]);
  const named = [builtRow(spec(['lee@example.com']), ALL_ASSETS)];
  assert.equal(I.planSubmission(named, { ...spec(['lee@example.com', 'LEE@example.com']), based_on_version: 1 }).unchanged, true,
    'a repeat of the same person is the same owners');
  assert.deepEqual(I.planSubmission(named, { ...spec([]), based_on_version: 1 }).summary.refresh, ['app'], 'removing the last owner is a change too');
});

test('the wizard holdout starts unsent, ticks on at 10%, takes a percent from 1 to 50, and the backend accepts what it sends', async () => {
  const w = await frontendLib('implementWizard.js');
  assert.equal(w.HOLDOUT_SHARE_DEFAULT, I.IMPLEMENT_HOLDOUT_SHARE);
  assert.equal(w.HOLDOUT_MAX_PERCENT / 100, I.IMPLEMENT_HOLDOUT_MAX_SHARE);
  assert.equal(w.HOLDOUT_MIN_PERCENT, 1);
  const fresh = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire', sessionId: '42' });
  assert.equal(Object.prototype.hasOwnProperty.call(fresh, 'holdout'), false, 'a new spec sends no holdout');
  assert.deepEqual(w.holdoutOf(fresh), { enabled: false, share: 0.1 });
  assert.equal(w.holdoutPercentText(fresh), '10');
  assert.deepEqual(w.stepErrors('results', fresh), []);
  const on = w.withHoldout(fresh, true);
  assert.deepEqual(on.holdout, { enabled: true, share: 0.1 });
  const quarter = w.withHoldoutPercent(on, '25');
  assert.deepEqual(quarter.holdout, { enabled: true, share: 0.25 });
  assert.equal(w.holdoutPercentText(quarter), '25');
  assert.equal(w.holdoutPercentText(w.withHoldoutPercent(on, '29')), '29', 'the percent reads back as typed, with no float noise');
  assert.deepEqual(w.stepErrors('results', quarter), []);
  assert.equal(w.holdoutText(quarter), 'Holds back 25% of the records to measure impact');
  assert.equal(w.holdoutText(fresh), '');
  const sent = I.validateImplementSpec(quarter);
  assert.deepEqual(sent.errors, []);
  assert.deepEqual(sent.spec.holdout, { enabled: true, share: 0.25 });
  for (const text of ['0', '0.5', '51', '', 'ten', '-5']) {
    const bad = w.withHoldoutPercent(on, text);
    assert.deepEqual(w.stepErrors('results', bad), [w.HOLDOUT_PERCENT_PROBLEM], JSON.stringify(text));
    const off = w.withHoldout(bad, false);
    assert.deepEqual(off.holdout, { enabled: false, share: 0.1 }, `switching off resets a bad share ${JSON.stringify(text)} so a hidden field never blocks`);
    assert.deepEqual(w.stepErrors('results', off), []);
    assert.deepEqual(I.validateImplementSpec(off).errors, []);
  }
  assert.deepEqual(w.withHoldout(quarter, false).holdout, { enabled: false, share: 0.25 }, 'switching off keeps a good share for next time');
  assert.doesNotMatch(`${w.HOLDOUT_LABEL} ${w.HOLDOUT_BLURB} ${w.HOLDOUT_PERCENT_PROBLEM}`, /\u2014|\u2013/);
  const saved = w.specFromLatest({ spec_version: 2, spec_json: { ...fresh, holdout: { enabled: true, share: 0.2 } } }, fresh);
  assert.deepEqual(saved.holdout, { enabled: true, share: 0.2 }, 'Edit opens with the holdout of the saved version');
});

test('the wizard App owners start empty, take workspace emails, and flag a bad one or more than 50 only while the App is on', async () => {
  const w = await frontendLib('implementWizard.js');
  assert.equal(w.APP_OWNERS_MAX, I.IMPLEMENT_APP_OWNERS_MAX);
  const fresh = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  assert.deepEqual(fresh.outputs.app_owners, []);
  const app = { ...fresh, outputs: { ...fresh.outputs, app: true, genie_space: true, app_owners: ['lee@example.com', 'nope'] } };
  assert.ok(w.stepErrors('delivery', app).includes('App owners must be email addresses: nope'));
  assert.ok(w.advancedErrors('delivery', app).includes('App owners must be email addresses: nope'), 'the problem opens Advanced settings, where owners are typed');
  assert.ok(!w.stepErrors('delivery', { ...app, outputs: { ...app.outputs, app: false } }).some((e) => e.startsWith('App owners must')));
  const many = Array.from({ length: 51 }, (_, i) => `person${i}@example.com`);
  assert.ok(w.stepErrors('delivery', { ...app, outputs: { ...app.outputs, app_owners: many } }).includes('name at most 50 App owners'));
  assert.ok(!w.stepErrors('delivery', { ...app, outputs: { ...app.outputs, app_owners: [...many.slice(0, 50), 'PERSON0@example.com'] } })
    .some((e) => e.startsWith('name at most')), 'a repeat does not count twice');
  const good = { ...app, outputs: { ...app.outputs, app_access: 'sp', app_owners: ['lee@example.com', 'LEE@example.com'] } };
  assert.ok(!w.stepErrors('delivery', good).some((e) => e.startsWith('App owners must')));
  assert.deepEqual(I.validateImplementSpec(good).spec.outputs.app_owners, ['lee@example.com']);
  assert.deepEqual(w.splitList('a@b.co, c@d.co,', ','), ['a@b.co', 'c@d.co']);
  assert.deepEqual(w.splitList('one\n\n two \n', '\n'), ['one', 'two']);
  assert.match(w.APP_OWNERS_HELP, /money at stake assumptions/);
  assert.doesNotMatch(w.APP_OWNERS_HELP, /\u2014|\u2013/);
});

test('the control tower shows the holdout on the job row, and nothing when no record is held back', async () => {
  const v = await frontendLib('implementControl.js');
  const live = { targets: { job: '77' }, assets: { job: { ok: true, schedule: { cron: '0 0 6 * * ?', timezone: 'UTC', paused: false }, active_runs: [] } } };
  const latest = (holdout) => ({ spec_version: 2, status: 'ready', spec_json: { schedule: { enabled: true }, ...(holdout ? { holdout } : {}) } });
  const job = (holdout) => v.controlRows(live, latest(holdout)).find((r) => r.id === 'job');
  assert.equal(job({ enabled: true, share: 0.1 }).detail, 'Scheduled: 0 0 6 * * ? (UTC). Holds back 10% of the records to measure impact');
  assert.equal(job(null).detail, 'Scheduled: 0 0 6 * * ? (UTC)');
  assert.equal(job({ enabled: false, share: 0.1 }).detail, 'Scheduled: 0 0 6 * * ? (UTC)');
  const unread = v.controlRows({ targets: { job: '77' }, assets: { job: { ok: false, error: 'no access' } } }, latest({ enabled: true, share: 0.2 }))
    .find((r) => r.id === 'job');
  assert.match(unread.detail, /Holds back 20% of the records to measure impact$/, 'the setting shows even while the job cannot be read');
});
