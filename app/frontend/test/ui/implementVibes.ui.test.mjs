import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { defaultSpecFromUseCase } from '../../src/lib/implementWizard.js';
import { HARNESS_USE_CASE, HARNESS_SETTINGS, HARNESS_SESSION_ID } from './implementFixtures.js';
import { clippedExamples, closeBrowser, lowContrast, openUi, onStep, startMvp, toAppAccess, toVibes, until } from './uiSupport.mjs';

const OWNER = ['owner', 'example.com'].join('@');
const SHOTS = process.env.VIBES_SHOTS || '';
const LONG_ASK = 'Put the weekly trend first, show the twenty rows to act on today, and colour every overdue row so it stands out at once';

test.after(closeBrowser);

const next = (page) => page.getByRole('button', { name: 'Next' }).click();
const footerErrors = (page) => page.locator('[role="alert"] p').allTextContents();
const VIBES_TABS = { 'Notebook vibes': 'notebook', 'Vibes for the Dashboard': 'dashboard', 'Vibes for the Genie Agent': 'genie_space', 'App vibes': 'app', 'Vibes for the Alert': 'alert' };
const vibesTabs = (page) => page.getByRole('tablist', { name: 'Vibes for each asset', exact: true });
async function vibesBox(page, name) {
  await vibesTabs(page).locator(`[data-tab="${VIBES_TABS[name]}"]`).click();
  const box = page.getByRole('textbox', { name, exact: true });
  await box.waitFor();
  return box;
}

async function toDelivery(page) {
  await onStep(page, 'Choose');
  await next(page);
  await onStep(page, 'Data');
  await next(page);
  await onStep(page, 'Results');
  await next(page);
  await onStep(page, 'Delivery');
}

function insertsOf(made) {
  return made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'))
    .map((c) => ({ spec: JSON.parse(c.parameters.find((p) => p.name === 'spec').value), classes: c.parameters.find((p) => p.name === 'classes').value }));
}

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function readable(page, selectors, name) {
  for (const dark of [false, true]) {
    await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
    await page.waitForTimeout(300);
    const result = await lowContrast(page, selectors);
    assert.ok(result.checked >= 10, `${name}: measured ${result.checked} elements`);
    assert.deepEqual(result.low, [], `${name} ${dark ? 'dark' : 'light'}`);
    await shot(page, `${name}-${dark ? 'dark' : 'light'}`);
  }
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
}

const STEPS_WITH_APP = ['1. Choose', '2. Data', '3. Results', '4. Delivery', '5. App placement', '6. App access', '7. App look', '8. Vibes'];
const boxLabels = (panel) => panel.locator('textarea').evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));
const tabNames = (page) => vibesTabs(page).getByRole('tab').evaluateAll((tabs) => tabs.map((t) => t.textContent));

async function grayExamples(page, panel) {
  return panel.locator('textarea').evaluateAll((boxes) => boxes.map((b) => {
    const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    return { label: b.getAttribute('aria-label'), text: b.placeholder, value: b.value, example: rgb(getComputedStyle(b, '::placeholder').color), typed: rgb(getComputedStyle(b).color) };
  }));
}

function assertGray(examples, mode) {
  for (const e of examples) {
    assert.match(e.text, /^For example: \S/, `${mode} ${e.label}: the example reads as an example`);
    assert.ok(Math.max(...e.example) - Math.min(...e.example) <= 16, `${mode} ${e.label}: the example is gray, ${e.example}`);
    assert.ok(Math.max(...e.example) >= 80 && Math.max(...e.example) <= 180, `${mode} ${e.label}: the example is a mid gray, ${e.example}`);
    assert.notDeepEqual(e.example, e.typed, `${mode} ${e.label}: typed words never look like the example`);
  }
}

