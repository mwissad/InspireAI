const test = require('node:test');
const assert = require('node:assert/strict');

const {
  INSPIRE_AGENT_VERSION,
  INSPIRE_NOTEBOOK_WIDGET_KEYS,
  buildDemoInspireDiscoveryParams,
  normalizeGenerationOptionsParams,
  normalizeUseCasesQualityParams,
  sanitizeInspireNotebookJobParams,
  belowBarLabelFromUseCase,
  normalizeDiscoveryTypeParams,
  validateStrategicContextParams,
  normalizeV130UseCaseFields,
  STRATEGIC_CONTEXT_MAX_BYTES,
} = require('../lib/inspireJobParams');

test('advertises the integrated notebook version', () => {
  assert.equal(INSPIRE_AGENT_VERSION, 'v1.3.0');
});

test('demo discovery parameters use v1.2.0 generation choices and the v1.3.0 discovery defaults', () => {
  const params = buildDemoInspireDiscoveryParams({
    inspireDatabase: 'main._inspire',
    sessionId: '123456789',
  });

  assert.equal(params['09_generation_options'], 'PDF Catalog');
  assert.equal(params['13_generate_genie_code_for'], '0');
  assert.equal(params['14_session_id'], '123456789');
  assert.equal(params['05_use_cases_quality'], 'Good');
  assert.equal(params['03_discovery_type'], 'Deep');
  assert.equal(params['10_strategic_context'], '');
});

test('removes the retired Genie generation option from legacy requests', () => {
  const params = {
    '09_generation_options': 'PDF Catalog,Genie Code Instructions,Presentation',
  };

  normalizeGenerationOptionsParams(params);
  assert.equal(params['09_generation_options'], 'PDF Catalog,Presentation');
});

test('normalizes quality aliases to v1.2.0 canonical modes', () => {
  for (const [input, expected] of [
    ['Good', 'Good'],
    ['High', 'High'],
    ['Ultra High', 'Ultra High'],
    ['Coverage Mode (All)', 'Good'],
    ['Balanced', 'Good'],
    ['Good Quality', 'Good'],
    ['High Quality', 'Good'],
    ['Strict Quality', 'High'],
    ['Very High Quality', 'High'],
    ['', 'Good'],
  ]) {
    const params = { '05_use_cases_quality': input };
    normalizeUseCasesQualityParams(params);
    assert.equal(params['05_use_cases_quality'], expected);
  }
});

test('sanitizer forwards only notebook widget keys and valid generation choices', () => {
  const params = sanitizeInspireNotebookJobParams({
    '00_business_name': 'Retail',
    '09_generation_options': 'Genie Code Instructions',
    '13_generate_genie_code_for': 'all',
    discover_auto_genie_top_n: '7',
    legacy_widget: 'must not be forwarded',
  });

  assert.deepEqual(Object.keys(params).sort(), [
    '00_business_name',
    '03_discovery_type',
    '05_use_cases_quality',
    '09_generation_options',
    '10_strategic_context',
    '13_generate_genie_code_for',
    '16_best_of_best_count',
  ]);
  assert.equal(params['03_discovery_type'], 'Deep');
  assert.equal(params['10_strategic_context'], '');
  assert.equal(params['09_generation_options'], 'PDF Catalog');
  assert.equal(params['13_generate_genie_code_for'], 'all');
  assert.equal(params['05_use_cases_quality'], 'Good');
  assert.ok(!INSPIRE_NOTEBOOK_WIDGET_KEYS.includes('legacy_widget'));
  assert.equal(params.discover_auto_genie_top_n, undefined);
});

test('below-bar fallback flags are treated as a valid result label', () => {
  assert.match(
    belowBarLabelFromUseCase({
      selection_flags: '{"elite_fallback_pick":"Below the High bar"}',
    }),
    /Below the High bar/,
  );
  assert.equal(belowBarLabelFromUseCase({ Name: 'ok' }), '');
});

