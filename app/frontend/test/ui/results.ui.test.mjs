import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { closeBrowser, lowContrast, lowContrastThroughAnimations, openUi } from './uiSupport.mjs';
import { RESULTS } from './implementFixtures.js';

const { SLOW_WAREHOUSE_MESSAGE } = createRequire(import.meta.url)('../../../backend/lib/sqlStatements.js');

test.after(closeBrowser);

const STATE = { results: RESULTS, useCases: [] };

const list = (page) => page.getByRole('region', { name: 'Use case list' });
const cards = (page) => list(page).locator('[aria-expanded]');
const card = (page, name) => cards(page).filter({ hasText: name });
const panel = (page, title) => page.getByRole('button', { name: new RegExp(`^${title}\\b`) }).first();

async function ready(page) {
  await list(page).waitFor();
  await cards(page).first().waitFor();
}

test('the search finds a use case by the business title its card shows under the name, and only that one', async () => {
  const titled = {
    ...RESULTS,
    domains: RESULTS.domains.map((d) => ({ ...d, use_cases: d.use_cases.map((u) => (u.No === 'N02-U02'
      ? { ...u, description: u.Name, usecase: 'Warn buyers 2 days before a supplier delivery slips', short_name: 'Warn buyers 2 days before a supplier delivery slips' }
      : u)) })),
  };
  const ui = await openUi('results', { ...STATE, results: titled });
  const { page } = ui;
  try {
    await ready(page);
    await card(page, 'Spot late suppliers').getByText('Warn buyers 2 days before a supplier delivery slips').waitFor();
    await page.getByPlaceholder('Search use cases...').fill('Warn buyers 2 days before a supplier delivery slips');
    assert.equal(await cards(page).count(), 1);
    assert.match(await cards(page).first().innerText(), /Spot late suppliers/);
    await page.getByPlaceholder('Search use cases...').fill('supplier delivery slips churn');
    await page.getByText('No use cases match your filters.').waitFor();
    assert.equal(await cards(page).count(), 0, 'a phrase no card carries finds nothing');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the Results page is the list it was before the grid: the sidebar and the filter bar narrow the cards, best of best comes first, and Clear brings every card back', async () => {
  const ui = await openUi('results', STATE);
  const { page } = ui;
  try {
    await ready(page);
    assert.equal(await page.locator('[data-use-case-grid], [data-use-case-catalog]').count(), 0, 'no grid or facet rail');
    assert.equal(await cards(page).count(), 6);
    assert.match(await cards(page).first().innerText(), /Predict churn/, 'best of best rank 1 leads');
    assert.match(await cards(page).nth(1).innerText(), /Forecast stock/, 'best of best rank 2 follows');
    await panel(page, 'Domains').click();
    await page.getByRole('button', { name: /^Supply\b/ }).click();
    assert.equal(await cards(page).count(), 2);
    assert.match(await page.getByText(/use cases$/).filter({ hasText: ' of ' }).first().innerText(), /2\s+of\s+6 use cases/);
    await page.getByPlaceholder('Search use cases...').fill('late');
    assert.equal(await cards(page).count(), 1);
    assert.match(await cards(page).first().innerText(), /Spot late suppliers/);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal(await cards(page).count(), 6);
    await panel(page, 'Sponsors').click();
    await page.getByRole('button', { name: /^Head of Sales\b/ }).click();
    assert.equal(await cards(page).count(), 1);
    assert.match(await cards(page).first().innerText(), /Score upsell/);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    const churn = card(page, 'Predict churn');
    await churn.click();
    assert.equal(await churn.getAttribute('aria-expanded'), 'true');
    await list(page).getByText('Build predict churn').first().waitFor();
    await card(page, 'Forecast stock').click();
    assert.equal(await churn.getAttribute('aria-expanded'), 'false', 'one card is open at a time');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('an open card says what the Deep data check found, and a card without the check says nothing about it', async () => {
  const ui = await openUi('results', STATE);
  const { page } = ui;
  try {
    await ready(page);
    const line = list(page).locator('[data-testid="data-signal"]');
    await card(page, 'Predict churn').click();
    await line.waitFor();
    assert.equal(await line.innerText(), 'The data shows no signal: no signal column separates the outcome. Inspire kept it because the instructions ask for it.');
    await card(page, 'Score upsell').click();
    await list(page).getByText('Data check passed').waitFor();
    assert.equal(await line.innerText(), 'Data check passed: basket_size moves with the outcome, with a correlation of 0.210.');
    await card(page, 'Segment shoppers').click();
    await list(page).getByText('Build segment shoppers').first().waitFor();
    assert.equal(await line.count(), 0);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the contrast check measures gradient fills by their weakest stop and skips decoration and disabled controls', async () => {
  const ui = await openUi('header');
  const { page } = ui;
  try {
    await page.setContent(`<body style="margin:0;background:#ffffff">
      <button style="background-image:linear-gradient(to right,#D92E1B,#CC2A19);color:#fff">Solid gradient</button>
      <button style="background-image:linear-gradient(to right,#FF3621,#FF4A36);color:#fff">Bright on light</button>
      <div style="background:#09090B"><button style="background:transparent;background-image:linear-gradient(to right,#D92E1B,#FF4A36);color:#fff">Bright stop on dark</button></div>
      <p style="background-image:linear-gradient(to right,rgba(255,54,33,0.06),transparent);color:#18181B">Faint tint</p>
      <p style="background-image:linear-gradient(to right,rgba(255,54,33,0.06),transparent);color:#ffffff">White on faint tint</p>
      <span aria-hidden="true" style="color:#eeeeee">Decoration</span>
      <button disabled style="color:#eeeeee">Locked</button>
    </body>`);
    const result = await lowContrast(page, ['body']);
    assert.equal(result.checked, 5);
    assert.deepEqual(result.low.map((l) => l.replace(/: [\d.]+$/, '')), ['Bright on light', 'Bright stop on dark', 'White on faint tint']);
  } finally {
    await ui.close();
  }
});

test('the contrast check measures the colors a theme switch settles on, not the fade in between', async () => {
  const ui = await openUi('header');
  const { page } = ui;
  try {
    await page.setContent(`<style>
      body { margin:0; background:#ffffff; color:#18181B; transition: background-color 10s ease, color 10s ease; }
      .panel { background:#ffffff; }
      .dim { color:#18181B; }
      html.dark body { background:#09090B; color:#F0F0F3; }
      html.dark .panel { background:#111113; }
      html.dark .dim { color:#1A1A1F; }
    </style><div class="panel"><p>Inherited text</p><p class="dim">Dark text on the dark panel</p></div>`);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    const result = await lowContrast(page, ['body']);
    assert.equal(result.checked, 2);
    assert.deepEqual(result.low.map((l) => l.replace(/: [\d.]+$/, '')), ['Dark text on the dark panel']);
  } finally {
    await ui.close();
  }
});

test('the landing page reads at 4.5:1 or better in light and in dark at every point of its animations', async () => {
  const ui = await openUi('landing');
  const { page } = ui;
  try {
    await page.getByText('Scroll to explore').waitFor();
    await page.waitForTimeout(1500);
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const mode = dark ? 'dark' : 'light';
      const result = await lowContrastThroughAnimations(page, ['body']);
      assert.ok(result.checked >= 15, `${mode}: measured ${result.checked} text elements`);
      assert.ok(result.animations >= 3, `${mode}: paused ${result.animations} animations`);
      assert.deepEqual(result.low, [], `${mode} landing`);
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the header reads at 4.5:1 or better in light and in dark on its current, open and locked steps', async () => {
  const ui = await openUi('header');
  const { page } = ui;
  try {
    const nav = page.locator('header nav');
    await nav.waitFor();
    assert.equal(await nav.getByRole('button', { name: /Build/ }).isDisabled(), true, 'a locked step');
    assert.equal(await nav.getByRole('button', { name: /Get Started/ }).isEnabled(), true, 'an open step');
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const mode = dark ? 'dark' : 'light';
      const result = await lowContrast(page, ['header']);
      assert.ok(result.checked >= 8, `${mode}: measured ${result.checked} header elements`);
      assert.deepEqual(result.low, [], `${mode} header`);
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the whole Results page, its open sidebar panels and every kind of open card read at 4.5:1 or better in light and in dark', async () => {
  const ui = await openUi('results', STATE);
  const { page } = ui;
  try {
    await ready(page);
    for (const title of ['Domains', 'Strategy', 'Beneficiaries', 'Sponsors']) {
      if (await panel(page, title).count()) await panel(page, title).click();
    }
    await page.getByRole('button', { name: /^Customer\b/ }).click();
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const mode = dark ? 'dark' : 'light';
      const plain = await lowContrast(page, ['body']);
      assert.ok(plain.checked >= 80, `${mode}: measured ${plain.checked} text elements`);
      assert.deepEqual(plain.low, [], `${mode} Results page with a domain filter on`);
      for (const name of ['Predict churn', 'Score upsell', 'Price elasticity']) {
        const open = card(page, name);
        await open.click();
        await page.waitForTimeout(300);
        const withCard = await lowContrast(page, ['[aria-label="Use case list"]']);
        assert.ok(withCard.checked >= 20, `${mode} ${name}: measured ${withCard.checked} card elements`);
        assert.deepEqual(withCard.low, [], `${mode} open card ${name}`);
        await open.click();
      }
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the MVP tiles count the use cases by their MVP, a tile or the MVP filter narrows the cards, and clearing brings every card back', async () => {
  const now = new Date().toISOString();
  const row = (id, status) => ({ session_id: '42', use_case_id: id, spec_version: 1, status, created_by: 'amr@x', updated_at: now, spec_json: '{}' });
  const history = [row('N01-U01', 'ready'), row('N01-U02', 'ready_with_warnings'), row('N02-U01', 'filling'), row('N02-U02', 'failed'), row('N01-U04', 'uninstalled')];
  const ui = await openUi('results', { ...STATE, history });
  const { page } = ui;
  const names = async () => (await cards(page).allInnerTexts()).map((text) => ['Predict churn', 'Score upsell', 'Segment shoppers', 'Price elasticity', 'Forecast stock', 'Spot late suppliers']
    .find((name) => text.includes(name))).sort();
  try {
    await ready(page);
    const tiles = page.getByRole('group', { name: 'MVPs' });
    await tiles.getByRole('button', { name: 'MVPs started: 4' }).waitFor();
    for (const name of ['MVPs live: 2', 'Building: 1', 'Failed: 1', 'No MVP yet: 2']) {
      assert.equal(await tiles.getByRole('button', { name, exact: true }).count(), 1, name);
    }
    const live = tiles.getByRole('button', { name: 'MVPs live: 2' });
    await live.click();
    await card(page, 'Forecast stock').waitFor({ state: 'detached' });
    assert.deepEqual(await names(), ['Predict churn', 'Score upsell']);
    assert.equal(await live.getAttribute('aria-pressed'), 'true');
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const measured = await lowContrast(page, ['[aria-label="MVPs"]']);
      assert.ok(measured.checked >= 10, `${dark ? 'dark' : 'light'}: measured ${measured.checked} tile elements`);
      assert.deepEqual(measured.low, [], `${dark ? 'dark' : 'light'} MVP tiles with one picked`);
    }
    await live.click();
    await card(page, 'Forecast stock').waitFor();
    assert.equal(await cards(page).count(), 6, 'a second click on the picked tile shows every use case');
    const filter = page.getByRole('combobox', { name: 'MVP', exact: true });
    await filter.selectOption('none');
    await card(page, 'Predict churn').waitFor({ state: 'detached' });
    assert.deepEqual(await names(), ['Price elasticity', 'Segment shoppers'], 'an uninstalled MVP counts as no MVP');
    assert.equal(await tiles.getByRole('button', { name: 'No MVP yet: 2' }).getAttribute('aria-pressed'), 'true', 'the dropdown and the tiles agree');
    await page.getByRole('button', { name: 'Clear the MVP filter' }).click();
    await card(page, 'Predict churn').waitFor();
    assert.equal(await cards(page).count(), 6);
    await filter.selectOption('has');
    await card(page, 'Segment shoppers').waitFor({ state: 'detached' });
    assert.deepEqual(await names(), ['Forecast stock', 'Predict churn', 'Score upsell', 'Spot late suppliers']);
    await filter.selectOption('failed');
    await card(page, 'Predict churn').waitFor({ state: 'detached' });
    assert.deepEqual(await names(), ['Spot late suppliers']);
    await filter.selectOption('building');
    await card(page, 'Forecast stock').waitFor();
    assert.deepEqual(await names(), ['Forecast stock']);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await card(page, 'Predict churn').waitFor();
    assert.equal(await cards(page).count(), 6);
    assert.equal(await filter.inputValue(), 'all', 'Clear resets the MVP filter too');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a warehouse too slow to answer shows its own message with Retry, and Retry brings the sessions back', async () => {
  const ui = await openUi('results', { ...STATE, sessionsErrors: [SLOW_WAREHOUSE_MESSAGE] });
  const { page, made } = ui;
  try {
    await ready(page);
    await page.getByRole('button', { name: /Change Session/ }).click();
    await page.getByText('Could not load sessions').waitFor();
    assert.equal(await page.getByText(SLOW_WAREHOUSE_MESSAGE, { exact: false }).count(), 1, 'the page shows why and what to do');
    assert.equal(await page.getByText('Failed to fetch').count(), 0);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    const session = page.locator('button', { hasText: made.state.session.business_name }).filter({ hasText: 'Complete' });
    await session.first().waitFor();
    assert.equal(await page.getByText('Could not load sessions').count(), 0);
    await session.first().click();
    await ready(page);
    assert.deepEqual(ui.pageErrors.filter((e) => !/status of 500/.test(e)), []);
  } finally {
    await ui.close();
  }
});