test('Vibes is the last step: Delivery asks for no vibes, each picked output gets a box with a gray example, and the step names what has no box', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page } = ui;
  try {
    await toDelivery(page);
    assert.deepEqual(await page.locator('ol li').allTextContents(), STEPS_WITH_APP);
    assert.equal(await page.getByRole('button', { name: /vibes/i }).count(), 0, 'Delivery has no vibes button');
    assert.equal(await page.getByRole('textbox', { name: /vibes/i }).count(), 0, 'Delivery has no vibes box');
    assert.equal(await page.getByRole('region', { name: 'Vibes' }).count(), 0);
    await page.getByRole('checkbox', { name: /^App / }).uncheck();
    assert.deepEqual(await page.locator('ol li').allTextContents(), ['1. Choose', '2. Data', '3. Results', '4. Delivery', '5. Vibes'], 'Vibes stays last without an App');
    await toVibes(page);
    const panel = page.getByRole('region', { name: 'Vibes' });
    await panel.getByRole('heading', { name: 'Anything else Genie should build in?' }).waitFor();
    await panel.getByText('Each box is optional: leave it empty and Genie builds it the way Inspire would. The gray text in a box is only an example.', { exact: false }).waitFor();
    assert.deepEqual(await boxLabels(panel), ['Notebook vibes', 'Vibes for the Dashboard', 'Vibes for the Genie Agent'], 'the notebook, then one box per picked output');
    assert.deepEqual(await tabNames(page), ['Notebook', 'Dashboard', 'Genie Agent'], 'one tab per box, in the same order');
    assert.equal(await panel.locator('[data-vibes-skipped]').textContent(),
      'No box for App and Alert: Genie builds only what you picked in the Delivery step. To vibe them, go Back to Delivery and pick them.');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Notebook vibes', 'the first box has the focus');
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      const examples = await grayExamples(page, panel);
      assert.equal(examples.length, 3);
      assertGray(examples, dark ? 'dark' : 'light');
      assert.equal(new Set(examples.map((e) => e.text)).size, 3, 'each box has its own example');
    }
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    assert.deepEqual((await grayExamples(page, panel)).map((e) => e.value), ['', '', ''], 'the example is never typed into the box');

    await page.getByRole('button', { name: 'Back' }).click();
    await onStep(page, 'Delivery');
    for (const name of [/^App /, /^Alert/]) await page.getByRole('checkbox', { name }).check();
    await page.getByText(`Emails ${OWNER} when`, { exact: false }).waitFor();
    await toAppAccess(page);
    await page.getByRole('radio', { name: /^Internal data/ }).check();
    await toVibes(page);
    assert.deepEqual(await boxLabels(panel), ['Notebook vibes', 'Vibes for the Dashboard', 'Vibes for the Genie Agent', 'App vibes', 'Vibes for the Alert']);
    assert.deepEqual(await tabNames(page), ['Notebook', 'Dashboard', 'Genie Agent', 'App', 'Alert']);
    assert.equal(await panel.locator('[data-vibes-skipped]').count(), 0, 'every output picked, nothing to name');
    assertGray(await grayExamples(page, panel), 'every output');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the Vibes step shows one asset at a time in tabs, each with a full-width box that grows, and marks the tabs that hold asks', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page } = ui;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await toDelivery(page);
    await page.getByRole('checkbox', { name: /^Alert/ }).check();
    await page.getByText(`Emails ${OWNER} when`, { exact: false }).waitFor();
    await toAppAccess(page);
    await page.getByRole('radio', { name: /^Internal data/ }).check();
    await toVibes(page);
    const panel = page.getByRole('region', { name: 'Vibes' });
    const states = () => vibesTabs(page).getByRole('tab').evaluateAll((tabs) => tabs.map((t) => [t.dataset.tab, t.getAttribute('aria-selected'), t.getAttribute('aria-label'), t.querySelector('[data-vibes-mark]')?.dataset.vibesMark || '']));
    assert.deepEqual(await states(), [
      ['notebook', 'true', 'Notebook', ''], ['dashboard', 'false', 'Dashboard', ''], ['genie_space', 'false', 'Genie Agent', ''], ['app', 'false', 'App', ''], ['alert', 'false', 'Alert', ''],
    ], 'the notebook tab is open first and no tab holds an ask yet');
    assert.equal(await panel.getByRole('textbox').count(), 1, 'one box shows at a time');
    const notebook = await vibesBox(page, 'Notebook vibes');
    const size = await notebook.evaluate((el) => ({ rows: el.rows, resize: getComputedStyle(el).resize, width: el.getBoundingClientRect().width, panel: el.closest('[role="tabpanel"]').getBoundingClientRect().width }));
    assert.deepEqual([size.rows, size.resize], [8, 'vertical'], 'the box is 8 lines tall and the person can make it taller');
    assert.ok(size.width >= size.panel - 2, `the box takes the full width of its tab (${size.width} of ${size.panel})`);
    const before = await notebook.boundingBox();
    await page.mouse.move(before.x + before.width - 3, before.y + before.height - 3);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width - 3, before.y + before.height + 120, { steps: 6 });
    await page.mouse.up();
    const after = await notebook.boundingBox();
    assert.ok(after.height > before.height + 60, `dragging the corner makes the box taller (${before.height} to ${after.height})`);

    await (await vibesBox(page, 'Vibes for the Dashboard')).fill('Make the trend weekly');
    await (await vibesBox(page, 'Vibes for the Alert')).fill('a'.repeat(2001));
    assert.deepEqual(await states(), [
      ['notebook', 'false', 'Notebook', ''], ['dashboard', 'false', 'Dashboard, has vibes', 'filled'], ['genie_space', 'false', 'Genie Agent', ''], ['app', 'false', 'App', ''], ['alert', 'true', 'Alert, too long', 'problem'],
    ], 'a tab shows a dot when it holds an ask and a red dot when the ask is too long');
    await vibesTabs(page).locator('[data-tab="alert"]').focus();
    for (const [key, id] of [['Home', 'notebook'], ['ArrowLeft', 'alert'], ['ArrowRight', 'notebook'], ['ArrowRight', 'dashboard'], ['End', 'alert']]) {
      await page.keyboard.press(key);
      assert.equal(await page.evaluate(() => document.activeElement?.dataset.tab), id, `${key} moves to ${id}`);
      assert.equal(await vibesTabs(page).locator(`[data-tab="${id}"]`).getAttribute('aria-selected'), 'true');
    }
    assert.equal(await (await vibesBox(page, 'Vibes for the Dashboard')).inputValue(), 'Make the trend weekly', 'switching tabs keeps what was typed');
    await page.getByRole('button', { name: 'Back' }).click();
    await onStep(page, 'App look');
    await next(page);
    await onStep(page, 'Vibes');
    assert.equal(await vibesTabs(page).locator('[data-tab="dashboard"]').getAttribute('aria-selected'), 'true', 'coming back opens the same tab');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('every gray example on the Vibes step shows in full, on a desktop and on a phone', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page } = ui;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await toDelivery(page);
    await page.getByRole('checkbox', { name: /^Alert/ }).check();
    await page.getByText(`Emails ${OWNER} when`, { exact: false }).waitFor();
    await toVibes(page);
    assert.equal(await page.getByRole('region', { name: 'Vibes', exact: true }).locator('textarea').count(), 5, 'the notebook and the 4 outputs');
    for (const [width, height, device] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
      await page.setViewportSize({ width, height });
      for (const name of Object.keys(VIBES_TABS)) assert.deepEqual(await clippedExamples(page, await vibesBox(page, name)), [], `${device}: ${name}`);
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the Vibes step keeps a live counter, an ask over 2000 characters stops Start with the shared message and focuses its box, and the asks reach the spec', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await toDelivery(page);
    await page.getByRole('checkbox', { name: /^Alert/ }).check();
    await page.getByText(`Emails ${OWNER} when`, { exact: false }).waitFor();
    await toAppAccess(page);
    await page.getByRole('radio', { name: /^Internal data/ }).check();
    await toVibes(page);
    const panel = page.getByRole('region', { name: 'Vibes' });
    const dash = panel.locator('[data-vibes="dashboard"]');
    await (await vibesBox(page, 'Vibes for the Dashboard')).fill(`  ${LONG_ASK}  `);
    assert.equal(await dash.locator('[data-vibes-count]').textContent(), `${LONG_ASK.length}/2000`, 'the counter counts the trimmed ask');
    const genie = panel.locator('[data-vibes="genie_space"]');
    await (await vibesBox(page, 'Vibes for the Genie Agent')).fill('g'.repeat(2001));
    const count = genie.locator('[data-vibes-count]');
    assert.equal(await count.textContent(), '2001/2000');
    assert.match(await count.getAttribute('class'), /text-error-fg/, 'the counter turns to the error style over the limit');
    await genie.getByText('the Genie Agent vibes are 2001 characters; at most 2000 are allowed').waitFor();
    assert.equal(await (await vibesBox(page, 'Vibes for the Genie Agent')).getAttribute('aria-invalid'), 'true');

    await (await vibesBox(page, 'Notebook vibes')).focus();
    await page.getByRole('button', { name: 'Start MVP', exact: true }).click();
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page), ['the Genie Agent vibes are 2001 characters; at most 2000 are allowed']);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Vibes for the Genie Agent', 'Start moves the focus to the box to shorten');
    assert.equal(await vibesTabs(page).locator('[data-tab="genie_space"]').getAttribute('aria-selected'), 'true', 'and opens its tab');
    await onStep(page, 'Vibes');
    assert.equal(made.jobs.length, 0, 'an ask over the limit starts nothing');
    assert.equal(insertsOf(made).length, 0, 'and records no version');

    await (await vibesBox(page, 'Vibes for the Genie Agent')).fill('g'.repeat(2000));
    assert.equal(await count.textContent(), '2000/2000');
    assert.doesNotMatch(await count.getAttribute('class'), /text-error-fg/);
    await page.locator('[role="alert"]').waitFor({ state: 'detached' });
    await (await vibesBox(page, 'App vibes')).fill('One page: the decision list on the left and the row detail on the right');
    await startMvp(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const [{ spec }] = insertsOf(made);
    assert.deepEqual([spec.data.notes, spec.outputs.dashboard_vibes, spec.outputs.genie_space_vibes.length, spec.outputs.app_vibes, spec.outputs.alert_vibes],
      ['', LONG_ASK, 2000, 'One page: the decision list on the left and the row detail on the right', ''], 'an empty box sends no ask');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the Vibes step with every output picked fits 1440x900 with every box filled, and reads at 4.5:1 in light and dark', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page } = ui;
  const fits = async (name) => {
    await page.waitForTimeout(250);
    const box = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect();
      const body = document.querySelector('[data-wizard-body]');
      return { top: dialog.top, bottom: dialog.bottom, scroll: body.scrollHeight, client: body.clientHeight, page: document.scrollingElement.scrollHeight };
    });
    assert.ok(box.top >= 0 && box.bottom <= 900, `${name}: the dialog sits inside the screen ${JSON.stringify(box)}`);
    assert.ok(box.scroll <= box.client + 1, `${name}: the step needs no scroll (${box.scroll} > ${box.client})`);
    assert.ok(box.page <= 900, `${name}: the page itself does not scroll (${box.page})`);
  };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await toDelivery(page);
    await page.getByRole('checkbox', { name: /^Alert/ }).check();
    await page.getByText(`Emails ${OWNER} when`, { exact: false }).waitFor();
    await fits('vibes-wizard-tiles');
    await toAppAccess(page);
    await page.getByRole('radio', { name: /^Internal data/ }).check();
    await toVibes(page);
    await fits('vibes-step-empty');
    for (const [name, words] of [['Notebook vibes', 'Score the baseline and every model on the same held-out rows'], ['Vibes for the Dashboard', LONG_ASK],
      ['Vibes for the Genie Agent', 'Answer in plain words and always say which rows you counted'],
      ['App vibes', 'One page: the decision list on the left and the row detail on the right'], ['Vibes for the Alert', 'a'.repeat(2001)]]) {
      await (await vibesBox(page, name)).fill(words);
    }
    await fits('vibes-step-filled');
    await readable(page, ['[role="dialog"]'], 'vibes-step');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