test('widget keys follow the notebook order with the two v1.3.0 keys in their slots', () => {
  assert.equal(INSPIRE_NOTEBOOK_WIDGET_KEYS.indexOf('03_discovery_type'), INSPIRE_NOTEBOOK_WIDGET_KEYS.indexOf('02_inspire_database') + 1);
  assert.equal(INSPIRE_NOTEBOOK_WIDGET_KEYS.indexOf('10_strategic_context'), INSPIRE_NOTEBOOK_WIDGET_KEYS.indexOf('09_generation_options') + 1);
  const { IMPLEMENT_USE_CASE_PARAM, IMPLEMENT_SPEC_VERSION_PARAM } = require('../lib/inspireImplement');
  assert.deepEqual(INSPIRE_NOTEBOOK_WIDGET_KEYS.slice(-3), ['16_best_of_best_count', IMPLEMENT_USE_CASE_PARAM, IMPLEMENT_SPEC_VERSION_PARAM]);
  assert.equal(INSPIRE_NOTEBOOK_WIDGET_KEYS.length, 19);
});

test('the implement run id reaches the job but is not a notebook widget, so a forked run never copies it', () => {
  const I = require('../lib/inspireImplement');
  assert.equal(I.IMPLEMENT_RUN_ID_PARAM, 'inspire_implement_run_id');
  assert.ok(!INSPIRE_NOTEBOOK_WIDGET_KEYS.includes(I.IMPLEMENT_RUN_ID_PARAM));
  const params = sanitizeInspireNotebookJobParams(I.implementJobParams({ '00_business_name': 'Acme', not_a_param: 'x' }, 'N01-U01', 2));
  assert.equal(params[I.IMPLEMENT_RUN_ID_PARAM], '{{job.run_id}}');
  assert.equal(params.inspire_implement_use_case, 'N01-U01');
  assert.ok(!('not_a_param' in params), 'anything else that is not a widget is still dropped');
});

test('discovery type keeps Deep or Standard, defaults to Deep and refuses anything else', () => {
  for (const [input, expected] of [['Deep', 'Deep'], ['standard', 'Standard'], [' STANDARD ', 'Standard'], ['', 'Deep'], [undefined, 'Deep']]) {
    const params = { '03_discovery_type': input };
    normalizeDiscoveryTypeParams(params);
    assert.equal(params['03_discovery_type'], expected, String(input));
  }
  for (const bad of ['Standrad', 'Deeper', 'off']) {
    assert.throws(() => normalizeDiscoveryTypeParams({ '03_discovery_type': bad }),
      (err) => err.statusCode === 400 && /not supported/.test(err.message), bad);
  }
  assert.throws(() => sanitizeInspireNotebookJobParams({ '03_discovery_type': 'Standrad' }), (err) => err.statusCode === 400,
    'a mistyped Standard never reaches the notebook as Deep');
});

test('strategic context is trimmed and capped at the agent limit in bytes', () => {
  const params = { '10_strategic_context': '  {"strategy": []}  ' };
  validateStrategicContextParams(params);
  assert.equal(params['10_strategic_context'], '{"strategy": []}');
  validateStrategicContextParams({ '10_strategic_context': 'a'.repeat(STRATEGIC_CONTEXT_MAX_BYTES) });
  assert.throws(() => validateStrategicContextParams({ '10_strategic_context': 'a'.repeat(STRATEGIC_CONTEXT_MAX_BYTES + 1) }),
    (err) => err.statusCode === 400 && /Workspace or Volumes file/.test(err.message));
  const arabic = 'ا'.repeat(Math.floor(STRATEGIC_CONTEXT_MAX_BYTES / 2) + 1);
  assert.throws(() => validateStrategicContextParams({ '10_strategic_context': arabic }), (err) => err.statusCode === 400,
    'multibyte text is measured in bytes');
});

