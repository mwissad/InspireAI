import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSpecFromUseCase } from '../../src/lib/implementWizard.js';
import { HARNESS_USE_CASE, HARNESS_SETTINGS, HARNESS_SESSION_ID } from './implementFixtures.js';
import { closeBrowser, lowContrast, openUi, until } from './uiSupport.mjs';

const OWNER = ['owner', 'example.com'].join('@');
const PAGE = 'app:page:decisions';
const CHART = 'dashboard:w1a2b3c4';
const NOT_BUILT = 'Inspire has not built the App page decisions on this MVP, so it cannot rebuild it with your vibes; pick an asset the Control tower lists';

test.after(closeBrowser);

const checks = (...items) => items.map(([ask, status, evidence]) => ({ ask, status, evidence }));
const ready = (version, extra = {}) => ({ state: 'ready', spec_version: version, ...extra });

const builtSpec = (outputs = {}, top = {}) => {
  const spec = defaultSpecFromUseCase(HARNESS_USE_CASE, { warehouseId: HARNESS_SETTINGS.warehouseId, inspireDatabase: HARNESS_SETTINGS.inspireDatabase, sessionId: HARNESS_SESSION_ID, owner: OWNER });
  return {
    ...spec,
    ...top,
    outputs: { ...spec.outputs, genie_space: true, app: true, app_name: 'churn-desk', app_access: 'sp', alert: true, alert_recipients: [OWNER], ...outputs },
  };
};

const versionRow = (version, { outputs = {}, assets = {}, top = {}, ...extra } = {}) => ({
  session_id: '42', use_case_id: 'N01-U01', spec_version: version, status: 'ready', change_classes: version === 1 ? 'initial' : 'outputs', created_by: OWNER,
  updated_at: `2026-10-2${version}T04:00:00Z`, spec_json: JSON.stringify(builtSpec(outputs, top)), job_id: '77', last_preview_run_id: '9001', result_rows: '3',
  dashboard_id: 'd1', dashboard_url: 'https://workspace.example.com/dashboardsv3/d1/published',
  genie_space_id: 'g1', genie_space_url: 'https://workspace.example.com/genie/rooms/g1',
  app_name: 'churn-desk', app_url: 'https://churn-desk-1.aws.example.com',
  alert_id: 'a1', alert_url: 'https://workspace.example.com/sql/alerts-v2/a1',
  asset_status: JSON.stringify(assets),
  ...extra,
});

const V3_OUTPUTS = {
  dashboard_vibes: 'Put the weekly trend first\nArabic labels',
  genie_space_vibes: 'Answer in euros, name the rows you counted and add a question about returns',
  [`${PAGE}_vibes`]: 'Dark header\nRows to act on first',
  [`${CHART}_vibes`]: 'Bars by week\nA map by region',
};

const V3_ASSETS = {
  notebook: { spec_version: 2, modified_at: 1 },
  dashboard: ready(3, { snapshot: true, vibes_checks: checks(['Put the weekly trend first', 'done', 'The first widget is the weekly trend'],
    ['Arabic labels', 'missing', 'The dashboard has no Arabic font']) }),
  [CHART]: { state: 'ready_with_warnings', spec_version: 3, name: 'Weekly trend', what: 'Bars by week, the last 8 weeks', vibes_checks: checks(
    ['Bars by week', 'done', 'Checked by running the rebuilt chart query'], ['A map by region', 'missing', 'The result table has no region column']) },
  genie_space: ready(1, { snapshot: true }),
  app: ready(3, { snapshot: true }),
  [PAGE]: ready(3, { name: 'Decisions', what: 'The rows to act on, with their filters', vibes_checks: JSON.stringify(checks(
    ['Dark header', 'done', 'Checked by opening the rebuilt page with the latest data'], ['Rows to act on first', 'done', 'The decision list opens the page'])) }),
  'app:page:detail': ready(2, { title: 'Row detail' }),
  alert: ready(1),
  ai_reasoning: ready(2),
  value_formula: ready(2),
};

