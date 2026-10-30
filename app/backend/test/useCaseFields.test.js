const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'useCaseFields.js')).href;
const load = () => import(libUrl);

test('a use case notebook is its stored path, else the first notebook whose name starts with one of its ids', async () => {
  const f = await load();
  const files = ['/out/N01-U010.ipynb', '/out/readme.md', '/out/n01-u01_predict_churn.ipynb', '/out/N01-U01-extra.ipynb'];
  assert.equal(f.notebookPathOf({ id: 'N01-U01', notebook_path: '/stored/nb' }, files), '/stored/nb');
  assert.equal(f.notebookPathOf({ id: 'N01-U01' }, files), '/out/n01-u01_predict_churn.ipynb');
  assert.equal(f.notebookPathOf({ id: 'N01-U010' }, files), '/out/N01-U010.ipynb');
  assert.equal(f.notebookPathOf({ id: 'N01-U0' }, files), '', 'a longer id is not a match for a shorter one');
  assert.equal(f.notebookPathOf({ id: 'N09-U09' }, files), '');
  assert.equal(f.notebookPathOf({ id: 'N01-U01' }, []), '');
  assert.equal(f.notebookPathOf({}, files), '');
  assert.equal(f.notebookPathOf({ id: 'N03-U01', catalog_no: 'N01-U01' }, files), '/out/n01-u01_predict_churn.ipynb');
});

test('a notebook file name finds its use case by stored path or id prefix, never by a partial id', async () => {
  const f = await load();
  const ucs = [{ id: 'N01-U01' }, { id: 'N02-U01', notebook_path: '/x/custom_name.ipynb' }];
  assert.equal(f.findUcForNotebookFilename('N01-U01.ipynb', ucs), ucs[0]);
  assert.equal(f.findUcForNotebookFilename('n01-u01.churn.ipynb', ucs), ucs[0]);
  assert.equal(f.findUcForNotebookFilename('custom_name.ipynb', ucs), ucs[1]);
  assert.equal(f.findUcForNotebookFilename('N01-U011.ipynb', ucs), null);
  assert.equal(f.findUcForNotebookFilename('N01-U01.py', ucs), null);
  assert.equal(f.findUcForNotebookFilename('', ucs), null);
  assert.equal(f.findUcForNotebookFilename('N01-U01.ipynb', []), null);
});

test('scores read the first finite field and the Inspire score falls back through value and feasibility', async () => {
  const f = await load();
  assert.equal(f.scoreOf({ a: '', b: 'x', c: '3.5' }, 'a', 'b', 'c'), 3.5);
  assert.equal(f.scoreOf({ a: null }, 'a'), null);
  assert.equal(f.scoreOf(null, 'a'), null);
  assert.equal(f.inspireScoreFromUc({ priority_score: '4.2', value_score: '1' }), 4.2);
  assert.equal(f.inspireScoreFromUc({ value_score: '4', feasibility_score: '2' }), 3);
  assert.equal(f.inspireScoreFromUc({ Priority: '3.5' }), 3.5);
  assert.equal(f.inspireScoreFromUc({ Priority: 'High' }), null);
  assert.equal(f.inspireScoreFromUc(null), null);
});

test('the subtitle is the description or short name, never a repeat of the title', async () => {
  const f = await load();
  assert.equal(f.subtitleOfUseCase({ description: '<b>Find</b> churners' }, 'Predict churn'), 'Find churners');
  assert.equal(f.subtitleOfUseCase({ description: 'Predict churn', short_name: 'Churn' }, 'Predict churn'), 'Churn');
  assert.equal(f.subtitleOfUseCase({ short_name: 'Predict churn' }, 'Predict churn'), '');
  assert.equal(f.subtitleOfUseCase(null, 'x'), '');
  assert.equal(f.subtitleOfUseCase({ description: 'Forecast pickups', usecase: 'Cut idle time' }, 'Forecast pickups'), 'Cut idle time',
    'a description that repeats the title falls through to the business title');
  assert.equal(f.subtitleOfUseCase({ description: 'forecast PICKUPS' }, 'Forecast pickups'), '', 'a repeat in other letter case is still a repeat');
  assert.equal(f.subtitleOfUseCase({ description: '<i></i>', short_name: 'Cut idle time' }, 'Forecast pickups'), 'Cut idle time');
});

test('the card title and the subtitle under it come from one place, so the search reads what the card shows', async () => {
  const f = await load();
  const live = { Name: 'Forecast pickups', description: 'Forecast pickups', usecase: 'Cut idle time', short_name: 'Cut idle time' };
  assert.deepEqual(f.cardTitlesOfUseCase(live), { title: 'Forecast pickups', subtitle: 'Cut idle time' });
  assert.deepEqual(f.cardTitlesOfUseCase({ use_case_name: '<b>Spot</b>   fraud', description: 'Flag risky cards' }), { title: 'Spot fraud', subtitle: 'Flag risky cards' });
  assert.deepEqual(f.cardTitlesOfUseCase({ Name: '' }, 2), { title: 'Use Case 3', subtitle: '' });
  assert.deepEqual(f.cardTitlesOfUseCase(null), { title: 'Use Case 1', subtitle: '' });
  assert.equal(f.nameOfUseCase({ name: 'Top 10 zones' }), 'Top 10 zones');
  assert.equal(f.nameOfUseCase({}), '');
});

