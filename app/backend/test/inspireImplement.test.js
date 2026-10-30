const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const I = require('../lib/inspireImplement');

const {
  IMPLEMENT_COLUMNS,
  IMPLEMENT_USE_CASE_PARAM,
  IMPLEMENT_SPEC_VERSION_PARAM,
  IMPLEMENT_RUN_ID_PARAM,
  IMPLEMENT_OPERATION,
  validateImplementSpec,
  classifyImplementChange,
  implementChangeSummary,
  implementTableCreateSql,
  implementHistoryStatement,
  implementInsertStatement,
  parseImplementRow,
  carriedAssets,
  planSubmission,
  refuseUnchanged,
  implementJobParams,
  widgetsFromInstruction,
  groupWidgets,
  columnsStatement,
  tableSwapStatement,
  rerunParams,
  liveLogPath,
  useCaseLogLines,
  filterImplementSteps,
  outputAccessStatement,
  outputAccess,
  modelAccess,
  defaultModelName,
  sameSchema,
  trainsModel,
  resultTableProblem,
  otherUseCaseRowsStatement,
  appOwnerTag,
  appNameCheck,
  appsLimit,
  appsQuotaCheck,
  executionFamily,
  parseEvidence,
  implementWidgets,
  allowedRule,
  allowedText,
  widgetValueProblem,
  widgetProblems,
  cronProblem,
  IMPLEMENT_INSPIRE_WIDGETS,
  IMPLEMENT_RESULT_KEY_COLUMNS,
  IMPLEMENT_MODEL_FAMILIES,
  IMPLEMENT_NOTEBOOK_TASK_KEY,
  IMPLEMENT_STOPPED_STATES,
  validateUseCaseId,
  quoteTable,
  quoteColumn,
  describedColumnNames,
  implementMissingColumns,
  isMissingColumnError,
  destinationsFromList,
  useCaseTables,
  primaryTableOf,
  removedTableProblems,
  implementRunStartedStatement,
  implementStartFailedStatement,
  implementStalled,
  IMPLEMENT_STALE_AFTER_MS,
} = require('../lib/inspireImplement');
const { sanitizeInspireNotebookJobParams } = require('../lib/inspireJobParams');

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'implement_change_classes.json'), 'utf8'));

const VALID = {
  use_case_id: 'N01-U01',
  use_case_name: 'Predict churn',
  data: {
    tables: { 'main.s.orders': 'main.s.orders_v2' },
    filters: [{ table: 'main.s.orders_v2', column: 'region', op: 'in', values: ['EU', 'UK'] }],
    run_profile: 'preview',
  },
  config: { widgets: { top_k: 25 }, result_table: 'main.inspire.churn_out', warehouse_id: 'wh1' },
  schedule: { enabled: true, cron: '0 0 6 ? * MON', timezone: 'Asia/Dubai' },
  outputs: { dashboard: true, genie_space: true, app: true, app_name: 'churn-desk', app_access: 'sp' },
  sharing: { principals: [{ type: 'group', name: 'planners' }, { type: 'group', name: 'Planners' }] },
};

function spec(changes = {}) {
  return validateImplementSpec({ ...JSON.parse(JSON.stringify(VALID)), ...changes });
}

test('the implement table columns match the contract the agent shares', () => {
  assert.deepEqual(IMPLEMENT_COLUMNS, FIXTURE.columns);
  assert.equal(IMPLEMENT_STALE_AFTER_MS, FIXTURE.stale_after_seconds * 1000, 'a version stalls after the longest an Implement run may hold its lock');
  const sql = implementTableCreateSql('`c`.`s`.`__inspire_implement`');
  for (const [name, kind] of IMPLEMENT_COLUMNS) assert.ok(sql.includes(`\`${name}\` ${kind}`), name);
  assert.ok(sql.startsWith('CREATE TABLE IF NOT EXISTS `c`.`s`.`__inspire_implement` ('));
});

test('change classes match the shared fixture, case by case', () => {
  assert.ok(FIXTURE.cases.length >= 15);
  for (const c of FIXTURE.cases) {
    const previous = c.previous ? validateImplementSpec(c.previous).spec : null;
    const current = validateImplementSpec(c.current).spec;
    assert.deepEqual(classifyImplementChange(previous, current), c.classes, c.name);
  }
});

const SHARED_PLAN_LISTS = ['build', 'refresh', 'rollback', 'delete', 'keep_unmanaged'];
const SHARED_PLAN_KEYS = ['classes', 'refill', ...SHARED_PLAN_LISTS, 'schedule'];

test('change summaries match the shared fixture, plan by plan', () => {
  const cases = Object.fromEntries(FIXTURE.cases.map((c) => [c.name, c]));
  assert.ok(FIXTURE.plans.length >= 80);
  for (const p of FIXTURE.plans) {
    const c = cases[p.case];
    assert.ok(c, `${p.name} names no shared case`);
    assert.deepEqual(Object.keys(p.summary), SHARED_PLAN_KEYS, p.name);
    const previous = c.previous ? validateImplementSpec(c.previous).spec : null;
    const summary = implementChangeSummary(previous, validateImplementSpec(c.current).spec, p.assets);
    const shared = Object.fromEntries(SHARED_PLAN_KEYS.map((k) => [k, SHARED_PLAN_LISTS.includes(k) ? [...summary[k]].sort() : summary[k]]));
    assert.deepEqual(shared, p.summary, p.name);
  }
});

test('a valid spec normalizes the same way the agent does', () => {
  const { spec: out, errors } = spec();
  assert.deepEqual(errors, []);
  assert.deepEqual(out.config.widgets, { top_k: '25' });
  assert.deepEqual(out.sharing.principals, [{ type: 'group', name: 'planners' }]);
  assert.equal(out.outputs.app_name, 'churn-desk');
  const noOutputs = { ...VALID };
  delete noOutputs.outputs;
  const defaulted = validateImplementSpec(noOutputs).spec.outputs;
  assert.equal(defaulted.dashboard, true);
  assert.equal(defaulted.genie_space, false);
});

const MUST_REJECT = [
  [{ use_case_id: '' }, 'use_case_id is required'],
  [{ outputs: { app: true, app_name: 'Churn_App' } }, 'app_name'],
  [{ config: { widgets: {} } }, 'SQL warehouse is required'],
  [{ schedule: { enabled: true, cron: '' } }, 'needs a cron'],
  [{ schedule: { cron: 'every monday' } }, 'Quartz cron'],
  [{ data: { filters: [{ table: 'main.s.t', column: 'c', op: 'like', values: ['x'] }] } }, 'operator'],
  [{ data: { filters: [{ table: 'main.s.t', column: 'c', op: 'between', values: ['1'] }] } }, 'two values'],
  [{ data: { tables: { 'main.s.orders': 'orders_v2' } } }, 'table swap'],
  [{ data: { run_profile: 'huge' } }, 'run_profile'],
  [{ sharing: { principals: [{ type: 'group', name: 'a`b' }] } }, 'principal'],
  [{ use_case: { success_measures: ['a', 'b', 'c', 'd'] } }, 'at most 3 success measures'],
  [{ based_on_version: 'latest' }, 'based_on_version'],
  [{ data: { column_roles: { owner: 'a.b.c.d' } } }, "column role 'owner'"],
  [{ data: { window: { start: '2026-02-01', end: '2026-01-01' } } }, 'after it ends'],
  [{ config: { warehouse_id: 'w', profiles: { training: { window_days: 0 } } } }, 'at least 1'],
  [{ config: { warehouse_id: 'w', profiles: { retrain: { drift_threshold: 3 } } } }, 'drift_threshold'],
  [{ schedule: { failure_emails: ['not-an-email'] } }, 'not an email'],
  [{ outputs: { genie_space: true, genie_questions: ['a', 'b', 'c', 'd', 'e', 'f'] } }, 'at most 5 Genie Agent'],
];

for (const [changes, needle] of MUST_REJECT) {
  test(`the spec is rejected: ${needle}`, () => {
    const { errors } = spec(changes);
    assert.ok(errors.some((e) => e.includes(needle)), JSON.stringify(errors));
  });
}

test('a spec that is not JSON is rejected', () => {
  assert.match(validateImplementSpec('{nope').errors[0], /not valid JSON/);
  assert.deepEqual(validateImplementSpec([1]).errors, ['the spec must be a JSON object']);
});

test('the change summary never deletes an unticked output unless asked, and flags the undecided ones', () => {
  const before = spec().spec;
  const after = spec({ outputs: { dashboard: false, genie_space: true, app: true, app_name: 'churn-desk', app_access: 'sp' } }).spec;
  const assets = { dashboard: 'd1', genie_space: 'g1', app: 'churn-desk' };
  const summary = implementChangeSummary(before, after, assets);
  assert.deepEqual(summary.classes, ['deselect']);
  assert.deepEqual(summary.delete, []);
  assert.deepEqual(summary.undecided, ['dashboard']);
  const asked = spec({ outputs: after.outputs, removed_outputs: { dashboard: 'delete' } }).spec;
  assert.deepEqual(implementChangeSummary(before, asked, assets).delete, ['dashboard']);
  const kept = spec({ outputs: after.outputs, removed_outputs: { dashboard: 'keep' } }).spec;
  assert.deepEqual(implementChangeSummary(before, kept, assets).keep_unmanaged, ['dashboard']);
});

test('renaming a kept Genie Agent refreshes only that output without rebuilding the notebook', () => {
  const before = spec().spec;
  const after = spec({ outputs: { ...VALID.outputs, genie_space_name: 'Churn questions' } }).spec;
  const summary = implementChangeSummary(before, after, { dashboard: 'd', genie_space: 'g', app: 'churn-desk' });
  assert.deepEqual(summary.classes, ['outputs']);
  assert.deepEqual(summary.refresh, ['genie_space']);
  assert.equal(summary.refill, false);
});

function row(version, status, extra = {}) {
  return { spec_version: version, status, spec_json: VALID, asset_status: null, ...extra };
}

test('a submission while a run is active is refused with 409', () => {
  assert.throws(() => planSubmission([row(2, 'previewing'), row(1, 'ready')], spec().spec),
    (err) => err.statusCode === 409 && /still previewing/.test(err.message));
});

test('a new version may replace a stalled one, never one whose run may still be working', () => {
  const history = [row(2, 'filling'), row(1, 'ready')];
  assert.throws(() => planSubmission(history, spec({ based_on_version: 2, data: { run_profile: 'full' } }).spec),
    (err) => err.statusCode === 409 && /still filling/.test(err.message));
  const plan = planSubmission(history, spec({ based_on_version: 2, data: { run_profile: 'full' } }).spec, { run_id: '77', reason: 'ended' });
  assert.equal(plan.nextVersion, 3);
  assert.equal(plan.built.spec_version, 1);
  assert.equal(planSubmission([row(1, 'queued')], spec().spec, { run_id: null, reason: 'old' }).nextVersion, 2,
    'the same spec may be submitted again over a version that never ran');
});