const builtSpec = (vibes = {}) => {
  const spec = defaultSpecFromUseCase(HARNESS_USE_CASE, { warehouseId: HARNESS_SETTINGS.warehouseId, inspireDatabase: HARNESS_SETTINGS.inspireDatabase, sessionId: HARNESS_SESSION_ID, owner: OWNER });
  return {
    ...spec,
    outputs: { ...spec.outputs, genie_space: true, app: true, app_name: 'churn-desk', app_access: 'sp', alert: true, alert_recipients: [OWNER], ...vibes },
  };
};

const ready = (version, extra = {}) => ({ state: 'ready', spec_version: version, ...extra });

const versionRow = (version, { vibes = {}, assets = {}, ...extra } = {}) => ({
  session_id: '42', use_case_id: 'N01-U01', spec_version: version, status: 'ready', change_classes: version === 1 ? 'initial' : 'outputs', created_by: OWNER,
  updated_at: `2026-10-2${version}T04:00:00Z`, spec_json: JSON.stringify(builtSpec(vibes)), job_id: '77', last_preview_run_id: '9001', result_rows: '3',
  dashboard_id: 'd1', dashboard_url: 'https://workspace.example.com/dashboardsv3/d1/published',
  genie_space_id: 'g1', genie_space_url: 'https://workspace.example.com/genie/rooms/g1',
  app_name: 'churn-desk', app_url: 'https://churn-desk-1.aws.example.com',
  alert_id: 'a1', alert_url: 'https://workspace.example.com/sql/alerts-v2/a1',
  asset_status: JSON.stringify(assets),
  ...extra,
});

