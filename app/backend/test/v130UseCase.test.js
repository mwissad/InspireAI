const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { normalizeV130UseCaseFields } = require('../lib/inspireJobParams');

const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'v130UseCase.js')).href;
const load = () => import(libUrl);

const AGENT_KPI_TEXT = [
  [{ name: 'Repeat purchase rate', direction: 'increase', unit: '%', baseline: { value: 23.4, window_days: 90, measured_on: '2026-10-21' } },
    'Repeat purchase rate (↑ %): baseline 23.40, last 90 days, measured 2026-10-21'],
  [{ name: 'Stockout days', direction: 'reduce stockouts', unit: 'days', baseline: { value: 1234.5, measured_on: '2026-10-21' } },
    'Stockout days (↓ days): baseline 1,234, measured 2026-10-21'],
  [{ name: 'Orders', direction: '', unit: '', baseline: { value: 2500.5, window_days: 30, measured_on: '2026-10-20' } },
    'Orders: baseline 2,500, last 30 days, measured 2026-10-20'],
  [{ name: 'Margin', direction: 'maintain', unit: 'AED', baseline: null }, 'Margin (maintain AED)'],
  [{ name: 'Churn', direction: 'up or down', unit: '', baseline: { value: 7, measured_on: '2026-10-19' } },
    'Churn (up or down): baseline 7, measured 2026-10-19'],
  [{ name: 'Basket', direction: 'Grow', unit: 'AED', baseline: { value: -0.125, window_days: 7, measured_on: '2026-10-18' } },
    'Basket (↑ AED): baseline -0.12, last 7 days, measured 2026-10-18'],
  [{ name: 'Big', direction: 'decline', unit: '', baseline: { value: 3500.5, measured_on: '2026-10-18' } },
    'Big (↓): baseline 3,500, measured 2026-10-18'],
  [{ name: 'Str', direction: 'increase', unit: '', baseline: { value: '', measured_on: '2026-10-18' } }, 'Str (↑)'],
];

const ALIGNMENTS = [
  { id: 'S1.1', path: 'Customer > Grow repeat purchases', evidence: 'orders.customer_id repeat rate' },
  { id: 'S2', path: 'Operations', evidence: 'inventory.on_hand' },
];
const KPIS = [{ name: 'Repeat purchase rate', direction: 'increase', unit: '%', metric_view: 'main.m.sales_mv', measure: 'repeat_rate',
  computable: true, baseline: { value: 23.4, window_days: 90, measured_on: '2026-10-21' } }];
const KEY_RESULTS = [
  { id: 'R1', statement: 'Raise repeat purchase rate to 24%', kpi_id: 'K1', source: 'strategy' },
  { id: null, statement: 'Lift repeat buyers by a tenth', kpi_id: null, source: 'proposed' },
];
const EVIDENCE = { tables: { 'main.s.orders': { rows: 1200, sampled: false, date_ranges: { order_date: { min: '2024-01-01', max: '2026-10-01' } } } },
  joins: [{ child_table: 'main.s.orders', child_column: 'customer_id', parent_table: 'main.s.customers', parent_column: 'id', rate: 0.8765 }] };

const RESULTS_UC = {
  No: 'N01-U01', 'Strategy Alignment': ALIGNMENTS, 'Strategy Path': 'Customer > Grow repeat purchases; Operations',
  'Business Priority Alignment': 'Grow revenue, Protect margin, cut costs', KPIs: KPIS, 'Expected Key Results': KEY_RESULTS,
  'Measures of Success': ['Repeat rate up'], 'Financial Benefits': ['More revenue'], 'Non-Financial Benefits': ['Loyalty'],
  'Data Evidence': EVIDENCE, Foundations: ['F1', 'F2'], use_case_key: 'repeat buyers|main.s.orders', 'Feedback Status': 'Planned',
};

const TRACKING_ROW = () => normalizeV130UseCaseFields({
  id: 'N01-U01', strategy_alignment: JSON.stringify(ALIGNMENTS), strategy_path: 'Customer > Grow repeat purchases; Operations',
  kpis: JSON.stringify(KPIS), expected_key_results: JSON.stringify(KEY_RESULTS), measures_of_success: 'Repeat rate up',
  financial_benefits: 'More revenue', non_financial_benefits: 'Loyalty', data_evidence: JSON.stringify(EVIDENCE),
  foundation_ids: 'F1,F2', use_case_key: 'repeat buyers|main.s.orders',
});