test('the App records the run it started, and fails a version whose run never started', () => {
  const key = { sessionId: 42, useCaseId: 'N01-U01', specVersion: 3 };
  const keyParams = [{ name: 'sid', value: '42', type: 'BIGINT' }, { name: 'uc', value: 'N01-U01', type: 'STRING' }, { name: 'v', value: '3', type: 'INT' }];
  const started = implementRunStartedStatement('t', { ...key, runId: 5555555555555555, message: 'https://x/run/5555555555555555' });
  assert.equal(started.sql, "UPDATE t SET implement_run_id = :run, status_message = CASE WHEN status = 'queued' THEN :message ELSE status_message END "
    + 'WHERE session_id = :sid AND use_case_id = :uc AND spec_version = :v');
  assert.deepEqual(started.parameters, [{ name: 'run', value: '5555555555555555', type: 'BIGINT' },
    { name: 'message', value: 'https://x/run/5555555555555555', type: 'STRING' }, ...keyParams]);
  for (const runId of [undefined, null, '', 'run-9', '1'.repeat(20)]) {
    assert.deepEqual(implementRunStartedStatement('t', { ...key, runId, message: 'm' }).parameters[0], { name: 'run', type: 'BIGINT' }, String(runId));
  }
  const failed = implementStartFailedStatement('t', { ...key, message: 'the MVP run could not start: RESOURCE_EXHAUSTED' });
  assert.equal(failed.sql, "UPDATE t SET status = 'failed', status_message = :message, updated_at = current_timestamp() "
    + "WHERE session_id = :sid AND use_case_id = :uc AND spec_version = :v AND status = 'queued'");
  assert.deepEqual(failed.parameters, [{ name: 'message', value: 'the MVP run could not start: RESOURCE_EXHAUSTED', type: 'STRING' }, ...keyParams]);
});

test('a version is stalled when its run ended, or when its run cannot be read and it has not moved for longer than a run may hold its lock', () => {
  const now = Date.parse('2026-10-25T18:00:00Z');
  const version = (status, extra = {}) => ({ spec_version: 4, status, implement_run_id: '77', updated_at: '2026-10-25T17:00:00.000Z', ...extra });
  const run = (life, result, message, url) => ({ run_page_url: url, state: { life_cycle_state: life, result_state: result, state_message: message } });
  assert.deepEqual(implementStalled(version('previewing'), run('TERMINATED', 'FAILED', 'Workload failed', 'https://x/run/77'), now),
    { run_id: '77', run_url: 'https://x/run/77', reason: 'the run building v4 ended (FAILED: Workload failed) while v4 was still previewing' });
  assert.equal(implementStalled(version('building_outputs'), run('INTERNAL_ERROR', undefined, ''), now).reason,
    'the run building v4 ended (INTERNAL_ERROR) while v4 was still building outputs');
  assert.equal(implementStalled(version('queued'), { status: { state: 'TERMINATED', termination_details: { code: 'CANCELED', message: 'Run cancelled' } } }, now).reason,
    'the run building v4 ended (CANCELED: Run cancelled) while v4 was still queued');
  for (const life of ['PENDING', 'QUEUED', 'RUNNING', 'TERMINATING', 'BLOCKED', 'WAITING_FOR_RETRY']) {
    assert.equal(implementStalled(version('filling'), run(life), now), null, life);
  }
  for (const status of ['ready', 'ready_with_warnings', 'failed']) {
    assert.equal(implementStalled(version(status), run('TERMINATED', 'FAILED'), now), null, status);
    assert.equal(implementStalled(version(status, { updated_at: '2026-10-20T00:00:00Z' }), null, now), null, status);
  }
  assert.deepEqual(implementStalled(version('filling', { updated_at: '2026-10-25T13:59:59.000Z' }), null, now),
    { run_id: '77', run_url: null, reason: 'v4 has been filling with no progress since 2026-10-25T13:59:59.000Z, longer than an Implement run may take (4 hours)' });
  assert.equal(implementStalled(version('filling', { updated_at: '2026-10-25T14:00:01.000Z' }), null, now), null);
  assert.equal(implementStalled(version('queued', { updated_at: null, created_at: '2026-10-25T10:00:00Z', implement_run_id: null }), null, now).run_id, null);
  assert.equal(implementStalled(version('filling', { updated_at: 'not a time', created_at: null }), null, now), null);
  assert.equal(implementStalled(null, null, now), null);
});

test('an edit from a stale version is a conflict', () => {
  assert.throws(() => planSubmission([row(3, 'ready'), row(2, 'ready')], spec({ based_on_version: 2 }).spec),
    (err) => err.statusCode === 409 && /v3 was built after the version you edited \(v2\)/.test(err.message));
});

test('the next version follows the newest row, whatever its status', () => {
  const plan = planSubmission([row(4, 'failed'), row(3, 'ready')], spec({ based_on_version: 3, data: { run_profile: 'full' } }).spec);
  assert.equal(plan.nextVersion, 5);
  assert.equal(plan.built.spec_version, 3);
  assert.deepEqual(plan.summary.classes, ['data']);
  assert.equal(planSubmission([], spec().spec).nextVersion, 1);
});

test('an unticked output must be decided before submit, and an unchanged spec is refused', () => {
  const after = { ...VALID.outputs, dashboard: false };
  assert.throws(() => planSubmission([row(1, 'ready', { dashboard_id: 'd1' })], spec({ outputs: after, based_on_version: 1 }).spec),
    (err) => err.statusCode === 400 && /choose whether to delete or keep Dashboard/.test(err.message));
  const same = planSubmission([row(1, 'ready')], spec({ based_on_version: 1 }).spec);
  assert.equal(same.unchanged, true, 'the plan says nothing changed instead of refusing, so the wizard can explain it');
  assert.throws(() => refuseUnchanged(same), (err) => err.statusCode === 400
    && err.message.startsWith('nothing changed since version 1, the last built version, so there is nothing new to build')
    && /rebuild an output or preview a re-run/.test(err.message));
  const failed = planSubmission([row(1, 'failed')], spec({ based_on_version: 1 }).spec);
  assert.equal(failed.nextVersion, 2, 'a failed version can be retried as is');
  assert.equal(failed.unchanged, false);
  assert.doesNotThrow(() => refuseUnchanged(failed));
  const changed = planSubmission([row(1, 'ready')], spec({ based_on_version: 1, data: { run_profile: 'full' } }).spec);
  assert.equal(changed.unchanged, false);
  assert.doesNotThrow(() => refuseUnchanged(changed));
});

test('assets carry from failed versions and stop at a delete', () => {
  const history = [
    { spec_version: 3, dashboard_id: null, genie_space_id: 'g3', app_name: null, asset_status: { dashboard: { state: 'deleted' } } },
    { spec_version: 2, dashboard_id: 'd2', genie_space_id: null, app_name: 'churn-desk', asset_status: null },
    { spec_version: 1, dashboard_id: 'd1', genie_space_id: 'g1', app_name: null, asset_status: null },
  ];
  assert.deepEqual(carriedAssets(history), { genie_space: 'g3', app: 'churn-desk' });
  history[0].asset_status.app = { state: 'released', note: "not this use case's App" };
  assert.deepEqual(carriedAssets(history), { genie_space: 'g3' }, 'an App Inspire released is never carried back from an older version');
});

test('the states that stop an output carrying match the agent', () => {
  assert.deepEqual(IMPLEMENT_STOPPED_STATES, FIXTURE.stopped_states);
});

test('insert and history statements are parameterized', () => {
  const insert = implementInsertStatement('`c`.`s`.`__inspire_implement`', {
    sessionId: '42', useCaseId: "N01-U01'; DROP", specVersion: 2, basedOnVersion: null, spec: { a: 1 }, createdBy: 'me@x' });
  assert.ok(insert.sql.includes('parse_json(:spec)'));
  assert.ok(!insert.sql.includes('DROP'));
  assert.deepEqual(insert.parameters.find((p) => p.name === 'based'), { name: 'based', type: 'INT' });
  assert.equal(insert.parameters.find((p) => p.name === 'uc').value, "N01-U01'; DROP");
  const history = implementHistoryStatement('`t`', '42', 'N01-U01');
  assert.ok(history.sql.includes('to_json(`spec_json`) AS `spec_json`'));
  assert.ok(history.sql.includes('use_case_id = :uc'));
});

test('rows parse their VARIANT columns', () => {
  const parsed = parseImplementRow({ spec_version: '3', based_on_version: '', spec_json: '{"a":1}', asset_status: 'not json' });
  assert.equal(parsed.spec_version, 3);
  assert.equal(parsed.based_on_version, null);
  assert.deepEqual(parsed.spec_json, { a: 1 });
  assert.equal(parsed.asset_status, null);
});

test('job parameters target one use case and survive the widget allowlist', () => {
  const params = sanitizeInspireNotebookJobParams(implementJobParams(
    { '15_operation': 'Generate Use Cases', '00_business_name': 'Acme', '14_session_id': '42', bogus: 'x' }, 'N01-U01', 3));
  assert.equal(params['15_operation'], 'Implement Use Cases');
  assert.equal(params[IMPLEMENT_USE_CASE_PARAM], 'N01-U01');
  assert.equal(params[IMPLEMENT_SPEC_VERSION_PARAM], '3');
  assert.equal(params[IMPLEMENT_RUN_ID_PARAM], '{{job.run_id}}', 'the run names its own log after the job run the App records');
  assert.equal(params.bogus, undefined);
});

test('the insert records the change classes as a bound parameter', () => {
  const insert = implementInsertStatement('`c`.`s`.`__inspire_implement`', {
    sessionId: '42', useCaseId: 'N01-U01', specVersion: 2, basedOnVersion: 1, spec: { a: 1 },
    createdBy: 'me@x', changeClasses: ['outputs', 'schedule'],
  });
  assert.ok(insert.sql.includes('change_classes'));
  assert.equal(insert.parameters.find((p) => p.name === 'classes').value, 'outputs,schedule');
});

test('widgets parse from a Parameters section the same way the agent does', () => {
  const widgets = widgetsFromInstruction('## 3. Parameters\n| widget | type | default | label |\n| `top_k` | text | `25` | Top K |\n| act_now_share | text | 0.1 | Act now |\n| ai_endpoint | dropdown | databricks-meta-llama | AI |\n');
  assert.deepEqual(widgets.map((w) => w.name), ['top_k', 'act_now_share', 'ai_endpoint']);
  assert.deepEqual(widgets.map((w) => [w.label, w.allowed]), [['Top K', ''], ['Act now', ''], ['AI', '']]);
  const groups = groupWidgets(widgets);
  assert.deepEqual(groups.business.map((w) => w.name), ['act_now_share']);
  assert.deepEqual(groups.ai.map((w) => w.name), ['ai_endpoint']);
  assert.deepEqual(groups.extras.map((w) => w.name), ['top_k']);
  assert.deepEqual(groups.extras_kept_default, []);
});