const HISTORY = [
  versionRow(3, { outputs: V3_OUTPUTS, assets: V3_ASSETS, status: 'ready_with_warnings' }),
  versionRow(2, {
    outputs: { dashboard_vibes: 'Make the trend weekly' },
    assets: { dashboard: ready(2, { snapshot: true, vibes_checks: checks(['Make the trend weekly', 'done', 'The trend is weekly']) }), genie_space: ready(1, { snapshot: true }),
      app: ready(2, { snapshot: true }), alert: ready(1) },
  }),
  versionRow(1, { assets: { dashboard: ready(1, { snapshot: false }), app: ready(1, { snapshot: true }), alert: ready(1),
    genie_space: ready(1, { snapshot: true, vibes_checks: checks(['Answer in euros', 'missing', 'The answers are in dollars'], ['Name the rows you counted', 'done', 'Checked by asking Genie 5 test questions'],
      ['Add a question about returns', 'missing', '']) }) } }),
];

const STATE = {
  history: HISTORY, appExists: true,
  app: { name: 'churn-desk', description: 'Inspire use case N01-U01 (session 42): Predict churn', compute_status: { state: 'ACTIVE' }, app_status: { state: 'RUNNING' } },
  responses: { 'GET /api/2.0/alerts/a1': [{ display_name: 'Churn over 25' }] },
};

function insertsOf(made) {
  return made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'))
    .map((c) => ({ spec: JSON.parse(c.parameters.find((p) => p.name === 'spec').value), classes: c.parameters.find((p) => p.name === 'classes').value }));
}

const DRAWER_TITLES = { notebook: 'Genie Code notebook', ai_reasoning: 'Genie Code notebook', value_formula: 'Genie Code notebook', dashboard: 'Dashboard',
  genie_space: 'Genie Agent', app: 'App', alert: 'Alert' };
const drawerTitle = (id) => DRAWER_TITLES[id] || (id.startsWith('app:') ? 'App' : 'Dashboard');
const tower = (page) => page.getByRole('region', { name: 'Control tower' });
const openDrawer = (page) => page.locator('[data-details-drawer]');
const drawerOf = (page, id) => page.getByRole('dialog', { name: `${drawerTitle(id)} details`, exact: true });
const partsOf = (drawer) => drawer.getByRole('tablist', { name: 'Pick a part to vibe' });
async function pick(page, id) {
  const drawer = drawerOf(page, id);
  if (!(await drawer.count())) {
    if (await openDrawer(page).count()) {
      await page.keyboard.press('Escape');
      await openDrawer(page).waitFor({ state: 'detached' });
    }
    await tower(page).getByRole('button', { name: `${drawerTitle(id)} details`, exact: true }).click();
    await drawer.waitFor();
  }
  const part = partsOf(drawer).locator(`[data-tab="${id}"]`);
  if (await part.count()) await part.click();
  const card = drawer.locator(`[data-vibe-card="${id}"]`);
  await card.waitFor();
  return card;
}
const picked = (page, id) => openDrawer(page).locator(`[data-vibe-card="${id}"]`);
const box = (card) => card.getByRole('textbox', { name: 'How should it work?', exact: true });

async function openTower(state = STATE) {
  const ui = await openUi('implement', state);
  try {
    await ui.page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const control = ui.page.getByRole('tab', { name: 'Control Tower', exact: true });
    if (await control.getAttribute('aria-selected') !== 'true') await control.click();
    await ui.page.getByRole('region', { name: 'History', exact: true }).getByText(/^\d+ spec versions? · /).waitFor({ timeout: 15000 });
    await tower(ui.page).locator('[data-tile="notebook"]').waitFor({ timeout: 15000 });
  } catch (e) {
    await ui.close();
    throw e;
  }
  return ui;
}