test('the KPI line matches the agent writers character for character', async () => {
  const lib = await load();
  for (const [spec, expected] of AGENT_KPI_TEXT) assert.equal(lib.kpiText(spec), expected);
  assert.equal(lib.kpiText({ name: ' ' }), '');
});

test('results_json keys and tracking columns give the same view', async () => {
  const lib = await load();
  const fromResults = lib.v130View(RESULTS_UC);
  const fromTracking = lib.v130View(TRACKING_ROW());
  for (const key of ['alignments', 'paths', 'kpis', 'keyResults', 'measures', 'financial', 'nonFinancial', 'dataEvidence', 'foundations', 'useCaseKey']) {
    assert.deepEqual(fromTracking[key], fromResults[key], key);
  }
  assert.deepEqual(fromResults.paths, ['Customer > Grow repeat purchases', 'Operations']);
  assert.equal(fromResults.feedbackStatus, 'planned');
  assert.equal(fromResults.hasValue, true);
  assert.deepEqual(fromResults.keyResults.map((kr) => kr.source), ['strategy', 'proposed']);
});

test('tracking fields fill gaps and never overwrite results_json values', async () => {
  const lib = await load();
  const uc = { 'Strategy Path': 'Customer', kpis: [{ name: 'Kept' }], use_case_key: '' };
  lib.copyV130TrackingFields(uc, { kpis: [{ name: 'Other' }], use_case_key: 'k|t', strategy_path: 'From row', measures_of_success: [] });
  assert.deepEqual(uc.kpis, [{ name: 'Kept' }]);
  assert.equal(uc.use_case_key, 'k|t');
  assert.equal(uc.strategy_path, 'From row');
  assert.equal('measures_of_success' in uc, false);
  assert.equal(lib.v130View(uc).paths[0], 'Customer');
});

test('Not aligned holds only v1.3.0 use cases without a path; older sessions stay out of it', async () => {
  const lib = await load();
  const notAligned = lib.v130View({ 'Strategy Alignment': [], 'Strategy Path': 'Not aligned' });
  assert.equal(notAligned.notAligned, true);
  assert.deepEqual(notAligned.paths, []);
  const builtinNoMatch = lib.v130View({ 'Strategy Alignment': [], 'Strategy Path': '' });
  assert.equal(builtinNoMatch.notAligned, true);
  const legacy = lib.v130View({ Name: 'v1.2.0', 'Strategic Goals Alignment': 'Increase Revenue', 'Business Priority Alignment': 'Grow' });
  assert.equal(legacy.hasStrategyData, false);
  assert.equal(legacy.notAligned, false);
  assert.equal(lib.matchesStrategyFilter(legacy, lib.NOT_ALIGNED_FILTER), false);
  assert.equal(lib.v130View(TRACKING_ROW()).notAligned, false);
  assert.equal(lib.v130View(null).hasStrategyData, false);
});

test('a strategy filter matches the entry and everything under it, and nothing that only shares a name prefix', async () => {
  const lib = await load();
  const info = lib.v130View(RESULTS_UC);
  assert.equal(lib.matchesStrategyFilter(info, 'all'), true);
  assert.equal(lib.matchesStrategyFilter(info, 'Customer'), true);
  assert.equal(lib.matchesStrategyFilter(info, 'Customer > Grow repeat purchases'), true);
  assert.equal(lib.matchesStrategyFilter(info, 'Operations'), true);
  const care = lib.v130View({ 'Strategy Alignment': [{ id: 'S9', path: 'Customer Care > Faster replies', evidence: 'x' }] });
  assert.equal(lib.matchesStrategyFilter(care, 'Customer'), false);
  assert.equal(lib.matchesStrategyFilter(care, 'Customer Care'), true);
  assert.equal(lib.matchesStrategyFilter(info, lib.NOT_ALIGNED_FILTER), false);
});