test('the five-column Parameters table carries each widget\'s allowed range, and an unreadable range means any value', () => {
  const widgets = widgetsFromInstruction('## 3. Parameters\n| widget | type | default | allowed | used for |\n|---|---|---|---|---|\n'
    + '| `horizon` | text | 12 | whole number, at least 1 | Months to forecast |\n'
    + '| `act_now_share` | text | 0.05 | 0 to 1 | Share of rows marked act now |\n'
    + '| `note` | text | x | any | Free text |\n'
    + '| `odd` | text | 3 | between 1 and 5 | Odd range |\n');
  assert.deepEqual(widgets.map((w) => [w.name, w.default, w.allowed, w.label]), [
    ['horizon', '12', 'whole number, at least 1', 'Months to forecast'],
    ['act_now_share', '0.05', '0 to 1', 'Share of rows marked act now'],
    ['note', 'x', '', 'Free text'],
    ['odd', '3', '', 'Odd range'],
  ]);
});

test('Genie widgets without a range take the instruction\'s range, and keep their own when they have one', () => {
  const instruction = '## 3. Parameters\n| widget | type | default | allowed | used for |\n| `horizon` | text | 12 | whole number, at least 1 | Months |\n| `top_k` | text | 5 | whole number, at least 1 | Rows |\n';
  const latest = parseImplementRow({ genie_widgets: JSON.stringify([{ name: 'horizon', type: 'text', default: '12' }, { name: 'top_k', type: 'text', default: '5', allowed: 'whole number, 1 to 10' }]) });
  const { source, widgets } = implementWidgets([latest], instruction);
  assert.equal(source, 'genie');
  assert.deepEqual(widgets.map((w) => [w.name, w.allowed]), [['horizon', 'whole number, at least 1'], ['top_k', 'whole number, 1 to 10']]);
  assert.deepEqual(widgetProblems(widgets, { horizon: '0', top_k: '11' }), [
    "horizon is '0'; allowed: whole number, at least 1",
    "top_k is '11'; allowed: whole number, 1 to 10",
  ]);
});

test('widgets come from the newest version that built the notebook, past versions that only changed outputs', () => {
  const instruction = '## 3. Parameters\n| widget | type | default | allowed | used for |\n| `horizon` | text | 12 | whole number, at least 1 | Months |\n';
  const row = (version, widgets) => parseImplementRow({ spec_version: version, genie_widgets: widgets == null ? null : JSON.stringify(widgets) });
  const history = [row(3, null), row(4, []), row(1, [{ name: 'top_k', default: '10' }]), row(2, [{ name: 'top_k', default: '25' }])];
  const got = implementWidgets(history, instruction);
  assert.equal(got.source, 'genie');
  assert.deepEqual(got.widgets.map((w) => [w.name, w.default]), [['top_k', '25']], 'v2 built the notebook last; v1 is older');
  assert.deepEqual(implementWidgets([row(3, null), row(4, [])], instruction).widgets.map((w) => w.name), ['horizon']);
  assert.equal(implementWidgets([], '').source, 'instruction');
  assert.deepEqual(implementWidgets(null, '').widgets, []);
});

test('every readiness threshold is a business rule, Inspire\'s own widgets never show, and extras past six keep their defaults', () => {
  const thresholds = FIXTURE.widget_groups.threshold_names.map((name) => ({ name, type: 'text', default: '1' }));
  const extras = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'].map((name) => ({ name, type: 'text', default: '' }));
  const inspire = FIXTURE.widget_groups.inspire_widgets.map((name) => ({ name, type: 'text', default: '' }));
  const tiers = FIXTURE.widget_groups.tier_widgets.map((name) => ({ name, type: 'text', default: '' }));
  const groups = groupWidgets([...extras, ...inspire, ...tiers, ...thresholds, { name: 'horizon' }, { name: 'ai_endpoint' },
    { name: 'explanation_top_k' }]);
  assert.deepEqual(groups.business.map((w) => w.name), [...FIXTURE.widget_groups.tier_widgets, ...FIXTURE.widget_groups.threshold_names]);
  assert.deepEqual(groups.model.map((w) => w.name), ['horizon']);
  assert.deepEqual(groups.ai.map((w) => w.name), ['ai_endpoint']);
  assert.deepEqual(groups.extras.map((w) => w.name), ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  assert.deepEqual(groups.extras_kept_default, ['a7', 'a8', 'explanation_top_k']);
  assert.deepEqual(IMPLEMENT_INSPIRE_WIDGETS, FIXTURE.widget_groups.inspire_widgets);
  const shown = [...groups.business, ...groups.model, ...groups.ai, ...groups.extras].map((w) => w.name);
  for (const name of IMPLEMENT_INSPIRE_WIDGETS) assert.ok(!shown.includes(name), name);
});

test('cron problems match the agent\'s validator case for case', () => {
  for (const cron of FIXTURE.crons.valid) assert.equal(cronProblem(cron), '', cron);
  for (const [cron, problem] of FIXTURE.crons.invalid) assert.equal(cronProblem(cron), problem, cron);
});

test('widget ranges parse, print and check exactly as the agent does', () => {
  for (const [text, rule, printed] of FIXTURE.widget_ranges.allowed) {
    assert.deepEqual(allowedRule(text), rule, text);
    if (rule) assert.equal(allowedText(rule), printed, text);
  }
  for (const [name, value, allowed, problem] of FIXTURE.widget_ranges.values) assert.equal(widgetValueProblem(name, value, allowed), problem, `${name}=${value}`);
  for (const item of FIXTURE.widget_ranges.problems) assert.deepEqual(widgetProblems(item.widgets, item.values), item.problems, item.name);
});

test('the result-table key columns, model families, execution patterns, App owner tag and job task keys match the agent', () => {
  assert.deepEqual(IMPLEMENT_RESULT_KEY_COLUMNS, FIXTURE.result_key_columns);
  assert.deepEqual(IMPLEMENT_MODEL_FAMILIES, FIXTURE.model_families);
  for (const [mandate, family] of FIXTURE.execution_patterns) assert.equal(executionFamily(mandate), family, mandate);
  for (const t of FIXTURE.app_owner_tags) assert.equal(appOwnerTag(t.use_case_id, t.session_id), t.tag);
  assert.equal(IMPLEMENT_NOTEBOOK_TASK_KEY, FIXTURE.task_keys.notebook);
  assert.notEqual(IMPLEMENT_NOTEBOOK_TASK_KEY, FIXTURE.task_keys.alert);
});

test('column and swap SQL bind schema and table names', () => {
  const cols = columnsStatement('main.s.orders');
  assert.ok(cols.sql.includes('information_schema.columns'));
  assert.deepEqual(cols.parameters.map((p) => p.value), ['s', 'orders']);
  const swaps = tableSwapStatement('main.s.orders', ['order_id', 'region']);
  assert.ok(swaps.sql.includes(':r0') && swaps.sql.includes(':r1'));
  assert.equal(swaps.catalog, 'main');
  assert.throws(() => tableSwapStatement('main.s.orders', ["o'; drop"]), /plain column/);
});

const INFO_SCHEMA_NAMES = '(catalog_name|schema_name|table_catalog|table_schema|table_name)';

test('information schema filters keep the name column bare and lower the name asked for, so they stay fast and match a name typed in any case', () => {
  for (const statement of [outputAccessStatement('Main.Sales.Out_1'), columnsStatement('Main.Sales.Out_1'), tableSwapStatement('Main.Sales.Out_1', ['order_id'])]) {
    assert.doesNotMatch(statement.sql, new RegExp(`lower\\(${INFO_SCHEMA_NAMES}\\)`), statement.sql);
    assert.doesNotMatch(statement.sql, new RegExp(`\\b${INFO_SCHEMA_NAMES} = :`), statement.sql);
    assert.match(statement.sql, new RegExp(`\\b${INFO_SCHEMA_NAMES} = lower\\(:[a-z]+\\)`));
  }
  assert.equal((outputAccessStatement('Main.Sales.Out_1').sql.match(/ = lower\(:[cst]\)/g) || []).length, 12);
});

test('no backend statement filters the information schema on a lowered name column or an unlowered name', () => {
  const dir = path.join(__dirname, '..', 'lib');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.doesNotMatch(source, new RegExp(`lower\\(${INFO_SCHEMA_NAMES}\\) =`), file);
    assert.doesNotMatch(source, new RegExp(`\\b${INFO_SCHEMA_NAMES} = :`), file);
  }
});

test('a preview re-run only accepts this notebook\'s widgets', () => {
  const params = rerunParams(['top_k', 'run_profile'], { top_k: 10, run_profile: 'full' });
  assert.equal(params.run_profile, 'preview');
  assert.equal(params.top_k, '10');
  assert.throws(() => rerunParams(['top_k'], { inject: 'nope' }), (err) => err.statusCode === 400);
});

test('live log paths stay inside the inspire volume and lines keep the use-case tags', () => {
  assert.equal(liveLogPath('main.inspire', 'Acme Bank!', '42'), '/Volumes/main/inspire/vol_root/logs/Acme_Bank_/session_42/log.log');
  assert.equal(liveLogPath('bad', 'x', '1'), null);
  assert.equal(liveLogPath('main.inspire', 'Acme', '42', '111122223333444'),
    '/Volumes/main/inspire/vol_root/logs/Acme/session_42/log_implement_111122223333444.log');
  assert.equal(liveLogPath('main.inspire', 'Acme', '42', 111122223333444),
    '/Volumes/main/inspire/vol_root/logs/Acme/session_42/log_implement_111122223333444.log');
  for (const runId of [null, undefined, '', '{{job.run_id}}', '12a', '../x', '1'.repeat(20)]) {
    assert.equal(liveLogPath('main.inspire', 'Acme', '42', runId), '/Volumes/main/inspire/vol_root/logs/Acme/session_42/log.log', String(runId));
  }
  const lines = useCaseLogLines('[IMPLEMENT N01-U01] filling\nnoise\n[GENIE N01-U02] skip\n[IMPLEMENT-FAILED] N01-U01 timeout', 'N01-U01');
  assert.equal(lines.length, 2);
  const steps = filterImplementSteps([
    { stage_name: IMPLEMENT_OPERATION, step_name: 'N01-U01 fill', result_json: '{}' },
    { stage_name: 'Discover Use Cases', step_name: 'N01-U01', result_json: '{"use_case_id":"N01-U01"}' },
    { stage_name: IMPLEMENT_OPERATION, step_name: 'preview', result_json: '{"use_case_id":"N01-U01"}' },
  ], 'N01-U01');
  assert.equal(steps.length, 2);
});

const logLine = (time, body, level = 'INFO') => `2026-01-02 ${time} - DatabricksInspire - ${level} - ${body} [in /home/spark-x/.ipykernel/1/command-2:43424]`;