test('v1.3.0 use case fields are parsed and stay NULL-safe on older rows', () => {
  const row = normalizeV130UseCaseFields({
    strategy_alignment: '[{"id":"S1.1","path":"Customer > Grow","evidence":"`orders`"}]',
    kpis: '[{"name":"Repeat rate","baseline":{"value":23.4}}]',
    expected_key_results: 'not json',
    measures_of_success: 'One\n\nTwo ',
    financial_benefits: 'Margin',
    foundation_ids: 'F1, F2,',
    strategy_path: 'Customer > Grow',
    use_case_key: 'forecast demand|main.s.orders',
  });
  assert.equal(row.strategy_alignment[0].id, 'S1.1');
  assert.equal(row.kpis[0].baseline.value, 23.4);
  assert.equal(row.expected_key_results, null, 'invalid JSON becomes null, never a crash');
  assert.deepEqual(row.measures_of_success, ['One', 'Two']);
  assert.deepEqual(row.financial_benefits, ['Margin']);
  assert.deepEqual(row.non_financial_benefits, []);
  assert.deepEqual(row.foundation_ids, ['F1', 'F2']);
  const legacy = normalizeV130UseCaseFields({ id: 'N01-U01', use_case: 'Old row' });
  assert.equal(legacy.strategy_alignment, null);
  assert.equal(legacy.kpis, null);
  assert.equal(legacy.data_evidence, null);
  assert.deepEqual(legacy.measures_of_success, []);
  assert.deepEqual(legacy.foundation_ids, []);
  assert.equal(legacy.strategy_path, null);
  assert.equal(legacy.use_case_key, null);
  assert.equal(legacy.use_case, 'Old row');
});

test('a blank Genie Code count launches Discover with skeleton notebooks only, an explicit count is kept', () => {
  for (const value of [undefined, null, '']) {
    assert.equal(sanitizeInspireNotebookJobParams({ '00_business_name': 'Acme', '13_generate_genie_code_for': value })['13_generate_genie_code_for'], '0');
  }
  for (const value of ['5', 'all', '0']) {
    assert.equal(sanitizeInspireNotebookJobParams({ '00_business_name': 'Acme', '13_generate_genie_code_for': value })['13_generate_genie_code_for'], value);
  }
});

test('the Best of Best count widget is forwarded, kept empty by default and refused outside 0 to 100', () => {
  const { validateBestOfBestCountParams, BEST_OF_BEST_MAX_COUNT } = require('../lib/inspireJobParams');
  assert.ok(INSPIRE_NOTEBOOK_WIDGET_KEYS.includes('16_best_of_best_count'));
  assert.equal(BEST_OF_BEST_MAX_COUNT, 100);
  for (const value of ['', ' ', '0', '20', ' 15 ', '100']) {
    assert.equal(validateBestOfBestCountParams({ '16_best_of_best_count': value })['16_best_of_best_count'], value.trim());
  }
  for (const value of ['101', 'abc', '-1', '1.5', '1e2', '0020']) {
    assert.throws(() => validateBestOfBestCountParams({ '16_best_of_best_count': value }), (err) => err.statusCode === 400, value);
  }
  const out = sanitizeInspireNotebookJobParams({ '00_business_name': 'Acme', '16_best_of_best_count': ' 12 ' });
  assert.equal(out['16_best_of_best_count'], '12');
  assert.equal(sanitizeInspireNotebookJobParams({ '00_business_name': 'Acme' })['16_best_of_best_count'], '');
});

test('tracking rows carry the star NULL-safe: Y with its rank, N without one, older rows as null', () => {
  const starred = normalizeV130UseCaseFields({ best_of_best: 'y', best_of_best_rank: '3', best_of_best_score: '8.75', best_of_best_reason: 'passed' });
  assert.deepEqual([starred.best_of_best, starred.best_of_best_rank, starred.best_of_best_score, starred.best_of_best_reason], ['Y', 3, 8.75, 'passed']);
  const plain = normalizeV130UseCaseFields({ best_of_best: 'N', best_of_best_rank: '2', best_of_best_score: '', best_of_best_reason: 'did not pass: red_team' });
  assert.deepEqual([plain.best_of_best, plain.best_of_best_rank, plain.best_of_best_score], ['N', null, null], 'a rank is only kept on a starred row');
  const older = normalizeV130UseCaseFields({});
  assert.deepEqual([older.best_of_best, older.best_of_best_rank, older.best_of_best_score, older.best_of_best_reason], [null, null, null, null]);
});

