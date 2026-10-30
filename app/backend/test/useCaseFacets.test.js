const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const SRC = path.resolve(__dirname, '..', '..', 'frontend', 'src');
const lib = (name) => pathToFileURL(path.join(SRC, 'lib', name)).href;
const load = async () => ({ ...(await import(lib('useCaseFacets.js'))), ...(await import(lib('v130UseCase.js'))) });

const withView = (f, uc) => ({ ...uc, _v130: f.v130View(uc) });

test('a use case row carries the fields the drawer and the wizard header show', async () => {
  const f = await load();
  const statusOf = (_uc, id) => (id === 'N01-U02' ? { label: 'MVP ready' } : null);
  const churn = f.catalogRow(withView(f, {
    id: 'N01-U01', Name: 'Predict churn', _domain: 'Customer', Subdomain: 'Retention', Priority: 'Very High', Quality: 'High',
    'Analytics Technique': 'Classification', priority_score: '4.5', value_score: '4', feasibility_score: '5',
    has_genie_code: 'Y', best_of_best: 'Y', best_of_best_rank: '1', use_case_key: 'k1',
  }), 0, { statusOf, feedbackLatest: { k1: { status: 'Accepted' } } });
  const upsell = f.catalogRow(withView(f, { id: 'N01-U02', Name: 'Score upsell', Priority: '3.2', genie_instruction: 'draft' }), 1, { statusOf });
  const stock = f.catalogRow(withView(f, { id: 'N02-U01', Name: '' }), 2, {});
  assert.deepEqual(
    [churn.key, churn.id, churn.title, churn.domain, churn.subdomain, churn.technique, churn.quality, churn.priority],
    ['N01-U01#0', 'N01-U01', 'Predict churn', 'Customer', 'Retention', 'Classification', 'High', 'Very High'],
  );
  assert.equal(churn.inspire, 4.5);
  assert.equal(churn.value, 4);
  assert.equal(churn.feasibility, 5);
  assert.ok(churn.bob);
  assert.equal(churn.feedbackStatus, 'accepted');
  assert.equal(churn.genie, f.GENIE_LABELS.shipped);
  assert.equal(upsell.genie, f.GENIE_LABELS.draft);
  assert.equal(stock.genie, f.GENIE_LABELS.none);
  assert.equal(churn.status, null, 'a use case without an MVP has no status');
  assert.equal(upsell.status.label, 'MVP ready');
  assert.equal(upsell.priority, '', 'a numeric priority is a score, not a tier');
  assert.equal(stock.title, 'N02-U01', 'a use case without a name shows its ID');
  assert.equal(stock.bob, null);
  const tracked = f.catalogRow(withView(f, { id: 'T1', use_case: 'From tracking', business_domain: 'Ops', subdomain: 'Fleet', analytics_technique: 'Forecasting', quality: 'High', priority: 'Very High', Subdomain: ' ' }), 0, {});
  assert.deepEqual([tracked.domain, tracked.subdomain, tracked.technique, tracked.quality, tracked.priority], ['Ops', 'Fleet', 'Forecasting', 'High', 'Very High'], 'a tracking-table row reads its lowercase columns, and a blank display key falls back');
  const favUc = withView(f, { id: 'N09-U09', Name: 'Fav', _domain: 'Ops' });
  const fields = await import(lib('useCaseFields.js'));
  assert.equal(f.catalogRow(favUc, 0, { favorites: { [fields.favoriteKeyOf(favUc)]: true } }).favorite, true);
  assert.equal(f.catalogRow(favUc, 0, { favorites: {} }).favorite, false);
  assert.equal(f.catalogRow(favUc, 0, {}).favorite, false);
});

test('the Results page is the pre-grid list: sidebar filters, a filter bar and scrolling cards, with no grid modules left', () => {
  const results = fs.readFileSync(path.join(SRC, 'pages', 'ResultsPage.jsx'), 'utf8');
  assert.doesNotMatch(results, /UseCaseCatalog|catalogRows|emptyFacetState|setFacetValues|catalogState/);
  assert.match(results, /<SidebarFilterPanel/);
  assert.match(results, /aria-label="Use case list"/);
  assert.match(results, /filteredUseCases\.map\(/);
  assert.match(results, /<UseCaseCard\b/);
  assert.match(results, /onSelectNotAligned=\{\(\) => setFilterStrategy\(NOT_ALIGNED_FILTER\)\}/);
  for (const gone of ['catalog/UseCaseCatalog.jsx', 'catalog/FacetRail.jsx', 'catalog/ColumnChooser.jsx', 'catalog/SavedViews.jsx', 'catalog/UseCaseGrid.jsx']) {
    assert.equal(fs.existsSync(path.join(SRC, 'components', gone)), false, gone);
  }
  const pkg = JSON.parse(fs.readFileSync(path.resolve(SRC, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['@tanstack/react-table'], undefined);
  assert.match(fs.readFileSync(path.join(SRC, 'lib', 'layout.js'), 'utf8'), /RESULTS_FRAME = 'max-w-6xl mx-auto /);
  assert.match(fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8'), /<div className=\{RESULTS_FRAME\}>\s*<ResultsPage/);
});