test('the Genie feed carries Genie\'s own words, folds commands and edits, and never shows the JSON', () => {
  const legacy = (summary, stop = '') => `{"status":"built","summary":"${summary}","stop_reason":"${stop}","widgets":[],"profiles":{"training":{"description":""}}}`;
  const text = [
    logLine('10:00:00', '[GENIE N01-U01] [build] Genie: older run'),
    logLine('10:05:01', '[IMPLEMENT-NOTEBOOK] N01-U01: wrote /Workspace/Shared/demo/N01-U01 - predict_lapse'),
    logLine('10:05:02', `[GENIE N01-U01] [build] Genie: ${legacy('I\u2019m inspecting the notebook instructions first.')}`),
    logLine('10:05:03', '[GENIE N01-U01] [build] Genie ran: /bin/sh -lc "cat SKILL.md" (exit 0)'),
    logLine('10:05:04', '[GENIE N01-U01] [build] Genie ran: /bin/sh -lc "python check.py" (exit 1)'),
    logLine('10:05:05', '[GENIE N01-U01] [build] Genie edited: /tmp/w/fill_1/implementation.py'),
    logLine('10:05:06', '[GENIE N01-U01] [build] Genie edited: /tmp/w/fill_1/implementation.py, /tmp/w/fill_1/notebook.py'),
    logLine('10:05:07', '[GENIE N01-U02] [build] Genie: another use case'),
    logLine('10:05:08', '[GENIE N01-U01] [build] Genie: {"status":"built","summary":"The notebook is uploaded; I\\u2019m running the prev'),
    logLine('10:05:09', '[GENIE N01-U01] [build] Genie ran: /bin/sh -lc "databricks jobs get-run 1" (exit 0)'),
    logLine('10:05:10', `[GENIE N01-U01] [build] Genie: ${legacy('Preview completed via the stop rule.', 'History covers 0 closed outcome windows; at least 2 are needed.')}`),
    logLine('10:05:10', '[GENIE N01-U01] [build] Genie turn completed (input tokens 10, output tokens 2)'),
    logLine('10:05:11', '[IMPLEMENT N01-U01]   [0s] job run 111: RUNNING'),
    logLine('10:06:11', '[IMPLEMENT N01-U01]   [60s] job run 111: TERMINATED / SUCCESS'),
    logLine('10:06:20', '[IMPLEMENT-FAILED] N01-U01 spec 1: the preview run did not write usable rows: no rows', 'ERROR'),
    logLine('10:06:21', '[IMPLEMENT-FAILED] N01-U010 spec 1: not this one', 'ERROR'),
  ].join('\n');
  const feed = I.genieFeed(text, 'N01-U01', '2026-01-02T10:05:00.250Z');
  assert.deepEqual(feed.map(({ at, kind, text: words }) => [at.slice(11, 19), kind, words]), [
    ['10:05:01', 'note', 'Wrote the notebook N01-U01 - predict_lapse'],
    ['10:05:02', 'message', 'I\u2019m inspecting the notebook instructions first.'],
    ['10:05:03', 'activity', undefined],
    ['10:05:08', 'message', 'The notebook is uploaded; I\u2019m running the prev'],
    ['10:05:09', 'activity', undefined],
    ['10:05:10', 'stopped', 'History covers 0 closed outcome windows; at least 2 are needed.'],
    ['10:05:10', 'turn_done', undefined],
    ['10:05:11', 'run', undefined],
    ['10:06:20', 'failed', 'the preview run did not write usable rows: no rows'],
  ]);
  assert.deepEqual(feed[2], { at: '2026-01-02T10:05:03Z', phase: 'build', kind: 'activity', commands: 2, failed: 1,
    files: ['implementation.py', 'notebook.py'], until: '2026-01-02T10:05:06Z' });
  assert.deepEqual(feed[7], { at: '2026-01-02T10:05:11Z', kind: 'run', check: false, seconds: 60, run_id: '111',
    state: 'TERMINATED', result: 'SUCCESS', until: '2026-01-02T10:06:11Z' });
  assert.ok(feed.every((item) => !String(item.text || '').includes('{') && !String(item.text || '').includes('[in /home')));
  assert.equal(I.genieFeed(text, 'N01-U01').length, 10);
  assert.deepEqual(I.genieFeed('', 'N01-U01'), []);
  assert.deepEqual(I.genieFeed(text, ''), []);
});

test('the Genie feed shows only lines the agent finished writing, so a log read mid-copy never shows cut-off words', () => {
  const done = `${logLine('10:05:01', '[GENIE N01-U01] [build] Genie: I checked the trips table.')}\n`;
  const said = logLine('10:05:02', '[GENIE N01-U01] [build] Genie: Next I am profiling the pickup zones and their hourly demand.');
  const words = (text) => I.genieFeed(text, 'N01-U01').map((item) => item.text);
  for (const cut of [20, 70, 120, said.length - 30, said.length]) {
    assert.deepEqual(words(done + said.slice(0, cut)), ['I checked the trips table.'], `cut at ${cut}`);
  }
  assert.deepEqual(words(`${done}${said}\n`), ['I checked the trips table.', 'Next I am profiling the pickup zones and their hourly demand.']);
  assert.deepEqual(words(said.slice(0, 80)), [], 'a file holding only part of its first line shows nothing yet');
  assert.deepEqual(words(`${done}\r\n`), ['I checked the trips table.']);
});

test('a Genie message is its words, a stop is its reason, and a cut-off JSON message still reads', () => {
  assert.deepEqual(I.genieMessage('I am  checking\nthe notebook'), { kind: 'message', text: 'I am checking the notebook' });
  assert.deepEqual(I.genieMessage('Stopped: History covers 0 windows'), { kind: 'stopped', text: 'History covers 0 windows' });
  assert.deepEqual(I.genieMessage('Stopped:'), { kind: 'stopped', text: 'Genie gave no reason' });
  assert.deepEqual(I.genieMessage('{"status":"stopped","summary":"done","stop_reason":""}'), { kind: 'stopped', text: 'Genie gave no reason' });
  assert.deepEqual(I.genieMessage('{"status":"failed","summary":"could not run","stop_reason":"x"}'), { kind: 'message', text: 'could not run' });
  assert.deepEqual(I.genieMessage('{"status":"built","summary":"line \\"one\\" \\u2019ok'), { kind: 'message', text: 'line "one" \u2019ok' });
  assert.deepEqual(I.genieMessage('{"status":"built","summary":"cut at \\u20'), { kind: 'message', text: 'cut at' });
  assert.deepEqual(I.genieMessage('{"status":"built","summ'), { kind: 'message', text: '' });
});

const grant = (level, privilege, principal, mine) => ({ level, privilege, principal, mine: mine ? 'true' : 'false', me: 'amr@x' });
const CATALOG_AND_SCHEMA = [grant('catalog', 'OWNER', 'admins', false), grant('schema', 'OWNER', 'data-eng', false)];

test('the output access statement binds the table parts, checks group membership and reads only system.information_schema', () => {
  const statement = outputAccessStatement('Main.Sales.Out_1');
  assert.deepEqual(statement.parameters.map((p) => [p.name, p.value]), [['c', 'Main'], ['s', 'Sales'], ['t', 'Out_1']]);
  assert.ok(statement.sql.includes('is_account_group_member(principal)'));
  assert.ok(!statement.sql.includes('Main') && !statement.sql.includes('Sales'));
  for (const view of ['catalogs', 'schemata', 'tables', 'catalog_privileges', 'schema_privileges', 'table_privileges']) {
    assert.ok(statement.sql.includes(`system.information_schema.${view} `), view);
  }
  assert.throws(() => outputAccessStatement('main.out'), /catalog.schema.table/);
  assert.throws(() => outputAccessStatement("main.s.o'; drop"), /catalog.schema.table/);
});

test('a new output table needs USE CATALOG, USE SCHEMA and CREATE TABLE held by the user or one of the user\'s groups', () => {
  const ok = outputAccess([...CATALOG_AND_SCHEMA, grant('catalog', 'USE_CATALOG', 'account users', true),
    grant('schema', 'USE SCHEMA', 'analysts', true), grant('schema', 'CREATE_TABLE', 'analysts', true)], 'main.s.out');
  assert.deepEqual([ok.exists, ok.identity, ok.write], [false, 'amr@x', { ok: true, detail: 'you can create main.s.out' }]);
  assert.deepEqual(ok.grant, { ok: true, detail: 'you will own main.s.out, so you can share it' });
  const all = outputAccess([...CATALOG_AND_SCHEMA, grant('catalog', 'ALL PRIVILEGES', 'amr@x', true)], 'main.s.out');
  assert.equal(all.write.ok, true);
  const others = outputAccess([...CATALOG_AND_SCHEMA, grant('catalog', 'USE CATALOG', 'amr@x', true), grant('schema', 'USE SCHEMA', 'amr@x', true),
    grant('schema', 'CREATE TABLE', 'someone-else@x', false), grant('schema', 'SELECT', 'amr@x', true)], 'main.s.out');
  assert.deepEqual(others.write, { ok: false, detail: 'you need CREATE TABLE on main.s to create main.s.out' });
  assert.equal(others.grant.ok, false);
  const none = outputAccess(CATALOG_AND_SCHEMA, 'main.s.out');
  assert.equal(none.write.detail, 'you need USE CATALOG on main, USE SCHEMA on main.s and CREATE TABLE on main.s to create main.s.out');
});

test('an existing output table needs MODIFY and SELECT, and sharing it needs ownership or MANAGE, which ALL PRIVILEGES does not give', () => {
  const base = [...CATALOG_AND_SCHEMA, grant('table', 'OWNER', 'data-eng', false), grant('catalog', 'USE CATALOG', 'amr@x', true),
    grant('schema', 'USE SCHEMA', 'amr@x', true)];
  const writer = outputAccess([...base, grant('schema', 'ALL_PRIVILEGES', 'amr@x', true)], 'main.s.out');
  assert.deepEqual([writer.exists, writer.write.ok, writer.write.detail], [true, true, 'you can write to main.s.out']);
  assert.deepEqual(writer.grant, { ok: false, detail: 'you cannot share main.s.out: you need to own it, its schema or its catalog, or hold MANAGE on one of them' });
  const manager = outputAccess([...base, grant('table', 'MODIFY', 'amr@x', true), grant('table', 'SELECT', 'amr@x', true), grant('schema', 'MANAGE', 'amr@x', true)], 'main.s.out');
  assert.deepEqual([manager.write.ok, manager.grant.ok], [true, true]);
  const reader = outputAccess([...base, grant('table', 'SELECT', 'amr@x', true)], 'main.s.out');
  assert.deepEqual(reader.write, { ok: false, detail: 'you need MODIFY on main.s.out to write to main.s.out' });
});

test('a missing catalog or schema is named instead of a privilege list', () => {
  assert.deepEqual(outputAccess([], 'main.s.out').write, { ok: false, detail: 'catalog main does not exist or you have no access to it' });
  assert.deepEqual(outputAccess([grant('catalog', 'OWNER', 'admins', false)], 'main.s.out').write,
    { ok: false, detail: 'schema main.s does not exist or you have no access to it; create it or pick another schema' });
});

