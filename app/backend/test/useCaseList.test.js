const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'useCaseList.js')).href;
const load = () => import(libUrl);

const RESULTS = {
  domains: [
    { domain_name: 'Retention', use_cases: [{ No: 'N01-U01', Name: 'Predict churn', Statement: 'Cut churn' }] },
    { domain_name: 'Sales', use_cases: [{ No: '7', Name: 'Basket growth' }, { No: 'N02-U02', Name: 'Cross sell' }] },
  ],
};

test('results domains are overlaid with the tracking id, notebook and Genie flags of the matching row', async () => {
  const { buildUseCaseList } = await load();
  const rows = [
    { id: 'N01-U01', notebook_path: '/Shared/n01_u01', generate_genie_code_instruction: ' Yes ', has_genie_code: 'N', genie_instruction: 'full text', priority_score: 8.1 },
    { id: 'N02-U01', Name: 'Basket growth', 'Business Domain': 'sales', has_genie_code: 'Y', priority_score: 7 },
  ];
  const list = buildUseCaseList(RESULTS, rows);
  assert.deepEqual(list.map((u) => [u.id ?? u.No, u._domain]), [['N01-U01', 'Retention'], ['N02-U01', 'Sales'], ['N02-U02', 'Sales']]);
  const [churn, basket, cross] = list;
  assert.equal(churn.notebook_path, '/Shared/n01_u01');
  assert.equal(churn.generate_genie_code_instruction, 'Yes');
  assert.equal(churn.has_genie_code, 'N');
  assert.equal(churn.genie_instruction, 'full text');
  assert.equal(churn.priority_score, 8.1);
  assert.equal(basket.catalog_no, '7', 'a catalog number that differs from the tracking id is kept');
  assert.equal(basket.has_genie_code, 'Y');
  assert.equal(cross.has_genie_code, undefined);
  for (const uc of list) assert.ok(uc._v130 && typeof uc._v130 === 'object');
});

test('the results JSON is cloned, so overlaying tracking rows never changes the loaded results', async () => {
  const { buildUseCaseList } = await load();
  const before = JSON.stringify(RESULTS);
  buildUseCaseList(RESULTS, [{ id: 'N01-U01', has_genie_code: 'Y', notebook_path: '/x' }]);
  assert.equal(JSON.stringify(RESULTS), before);
});

test('tracking rows alone become the list when there is no results JSON, with their names and domains mapped', async () => {
  const { buildUseCaseList } = await load();
  const list = buildUseCaseList(null, [{ id: 'N03-U01', use_case_name: 'Stock outs', domain: 'Supply', has_genie_code: 'Y' }]);
  assert.equal(list.length, 1);
  assert.equal(list[0].Name, 'Stock outs');
  assert.equal(list[0]._domain, 'Supply');
  assert.equal(list[0].has_genie_code, 'Y');
});

test('flat use case arrays are read, and shapes that are not lists give an empty list instead of throwing', async () => {
  const { buildUseCaseList } = await load();
  assert.deepEqual(buildUseCaseList({ use_cases: [{ No: 'A', Name: 'a' }] }, null).map((u) => u.No), ['A']);
  assert.deepEqual(buildUseCaseList([{ No: 'B', Name: 'b' }], []).map((u) => u.No), ['B']);
  for (const bad of [null, undefined, {}, { domains: 'nope' }, 'text', 42]) assert.deepEqual(buildUseCaseList(bad, null), [], String(bad));
  assert.deepEqual(buildUseCaseList({ domains: [{ domain_name: 'X', use_cases: 'nope' }, null] }, null), []);
});