test('filter options count each use case once per entry, at every depth, in strategy order', async () => {
  const lib = await load();
  const twoChildren = lib.v130View({ 'Strategy Alignment': [
    { id: 'S1.1', path: 'Customer > Grow repeat purchases', evidence: 'a' }, { id: 'S1.2', path: 'Customer > Win back', evidence: 'b' }] });
  const infos = [lib.v130View(RESULTS_UC), twoChildren, lib.v130View({ 'Strategy Alignment': [] }), lib.v130View({ Name: 'legacy' })];
  const coverage = [{ path: 'Operations' }, { path: 'Customer' }, { path: 'Customer > Win back' }, { path: 'Customer > Grow repeat purchases' }, { path: 'Unused' }];
  const { options, notAligned, withData } = lib.strategyFilterOptions(infos, coverage);
  assert.deepEqual(options.map((o) => [o.value, o.count, o.depth]), [
    ['Operations', 1, 0], ['Customer', 2, 0], ['Customer > Win back', 1, 1], ['Customer > Grow repeat purchases', 2, 1]]);
  assert.equal(options[2].label, 'Win back');
  assert.equal(notAligned, 1);
  assert.equal(withData, 3);
  assert.deepEqual(lib.strategyFilterOptions(infos, []).options.map((o) => o.value),
    ['Customer', 'Customer > Grow repeat purchases', 'Customer > Win back', 'Operations']);
});

test('priorities match whole names, including names with a comma, and nothing partial', async () => {
  const lib = await load();
  const known = ['Grow revenue', 'Protect margin, cut costs', 'Grow'];
  assert.deepEqual(lib.priorityMatches('Grow revenue, Protect margin, cut costs', known), ['Grow revenue', 'Protect margin, cut costs']);
  assert.deepEqual(lib.priorityMatches('General Improvement', known), []);
  assert.deepEqual(lib.priorityMatches('', known), []);
  assert.deepEqual(lib.priorityMatches('Grow revenue', ['Grow']), []);
  assert.deepEqual(lib.priorityMatches('Grow revenue', []), []);
  assert.deepEqual(lib.knownPriorities({ strategy_coverage: { priorities: [{ priority: 'A', use_cases: 2 }] }, strategic_context: { priorities: ['B'] } }), ['A']);
  assert.deepEqual(lib.knownPriorities({ strategic_context: { priorities: ['B', ' '] } }), ['B']);
  assert.deepEqual(lib.knownPriorities(null), []);
});

test('data access, KPI source, match rate and feedback helpers', async () => {
  const lib = await load();
  const deep = lib.dataAccessSummary({ discovery_type: 'Deep', data_access: { tables_read: ['a.b.c'], tables_read_count: 1, statements: 9, pii_columns_excluded: 2, rows_sent_to_ai: 0 } });
  assert.equal(deep.deep, true);
  assert.equal(deep.tablesReadCount, 1);
  assert.equal(deep.piiColumnsExcluded, 2);
  const standard = lib.dataAccessSummary({ discovery_type: 'Standard', data_access: { tables_read: [], tables_read_count: 0, statements: 0 } });
  assert.equal(standard.deep, false);
  assert.equal(standard.tablesReadCount, 0);
  assert.equal(lib.dataAccessSummary({}), null);
  assert.equal(lib.kpiSource(KPIS[0]), 'metric view main.m.sales_mv, measure repeat_rate');
  assert.equal(lib.kpiSource({ table: 'main.s.orders', column: 'amount', aggregation: 'SUM' }), 'main.s.orders.amount (sum)');
  assert.equal(lib.kpiSource({}), '');
  assert.equal(
    lib.kpiSource({ table: 'main.s.orders', aggregation: 'COUNT', column: null, filter_column: 'status', filter_value: 'shipped',
      denominator: { aggregation: 'COUNT', column: null, filter_column: null, filter_value: null } }),
    'count of rows where status = shipped / count of rows, on main.s.orders');
  assert.equal(
    lib.kpiSource({ table: 'main.s.orders', aggregation: 'SUM', column: 'amount',
      denominator: { aggregation: 'COUNT_DISTINCT', column: 'customer_id' } }),
    'sum of amount / count_distinct of customer_id, on main.s.orders');
  assert.equal(lib.matchRateText(0.8765), '87.7%');
  assert.equal(lib.matchRateText(null), '');
  assert.equal(lib.feedbackLabel('IMPLEMENTED'), 'Implemented');
  assert.equal(lib.feedbackLabel('maybe'), '');
  const map = lib.latestFeedbackMap([{ use_case_key: 'k', status: 'planned' }, { use_case_key: 'k', status: 'accepted' }, { status: 'x' }]);
  assert.deepEqual(Object.keys(map), ['k']);
  assert.equal(map.k.status, 'planned');
});