test('a launched job carries the real session id, the use cases it works on and the spec version, never a made-up id', () => {
  const { inspireJobTags } = require('../lib/inspireJobParams');
  const tags = inspireJobTags({
    runType: 'implement',
    params: { '14_session_id': '1234567890123456789', inspire_implement_spec_version: '3' },
    businessName: 'TPCDS Retail V130 Ship',
    notebookFilename: 'dbx_inspire_ai_agent',
    useCaseIds: ['N05-U01'],
  });
  assert.deepEqual(tags, {
    inspire_version: INSPIRE_AGENT_VERSION,
    dbx_inspire_ai_business: 'TPCDS_Retail_V130_Ship',
    dbx_inspire_ai_type: 'implement',
    dbx_inspire_ai_run_type: 'implement',
    dbx_inspire_ai_usecases: '1',
    dbx_inspire_ai_notebook: 'dbx_inspire_ai_agent',
    dbx_inspire_ai_launcher_source: 'Inspire_App',
    dbx_inspire_ai_session: '1234567890123456789',
    dbx_inspire_ai_session_id: '1234567890123456789',
    dbx_inspire_ai_usecase_id: 'N05-U01',
    dbx_inspire_ai_spec_version: '3',
  });
  const discovery = inspireJobTags({ runType: 'discovery', params: {}, businessName: 'Acme', notebookFilename: 'nb' });
  assert.equal(discovery.dbx_inspire_ai_usecases, '0');
  for (const key of ['dbx_inspire_ai_session', 'dbx_inspire_ai_session_id', 'dbx_inspire_ai_usecase_id', 'dbx_inspire_ai_spec_version']) {
    assert.equal(key in discovery, false, `${key} is left out when the launch does not know it`);
  }
});

test('several use cases share one tag, deduplicated, and a list that does not fit keeps whole ids with the full count', () => {
  const { inspireJobTags } = require('../lib/inspireJobParams');
  const two = inspireJobTags({ runType: 'genie_regen', params: { '14_session_id': '42' }, useCaseIds: ['N01-U01', 'N01-U02', 'N01-U01', ' ', null] });
  assert.equal(two.dbx_inspire_ai_usecase_id, 'N01-U01_N01-U02');
  assert.equal(two.dbx_inspire_ai_usecases, '2');
  const many = Array.from({ length: 40 }, (_, i) => `N${String(i).padStart(2, '0')}-U01`);
  const capped = inspireJobTags({ runType: 'genie_regen', params: {}, useCaseIds: many });
  assert.ok(capped.dbx_inspire_ai_usecase_id.length <= 255);
  assert.deepEqual(capped.dbx_inspire_ai_usecase_id.split('_'), many.slice(0, capped.dbx_inspire_ai_usecase_id.split('_').length));
  assert.ok(capped.dbx_inspire_ai_usecase_id.split('_').length < 40);
  assert.equal(capped.dbx_inspire_ai_usecases, '40');
});

test('tag values are cleaned exactly the way the agent cleans them, and the use case tags are the same on both sides', () => {
  const fs = require('fs');
  const path = require('path');
  const { inspireJobTags, inspireTagValue } = require('../lib/inspireJobParams');
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'implement_change_classes.json'), 'utf8'));
  for (const [raw, cleaned] of fixture.tag_values) assert.equal(inspireTagValue(raw), cleaned, raw);
  assert.equal(inspireTagValue('x'.repeat(300)).length, 255);
  const tags = inspireJobTags({
    runType: 'implement', params: { '14_session_id': '42', inspire_implement_spec_version: '1' }, businessName: 'Acme', notebookFilename: 'nb',
    useCaseIds: ['N01-U01'],
  });
  assert.deepEqual(fixture.use_case_tag_keys.filter((key) => !(key in tags)), []);
});

test('every job the App creates takes its tags from inspireJobTags', () => {
  const fs = require('fs');
  const path = require('path');
  const backend = path.join(__dirname, '..');
  const sources = [path.join(backend, 'server.js')].concat(
    fs.readdirSync(path.join(backend, 'lib')).map((name) => path.join(backend, 'lib', name)),
  );
  const creators = sources.filter((file) => fs.readFileSync(file, 'utf8').includes("'/api/2.1/jobs/create'"));
  assert.deepEqual(creators.map((file) => path.basename(file)).sort(), ['demoDataPipeline.js', 'server.js']);
  for (const file of creators) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /tags: inspireJobTags\(/, file);
    assert.doesNotMatch(source, /dbx_inspire_ai_session: /, file);
  }
  const server = fs.readFileSync(path.join(backend, 'server.js'), 'utf8');
  const start = server.indexOf('async function triggerInspireNotebookJob');
  assert.doesNotMatch(server.slice(start, server.indexOf("'/api/2.1/jobs/create'", start)), /randomUUID/);
});
