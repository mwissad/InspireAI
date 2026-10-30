const test = require('node:test');
const assert = require('node:assert/strict');

const { notebookParamsFromSessionForGenerateRun } = require('../lib/inspireSessionParams');
const { INSPIRE_NOTEBOOK_WIDGET_KEYS, sanitizeInspireNotebookJobParams } = require('../lib/inspireJobParams');

const v121Session = {
  business_name: 'Acme',
  inspire_database_name: 'main._inspire',
  table_election_mode: 'All Tables',
  use_cases_quality: 'Balanced',
  catalogs: 'samples',
  schemas_str: 'samples.tpcds_sf1',
  generate_choices: 'PDF Catalog,Genie Code Instructions',
  output_language: 'English',
  business_priorities: 'Reduce Cost',
};

test('Route 1 on a v1.2.1 session falls back to Standard and no strategy', () => {
  const params = notebookParamsFromSessionForGenerateRun({ ...v121Session }, '42');
  assert.equal(params['15_operation'], 'Generate Use Cases');
  assert.equal(params['03_discovery_type'], 'Standard', 'older sessions never read data');
  assert.equal(params['10_strategic_context'], '');
  assert.equal(params['05_use_cases_quality'], 'Good');
  assert.equal(params['09_generation_options'], 'PDF Catalog');
  assert.equal(params['14_session_id'], '42');
  const sanitized = sanitizeInspireNotebookJobParams({ ...params });
  assert.deepEqual(Object.keys(sanitized), INSPIRE_NOTEBOOK_WIDGET_KEYS.filter((k) => k in sanitized));
  assert.equal(sanitized['03_discovery_type'], 'Standard');
});

test('Route 1 on a v1.3.0 session carries its discovery type and strategy', () => {
  const tree = '{"source":"customer","levels":["Pillar"],"strategy":[{"id":"S1","name":"Customer"}]}';
  const params = notebookParamsFromSessionForGenerateRun(
    { ...v121Session, discovery_type: 'Deep', strategic_context: `  ${tree}  ` }, '43');
  assert.equal(params['03_discovery_type'], 'Deep');
  assert.equal(params['10_strategic_context'], tree);
});

test('Route 1 treats SQL NULL columns like a missing value', () => {
  const params = notebookParamsFromSessionForGenerateRun({ ...v121Session, discovery_type: null, strategic_context: null }, '44');
  assert.equal(params['03_discovery_type'], 'Standard');
  assert.equal(params['10_strategic_context'], '');
});