test('registering a model needs USE CATALOG, USE SCHEMA and CREATE MODEL, held directly, by a group, by ownership or through ALL PRIVILEGES', () => {
  const traverse = [grant('catalog', 'USE_CATALOG', 'account users', true), grant('schema', 'USE SCHEMA', 'amr@x', true)];
  assert.deepEqual(modelAccess([...CATALOG_AND_SCHEMA, ...traverse, grant('schema', 'CREATE TABLE', 'amr@x', true)], 'main.s.out_model'),
    { ok: false, detail: 'you need CREATE MODEL on main.s to register the model main.s.out_model' });
  assert.deepEqual(modelAccess([...CATALOG_AND_SCHEMA, ...traverse, grant('schema', 'CREATE MODEL', 'someone-else@x', false)], 'main.s.out_model').ok, false);
  assert.deepEqual(modelAccess(CATALOG_AND_SCHEMA, 'main.s.out_model'),
    { ok: false, detail: 'you need USE CATALOG on main, USE SCHEMA on main.s and CREATE MODEL on main.s to register the model main.s.out_model' });
  assert.deepEqual(modelAccess([...CATALOG_AND_SCHEMA, ...traverse, grant('catalog', 'CREATE_MODEL', 'analysts', true)], 'main.s.out_model'),
    { ok: true, detail: 'you can register the model main.s.out_model' });
  assert.equal(modelAccess([...CATALOG_AND_SCHEMA, grant('schema', 'ALL_PRIVILEGES', 'amr@x', true), grant('catalog', 'USE CATALOG', 'amr@x', true)], 'main.s.m').ok, true);
  assert.equal(modelAccess([grant('catalog', 'OWNER', 'amr@x', true), grant('schema', 'OWNER', 'amr@x', true)], 'main.s.m').ok, true);
  assert.deepEqual(modelAccess([grant('catalog', 'OWNER', 'admins', false)], 'main.s.m'),
    { ok: false, detail: 'schema main.s does not exist or you have no access to it; create it or pick another schema, so Inspire cannot register the model main.s.m there' });
});

test('the model of a use case defaults next to its result table, and only execution families A to D train one', () => {
  assert.equal(defaultModelName('Main.Sales.Out_1'), 'Main.Sales.Out_1_model');
  assert.equal(defaultModelName('`main`.`s`.`out`'), 'main.s.out_model');
  assert.equal(sameSchema('main.sales.a', 'Main.Sales.b'), true);
  assert.equal(sameSchema('main.sales.a', 'main.models.a'), false);
  assert.equal(sameSchema('main.sales.a', 'other.sales.a'), false);
  for (const family of ['A', 'B', 'C', 'D']) assert.equal(trainsModel({ code_structure_mandate: `Execution pattern: family ${family} (x).` }), true, family);
  for (const family of ['E', 'F', 'G', 'H']) assert.equal(trainsModel({ code_structure_mandate: `Execution pattern: family ${family} (x).` }), false, family);
  assert.equal(trainsModel({ code_structure_mandate: '' }), null);
  assert.equal(trainsModel(null), null);
});

const accessRow = (level, privilege, principal, mine = false) => ({ level, privilege, principal, mine, me: 'inspire-sp' });
const LIVE_ACCESS = [accessRow('catalog', 'OWNER', 'amr@x'), accessRow('schema', 'OWNER', 'amr@x'), accessRow('table', 'OWNER', 'inspire-sp', true),
  accessRow('catalog', 'USE_CATALOG', 'inspire-sp', true), accessRow('catalog', 'BROWSE', 'account users', true),
  accessRow('schema', 'USE_SCHEMA', 'inspire-sp', true), accessRow('schema', 'SELECT', 'inspire-sp', true)];
const ACCESS_TABLE = 'main.inspire.churn_out';
const NEED_CATALOG = { privilege: 'USE CATALOG', level: 'catalog', object: '`main`' };
const NEED_SCHEMA = { privilege: 'USE SCHEMA', level: 'schema', object: '`main`.`inspire`' };
const NEED_SELECT = { privilege: 'SELECT', level: 'table', object: '`main`.`inspire`.`churn_out`' };
const GAP_CATALOG = { ...NEED_CATALOG, owner: 'amr@x' };
const GAP_SCHEMA = { ...NEED_SCHEMA, owner: 'amr@x' };

test('the access plan matches the agent: skip what a principal has, grant what Inspire manages, name the rest', () => {
  const cases = [
    [[], 'amr@x', [NEED_SELECT], []],
    [[], 'AMR@X', [NEED_SELECT], []],
    [[], 'bob@x', [NEED_SELECT], [GAP_CATALOG, GAP_SCHEMA]],
    [[], '', [], [GAP_CATALOG, GAP_SCHEMA]],
    [[accessRow('catalog', 'USE CATALOG', 'account users', true)], '', [], [GAP_SCHEMA]],
    [[accessRow('catalog', 'USE_SCHEMA', 'account users', true)], 'bob@x', [NEED_SELECT], [GAP_CATALOG]],
    [[accessRow('schema', 'MANAGE', 'inspire-sp', true)], 'bob@x', [NEED_SCHEMA, NEED_SELECT], [GAP_CATALOG]],
    [[accessRow('catalog', 'MANAGE', 'inspire-admins', true)], 'bob@x', [NEED_CATALOG, NEED_SCHEMA, NEED_SELECT], []],
    [[accessRow('catalog', 'MANAGE', 'someone-else')], 'bob@x', [NEED_SELECT], [GAP_CATALOG, GAP_SCHEMA]],
    [[accessRow('catalog', 'ALL_PRIVILEGES', 'bob@x')], 'bob@x', [], []],
    [[accessRow('catalog', 'USE_CATALOG', 'bob@x'), accessRow('catalog', 'USE_SCHEMA', 'bob@x'), accessRow('schema', 'SELECT', 'bob@x')], 'bob@x', [], []],
    [[accessRow('catalog', 'OWNER', 'bob@x')], 'bob@x', [NEED_SELECT], [GAP_SCHEMA]],
    [[accessRow('table', 'SELECT', 'bob@x')], 'bob@x', [], [GAP_CATALOG, GAP_SCHEMA]],
  ];
  for (const [extra, who, grants, gaps] of cases) {
    assert.deepEqual(I.accessPlan(ACCESS_TABLE, [...LIVE_ACCESS, ...extra], who), { grants, gaps, me: 'inspire-sp' }, `${who} ${JSON.stringify(extra)}`);
  }
  const noTable = LIVE_ACCESS.filter((r) => r.level !== 'table');
  assert.deepEqual(I.accessPlan(ACCESS_TABLE, noTable, 'bob@x').grants, [NEED_SELECT]);
  assert.deepEqual(I.accessPlan(ACCESS_TABLE, [], 'bob@x'),
    { grants: [NEED_SELECT], gaps: [{ ...GAP_CATALOG, owner: '' }, { ...GAP_SCHEMA, owner: '' }], me: '' });
  assert.deepEqual(I.accessPlan(ACCESS_TABLE, null, 'planners'),
    { grants: [NEED_CATALOG, NEED_SCHEMA, NEED_SELECT], gaps: [], me: '' });
  assert.deepEqual(I.accessPlan(ACCESS_TABLE, null, ''), { grants: [], gaps: [], me: '' });
  assert.deepEqual(I.accessPlan(ACCESS_TABLE, LIVE_ACCESS, 'x`; DROP TABLE t; --'), { grants: [], gaps: [], me: '' });
  assert.deepEqual(I.accessPlan('not_a_table', LIVE_ACCESS, 'bob@x'), { grants: [], gaps: [], me: '' });
  assert.deepEqual(I.accessPlan(ACCESS_TABLE, LIVE_ACCESS.map((r) => ({ ...r, mine: String(r.mine) })), 'amr@x').grants, [NEED_SELECT]);
});

test('a grant statement renders one need for one principal, as the agent does', () => {
  assert.deepEqual([NEED_CATALOG, NEED_SCHEMA, NEED_SELECT].map((need) => I.grantSql(need, 'bob@x')), [
    'GRANT USE CATALOG ON CATALOG `main` TO `bob@x`', 'GRANT USE SCHEMA ON SCHEMA `main`.`inspire` TO `bob@x`',
    'GRANT SELECT ON TABLE `main`.`inspire`.`churn_out` TO `bob@x`']);
  assert.equal(I.grantSql(GAP_CATALOG, 'planners'), 'GRANT USE CATALOG ON CATALOG `main` TO `planners`');
});

test('access gap messages match the agent word for word', () => {
  assert.equal(I.accessGapMessage('bob@x', [GAP_CATALOG]),
    'bob@x may not be able to read the result table: Inspire cannot grant USE CATALOG on catalog `main` (owner amr@x), because it '
    + 'neither owns nor holds MANAGE on it. If bob@x does not have it yet, ask the owner to run: '
    + 'GRANT USE CATALOG ON CATALOG `main` TO `bob@x`');
  assert.equal(I.accessGapMessage('bob@x', [GAP_CATALOG, { ...GAP_SCHEMA, owner: '' }]),
    'bob@x may not be able to read the result table: Inspire cannot grant USE CATALOG on catalog `main` (owner amr@x) and '
    + 'USE SCHEMA on schema `main`.`inspire`, because it neither owns nor holds MANAGE on them. If bob@x does not have them yet, '
    + 'ask the owner to run: GRANT USE CATALOG ON CATALOG `main` TO `bob@x`; GRANT USE SCHEMA ON SCHEMA `main`.`inspire` TO `bob@x`');
  assert.equal(I.appAccessMessage(ACCESS_TABLE, [GAP_CATALOG, GAP_SCHEMA], 'inspire-sp'),
    'a new App could not read main.inspire.churn_out: its service principal needs USE CATALOG on catalog `main` (owner amr@x) '
    + 'and USE SCHEMA on schema `main`.`inspire` (owner amr@x), which not all account users have, and Inspire can grant them only '
    + 'with MANAGE or ownership. Ask the owner to run: GRANT MANAGE ON CATALOG `main` TO `inspire-sp`; GRANT MANAGE ON SCHEMA '
    + '`main`.`inspire` TO `inspire-sp`, or GRANT USE CATALOG ON CATALOG `main` TO `account users`; GRANT USE SCHEMA ON SCHEMA '
    + '`main`.`inspire` TO `account users`, which open no data by themselves; or choose a result table in a catalog and schema '
    + 'Inspire manages');
  assert.ok(I.appAccessMessage(ACCESS_TABLE, [GAP_CATALOG], '').includes(
    'TO the identity Inspire runs as, or GRANT USE CATALOG ON CATALOG `main` TO `account users`, which opens no data by itself; or choose'));
  const withSelect = I.appAccessMessage(ACCESS_TABLE, [GAP_CATALOG, { ...NEED_SELECT, owner: 'data-eng' }], 'inspire-sp');
  assert.ok(withSelect.includes('GRANT MANAGE ON TABLE `main`.`inspire`.`churn_out` TO `inspire-sp`; or choose'));
  assert.ok(!withSelect.includes('account users`'), 'SELECT for every account user would open the data, so it is never offered');
});

test('output access tells up front whether a new App could read the table, and sharing warns per principal', () => {
  const blocked = outputAccess(LIVE_ACCESS, ACCESS_TABLE);
  assert.deepEqual(blocked.app, { ok: false, detail: I.appAccessMessage(ACCESS_TABLE, [GAP_CATALOG, GAP_SCHEMA], 'inspire-sp') });
  const managed = outputAccess([...LIVE_ACCESS, accessRow('catalog', 'MANAGE', 'inspire-sp', true)], ACCESS_TABLE);
  assert.deepEqual(managed.app, { ok: true, detail: 'Inspire can give a new App read access to main.inspire.churn_out' });
  const open = outputAccess([...LIVE_ACCESS, accessRow('catalog', 'USE_CATALOG', 'account users', true), accessRow('schema', 'USE_SCHEMA', 'account users', true)], ACCESS_TABLE);
  assert.equal(open.app.ok, true);
  assert.deepEqual(I.shareWarnings(ACCESS_TABLE, LIVE_ACCESS, ['amr@x', { name: 'planners' }, '', null]),
    [I.accessGapMessage('planners', [GAP_CATALOG, GAP_SCHEMA])]);
  assert.deepEqual(I.shareWarnings(ACCESS_TABLE, LIVE_ACCESS, undefined), []);
});