test('a use case hidden because it rewords a rejected one says what was proposed again', async () => {
  const lib = await load();
  const reworded = { use_case_key: 'predict churn|c.s.sales', title: 'Predict Churn', reason: 'We already run a churn model',
    match: 'reworded', proposed_title: 'Predict High-Value Churn' };
  assert.equal(lib.excludedFeedbackText(reworded), 'Predict Churn: We already run a churn model (proposed again as “Predict High-Value Churn”)');
  assert.equal(lib.excludedFeedbackText({ ...reworded, match: 'exact' }), 'Predict Churn: We already run a churn model');
  assert.equal(lib.excludedFeedbackText({ ...reworded, reason: '', proposed_title: 'predict churn' }), 'Predict Churn');
  assert.equal(lib.excludedFeedbackText({ use_case_key: 'k|t' }), 'k|t');
  assert.equal(lib.excludedFeedbackText(null), '');
});

test('the use case view exposes the star, the reason it was not starred, and the copied tracking fields', async () => {
  const { v130View, bestOfBestLabel, copyV130TrackingFields, V130_TRACKING_FIELDS } = await load();
  const starred = v130View({ best_of_best: 'Y', best_of_best_rank: '2', best_of_best_score: 8.64, best_of_best_reason: 'passed every elite test' });
  assert.deepEqual(starred.bestOfBest, { rank: 2, score: 8.64, reason: 'passed every elite test' });
  assert.equal(bestOfBestLabel(starred.bestOfBest), 'Best of Best #2 \u00b7 elite score 8.6/10');
  assert.equal(starred.notStarredReason, '');
  const plain = v130View({ best_of_best: 'N', best_of_best_reason: 'did not pass: score:evidence_strength' });
  assert.equal(plain.bestOfBest, null);
  assert.equal(plain.notStarredReason, 'did not pass: score:evidence_strength');
  assert.equal(v130View({}).bestOfBest, null, 'a session from before v1.3.0 has no star');
  assert.equal(bestOfBestLabel(null), '');
  assert.equal(bestOfBestLabel({ rank: null, score: null }), 'Best of Best');
  for (const field of ['best_of_best', 'best_of_best_rank', 'best_of_best_score', 'best_of_best_reason']) {
    assert.ok(V130_TRACKING_FIELDS.includes(field), field);
  }
  const merged = copyV130TrackingFields({ Name: 'x' }, { best_of_best: 'Y', best_of_best_rank: 1 });
  assert.equal(v130View(merged).bestOfBest.rank, 1);
});

test('starred use cases always come first in star order and the rest keep their order', async () => {
  const { compareBestOfBestFirst, v130View } = await load();
  const make = (name, star, score) => ({ name, score, view: v130View(star ? { best_of_best: 'Y', best_of_best_rank: star } : {}) });
  const list = [make('plain high', null, 9.5), make('star 2', 2, 7.0), make('plain low', null, 6.0),
    make('star 1', 1, 6.5), make('star without rank', 'x', 8.0), make('plain mid', null, 8.2)];
  const ordered = [...list].sort((a, b) => compareBestOfBestFirst(a.view, b.view) || b.score - a.score).map((u) => u.name);
  assert.deepEqual(ordered, ['star 1', 'star 2', 'star without rank', 'plain high', 'plain mid', 'plain low']);
  assert.equal(compareBestOfBestFirst(v130View({}), v130View({})), 0, 'two unstarred use cases keep the chosen sort');
  assert.equal(compareBestOfBestFirst(undefined, null), 0);
});

test('a use case card offers Open Notebook when it has a Genie instruction, otherwise Mark Ready', async () => {
  const { genieCardActions } = await load();
  assert.deepEqual(genieCardActions({ hasGenieInstruction: true, canMark: true, notebookHref: 'https://h/#workspace/n' }),
    { primary: 'open-notebook', regenerate: true, openCurrentNotebook: false });
  assert.deepEqual(genieCardActions({ hasGenieInstruction: true, canMark: false, notebookHref: '' }),
    { primary: 'open-notebook', regenerate: false, openCurrentNotebook: false }, 'without a warehouse the card still opens the notebook but cannot mark');
  assert.deepEqual(genieCardActions({ hasGenieInstruction: false, canMark: true, notebookHref: '' }),
    { primary: 'mark', regenerate: false, openCurrentNotebook: false });
  assert.deepEqual(genieCardActions({ hasGenieInstruction: false, canMark: true, notebookHref: 'https://h/#workspace/skeleton' }),
    { primary: 'mark', regenerate: false, openCurrentNotebook: true }, 'a notebook without a Genie instruction stays reachable');
  assert.deepEqual(genieCardActions({ hasGenieInstruction: false, canMark: false, notebookHref: '' }),
    { primary: null, regenerate: false, openCurrentNotebook: false }, 'nothing to offer means no action row');
});