test('cleaning display text drops emoji and pictographs but keeps every digit, #, * and %', async () => {
  const f = await load();
  assert.equal(f.displayCleanText('Top 10 Zones by 2024 Revenue'), 'Top 10 Zones by 2024 Revenue');
  assert.equal(f.displayCleanText('Reduce cost by 15% in Q3'), 'Reduce cost by 15% in Q3');
  assert.equal(f.displayCleanText('Rank #1 * priority'), 'Rank #1 * priority');
  assert.equal(f.displayCleanText('Taxi 🚕 audit ✅ done ©'), 'Taxi audit done');
  assert.equal(f.displayCleanText('Step 1\uFE0F\u20E3 then <b>2</b>'), 'Step 1 then 2');
  assert.equal(f.displayCleanText('👩\u200D💻 team'), 'team');
  assert.equal(f.displayCleanText(null), '');
});

test('priority pills use theme tokens, brand red only for the top tiers', async () => {
  const f = await load();
  assert.match(f.priorityPillClass('Ultra High'), /text-db-red-fg/);
  assert.match(f.priorityPillClass('Very High'), /text-db-red-fg/);
  assert.match(f.priorityPillClass('High'), /text-error-fg/);
  assert.match(f.priorityPillClass('Medium'), /text-warning-fg/);
  for (const p of ['Low', 'Very Low', '', null]) {
    assert.equal(f.priorityPillClass(p), 'text-text-secondary bg-bg border-border');
  }
  for (const p of ['Ultra High', 'High', 'Medium', 'Low']) {
    assert.doesNotMatch(f.priorityPillClass(p), /(^|\s)text-(success|warning|error)(\s|$)/);
  }
});

test('favorites load from the fingerprint key, migrate only fingerprint legacy keys, and survive broken storage', async () => {
  const f = await load();
  const store = (data) => ({ getItem: (k) => (k in data ? data[k] : null) });
  assert.deepEqual(f.loadFavoritesMap(store({ [f.FAVORITES_STORAGE_KEY]: '{"fp:1":true}' })), { 'fp:1': true });
  assert.deepEqual(f.loadFavoritesMap(store({ inspire_favorites: '{"fp:2":true,"N01-U01":true,"fp:3":false}' })), { 'fp:2': true });
  assert.deepEqual(f.loadFavoritesMap(store({ [f.FAVORITES_STORAGE_KEY]: '{bad' })), {});
  assert.deepEqual(f.loadFavoritesMap({ getItem: () => { throw new Error('denied'); } }), {});
  const key = f.favoriteKeyOf({ _domain: 'Customer', Name: 'Predict churn' });
  assert.match(key, /^fp:[0-9a-f]{8}$/);
  assert.equal(f.favoriteKeyOf({ _domain: ' customer ', Name: 'PREDICT  churn' }), key);
  assert.equal(f.favoriteKeyOf({ _domain: 'Customer' }), '');
});

test('the favorites count holds only the use cases still marked as favorites', async () => {
  const f = await load();
  assert.equal(f.favoriteCount({ a: true, b: false, c: 1, d: 0 }), 2);
  assert.equal(f.favoriteCount({}), 0);
  assert.equal(f.favoriteCount(null), 0);
});

test('the tracking id prefers id, then No', async () => {
  const f = await load();
  assert.equal(f.trackingIdOf({ id: ' N01-U01 ', No: 'X' }), 'N01-U01');
  assert.equal(f.trackingIdOf({ No: 7 }), '7');
  assert.equal(f.trackingIdOf(null), '');
});

test('a field reads its display key, falls back to the tracking-table column when that is blank, and survives a missing use case', async () => {
  const f = await load();
  assert.equal(f.fieldOf({ Statement: 'Display', statement: 'Tracking' }, 'Statement', 'statement'), 'Display');
  assert.equal(f.fieldOf({ statement: 'Tracking' }, 'Statement', 'statement'), 'Tracking');
  assert.equal(f.fieldOf({ Statement: '  ', statement: 'Tracking' }, 'Statement', 'statement'), 'Tracking');
  assert.deepEqual(f.fieldOf({ KPIs: [], kpis: [{ name: 'k' }] }, 'KPIs', 'kpis'), [{ name: 'k' }]);
  assert.equal(f.fieldOf({ Quality: 0, quality: 'High' }, 'Quality', 'quality'), 0, 'a zero is a value, not blank');
  assert.equal(f.fieldOf(null, 'Statement', 'statement'), undefined);
  assert.equal(f.fieldOf('text', 'Statement', 'statement'), undefined);
  assert.equal(f.beneficiaryFromUc({ beneficiary: ' Retention team ' }), 'Retention team');
  assert.equal(f.sponsorFromUc({ Sponsor: '', sponsor: 'CFO' }), 'CFO');
  assert.equal(f.sponsorFromUc(undefined), '');
  assert.equal(f.isBlankField('  '), true);
  assert.equal(f.isBlankField(false), false);
});