test('sharing a dashboard or Genie Agent warns about the warehouse only when Inspire cannot grant CAN USE on it', () => {
  const cannot = { ok: false, detail: 'Inspire cannot manage SQL' };
  const both = ['the dashboard', 'the Genie Agent'];
  assert.deepEqual(I.shareWarehouseWarnings(cannot, ['amr@x', { name: 'planners' }, '', null], both, 'SQL'),
    ['amr@x and planners need CAN USE on SQL to open the dashboard and the Genie Agent, because they query with their own access, '
      + 'and Inspire may not be able to grant it: ask the warehouse owner to give them CAN USE on SQL, or to give Inspire CAN MANAGE on it']);
  assert.match(I.shareWarehouseWarnings(cannot, [{ name: 'amr@x' }], [false, 'the Genie Agent'], '')[0],
    /^amr@x needs CAN USE on the SQL warehouse to open the Genie Agent, .*give it CAN USE/);
  assert.deepEqual(I.shareWarehouseWarnings({ ok: true, detail: 'manages' }, ['amr@x'], both, 'SQL'), [], 'Inspire grants it itself');
  assert.deepEqual(I.shareWarehouseWarnings(cannot, [], both, 'SQL'), []);
  assert.deepEqual(I.shareWarehouseWarnings(cannot, ['amr@x'], [false, false], 'SQL'), [], 'an App or alert alone needs no viewer access');
  assert.deepEqual(I.shareWarehouseWarnings(null, ['amr@x'], both, 'SQL'), []);
});

test('Inspire may attach a warehouse to a new App only when it holds CAN MANAGE, directly or through a group', () => {
  const acl = (entries) => ({ ok: true, status: 200, data: { access_control_list: entries } });
  const level = (permission_level) => ({ all_permissions: [{ permission_level }] });
  const cannot = 'Inspire cannot manage SQL, so it cannot give a new App access to it: ask the warehouse owner to grant Inspire CAN MANAGE on it, or re-run the Inspire installer';
  assert.deepEqual(I.warehouseManageCheck(acl([{ service_principal_name: 'SP-1', ...level('CAN_MANAGE') }]), ['sp-1'], [], 'SQL'),
    { ok: true, detail: 'Inspire can give a new App access to SQL' });
  assert.equal(I.warehouseManageCheck(acl([{ user_name: 'amr@x', ...level('IS_OWNER') }]), ['amr@x'], [], 'SQL').ok, true);
  assert.equal(I.warehouseManageCheck(acl([{ group_name: 'admins', ...level('CAN_MANAGE') }]), ['sp-1'], ['admins'], 'SQL').ok, true);
  assert.deepEqual(I.warehouseManageCheck(acl([{ service_principal_name: 'sp-1', ...level('CAN_USE') }, { group_name: 'admins', ...level('CAN_MANAGE') }]),
    ['sp-1'], ['users'], 'SQL'), { ok: false, detail: cannot });
  assert.deepEqual(I.warehouseManageCheck(acl([{ user_name: 'other@x', ...level('CAN_MANAGE') }]), ['sp-1', undefined, ''], [null], 'SQL'),
    { ok: false, detail: cannot });
  assert.deepEqual(I.warehouseManageCheck({ ok: false, status: 403, data: { message: 'no' } }, ['sp-1'], [], 'SQL'), { ok: false, detail: cannot });
  assert.deepEqual(I.warehouseManageCheck({ ok: false, status: 500, data: { message: 'boom' } }, ['sp-1'], [], ''),
    { ok: false, detail: 'Inspire could not check its permission on the SQL warehouse: boom' });
  assert.equal(I.warehouseManageCheck(null, ['sp-1'], [], 'SQL').detail, 'Inspire could not check its permission on SQL: no response');
  assert.equal(I.warehouseManageCheck({ ok: false, status: 502, data: {} }, ['sp-1'], [], 'SQL').detail, 'Inspire could not check its permission on SQL: HTTP 502');
  assert.equal(I.warehouseManageCheck(acl(null), ['sp-1'], [], 'SQL').ok, false);
});

test('App access combines the table and the warehouse and names every failing part', () => {
  const t = { ok: true, detail: 'table ok' };
  const w = { ok: true, detail: 'warehouse ok' };
  assert.deepEqual(I.appAccessCheck(t, w), { ok: true, detail: 'table ok; warehouse ok' });
  assert.deepEqual(I.appAccessCheck({ ok: false, detail: 'no table' }, w), { ok: false, detail: 'no table' });
  assert.deepEqual(I.appAccessCheck({ ok: false, detail: 'no table' }, { ok: false, detail: 'no warehouse' }), { ok: false, detail: 'no table; no warehouse' });
});

test('an existing table that is not an Inspire result table, or that holds other use cases, is refused', () => {
  const keys = IMPLEMENT_RESULT_KEY_COLUMNS.map((column_name) => ({ column_name }));
  assert.equal(resultTableProblem('main.s.out', [{ column_name: 'order_id' }, { column_name: 'use_case_id' }], 0),
    'main.s.out already exists and is not an Inspire result table (it has no run_id and as_of_date); pick a new table name so Inspire never rewrites it');
  assert.equal(resultTableProblem('main.s.out', keys, 3),
    "main.s.out already holds 3 row(s) of other use cases; give each use case its own result table so its outputs show only its rows");
  assert.equal(resultTableProblem('main.s.out', keys, '0'), '');
  assert.equal(resultTableProblem('main.s.out', [], 5), '');
  const counted = otherUseCaseRowsStatement('main.s.out', 'N01-U01');
  assert.ok(counted.sql.includes('use_case_id IS NULL OR use_case_id <> :uc'));
  assert.deepEqual(counted.parameters.map((p) => [p.name, p.value]), [['uc', 'N01-U01']]);
});

test('an App name taken by another App is refused, while this use case\'s own App is updated', () => {
  const ctx = { useCaseId: 'N01-U01', sessionId: '42' };
  assert.deepEqual(appNameCheck('churn-desk', null, ctx), { ok: true, detail: "'churn-desk' is free", creates: true });
  assert.deepEqual(appNameCheck('churn-desk', { description: `${appOwnerTag('N01-U01', '42')}: churn desk` }, ctx).ok, true);
  assert.deepEqual(appNameCheck('churn-desk', { description: 'x' }, { ...ctx, assets: { app: 'churn-desk' } }),
    { ok: false, detail: "'churn-desk' is used by another App in this workspace; pick another name", creates: true },
    'a recorded App name is not proof: the App under that name must still carry this use case\'s tag');
  const taken = appNameCheck('churn-desk', { description: 'Finance team tool' }, ctx);
  assert.deepEqual(taken, { ok: false, detail: "'churn-desk' is used by another App in this workspace; pick another name", creates: true });
  assert.equal(appNameCheck('churn-desk', { description: appOwnerTag('N01-U012', '42') }, ctx).ok, false);
  assert.equal(appNameCheck('churn-desk', { description: appOwnerTag('N01-U01', '43') }, ctx).ok, false);
});

test('the Apps quota is 50 on GCP and 100 on every other host, and only a new App needs room', () => {
  assert.equal(appsLimit('https://adb-1.14.azuredatabricks.net'), 100);
  assert.equal(appsLimit('https://workspace.example.com'), 100);
  assert.equal(appsLimit('https://1234.5.gcp.databricks.com'), 50);
  assert.deepEqual(appsQuotaCheck(99, 100, true), { ok: true, detail: '99 of 100 Apps used; one more fits' });
  assert.deepEqual(appsQuotaCheck(100, 100, true), { ok: false, detail: 'this workspace already has 100 of its 100 Apps; delete one or untick the App' });
  assert.equal(appsQuotaCheck(100, 100, false).ok, true);
});

test('discovery evidence parses from the stored JSON and drops what it cannot use', () => {
  const raw = JSON.stringify({ tables: { 'main.s.orders': { rows: 1200, sampled: true, date_ranges: { order_date: { min: '2024-01-01', max: '2024-12-31' }, bad: { min: '2024-01-01' } } },
    'main.s.x': 'nope', 'main.s.y': { rows: 'many' } }, joins: [] });
  assert.deepEqual(parseEvidence(raw), { tables: {
    'main.s.orders': { rows: 1200, date_ranges: { order_date: { min: '2024-01-01', max: '2024-12-31' } }, sampled: true },
    'main.s.y': { rows: null, date_ranges: {}, sampled: false },
  } });
  assert.equal(parseEvidence('not json'), null);
  assert.equal(parseEvidence(null), null);
  assert.equal(parseEvidence({ joins: [] }), null);
});

test('identifiers are validated before they reach SQL', () => {
  assert.equal(quoteTable('main.s.orders'), '`main`.`s`.`orders`');
  assert.equal(quoteTable('`main`.`s`.`orders`'), '`main`.`s`.`orders`');
  assert.throws(() => quoteTable('main.orders'), /catalog.schema.table/);
  assert.throws(() => quoteTable('main.s.o`rders'), /catalog.schema.table/);
  assert.equal(quoteColumn('region'), '`region`');
  assert.throws(() => quoteColumn('a`b'), /not a column name/);
  assert.equal(validateUseCaseId(' N01-U01 '), 'N01-U01');
  assert.throws(() => validateUseCaseId("N01'"), (err) => err.statusCode === 400);
});

const ALERT = { alert: true, alert_recipients: ['owner@example.com'] };

test('alert options normalize with the same defaults the agent uses', () => {
  const { spec: out, errors } = spec({ outputs: { ...VALID.outputs, alert: true, alert_name: ' Churn alert ',
    alert_recipients: ['Owner@Example.com', 'owner@example.com', 'b@example.com'],
    alert_destinations: [{ id: '1234abcd-ef', name: 'Slack #churn' }, '1234abcd-ef'] } });
  assert.deepEqual(errors, []);
  const o = out.outputs;
  assert.equal(o.alert, true);
  assert.equal(o.alert_name, 'Churn alert');
  assert.equal(o.alert_condition_text, '');
  assert.deepEqual([o.alert_tiers, o.alert_operator, o.alert_threshold], ['act_now', '>=', 1]);
  assert.deepEqual(o.alert_recipients, ['Owner@Example.com', 'b@example.com']);
  assert.deepEqual(o.alert_destinations, [{ id: '1234abcd-ef', name: 'Slack #churn' }]);
  const off = spec({ outputs: { ...VALID.outputs, alert_recipients: ['owner@example.com'], alert_name: 'x' } }).spec.outputs;
  assert.equal(off.alert, false);
  assert.equal(off.alert_name, '');
  assert.deepEqual(off.alert_recipients, []);
  assert.deepEqual(off.alert_destinations, []);
  const tuned = spec({ outputs: { ...VALID.outputs, ...ALERT, alert_tiers: 'ACT_NOW_REVIEW', alert_operator: '>', alert_threshold: ' 2.5 ' } }).spec.outputs;
  assert.deepEqual([tuned.alert_tiers, tuned.alert_operator, tuned.alert_threshold], ['act_now_review', '>', 2.5]);
});