const HISTORY = [
  versionRow(3, {
    vibes: { dashboard_vibes: 'Make the trend weekly', app_vibes: 'Dark header' },
    assets: { dashboard: ready(3, { snapshot: true }), genie_space: ready(1, { snapshot: true }), app: ready(3, { snapshot: true }), alert: ready(1) },
    status: 'ready_with_warnings',
    status_message: 'Dashboard vibe not done: put it in Arabic: the dashboard has no Arabic font; App vibe not done: a logo: no logo file was given',
  }),
  versionRow(2, {
    vibes: { dashboard_vibes: LONG_ASK, app_vibes: '' },
    assets: { dashboard: ready(2, { snapshot: true }), genie_space: ready(1, { snapshot: true }), app: ready(2, { snapshot: true }), alert: ready(1) },
  }),
  versionRow(1, { assets: { dashboard: ready(1, { snapshot: false }), genie_space: ready(1, { snapshot: true }), app: ready(1, { snapshot: true }), alert: ready(1) } }),
];

const STATE = { history: HISTORY, appExists: true, app: { name: 'churn-desk', description: 'Inspire use case N01-U01 (session 42): Predict churn', compute_status: { state: 'ACTIVE' }, app_status: { state: 'RUNNING' } } };

const LABELS = { notebook: 'Genie Code notebook', dashboard: 'Dashboard', genie_space: 'Genie Agent', app: 'App', alert: 'Alert' };
const OUTPUTS = ['dashboard', 'genie_space', 'app', 'alert'];