test('a click anywhere on a tile opens its card in a drawer that lists only that output\'s parts with their pills, the first is picked, and picking another shows what it is now', async () => {
  const ui = await openTower();
  const { page } = ui;
  try {
    assert.equal(await tower(page).getByRole('navigation', { name: 'Everything this use case built' }).count(), 0, 'the tiles are the list of what was built');
    assert.equal(await tower(page).locator('[data-vibe-card]').count(), 0, 'no card shows until a tile is clicked');
    await tower(page).locator('[data-tile="app"]').click({ position: { x: 6, y: 6 } });
    const app = drawerOf(page, PAGE);
    await app.waitFor();
    assert.deepEqual(await partsOf(app).getByRole('tab').evaluateAll((items) => items.map((b) => [b.dataset.tab, b.getAttribute('aria-label'), b.getAttribute('aria-selected')])), [
      [PAGE, 'Page: Decisions, Ready', 'true'], ['app:page:detail', 'Page: Row detail, Ready', 'false'],
    ], 'one tab per page of this App only, and the first is picked from the start');
    const card = picked(page, PAGE);
    const panel = app.getByRole('tabpanel');
    assert.equal(await panel.getAttribute('aria-labelledby'), await partsOf(app).locator(`[data-tab="${PAGE}"]`).getAttribute('id'), 'the card is the picked tab\'s panel');
    assert.equal(await panel.locator(`[data-vibe-card="${PAGE}"]`).count(), 1);
    assert.deepEqual(await box(card).evaluate((el) => [el.rows, getComputedStyle(el).resize]), [8, 'vertical'],
      'the same tall box as the wizard vibes, which the person can make taller');
    assert.equal(await card.getByRole('heading').textContent(), 'Page: Decisions');
    await card.getByText('App', { exact: true }).waitFor();
    await card.getByText('The rows to act on, with their filters', { exact: true }).waitFor();
    assert.match(await card.locator('[data-live]').textContent(), /^Version 3, built .+/);
    assert.equal(await box(card).inputValue(), V3_OUTPUTS[`${PAGE}_vibes`], 'the box holds the asks the page was built with, as written');
    assert.equal(await box(card).getAttribute('placeholder'), 'For example: put the rows to act on first and add a filter by region');
    await card.getByText('Genie writes the Decisions page again from this version.', { exact: true }).waitFor();
    const versions = openDrawer(page).getByRole('region', { name: 'Versions' });
    await versions.getByText('Roll back puts the whole App of an earlier version live again').waitFor();
    assert.deepEqual(await versions.locator('[data-version]').evaluateAll((rows) => rows.map((r) => r.dataset.version)), ['3', '2', '1']);
    await versions.locator('[data-live-version]').getByText('Live', { exact: true }).waitFor();
    await versions.getByRole('button', { name: 'Roll back to version 2', exact: true }).waitFor();
    await partsOf(app).locator('[data-tab="app:page:detail"]').click();
    await picked(page, 'app:page:detail').waitFor();
    assert.equal(await partsOf(app).locator(`[data-tab="${PAGE}"]`).getAttribute('aria-selected'), 'false', 'the earlier pick is let go');
    await picked(page, PAGE).waitFor({ state: 'detached' });
    await partsOf(app).locator('[data-tab="app:page:detail"]').focus();
    await page.keyboard.press('ArrowLeft');
    await picked(page, PAGE).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.tab), PAGE, 'the arrow keys move between parts');
    await page.keyboard.press('End');
    await picked(page, 'app:page:detail').waitFor();
    await page.keyboard.press('Escape');
    await openDrawer(page).waitFor({ state: 'detached' });

    const parts = {};
    for (const [output, first] of [['notebook', 'notebook'], ['dashboard', CHART], ['genie_space', 'genie_space'], ['alert', 'alert']]) {
      await tower(page).locator(`[data-tile="${output}"]`).click({ position: { x: 6, y: 6 } });
      const drawer = drawerOf(page, output);
      await drawer.locator(`[data-vibe-card="${first}"]`).waitFor();
      parts[output] = await partsOf(drawer).getByRole('tab').evaluateAll((items) => items.map((b) => b.getAttribute('aria-label')));
      assert.equal(await drawer.locator('[data-vibe-card]').count(), 1, `${output}: one card at a time`);
      await page.keyboard.press('Escape');
      await drawer.waitFor({ state: 'detached' });
    }
    assert.deepEqual(parts, {
      notebook: ['Notebook, Ready', 'AI reasoning, Ready', 'Money at stake, Ready'],
      dashboard: [], genie_space: [], alert: [],
    }, 'a drawer with one part shows its card with no picker, and the whole dashboard only when the build lists no charts');

    for (const [id, holder, live] of [
      ['genie_space', 'For example: answer in plain words and always say which rows you counted', /^Version 1, built /],
      ['value_formula', 'For example: price each row at its open order value times the chance it is lost', /^Version 2, built /],
      ['ai_reasoning', 'For example: explain each decision in one sentence that names the two columns behind it', /^Version 2, built /],
      [CHART, 'For example: make it a weekly bar chart and label each bar with its count', /^Version 3, built /],
    ]) {
      const shown = await pick(page, id);
      assert.equal(await box(shown).getAttribute('placeholder'), holder, id);
      assert.match(await shown.locator('[data-live]').textContent(), live, id);
    }
    await tower(page).locator('[data-tile="alert"]').getByRole('button', { name: 'Alert details', exact: true }).waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('an empty box or only spaces rebuilds the picked asset as it is and sends no vibes', async () => {
  const ui = await openTower();
  const { page, made } = ui;
  try {
    const card = await pick(page, 'app:page:detail');
    const rebuild = card.getByRole('button', { name: 'Rebuild this', exact: true });
    assert.equal(await box(card).inputValue(), '');
    await card.getByText('Genie writes the Row detail page again from this version.', { exact: true }).waitFor();
    assert.equal(await rebuild.isDisabled(), false, 'an empty box rebuilds the page as it is');
    await box(card).fill('   ');
    await card.getByText('Genie writes the Row detail page again from this version.', { exact: true }).waitFor();
    await rebuild.click();
    await until(() => made.jobs.length === 1, 'the page rebuild');
    const [plain] = insertsOf(made);
    assert.deepEqual([plain.spec.retry_outputs, plain.spec.rollback_outputs, plain.classes, 'retry_asks' in plain.spec], [['app:page:detail'], {}, 'retry', false]);
    assert.equal('app:page:detail_vibes' in plain.spec.outputs, false, 'spaces never become vibes');
    for (const [key, value] of Object.entries(V3_OUTPUTS)) assert.equal(plain.spec.outputs[key], value, `${key} stays as it was`);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Rebuild this sends the vibes exactly as typed for only the picked asset', async () => {
  const ui = await openTower();
  const { page, made } = ui;
  const asked = '  Put the rows to act on first,\n  then a map by region  ';
  try {
    const card = await pick(page, 'app:page:detail');
    const rebuild = card.getByRole('button', { name: 'Rebuild this', exact: true });
    await box(card).fill(asked);
    await card.getByText('Genie rebuilds only the Row detail page with your asks and replaces the live one. Inspire checks every ask after the rebuild.', { exact: true }).waitFor();
    assert.equal(await rebuild.isDisabled(), false);
    await rebuild.click();
    await until(() => made.jobs.length === 1, 'the page rebuild');
    const [vibed] = insertsOf(made);
    assert.equal(vibed.spec.outputs['app:page:detail_vibes'], asked, 'the ask reaches the agent spec exactly as typed');
    assert.deepEqual([vibed.spec.retry_outputs, vibed.spec.rollback_outputs, vibed.classes, 'retry_asks' in vibed.spec], [['app:page:detail'], {}, 'retry', false]);
    for (const [key, value] of Object.entries(V3_OUTPUTS)) assert.equal(vibed.spec.outputs[key], value, `${key} stays as it was`);

    const formula = await pick(page, 'value_formula');
    await box(formula).fill('x'.repeat(2001));
    await formula.getByText('the money at stake formula vibes are 2001 characters; at most 2000 are allowed').waitFor();
    assert.equal(await formula.getByRole('button', { name: 'Rebuild this', exact: true }).isDisabled(), true, 'an ask over the limit cannot be sent');
    assert.equal(insertsOf(made).length, 1);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('an asset whose asks were all done says You asked for 2 things. Done: 2 of 2. with how each was checked, and offers no Try again', async () => {
  const ui = await openTower();
  const { page } = ui;
  try {
    const list = (await pick(page, PAGE)).locator('[data-checks]');
    const tally = list.getByText('You asked for 2 things. Done: 2 of 2.', { exact: true });
    await tally.waitFor();
    assert.match(await tally.getAttribute('class'), /text-success-fg/);
    const items = list.getByRole('list', { name: 'What you asked for on the Decisions page' }).getByRole('listitem');
    assert.deepEqual(await items.evaluateAll((li) => li.map((x) => x.dataset.check)), ['done', 'done']);
    assert.deepEqual(await items.allTextContents(), [
      '✓Done: Dark headerChecked by opening the rebuilt page with the latest data. Version 3.',
      '✓Done: Rows to act on firstThe decision list opens the page. Version 3.',
    ]);
    assert.equal(await list.getByRole('button', { name: /^Try again/ }).count(), 0);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a missing ask reads not done yet with the asset ready with warnings, and Try again rebuilds that asset with only the missing asks, keeping the vibes as written', async () => {
  const ui = await openTower();
  const { page, made } = ui;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    const chart = await pick(page, CHART);
    const list = chart.locator('[data-checks]');
    const tally = list.getByText('You asked for 2 things. Done: 1 of 2.', { exact: true });
    await tally.waitFor();
    assert.match(await tally.getAttribute('class'), /text-error-fg/);
    const items = list.getByRole('listitem');
    assert.deepEqual(await items.evaluateAll((li) => li.map((x) => x.dataset.check)), ['done', 'missing']);
    assert.equal(await items.nth(1).textContent(),
      '!Not done yet: A map by regionNot done yet. The result table has no region column. This chart is marked ready with warnings.');
    await chart.getByText('Ready with warnings', { exact: true }).waitFor();
    await list.getByText('Only what is missing is rebuilt.').waitFor();
    const sizes = await page.evaluate(() => {
      const card = document.querySelector('[data-details-drawer] [data-vibe-card]');
      return { page: document.scrollingElement.scrollWidth, wide: card.scrollWidth <= card.clientWidth + 1 };
    });
    assert.ok(sizes.page <= 1440 && sizes.wide, JSON.stringify(sizes));
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(300);
      const result = await lowContrast(page, ['[data-details-drawer]']);
      assert.ok(result.checked >= 10, `measured ${result.checked} elements`);
      assert.deepEqual(result.low, [], dark ? 'dark' : 'light');
    }
    await page.evaluate(() => document.documentElement.classList.remove('dark'));

    await list.getByRole('button', { name: 'Try again with the missing thing', exact: true }).click();
    await until(() => made.jobs.length === 1, 'the chart try again');
    const [retried] = insertsOf(made);
    assert.deepEqual([retried.spec.retry_outputs, retried.spec.retry_asks, retried.classes], [[CHART], { [CHART]: ['A map by region'] }, 'retry'],
      'only the missing ask is rebuilt, on the chart alone');
    assert.equal(retried.spec.outputs[`${CHART}_vibes`], V3_OUTPUTS[`${CHART}_vibes`], 'the vibes stay exactly as the user wrote them');

    const genie = await pick(page, 'genie_space');
    await genie.locator('[data-checks]').getByText('You asked for 3 things. Done: 1 of 3.', { exact: true }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-details-drawer] [data-checks] button')].some((b) => !b.disabled));
    await genie.getByRole('button', { name: 'Try again with the 2 missing things', exact: true }).click();
    await until(() => made.jobs.length === 2, 'the Genie Agent try again');
    const whole = insertsOf(made)[1];
    assert.deepEqual([whole.spec.retry_outputs, whole.spec.retry_asks, whole.spec.outputs.genie_space_vibes, whole.classes],
      [['genie_space'], { genie_space: ['Answer in euros', 'Add a question about returns'] }, V3_OUTPUTS.genie_space_vibes, 'retry']);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('while a version rebuilds the picked asset, it reads Rebuilding with the three steps, its box and Rebuild this wait, and nothing else is rebuilding', async () => {
  const building = versionRow(4, {
    status: 'building_outputs', implement_run_id: '5555555555555555', updated_at: new Date().toISOString(), change_classes: 'retry',
    outputs: { ...V3_OUTPUTS, [`${PAGE}_vibes`]: 'Rows first, then a map by region and a filter' }, top: { retry_outputs: [PAGE] }, assets: {},
  });
  const ui = await openTower({ ...STATE, history: [building, ...HISTORY], implementRun: { run_id: 5555555555555555, state: { life_cycle_state: 'RUNNING' } } });
  const { page } = ui;
  try {
    const card = await pick(page, PAGE);
    const nav = partsOf(drawerOf(page, PAGE));
    await nav.getByRole('tab', { name: 'Page: Decisions, Rebuilding', exact: true }).waitFor();
    await nav.getByRole('tab', { name: 'Page: Row detail, Ready', exact: true }).waitFor();
    assert.equal(await nav.getByRole('tab', { name: /, Rebuilding$/ }).count(), 1, 'only the page is rebuilding');
    const steps = card.getByRole('list', { name: 'Rebuilding the Decisions page' }).getByRole('listitem');
    assert.deepEqual(await steps.evaluateAll((li) => li.map((x) => [x.dataset.step, x.textContent])), [
      ['done', '✓Reading what you asked: 3 things'],
      ['now', '2Rebuilding the Decisions page only. Nothing else changes.'],
      ['next', '3Checking each thing you asked for'],
    ]);
    assert.equal(await box(card).inputValue(), 'Rows first, then a map by region and a filter', 'the asks being built show');
    assert.equal(await box(card).isDisabled(), true);
    assert.equal(await card.getByRole('button', { name: 'Rebuild this', exact: true }).isDisabled(), true);
    assert.equal(await card.locator('[data-checks]').count(), 0, 'the checklist comes back once the build ends');
    await (await pick(page, 'app:page:detail')).getByText('A version is building now; vibes and roll backs apply after it finishes.').waitFor();
    assert.equal(await picked(page, 'app:page:detail').getByRole('button', { name: 'Rebuild this', exact: true }).isDisabled(), true);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a Genie Agent rebuilt while the use case has an App says the App page is pointed at it', async () => {
  const building = versionRow(4, {
    status: 'building_outputs', implement_run_id: '5555555555555555', updated_at: new Date().toISOString(), change_classes: 'retry',
    outputs: V3_OUTPUTS, top: { retry_outputs: ['genie_space'] }, assets: {},
  });
  const ui = await openTower({ ...STATE, history: [building, ...HISTORY], implementRun: { run_id: 5555555555555555, state: { life_cycle_state: 'RUNNING' } } });
  try {
    const card = await pick(ui.page, 'genie_space');
    const steps = card.getByRole('list', { name: 'Rebuilding the Genie Agent' }).getByRole('listitem');
    assert.deepEqual(await steps.evaluateAll((li) => li.map((x) => x.textContent.slice(1))), [
      'Reading what you asked: 3 things',
      'Rebuilding the Genie Agent, then pointing the App page at it. Nothing else changes.',
      'Checking each thing you asked for',
    ]);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a rolled back output shows the checklist of the version it rolled back to, its Versions card marks Live, and Roll back still works from its drawer', async () => {
  const rolled = [
    versionRow(4, {
      outputs: { ...V3_OUTPUTS, dashboard_vibes: 'Make the trend weekly', [`${CHART}_vibes`]: '' }, top: { rollback_outputs: { dashboard: 2 } }, change_classes: 'rollback',
      assets: { ...V3_ASSETS, dashboard: ready(4, { snapshot: true }), [CHART]: undefined },
    }),
    ...HISTORY,
  ];
  const ui = await openTower({ ...STATE, history: rolled });
  const { page, made } = ui;
  const sent = [];
  page.on('request', (req) => { if (req.url().includes('/api/inspire/implement/submit')) sent.push(JSON.parse(req.postData())); });
  try {
    const dash = await pick(page, 'dashboard');
    const list = dash.locator('[data-checks]');
    await list.getByText('You asked for 1 thing. Done: 1 of 1.', { exact: true }).waitFor();
    assert.deepEqual(await list.getByRole('listitem').allTextContents(), ['✓Done: Make the trend weeklyThe trend is weekly. Version 2.'], 'the checklist of v2');
    const versions = openDrawer(page).getByRole('region', { name: 'Versions' });
    await versions.getByText('Roll back puts an earlier version live again', { exact: true }).waitFor();
    assert.deepEqual(await versions.locator('[data-version]').evaluateAll((rows) => rows.map((r) => r.dataset.version)), ['4', '3', '2']);
    assert.deepEqual(await versions.locator('[data-version-checks]').allTextContents(), ['You asked for 2 things. Done: 1 of 2.', 'You asked for 1 thing. Done: 1 of 1.']);
    const row = versions.locator('[data-version="3"]');
    await row.getByRole('button', { name: 'Roll back to version 3', exact: true }).click();
    const confirm = row.getByRole('group', { name: 'Confirm the roll back to version 3' });
    await confirm.getByText('Roll back the Dashboard to version 3? This replaces the live Dashboard; Genie is not called.').waitFor();
    await confirm.getByRole('button', { name: 'Roll back', exact: true }).click();
    await until(() => made.jobs.length === 1, 'the roll back');
    assert.deepEqual([sent[0].spec.rollback_outputs, sent[0].spec.outputs.dashboard_vibes], [{ dashboard: 3 }, V3_OUTPUTS.dashboard_vibes]);
    const [stored] = insertsOf(made);
    assert.deepEqual(stored.spec.rollback_outputs, { dashboard: 3 });
    assert.equal(stored.spec.outputs[`${CHART}_vibes`], V3_OUTPUTS[`${CHART}_vibes`], 'the chart gets back the asks of v3 with its dashboard');
    assert.deepEqual(stored.classes.split(','), ['outputs', 'rollback']);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a roll back of a dashboard that no longer exists says Genie builds a new one, and while it runs it shows the build steps, not a roll back', async () => {
  const noChart = { ...V3_ASSETS, [CHART]: undefined };
  const lost = versionRow(3, {
    outputs: V3_OUTPUTS, status: 'ready_with_warnings', dashboard_id: null, dashboard_url: null,
    assets: { ...noChart, dashboard: { state: 'failed', spec_version: 3, error: 'the warehouse is stopped' } },
  });
  const live = versionRow(3, { outputs: V3_OUTPUTS, status: 'ready_with_warnings', assets: noChart });
  const rolling = versionRow(4, {
    status: 'building_outputs', implement_run_id: '5555555555555555', updated_at: new Date().toISOString(), change_classes: 'rollback',
    outputs: { ...V3_OUTPUTS, dashboard_vibes: 'Make the trend weekly' }, top: { rollback_outputs: { dashboard: 2 } }, assets: {},
  });
  let ui = await openTower({ ...STATE, history: [lost, ...HISTORY.slice(1)] });
  try {
    await pick(ui.page, 'dashboard');
    const row = openDrawer(ui.page).getByRole('region', { name: 'Versions' }).locator('[data-version="2"]');
    await row.getByRole('button', { name: 'Roll back to version 2', exact: true }).click();
    await row.getByRole('group', { name: 'Confirm the roll back to version 2' })
      .getByText('Roll back the Dashboard to version 2? The Dashboard no longer exists, so Genie builds a new one from the vibes of version 2.', { exact: true })
      .waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const run = { run_id: 5555555555555555, state: { life_cycle_state: 'RUNNING' } };
  for (const [base, builds] of [[lost, true], [live, false]]) {
    ui = await openTower({ ...STATE, history: [rolling, base, ...HISTORY.slice(1)], implementRun: run });
    try {
      const card = await pick(ui.page, 'dashboard');
      const steps = card.getByRole('list', { name: 'Rebuilding the Dashboard' });
      const back = card.locator('[data-rolling-back]');
      if (builds) {
        await steps.waitFor();
        assert.equal(await back.count(), 0, 'a dashboard that is gone is built by Genie, so it never says Genie is not called');
      } else {
        await back.waitFor();
        assert.equal((await back.textContent()).trim(), 'Putting version 2 live again. Genie is not called and nothing else changes.');
        assert.equal(await steps.count(), 0);
      }
      assert.deepEqual(ui.pageErrors, []);
    } finally {
      await ui.close();
    }
  }
});

test('a notebook rebuild that would read a swapped table that is gone is refused on its card with the table named, and nothing is written or started', async () => {
  const gone = '[TABLE_OR_VIEW_NOT_FOUND] The table or view `main`.`s`.`returns_old` cannot be found. Verify the spelling. SQLSTATE: 42P01';
  const lost = versionRow(3, { outputs: V3_OUTPUTS, assets: V3_ASSETS, status: 'ready_with_warnings', top: { data: { ...builtSpec().data, tables: { 'main.s.returns': 'main.s.returns_old' } } } });
  const ui = await openTower({ ...STATE, history: [lost, ...HISTORY.slice(1)], probeErrors: { '`main`.`s`.`returns_old`': gone } });
  const { page, made } = ui;
  try {
    const card = await pick(page, 'notebook');
    await box(card).fill('Use only the last 90 days');
    await card.getByRole('button', { name: 'Rebuild this', exact: true }).click();
    const alert = card.getByRole('alert');
    await alert.waitFor();
    assert.equal((await alert.textContent()).trim(), 'the preview cannot run because these source tables are missing or not readable: main.s.returns_old (not found). '
      + 'Open Edit, Data step, to swap each for a table with the same role or remove it');
    assert.equal(made.jobs.length, 0);
    assert.deepEqual(insertsOf(made), []);
  } finally {
    await ui.close();
  }
});

test('an asset the build no longer has is refused with a clear message on its card, and nothing is written or started', async () => {
  const ui = await openTower();
  const { page, made } = ui;
  try {
    const card = await pick(page, PAGE);
    await box(card).fill('Put the rows to act on first');
    const { [PAGE]: _gone, ...rest } = V3_ASSETS;
    made.state.history = [{ ...HISTORY[0], asset_status: JSON.stringify(rest) }, ...HISTORY.slice(1)];
    await card.getByRole('button', { name: 'Rebuild this', exact: true }).click();
    const alert = card.getByRole('alert');
    await alert.waitFor();
    assert.equal((await alert.textContent()).trim(), NOT_BUILT);
    assert.equal(made.jobs.length, 0);
    assert.deepEqual(insertsOf(made), []);
    await pick(page, 'notebook');
    await openDrawer(page).getByRole('alert').waitFor({ state: 'detached' });
    assert.deepEqual(ui.pageErrors.filter((e) => !/status of 400/.test(e)), []);
  } finally {
    await ui.close();
  }
});