const ALERT_REJECT = [
  [{ alert_tiers: 'everything' }, 'alert_tiers'],
  [{ alert_operator: '~' }, 'alert_operator'],
  [{ alert_threshold: -1 }, 'alert_threshold'],
  [{ alert_threshold: 'many' }, 'alert_threshold'],
  [{ alert_threshold: Number.NaN }, 'alert_threshold'],
  [{ alert_threshold: Number.POSITIVE_INFINITY }, 'alert_threshold'],
  [{ alert_threshold: true }, 'alert_threshold'],
  [{ alert_threshold: '0x10' }, 'alert_threshold'],
  [{ alert_recipients: ['not-an-email'] }, 'is not an email address'],
  [{ alert_destinations: [{ id: 'x' }] }, 'notification destination'],
  [{ alert_destinations: ['a;b c d e f g'] }, 'notification destination'],
  [{ alert_recipients: [] }, 'at least one recipient'],
  [{ alert_recipients: Array.from({ length: 101 }, (_, i) => `u${i}@example.com`) }, 'at most 100'],
];

for (const [changes, needle] of ALERT_REJECT) {
  test(`an alert is rejected: ${needle} ${JSON.stringify(changes).slice(0, 40)}`, () => {
    const { errors } = spec({ outputs: { ...VALID.outputs, ...ALERT, ...changes } });
    assert.ok(errors.some((e) => e.includes(needle)), JSON.stringify(errors));
  });
}

test('alert options are not checked when the alert is not ticked', () => {
  const { errors } = spec({ outputs: { ...VALID.outputs, alert: false, alert_tiers: 'everything', alert_threshold: 'many' } });
  assert.deepEqual(errors, []);
});

test('the warehouse message names the alert too', () => {
  const { errors } = spec({ config: { widgets: {} }, outputs: { dashboard: false, ...ALERT } });
  assert.ok(errors.includes('a SQL warehouse is required to build a dashboard, a Genie Agent, an App or an alert'), JSON.stringify(errors));
});

test('drift_threshold accepts decimals and rejects hex and booleans like the agent does', () => {
  const ok = spec({ config: { warehouse_id: 'w', profiles: { retrain: { drift_threshold: '0.25' } } } });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.spec.config.profiles.retrain.drift_threshold, 0.25);
  for (const bad of ['0x1', true, 'nan']) {
    const { errors } = spec({ config: { warehouse_id: 'w', profiles: { retrain: { drift_threshold: bad } } } });
    assert.ok(errors.some((e) => e.includes('drift_threshold')), JSON.stringify(bad));
  }
});

test('retry outputs validate and refresh only what was asked', () => {
  const { spec: out, errors } = spec({ retry_outputs: ['dashboard', 'dashboard', 'app'] });
  assert.deepEqual(errors, []);
  assert.deepEqual(out.retry_outputs, ['dashboard', 'app']);
  assert.ok(spec({ retry_outputs: ['pdf'] }).errors.some((e) => e.includes("retry output 'pdf' is not one of")));
  assert.ok(spec({ retry_outputs: ['alert'] }).errors.some((e) => e.includes('the Alert cannot be retried: it is not selected')));
  const previous = spec().spec;
  const current = spec({ retry_outputs: ['dashboard'] }).spec;
  const summary = implementChangeSummary(previous, current, { dashboard: 'd1', genie_space: 'g1', app: 'churn-desk' });
  assert.deepEqual(summary.classes, ['retry']);
  assert.deepEqual(summary.refresh, ['dashboard']);
  assert.deepEqual(summary.build, []);
  assert.equal(summary.refill, false);
  const gone = implementChangeSummary(previous, current, { genie_space: 'g1', app: 'churn-desk' });
  assert.deepEqual(gone.build, ['dashboard']);
  assert.deepEqual(gone.refresh, []);
  assert.deepEqual(spec().spec.retry_outputs, []);
});

test('a retry of an unchanged ready version is a real change, not "nothing changed"', () => {
  const plan = planSubmission([row(1, 'ready', { dashboard_id: 'd1' })], spec({ based_on_version: 1, retry_outputs: ['dashboard'] }).spec);
  assert.equal(plan.nextVersion, 2);
  assert.deepEqual(plan.summary.classes, ['retry']);
  assert.deepEqual(plan.summary.refresh, ['dashboard']);
});

test('the alert carries from earlier versions and stops at a delete like every other output', () => {
  assert.deepEqual(carriedAssets([
    { spec_version: 2, alert_id: null, asset_status: null },
    { spec_version: 1, alert_id: 'a1', asset_status: null },
  ]), { alert: 'a1' });
  assert.deepEqual(carriedAssets([
    { spec_version: 2, alert_id: null, asset_status: { alert: { state: 'deleted' } } },
    { spec_version: 1, alert_id: 'a1', asset_status: null },
  ]), {});
});

test('DESCRIBE output stops at the first blank or # row, and only missing columns are added', () => {
  const names = describedColumnNames([
    { col_name: 'session_id' }, { col_name: 'Use_Case_ID' }, { col_name: '' }, { col_name: '# Partition Information' }, { col_name: 'alert_id' },
  ]);
  assert.deepEqual([...names], ['session_id', 'use_case_id']);
  const all = new Set(IMPLEMENT_COLUMNS.map(([n]) => n));
  assert.deepEqual(implementMissingColumns(all), []);
  all.delete('alert_url');
  assert.deepEqual(implementMissingColumns(all), [['alert_url', 'STRING']]);
});

test('history reads missing columns as NULL and keeps VARIANT columns as JSON', () => {
  const existing = new Set(IMPLEMENT_COLUMNS.map(([n]) => n).filter((n) => n !== 'alert_id'));
  const statement = implementHistoryStatement('`t`', '42', null, existing);
  assert.ok(statement.sql.includes('NULL AS `alert_id`'));
  assert.ok(statement.sql.includes('`alert_url`') && !statement.sql.includes('NULL AS `alert_url`'));
  assert.ok(statement.sql.includes('to_json(`spec_json`) AS `spec_json`'));
  assert.ok(!implementHistoryStatement('`t`', '42', null).sql.includes('NULL AS'));
});

test('only a missing-column error triggers the read fallback', () => {
  assert.equal(isMissingColumnError(new Error('[UNRESOLVED_COLUMN.WITH_SUGGESTION] `alert_id` cannot be resolved')), true);
  assert.equal(isMissingColumnError(new Error('SQLSTATE: 42703')), true);
  assert.equal(isMissingColumnError(new Error('[TABLE_OR_VIEW_NOT_FOUND] t')), false);
  assert.equal(isMissingColumnError(new Error('PERMISSION_DENIED')), false);
  assert.equal(isMissingColumnError(null), false);
});

test('destinations keep only entries with a usable id', () => {
  assert.deepEqual(destinationsFromList({ results: [
    { id: '1234abcd-ef', display_name: 'Ops', destination_type: 'EMAIL' }, { id: 'short' }, null, { display_name: 'no id' },
  ] }), [{ id: '1234abcd-ef', name: 'Ops', type: 'email' }]);
  assert.deepEqual(destinationsFromList({}), []);
  assert.deepEqual(destinationsFromList(null), []);
});

function merged(base, patch) {
  const out = JSON.parse(JSON.stringify(base));
  for (const [key, value] of Object.entries(patch)) {
    const both = value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key]);
    out[key] = both ? merged(out[key], value) : value;
  }
  return out;
}

test('every shared invalid case is rejected with the shared message', () => {
  const base = FIXTURE.cases.find((c) => c.name === 'first submission').current;
  assert.deepEqual(validateImplementSpec(base).errors, []);
  assert.ok(FIXTURE.invalid.length >= 28);
  for (const c of FIXTURE.invalid) {
    const { errors } = validateImplementSpec(merged(base, c.patch));
    assert.ok(errors.some((e) => e.includes(c.error)), `${c.name}: ${JSON.stringify(errors)}`);
  }
});

const PARITY = require('./fixtures/implement_spec_parity.json');

function specLeaves(value, at = [], out = new Map()) {
  if (value && typeof value === 'object' && Object.keys(value).length) {
    for (const [key, item] of Object.entries(value)) specLeaves(item, [...at, Array.isArray(value) ? Number(key) : key], out);
  } else {
    out.set(JSON.stringify(at), JSON.stringify(value));
  }
  return out;
}

function withEdits(spec, edits) {
  const out = JSON.parse(JSON.stringify(spec));
  for (const [at, value] of edits) {
    let node = out;
    for (const key of at.slice(0, -1)) node = node[key];
    Object.defineProperty(node, at[at.length - 1], { value: JSON.parse(JSON.stringify(value)), enumerable: true, writable: true, configurable: true });
  }
  return out;
}

test('the validator gives the agent errors and cleaned spec on every parity case', () => {
  const first = validateImplementSpec(PARITY.base);
  assert.deepEqual(first.errors, []);
  const base = specLeaves(PARITY.clean);
  assert.deepEqual(specLeaves(first.spec), base);
  assert.ok(PARITY.cases.length >= 400);
  for (const c of PARITY.cases) {
    const { spec, errors } = validateImplementSpec(withEdits(PARITY.base, c.set));
    const expected = new Map(base);
    for (const at of c.removed) expected.delete(JSON.stringify(at));
    for (const [at, value] of c.changes) expected.set(JSON.stringify(at), JSON.stringify(value));
    assert.deepEqual([...errors].sort(), [...c.errors].sort(), c.name);
    assert.deepEqual(specLeaves(spec), expected, c.name);
  }
});

test('the contract tables are the ones the agent holds', () => {
  const APP_NAMES = {
    IMPLEMENT_OUTPUTS: 'IMPLEMENT_CONTRACT_OUTPUTS',
    IMPLEMENT_VIBES_MAX_CHARS: 'IMPLEMENT_VIBES_MAX',
    IMPLEMENT_APP_LOOK: 'IMPLEMENT_APP_LOOK_DEFAULT',
  };
  assert.ok(FIXTURE.contract_tables.IMPLEMENT_OUTPUT_OPTIONS && FIXTURE.contract_tables.IMPLEMENT_ALERT_BASELINE_DIRECTIONS);
  for (const [name, value] of Object.entries(FIXTURE.contract_tables)) {
    const mine = I[APP_NAMES[name] || name];
    assert.deepEqual(mine instanceof RegExp ? mine.source : mine, value, name);
  }
});

test('a removed table is normalized, deduplicated and kept apart from the swaps', () => {
  const base = FIXTURE.cases.find((c) => c.name === 'first submission').current;
  const { spec, errors } = validateImplementSpec(merged(base, { data: { removed_tables: ['`main`.`s`.`returns`', 'main.s.returns', 'main.s.web'] } }));
  assert.deepEqual(errors, []);
  assert.deepEqual(spec.data.removed_tables, ['main.s.returns', 'main.s.web']);
  assert.deepEqual(validateImplementSpec(base).spec.data.removed_tables, []);
});