async function openVibes(state = STATE) {
  const ui = await openUi('implement', state);
  try {
    await ui.page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const control = ui.page.getByRole('tab', { name: 'Control Tower', exact: true });
    if (await control.getAttribute('aria-selected') !== 'true') await control.click();
    await ui.page.getByRole('region', { name: 'History', exact: true }).getByText(/^\d+ spec versions? · /).waitFor({ timeout: 15000 });
  } catch (e) {
    await ui.close();
    throw e;
  }
  return ui;
}

async function openDrawer(page, id) {
  await page.getByRole('region', { name: 'Control tower' }).getByRole('button', { name: `${LABELS[id]} details`, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: `${LABELS[id]} details`, exact: true });
  await drawer.waitFor();
  return drawer;
}

async function closeDrawer(page, drawer) {
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'detached' });
}

const card = (scope, id) => scope.locator(`[data-vibe-card="${id}"]`);
const cardIds = (scope) => scope.locator('[data-vibe-card]').evaluateAll((cards) => cards.map((c) => c.dataset.vibeCard));
const askBox = (scope) => scope.getByRole('textbox', { name: 'How should it work?', exact: true });
const rebuildThis = (scope) => scope.getByRole('button', { name: 'Rebuild this', exact: true });
const versionIds = (scope) => scope.getByRole('region', { name: 'Versions' }).locator('[data-version]').evaluateAll((rows) => rows.map((r) => r.dataset.version));