test('removal problems match the shared cases', () => {
  for (const c of FIXTURE.removal) {
    assert.deepEqual(removedTableProblems({ data: { removed_tables: c.removed } }, c.involved, c.primary), c.problems, c.name);
  }
  assert.deepEqual(removedTableProblems({}, ['main.s.orders'], 'main.s.orders'), []);
});

test('use case tables match the shared cases and the primary table is parsed', () => {
  for (const c of FIXTURE.table_names) {
    assert.deepEqual(useCaseTables({ tables_involved: c.tables_involved, primary_table: c.primary_table }), c.names, JSON.stringify(c));
  }
  assert.equal(primaryTableOf({ primary_table: ' `main`.`s`.`orders`, main.s.web' }), 'main.s.orders');
  assert.equal(primaryTableOf({ primary_table: null }), '');
  assert.equal(primaryTableOf(null), '');
});

test('the preview reads each involved table under its swap, never a removed one, once', () => {
  const spec = { data: { tables: { 'main.s.orders': '`main`.`s`.`orders_v2`', 'main.s.unused': 'main.s.other' }, removed_tables: ['MAIN.S.RETURNS'] } };
  assert.deepEqual(I.sourceTables(spec, ['main.s.orders', 'main.s.returns', 'main.s.items', 'MAIN.S.ITEMS']), ['main.s.orders_v2', 'main.s.items']);
  assert.deepEqual(I.sourceTables({}, ['main.s.items']), ['main.s.items']);
  assert.deepEqual(I.sourceTables(null, null), []);
  assert.deepEqual(I.sourceTables({ data: { tables: ['bad'], removed_tables: 'main.s.items' } }, ['main.s.items']), ['main.s.items']);
});

test('the tables a rebuild checks are its source tables plus the use case\'s own table behind each live swap, once each', () => {
  const spec = { data: { tables: { 'MAIN.S.ORDERS': 'main.s.orders_v2', 'main.s.items': 'main.s.items', 'main.s.returns': 'main.s.returns_old', 'main.s.unused': 'main.s.other' },
    removed_tables: ['main.s.returns'] } };
  assert.deepEqual(I.checkedSourceTables(spec, ['main.s.orders', 'main.s.returns', 'main.s.items']), ['main.s.orders_v2', 'main.s.items', 'main.s.orders']);
  assert.deepEqual(I.checkedSourceTables({}, ['main.s.items', 'MAIN.S.ITEMS']), ['main.s.items']);
  assert.deepEqual(I.checkedSourceTables({ data: { tables: { 'main.s.a': 'main.s.b', 'main.s.c': 'main.s.b' } } }, ['main.s.a', 'main.s.c']),
    ['main.s.b', 'main.s.a', 'main.s.c']);
  assert.deepEqual(I.checkedSourceTables(null, null), []);
});

test('a probe error counts as a lost table only when it says so and names that table\'s catalog', () => {
  const t = 'main.s.returns';
  assert.equal(I.tableAccessReason(t, '[TABLE_OR_VIEW_NOT_FOUND] The table or view `main`.`s`.`returns` cannot be found.'), 'not found');
  assert.equal(I.tableAccessReason(t, '[SCHEMA_NOT_FOUND] The schema `main`.`s` cannot be found.'), 'not found');
  assert.equal(I.tableAccessReason(t, "[NO_SUCH_CATALOG_EXCEPTION] Catalog 'main' was not found."), 'not found');
  assert.equal(I.tableAccessReason(t, "[INSUFFICIENT_PERMISSIONS] Insufficient privileges: User does not have SELECT on Table 'main.s.returns'."), 'no read access');
  assert.equal(I.tableAccessReason(t, "PERMISSION_DENIED: User does not have USE SCHEMA on Schema 'main.s'"), 'no read access');
  assert.equal(I.tableAccessReason(t, 'Statement timed out after 50 seconds'), '');
  assert.equal(I.tableAccessReason(t, 'Warehouse wh1 does not exist or you cannot use it: not found'), '');
  assert.equal(I.tableAccessReason(t, '[TABLE_OR_VIEW_NOT_FOUND] The table or view `other`.`s`.`returns` cannot be found.'), '');
  assert.equal(I.tableAccessReason(t, '[PARSE_SYNTAX_ERROR] Syntax error at or near main'), '');
  assert.equal(I.tableAccessReason(t, ''), '');
  assert.equal(I.tableAccessReason('', '[TABLE_OR_VIEW_NOT_FOUND] cannot be found'), '');
});

test('the lost-table message names every table and its reason, and the probe reads no rows', () => {
  assert.equal(I.missingTablesMessage([{ table: 'main.s.a', reason: 'not found' }, { table: 'main.s.b', reason: 'no read access' }]),
    'the preview cannot run because these source tables are missing or not readable: main.s.a (not found), main.s.b (no read access). '
    + 'Open Edit, Data step, to swap each for a table with the same role or remove it');
  assert.deepEqual(I.tableProbeStatement('main.s.a'), { sql: 'SELECT * FROM `main`.`s`.`a` LIMIT 0', parameters: null });
  assert.throws(() => I.tableProbeStatement('main.s'), /must be catalog.schema.table/);
  assert.throws(() => I.tableProbeStatement('main.s.a`; DROP TABLE x; --'), /must be catalog.schema.table/);
});

test('re-run overrides drop blanks, the result table is refused, and the profile is always preview', () => {
  assert.deepEqual(I.rerunOverrides({ top_k: ' 10 ', as_of_date: '', horizon: '   ', n: 0, x: null }), { top_k: '10', n: '0' });
  assert.deepEqual(I.rerunOverrides(['top_k']), {});
  assert.deepEqual(I.rerunOverrides(null), {});
  assert.deepEqual(I.rerunParams(['top_k'], { top_k: '10', run_profile: 'full_load' }), { top_k: '10', run_profile: 'preview' });
  assert.throws(() => I.rerunParams(['top_k', 'result_table'], { result_table: 'main.x.y' }), /the result table is part of the spec/);
  assert.throws(() => I.rerunParams(['top_k'], { Result_Table: 'main.x.y' }), /the result table is part of the spec/);
  assert.throws(() => I.rerunParams(['top_k'], { horizon: '7' }), /'horizon' is not a widget of this notebook/);
});

test('re-run widgets leave out the result table and the run profile and come from the newest build', () => {
  const row = (v, widgets) => ({ spec_version: v, genie_widgets: widgets });
  const built = [{ name: 'result_table', default: 'main.s.out' }, { name: 'RUN_PROFILE', default: 'full_load' }, { name: 'top_k', default: '25' },
    { name: 'as_of_date', default: '' }];
  assert.deepEqual(I.rerunWidgets([row(3, null), row(1, built)]).map((w) => w.name), ['top_k', 'as_of_date']);
  assert.deepEqual(I.rerunWidgets([]), []);
});

test('the App status reads the active deployment, then the pending one, and says when the App is gone', () => {
  assert.equal(I.appStatusFrom(null), null);
  assert.deepEqual(I.appStatusFrom({ ok: false, status: 404, data: {} }), { ok: false, error: 'the App no longer exists' });
  assert.deepEqual(I.appStatusFrom({ ok: false, status: 403, data: { message: 'no CAN_VIEW on app' } }), { ok: false, error: 'no CAN_VIEW on app' });
  assert.deepEqual(I.appStatusFrom({ ok: false, status: 500, data: 'oops' }), { ok: false, error: 'HTTP 500' });
  const owner = { useCaseId: 'N01-U01', sessionId: '42' };
  const description = `${appOwnerTag('N01-U01', '42')}: churn desk`;
  const pending = I.appStatusFrom({ ok: true, status: 200, data: { name: 'a', description, pending_deployment: { status: { state: 'IN_PROGRESS', message: 'Deploying' }, create_time: 't0' } } }, owner);
  assert.deepEqual(pending, { ok: true, name: 'a', url: '', app_state: '', app_message: '', compute_state: '', deployment_state: 'IN_PROGRESS',
    deployment_message: 'Deploying', deployed_at: 't0' });
});

test('the App status never shows another App that took over the name as this use case\'s App', () => {
  const running = { name: 'churn-desk', url: 'https://churn-desk.example', app_status: { state: 'RUNNING' } };
  const gone = { ok: false, error: "the App named churn-desk is no longer this use case's App" };
  assert.deepEqual(I.appStatusFrom({ ok: true, status: 200, data: { ...running, description: 'Finance team tool' } }, { useCaseId: 'N01-U01', sessionId: '42' }), gone);
  assert.deepEqual(I.appStatusFrom({ ok: true, status: 200, data: { ...running, description: appOwnerTag('N01-U01', '43') } }, { useCaseId: 'N01-U01', sessionId: '42' }), gone);
  assert.deepEqual(I.appStatusFrom({ ok: true, status: 200, data: { ...running, description: appOwnerTag('N01-U01', '42') } }), gone,
    'a caller that does not say whose App it is sees no App');
  assert.equal(I.appStatusFrom({ ok: true, status: 200, data: { ...running, description: appOwnerTag('N01-U01', '42') } }, { useCaseId: 'N01-U01', sessionId: '42' }).app_state, 'RUNNING');
});

test('job runs map their state, profile and duration, and an error keeps an empty list', () => {
  assert.equal(I.jobRunsFrom(null), null);
  assert.deepEqual(I.jobRunsFrom({ ok: false, status: 403, data: {} }), { ok: false, error: 'HTTP 403', runs: [] });
  assert.deepEqual(I.jobRunsFrom({ ok: true, status: 200, data: {} }), { ok: true, runs: [] });
  assert.deepEqual(I.jobRunsFrom({ ok: true, status: 200, data: { runs: [{ run_id: 1, status: { state: 'QUEUED' } }] } }).runs,
    [{ run_id: 1, started: '', duration_s: 0, state: 'QUEUED', message: '', trigger: '', profile: '', url: '' }]);
});

test('an empty run list from a job Inspire cannot see says so instead of claiming the job never ran', () => {
  const empty = { ok: true, status: 200, data: { has_more: false } };
  assert.deepEqual(I.jobRunsFrom(empty, { ok: false, status: 403, data: { error_code: 'PERMISSION_DENIED', message: 'User x does not have View permissions on Job 77' } }),
    { ok: false, error: 'Inspire cannot see this job, so it cannot list its runs: User x does not have View permissions on Job 77', runs: [] });
  assert.deepEqual(I.jobRunsFrom(empty, { ok: false, status: 404, data: 'gone' }),
    { ok: false, error: 'Inspire cannot see this job, so it cannot list its runs: HTTP 404', runs: [] });
  assert.deepEqual(I.jobRunsFrom(empty, { ok: true, status: 200, data: { job_id: 77 } }), { ok: true, runs: [] });
  assert.deepEqual(I.jobRunsFrom(empty, null), { ok: true, runs: [] });
  assert.deepEqual(I.jobRunsFrom({ ok: false, status: 500, data: { message: 'list broke' } }, { ok: false, status: 403, data: {} }),
    { ok: false, error: 'list broke', runs: [] });
});