test('the gray example in each Details drawer\'s ask box shows in full, on a desktop and on a phone', async () => {
  const ui = await openVibes();
  const { page } = ui;
  try {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const id of OUTPUTS) {
        const drawer = await openDrawer(page, id);
        await card(drawer, id).waitFor();
        assert.deepEqual(await clippedExamples(page, askBox(card(drawer, id))), [], `${id} at ${width}px`);
        await closeDrawer(page, drawer);
      }
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('each Details drawer holds only its own output\'s card, starts from the live asks, a changed ask rebuilds only that output, an unchanged one is a retry, and a draft survives the drawer and the tabs', async () => {
  const ui = await openVibes();
  const { page, made } = ui;
  try {
    const held = {};
    for (const id of OUTPUTS) {
      const drawer = await openDrawer(page, id);
      await card(drawer, id).waitFor();
      held[id] = await cardIds(drawer);
      await closeDrawer(page, drawer);
    }
    assert.deepEqual(held, { dashboard: ['dashboard'], genie_space: ['genie_space'], app: ['app'], alert: ['alert'] }, 'each drawer shows only its output\'s card');
    let drawer = await openDrawer(page, 'genie_space');
    assert.match(await card(drawer, 'genie_space').locator('[data-live]').textContent(), /^Version 1, built /, 'a carried asset names the version it was built on');
    await closeDrawer(page, drawer);

    drawer = await openDrawer(page, 'dashboard');
    const dash = card(drawer, 'dashboard');
    assert.equal(await askBox(dash).inputValue(), 'Make the trend weekly');
    assert.match(await dash.locator('[data-live]').textContent(), /^Version 3, built .+/);
    assert.deepEqual(await dash.getByRole('list', { name: /^Vibes Genie could not do on the / }).getByRole('listitem').allTextContents(),
      ['Dashboard vibe not done: put it in Arabic: the dashboard has no Arabic font'], 'only this asset\'s warnings show under it');

    await askBox(dash).fill('  Make the trend weekly and add a map  ');
    await closeDrawer(page, drawer);
    await closeDrawer(page, await openDrawer(page, 'app'));
    await page.getByRole('tab', { name: 'Progress', exact: true }).click();
    await page.getByRole('tab', { name: 'Control Tower', exact: true }).click();
    drawer = await openDrawer(page, 'dashboard');
    assert.equal(await askBox(card(drawer, 'dashboard')).inputValue(), '  Make the trend weekly and add a map  ',
      'an ask being typed survives closing the drawer, another drawer and the other tab');
    await rebuildThis(card(drawer, 'dashboard')).click();
    await until(() => made.jobs.length === 1, 'the vibed rebuild');
    const vibed = insertsOf(made)[0];
    assert.equal(vibed.classes, 'outputs');
    assert.equal(vibed.spec.outputs.dashboard_vibes, 'Make the trend weekly and add a map');
    assert.deepEqual([vibed.spec.outputs.app_vibes, vibed.spec.outputs.genie_space_vibes, vibed.spec.outputs.alert_vibes], ['Dark header', '', ''],
      'only the vibed output\'s asks change');
    assert.deepEqual([vibed.spec.retry_outputs, vibed.spec.rollback_outputs, vibed.spec.based_on_version], [[], {}, 3]);
    await closeDrawer(page, drawer);

    drawer = await openDrawer(page, 'app');
    assert.equal(await askBox(card(drawer, 'app')).inputValue(), 'Dark header');
    await rebuildThis(card(drawer, 'app')).click();
    await until(() => made.jobs.length === 2, 'the unchanged rebuild');
    const retried = insertsOf(made)[1];
    assert.equal(retried.classes, 'retry');
    assert.deepEqual(retried.spec.retry_outputs, ['app']);
    assert.equal(retried.spec.outputs.app_vibes, 'Dark header');
    await closeDrawer(page, drawer);

    drawer = await openDrawer(page, 'alert');
    const over = card(drawer, 'alert');
    await askBox(over).fill('z'.repeat(2001));
    await over.getByText('the Alert vibes are 2001 characters; at most 2000 are allowed').waitFor();
    assert.equal(await rebuildThis(over).isDisabled(), true, 'an ask over the limit cannot be sent');
    assert.equal(insertsOf(made).length, 2);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Versions in each drawer lists the live version and only the earlier ones that kept a snapshot, and a confirmed roll back submits the version and its vibes', async () => {
  const ui = await openVibes();
  const { page, made } = ui;
  const sent = [];
  page.on('request', (req) => { if (req.url().includes('/api/inspire/implement/submit')) sent.push(JSON.parse(req.postData())); });
  try {
    let drawer = await openDrawer(page, 'app');
    await card(drawer, 'app').waitFor();
    assert.deepEqual(await versionIds(drawer), ['3', '2', '1']);
    await drawer.locator('[data-version="2"]').getByText('no vibes', { exact: true }).waitFor();
    await closeDrawer(page, drawer);
    for (const id of ['genie_space', 'alert']) {
      drawer = await openDrawer(page, id);
      await card(drawer, id).waitFor();
      assert.deepEqual(await versionIds(drawer), ['1'], `${id}: only the live version, nothing earlier to roll back to`);
      assert.equal(await drawer.getByRole('button', { name: /^Roll back to version / }).count(), 0, id);
      await closeDrawer(page, drawer);
    }

    drawer = await openDrawer(page, 'dashboard');
    await card(drawer, 'dashboard').waitFor();
    assert.deepEqual(await versionIds(drawer), ['3', '2'], 'v3 is live and v1 kept no snapshot');
    const row = drawer.getByRole('region', { name: 'Versions' }).locator('[data-version="2"]');
    assert.ok((await row.textContent()).includes(`“${LONG_ASK.slice(0, 80).trimEnd()}…”`), await row.textContent());

    await row.getByRole('button', { name: 'Roll back to version 2', exact: true }).click();
    const confirm = row.getByRole('group', { name: 'Confirm the roll back to version 2' });
    await confirm.getByText('Roll back the Dashboard to version 2? This replaces the live Dashboard; Genie is not called.').waitFor();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await confirm.waitFor({ state: 'detached' });
    assert.equal(made.jobs.length, 0, 'Cancel sends nothing');
    await row.getByRole('button', { name: 'Roll back to version 2', exact: true }).click();
    await confirm.getByRole('button', { name: 'Roll back', exact: true }).click();
    await until(() => made.jobs.length === 1, 'the roll back run');
    assert.equal(sent.length, 1);
    const asked = sent[0].spec;
    assert.deepEqual(asked.rollback_outputs, { dashboard: 2 });
    assert.equal(asked.outputs.dashboard_vibes, LONG_ASK, 'the browser sends the vibes of the version it rolls back to');
    assert.equal(asked.outputs.app_vibes, 'Dark header');
    assert.equal('retry_outputs' in asked, false);
    const [stored] = insertsOf(made);
    assert.deepEqual(stored.spec.rollback_outputs, { dashboard: 2 });
    assert.equal(stored.spec.outputs.dashboard_vibes, LONG_ASK);
    assert.deepEqual(stored.classes.split(','), ['outputs', 'rollback']);
    await confirm.waitFor({ state: 'detached' });
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('while a version builds or a submit is on its way, every vibe and roll back control in every drawer is disabled', async () => {
  const building = versionRow(4, { status: 'building_outputs', implement_run_id: '5555555555555555', updated_at: new Date().toISOString(),
    vibes: { dashboard_vibes: 'Make the trend weekly', app_vibes: 'Dark header' }, assets: {} });
  const busy = await openVibes({ ...STATE, history: [building, ...HISTORY], implementRun: { run_id: 5555555555555555, state: { life_cycle_state: 'RUNNING' } } });
  try {
    const { page } = busy;
    let rollbacks = 0;
    for (const id of ['dashboard', 'app']) {
      const drawer = await openDrawer(page, id);
      await drawer.getByText('A version is building now; vibes and roll backs apply after it finishes.').waitFor();
      assert.equal(await rebuildThis(card(drawer, id)).isDisabled(), true, id);
      for (const button of await drawer.getByRole('button', { name: /^Roll back to version / }).all()) assert.equal(await button.isDisabled(), true);
      rollbacks += await drawer.getByRole('button', { name: /^Roll back to version / }).count();
      await closeDrawer(page, drawer);
    }
    assert.equal(rollbacks, 3);
    assert.deepEqual(busy.pageErrors, []);
  } finally {
    await busy.close();
  }

  const ui = await openVibes();
  try {
    const { page, made } = ui;
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await page.route('**/api/inspire/implement/submit', async (route) => { await held; await route.continue(); });
    const app = await openDrawer(page, 'app');
    await rebuildThis(card(app, 'app')).click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-details-drawer] button')].filter((b) => /^Roll back to version /.test(b.getAttribute('aria-label') || ''))
      .every((b) => b.disabled));
    assert.equal(await card(app, 'app').locator('svg.animate-spin').count(), 1, 'the asked rebuild shows its spinner');
    await closeDrawer(page, app);
    const dash = await openDrawer(page, 'dashboard');
    assert.equal(await rebuildThis(card(dash, 'dashboard')).isDisabled(), true, 'another output waits for the submit too');
    assert.equal(await dash.getByRole('button', { name: 'Roll back to version 2', exact: true }).isDisabled(), true);
    release();
    await until(() => made.jobs.length === 1, 'the held rebuild');
    await page.waitForFunction(() => [...document.querySelectorAll('[data-details-drawer] button')]
      .some((b) => /^Roll back to version /.test(b.getAttribute('aria-label') || '') && !b.disabled));
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the Build page cards and versions fit their drawer on a 1440x900 screen and read at 4.5:1 in light and dark', async () => {
  const ui = await openVibes();
  const { page } = ui;
  const fits = (id) => page.evaluate((which) => {
    const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect();
    const c = document.querySelector(`[data-vibe-card="${which}"]`);
    const v = document.querySelector('[role="dialog"] [aria-label="Versions"]');
    const r = c.getBoundingClientRect();
    const vr = v ? v.getBoundingClientRect() : r;
    return {
      page: document.scrollingElement.scrollWidth, dialog: { left: dialog.left, right: dialog.right, bottom: dialog.bottom },
      card: { left: r.left, right: r.right, wide: c.scrollWidth <= c.clientWidth + 1 }, versions: { left: vr.left, right: vr.right },
    };
  }, id);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    let drawer = await openDrawer(page, 'dashboard');
    const dash = card(drawer, 'dashboard');
    await askBox(dash).fill('Make the trend weekly and add a map');
    await drawer.locator('[data-version="2"]').getByRole('button', { name: 'Roll back to version 2', exact: true }).click();
    for (const [id, open] of [['dashboard', null], ['alert', async (d) => askBox(card(d, 'alert')).fill('z'.repeat(2001))]]) {
      if (open) {
        await closeDrawer(page, drawer);
        drawer = await openDrawer(page, id);
        await open(drawer);
      }
      const sizes = await fits(id);
      assert.ok(sizes.page <= 1440, `the page does not scroll sideways (${sizes.page})`);
      assert.ok(sizes.dialog.left >= 0 && sizes.dialog.right <= 1440 && sizes.dialog.bottom <= 900, JSON.stringify(sizes.dialog));
      assert.ok(sizes.card.wide && sizes.card.left >= sizes.dialog.left && sizes.card.right <= sizes.dialog.right + 1, JSON.stringify(sizes));
      assert.ok(sizes.versions.left >= sizes.dialog.left && sizes.versions.right <= sizes.dialog.right + 1, JSON.stringify(sizes));
      await readable(page, ['[role="dialog"]'], `vibes-build-${id}`);
    }
    await closeDrawer(page, drawer);
    drawer = await openDrawer(page, 'app');
    await card(drawer, 'app').scrollIntoViewIfNeeded();
    await shot(page, 'vibes-build-versions-light');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the notebook has its own vibes in the wizard and a card on the Build page that rewrites it or rebuilds it', async () => {
  const wizard = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  try {
    const { page } = wizard;
    await toDelivery(page);
    await toAppAccess(page);
    await page.getByRole('radio', { name: /^Internal data/ }).check();
    await toVibes(page);
    const panel = page.getByRole('region', { name: 'Vibes' });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Notebook vibes', 'the notebook box comes first, with the focus');
    await (await vibesBox(page, 'Notebook vibes')).fill('n'.repeat(2001));
    await panel.locator('[data-vibes="notebook"]').getByText('the notebook vibes are 2001 characters; at most 2000 are allowed').waitFor();
    await (await vibesBox(page, 'App vibes')).focus();
    await page.getByRole('button', { name: 'Start MVP', exact: true }).click();
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page), ['the notebook vibes are 2001 characters; at most 2000 are allowed']);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Notebook vibes', 'Start moves the focus back to the over-limit box');
    assert.equal(wizard.made.jobs.length, 0);
    assert.deepEqual(wizard.pageErrors, []);
  } finally {
    await wizard.close();
  }

  const history = HISTORY.map((row, i) => (i ? row : { ...row, asset_status: JSON.stringify({ ...JSON.parse(row.asset_status), notebook: { spec_version: 2, modified_at: 1 } }) }));
  const ui = await openVibes({ ...STATE, history });
  const { page, made } = ui;
  try {
    assert.deepEqual(await page.getByRole('region', { name: 'Control tower' }).locator('[data-tile]').evaluateAll((tiles) => tiles.map((t) => t.dataset.tile)),
      ['notebook', 'dashboard', 'genie_space', 'app', 'alert'], 'the notebook the MVP built has its tile, first');
    const drawer = await openDrawer(page, 'notebook');
    await card(drawer, 'notebook').waitFor();
    assert.deepEqual(await cardIds(drawer), ['notebook']);
    const nb = card(drawer, 'notebook');
    assert.match(await nb.locator('[data-live]').textContent(), /^Version 2, built /);
    await nb.getByText('Genie checks every cell against the current rules, runs the notebook, and refreshes every output from the new result.').waitFor();
    await rebuildThis(nb).click();
    await until(() => made.jobs.length === 1, 'the notebook rebuild');
    const rebuilt = insertsOf(made)[0];
    assert.deepEqual([rebuilt.classes, rebuilt.spec.retry_outputs], ['retry', ['notebook']], 'with no asks the notebook is rebuilt as it is');
    await askBox(nb).fill('  Score every model on the same held-out baskets  ');
    await nb.getByText(/^Genie rewrites the notebook with your asks/).waitFor();
    await rebuildThis(nb).click();
    await until(() => made.jobs.length === 2, 'the notebook vibe');
    const vibed = insertsOf(made)[1];
    assert.deepEqual([vibed.classes, vibed.spec.data.notes, vibed.spec.retry_outputs], ['data', 'Score every model on the same held-out baskets', []]);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});
