import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildAgainHint, lostTablesText } from '../../src/lib/implementWizard.js';
import {
  HARNESS_USE_CASE, HARNESS_SETTINGS, HARNESS_SESSION_ID, OWNER, RESULT_TABLE, STUDIO_STATE, built, builtSpec,
} from './implementFixtures.js';
import { closeBrowser, lowContrast, openUi, onStep, startMvp, toAppAccess, toVibes, until } from './uiSupport.mjs';

const GONE = '[TABLE_OR_VIEW_NOT_FOUND] The table or view `main`.`s`.`returns` cannot be found. Verify the spelling. SQLSTATE: 42P01';

test.after(closeBrowser);

const next = (page) => page.getByRole('button', { name: 'Next' }).click();
const studioTab = (page, name) => page.getByRole('tab', { name, exact: true }).click();
const selectedTab = (page) => page.getByRole('tablist', { name: 'MVP views' }).locator('[aria-selected="true"]').innerText();
const towerOf = (page) => page.getByRole('region', { name: 'Control tower' });
const runPane = (page) => page.getByRole('region', { name: 'Run and schedule', exact: true });
const historyPane = (page) => page.getByRole('region', { name: 'History', exact: true });
const historyToggle = (page) => historyPane(page).getByRole('button', { name: /^History/ });
const statusLoaded = (page) => historyPane(page).getByText(/^\d+ spec versions? · /).waitFor({ timeout: 15000 });
const focusedName = (page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() || '');
const SHOTS = process.env.PAGE_SHOTS || '';

async function shot(page, name, fullPage = true) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
}

async function openDetails(page, label) {
  await towerOf(page).getByRole('button', { name: `${label} details`, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: `${label} details`, exact: true });
  await drawer.waitFor();
  return drawer;
}

async function closeDetails(page, drawer) {
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'detached' });
}

async function openHistory(page) {
  const toggle = historyToggle(page);
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
}

async function toData(page) {
  await onStep(page, 'Choose');
  await next(page);
  await onStep(page, 'Data');
}
async function toDelivery(page) {
  await next(page);
  await onStep(page, 'Results');
  await next(page);
  await onStep(page, 'Delivery');
}

async function throughApp(page, access = /^Internal data/) {
  await toAppAccess(page);
  await page.getByRole('radio', { name: access }).check();
  await next(page);
  await onStep(page, 'App look');
}
const advanced = (page) => page.getByRole('button', { name: 'Advanced settings' });
const footerErrors = (page) => page.locator('[role="alert"] p').allTextContents();

const implementWhenReady = startMvp;

function submittedSpec(made) {
  const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'));
  assert.equal(inserts.length, 1);
  return JSON.parse(inserts[0].parameters.find((p) => p.name === 'spec').value);
}

test('the wizard starts with the dashboard, Genie Agent and App ticked, drops App access and App look while the App is unticked, and Start MVP launches one run', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  const withApp = ['1. Choose', '2. Data', '3. Results', '4. Delivery', '5. App placement', '6. App access', '7. App look', '8. Vibes'];
  try {
    await onStep(page, 'Choose');
    assert.deepEqual(await page.locator('ol li').allTextContents(), withApp);
    const summary = page.getByRole('region', { name: 'Executive summary' });
    await summary.getByText('Cut churn in the top segment').waitFor();
    await summary.getByText('Head of Retention').waitFor();
    assert.equal(await page.getByRole('radio', { name: /^Full MVP \(default\)/ }).isChecked(), true);
    assert.equal(await page.getByRole('radio', { name: /^Notebook only/ }).isChecked(), false);
    assert.equal(await advanced(page).count(), 0, 'Choose has nothing under Advanced settings');
    await next(page);
    await onStep(page, 'Data');
    assert.deepEqual(await page.locator('[data-table]').evaluateAll((rows) => rows.map((r) => r.dataset.table)), ['main.s.orders', 'main.s.returns']);
    assert.equal(await advanced(page).getAttribute('aria-expanded'), 'false');
    assert.equal(await page.getByLabel('Goal sentence').count(), 0, 'every other setting waits under Advanced settings');
    await toDelivery(page);
    for (const name of [/^Dashboard/, /^Genie Agent/, /^App /]) assert.equal(await page.getByRole('checkbox', { name }).isChecked(), true, String(name));
    assert.equal(await page.getByRole('checkbox', { name: /^Alert/ }).isChecked(), false, 'the alert is the one output left off');
    await page.getByRole('checkbox', { name: /^App / }).uncheck();
    assert.deepEqual(await page.locator('ol li').allTextContents(), ['1. Choose', '2. Data', '3. Results', '4. Delivery', '5. Vibes']);
    assert.equal(await page.getByRole('button', { name: 'Start MVP', exact: true }).count(), 0, 'without an App, Delivery leads on to Vibes');
    await page.getByRole('checkbox', { name: /^App / }).check();
    assert.deepEqual(await page.locator('ol li').allTextContents(), withApp);
    assert.equal(await page.getByLabel('App name').count(), 0, 'the App name waits for App placement');
    await page.getByRole('checkbox', { name: /^Alert/ }).check();
    await page.getByText(`Emails ${OWNER} when Act now rows in the latest run >= 1.`).waitFor();
    const fresh = page.getByRole('group', { name: 'Keep it fresh' });
    assert.equal(await fresh.getByRole('button', { name: 'Off' }).getAttribute('aria-pressed'), 'true', 'Keep it fresh starts Off');
    await fresh.getByRole('button', { name: 'Weekly' }).click();
    assert.equal(await fresh.getByRole('button', { name: 'Weekly' }).getAttribute('aria-pressed'), 'true');
    assert.equal(made.jobs.length, 0);
    assert.equal(await page.getByRole('button', { name: 'Start MVP', exact: true }).count(), 0, 'with an App, Delivery leads on to App placement');
    await next(page);
    await onStep(page, 'App placement');
    assert.equal(await page.getByLabel('App name').inputValue(), 'inspire-hub-acme', 'a new App of a use case with no domain is the business Hub');
    await page.getByText("'inspire-hub-acme' is free").waitFor();
    await next(page);
    await onStep(page, 'App access');
    await page.getByRole('radio', { name: /^Internal data/ }).check();
    await next(page);
    await onStep(page, 'App look');
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();

    assert.equal(made.jobs.length, 1);
    const params = made.jobs[0].params;
    assert.equal(params['15_operation'], 'Implement Use Cases');
    assert.equal(params.inspire_implement_use_case, 'N01-U01');
    assert.equal(params.inspire_implement_spec_version, '1');
    const spec = submittedSpec(made);
    assert.equal(spec.use_case.decision_owner, OWNER);
    assert.deepEqual(spec.data.column_roles, {}, 'a new MVP leaves every column role to Inspire');
    assert.equal(spec.config.result_table, RESULT_TABLE);
    assert.deepEqual(
      { dashboard: spec.outputs.dashboard, genie_space: spec.outputs.genie_space, app: spec.outputs.app, alert: spec.outputs.alert },
      { dashboard: true, genie_space: true, app: true, alert: true },
    );
    assert.equal(spec.outputs.app_name, 'inspire-hub-acme');
    assert.equal(spec.outputs.app_access, 'sp');
    assert.deepEqual(spec.outputs.app_look, { style: 'a', layout: 'sidebar', palette: 'default', theme: 'light' });
    assert.deepEqual(spec.outputs.app_options, { modify: false, replace_edits: false, decisions: false, alerts: false });
    assert.deepEqual(spec.outputs.merge, { app: '', dashboard: '', genie_space: '' });
    assert.deepEqual(spec.outputs.alert_recipients, [OWNER]);
    assert.deepEqual([spec.schedule.enabled, spec.schedule.cron], [true, '0 0 6 ? * MON']);
    assert.deepEqual(spec.schedule.failure_emails, [OWNER]);
    assert.deepEqual(spec.sharing.principals, [{ type: 'user', name: OWNER }]);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the wizard names the use case as the card the person clicked, while the data comes from the tracking table', async () => {
  const { Name: _cardName, ...row } = HARNESS_USE_CASE;
  const ui = await openUi('wizard', { useCase: { ...row, use_case: 'Keep customers who would leave', statement: 'Keep the top segment buying' } });
  const { page, made } = ui;
  try {
    await onStep(page, 'Choose');
    const summary = page.getByRole('region', { name: 'Executive summary' });
    await summary.getByText('Keep the top segment buying').waitFor();
    assert.equal(await summary.locator('h3').innerText(), HARNESS_USE_CASE.Name);
    assert.equal(await page.getByRole('dialog').getByText('Keep customers who would leave').count(), 0, 'one name for the use case, the one on its card');
    await next(page);
    await onStep(page, 'Data');
    await toDelivery(page);
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.equal(submittedSpec(made).use_case_name, HARNESS_USE_CASE.Name);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Edit keeps the card name even when the saved version carries the tracking-table name', async () => {
  const legacy = built({ spec_json: JSON.stringify({ ...builtSpec(), use_case_name: 'Keep customers who would leave' }) });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [legacy] });
  const { page } = ui;
  try {
    const shown = page.locator('[data-implement-page]');
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await page.getByRole('heading', { name: HARNESS_USE_CASE.Name, exact: true }).waitFor();
    assert.equal(await shown.getByText('Keep customers who would leave').count(), 0);
    await runPane(page).getByRole('button', { name: 'Edit the MVP' }).click();
    await onStep(page, 'Choose');
    const summary = page.getByRole('region', { name: 'Executive summary' });
    await summary.waitFor();
    assert.equal(await summary.locator('h3').innerText(), HARNESS_USE_CASE.Name);
    assert.equal(await page.getByRole('dialog').getByText('Keep customers who would leave').count(), 0, 'one name for the use case, the one on its card');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Edit of a failed version the old wizard saved under the use case id names the App after the business Hub, since no App was built', async () => {
  const oldWizard = { ...builtSpec(), outputs: { ...builtSpec().outputs, app_name: 'n01-u01' } };
  const failed = built({
    status: 'failed', spec_json: JSON.stringify(oldWizard), result_rows: null, asset_status: null,
    dashboard_id: null, dashboard_url: null, genie_space_id: null, genie_space_url: null, app_name: null, app_url: null, alert_id: null, alert_url: null,
  });
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' }, history: [failed] });
  try {
    await toData(ui.page);
    await toDelivery(ui.page);
    await next(ui.page);
    await onStep(ui.page, 'App placement');
    assert.equal(await ui.page.getByLabel('App name').inputValue(), 'inspire-hub-acme', 'the App is the business Hub, not named after the use case id');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the wizard covers the screen from any scroll position, above the App header, inside an animated page', async () => {
  const ui = await openUi('wizard&nest=1', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page } = ui;
  try {
    const overlay = page.locator('[data-implement-overlay]');
    await overlay.waitFor();
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForFunction(() => window.scrollY === 1200);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('main')).transform === 'none', null, { timeout: 5000 })
      .catch(async () => {
        throw new Error(`the page animation leaves a transform behind: ${await page.evaluate(() => getComputedStyle(document.querySelector('main')).transform)}`);
      });
    assert.equal(await overlay.evaluate((el) => el.parentElement === document.body), true, 'the wizard renders at the top of the page');
    const box = await overlay.boundingBox();
    assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 1440, 1000], 'the wizard fills the viewport');
    assert.equal(await page.evaluate(() => Boolean(document.elementFromPoint(720, 30)?.closest('[data-implement-overlay]'))), true,
      'the App header never paints over the wizard');
    const dialog = await page.getByRole('dialog', { name: 'Start Use Case MVP with Genie' }).boundingBox();
    assert.ok(dialog.y >= 0 && dialog.y + dialog.height <= 1000, JSON.stringify(dialog));
    const button = await page.getByRole('button', { name: 'Next' }).boundingBox();
    assert.ok(button.y >= 0 && button.y + button.height <= 1000, 'Next is on screen without scrolling the page');
    await page.getByRole('region', { name: 'Executive summary' }).waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the signed-in person is the decision owner and is shared with by default, and removing them under Advanced sticks', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await toData(page);
    await advanced(page).click();
    assert.equal(await page.getByLabel('Decision owner').inputValue(), OWNER);
    await toDelivery(page);
    await advanced(page).click();
    const chip = page.getByRole('button', { name: `${OWNER} ×` });
    await chip.waitFor();
    await chip.click();
    await chip.waitFor({ state: 'detached' });
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const spec = submittedSpec(made);
    assert.equal(spec.use_case.decision_owner, OWNER);
    assert.deepEqual(spec.sharing.principals, []);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a new App that could not get access is disabled up front with the reason, and a sharing gap warns without blocking', async () => {
  const sp = (level, privilege, principal, mine) => ({ level, privilege, principal, mine: mine ? 'true' : 'false', me: 'inspire-sp' });
  const access = [sp('catalog', 'OWNER', 'admins', false), sp('schema', 'OWNER', 'data-eng', false), sp('catalog', 'USE_CATALOG', 'inspire-sp', true),
    sp('schema', 'USE_SCHEMA', 'inspire-sp', true), sp('schema', 'CREATE_TABLE', 'inspire-sp', true)];
  const ui = await openUi('wizard', { access, me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await toData(page);
    await toDelivery(page);
    const appBox = page.getByRole('checkbox', { name: /^App / });
    await appBox.waitFor();
    assert.equal(await appBox.isDisabled(), true);
    const reason = await page.getByText('Inspire cannot create this App:', { exact: false }).textContent();
    assert.ok(reason.includes(`Inspire cannot create this App: a new App could not read ${RESULT_TABLE}: its service principal needs USE CATALOG on catalog \`main\` (owner admins)`), reason);
    assert.ok(reason.includes('Inspire cannot manage'), reason);
    assert.equal(await page.getByRole('checkbox', { name: /^Genie Agent/ }).isDisabled(), false);
    const warn = page.locator('span.text-warning-fg', { hasText: `${OWNER} may not be able to read the result table` });
    await warn.waitFor();
    assert.equal(await warn.count(), 1, 'the warning shows on the main view, once');
    assert.match(await warn.textContent(), new RegExp(`${OWNER} needs CAN USE on .* to open the dashboard and the Genie Agent, because they query with their own access`));
    assert.equal(await page.getByRole('note', { name: 'Where Inspire saves the MVP' }).count(), 0, 'a session outside /Shared shows no folder warning');
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.equal(submittedSpec(made).outputs.app, false);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a use case that trains a model stops on Results until Inspire may register its model, and says which grant is missing', async () => {
  const sp = (level, privilege, principal, mine) => ({ level, privilege, principal, mine: mine ? 'true' : 'false', me: 'inspire-sp' });
  const writes = [sp('catalog', 'OWNER', 'admins', false), sp('schema', 'OWNER', 'data-eng', false), sp('catalog', 'USE_CATALOG', 'inspire-sp', true),
    sp('schema', 'USE_SCHEMA', 'inspire-sp', true), sp('schema', 'CREATE_TABLE', 'inspire-sp', true)];
  const useCase = { ...HARNESS_USE_CASE, code_structure_mandate: 'Execution pattern: family B (classification).' };
  const missing = `you need CREATE MODEL on main.inspire to register the model ${RESULT_TABLE}_model`;
  for (const [access, blocked] of [[writes, true], [[...writes, sp('schema', 'CREATE_MODEL', 'inspire-sp', true)], false]]) {
    const ui = await openUi('wizard', { access, useCase, me: { userName: OWNER, displayName: 'Owner' } });
    const { page } = ui;
    try {
      await toData(page);
      await next(page);
      await onStep(page, 'Results');
      await next(page);
      const check = page.getByLabel('Result table check');
      if (blocked) {
        await page.locator('[role="alert"] p', { hasText: missing }).waitFor({ timeout: 15000 });
        assert.ok((await footerErrors(page)).includes(missing));
        assert.equal(await page.locator('[aria-current="step"]', { hasText: 'Results' }).count(), 1);
        assert.equal(await check.locator('p.text-error-fg', { hasText: missing }).count(), 1);
      } else {
        await onStep(page, 'Delivery');
        assert.equal(await check.count(), 0);
        await page.getByRole('button', { name: 'Back' }).click();
        await onStep(page, 'Results');
        assert.equal(await page.getByLabel('Result table check').locator('p.text-success-fg', { hasText: `you can register the model ${RESULT_TABLE}_model` }).count(), 1);
      }
      assert.deepEqual(ui.pageErrors, []);
    } finally {
      await ui.close();
    }
  }
});

test('a session that saves under /Shared says on Delivery that everyone can edit the MVP, without blocking it', async () => {
  const session = { business_name: 'Acme', discovery_type: 'Deep', catalogs: 'main', schemas_str: 's', tables_str: 'main.s.orders',
    generation_path: '/Shared/demos', inspire_database_name: 'main.inspire' };
  const ui = await openUi('wizard', { session });
  const { page } = ui;
  try {
    await toData(page);
    await toDelivery(page);
    const note = page.getByRole('note', { name: 'Where Inspire saves the MVP' });
    await note.waitFor();
    assert.match(await note.textContent(), /^Inspire saves this MVP under \/Workspace\/Shared\/demos\/acme_implemented\. Everyone in the workspace can edit/);
    assert.equal(await note.evaluate((el) => el.className.includes('text-warning-fg')), true);
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('every column role starts as Inspire\'s choice, a picked column is type-checked, and only the roles the user picked are sent', async () => {
  const columns = [{ column_name: 'order_id', data_type: 'STRING', ordinal_position: 1 }, { column_name: 'order_date', data_type: 'DATE', ordinal_position: 2 }];
  const ui = await openUi('wizard', { columns, me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  const role = (name) => page.locator('label').filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) }).locator('select');
  try {
    await toData(page);
    await advanced(page).click();
    await role('event date').locator('option[value="main.s.orders.order_date"]').waitFor({ state: 'attached' });
    for (const name of ['entity id', 'event date', 'measure', 'label', 'segment']) {
      assert.equal(await role(name).inputValue(), '', `${name} starts empty`);
      assert.equal(await role(name).evaluate((s) => s.selectedOptions[0]?.textContent), "Inspire's choice", name);
    }
    await role('event date').selectOption('main.s.orders.order_id');
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.ok((await footerErrors(page)).some((e) => e.includes('event date main.s.orders.order_id: pick a DATE or TIMESTAMP column')),
      (await footerErrors(page)).join(' | '));
    assert.equal(await page.locator('[aria-current="step"]').innerText(), '2. Data', 'a wrong type keeps the wizard on Data');
    await role('event date').selectOption('main.s.orders.order_date');
    await role('entity id').selectOption('main.s.orders.order_id');
    await role('event date').selectOption('');
    await toDelivery(page);
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.deepEqual(submittedSpec(made).data.column_roles, { entity_id: 'main.s.orders.order_id' },
      'a role set back to Inspire\'s choice is not sent');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('roles an older wizard guessed come back with the version, and one click sets every role back to Inspire\'s choice', async () => {
  const columns = [{ column_name: 'order_id', data_type: 'STRING', ordinal_position: 1 }, { column_name: 'order_date', data_type: 'DATE', ordinal_position: 2 }];
  const guessed = { ...builtSpec(), data: { ...builtSpec().data, column_roles: { entity_id: 'main.s.orders.order_date', event_date: 'main.s.orders.order_id' } } };
  const failed = built({
    status: 'failed', spec_json: JSON.stringify(guessed), result_rows: null, asset_status: null,
    dashboard_id: null, dashboard_url: null, genie_space_id: null, genie_space_url: null, app_name: null, app_url: null, alert_id: null, alert_url: null,
  });
  const ui = await openUi('wizard', { columns, me: { userName: OWNER, displayName: 'Owner' }, history: [failed] });
  const { page, made } = ui;
  const role = (name) => page.locator('label').filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) }).locator('select');
  const reset = page.getByRole('button', { name: "Reset roles to Inspire's choice", exact: true });
  try {
    await toData(page);
    await advanced(page).click();
    await role('event date').locator('option[value="main.s.orders.order_date"]').waitFor({ state: 'attached' });
    assert.equal(await role('entity id').inputValue(), 'main.s.orders.order_date', 'the earlier version\'s roles come back');
    assert.equal(await reset.count(), 1, 'a set role shows the reset');
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    const shown = await footerErrors(page);
    assert.ok(shown.some((e) => e.startsWith('entity id main.s.orders.order_date:')), shown.join(' | '));
    assert.ok(shown.includes("Reset roles to Inspire's choice, under Advanced settings, sets every role back at once"), shown.join(' | '));
    await reset.click();
    for (const name of ['entity id', 'event date', 'measure', 'label', 'segment']) {
      assert.equal(await role(name).inputValue(), '', `${name} is back to Inspire's choice`);
    }
    assert.equal(await reset.count(), 0, 'with every role on Inspire\'s choice there is nothing to reset');
    await toDelivery(page);
    await throughApp(page);
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.deepEqual(submittedSpec(made).data.column_roles, {}, 'the reset sends no role');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Next stops when the data to work with has no rows and says what to widen, and the count says what it leaves out', async () => {
  const columns = [{ column_name: 'order_id', data_type: 'STRING', ordinal_position: 1 }, { column_name: 'order_date', data_type: 'DATE', ordinal_position: 2 }];
  const ui = await openUi('wizard&discovery=Deep', { columns, readinessRows: [{ row_count: '0' }], me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  const eventDate = () => page.getByLabel('event date');
  try {
    await toData(page);
    await advanced(page).click();
    await eventDate().locator('option[value="main.s.returns.order_date"]').waitFor({ state: 'attached' });
    await eventDate().selectOption('main.s.orders.order_date');
    await page.getByLabel('Window start').fill('2026-10-26');
    await page.getByLabel('Window end').fill('2026-10-28');
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page),
      ['No rows to work with: main.s.orders has no rows inside the date window you picked. Widen or clear it under Advanced settings.']);
    assert.equal(await page.locator('[aria-current="step"]').innerText(), '2. Data', 'the wizard stays on Data');
    assert.equal(await advanced(page).getAttribute('aria-expanded'), 'true');
    const counted = made.sqlCalls.filter((c) => String(c.sql).startsWith('SELECT COUNT(*) AS row_count'));
    assert.equal(counted.length, 1);
    assert.ok(counted[0].sql.includes('`order_date` >= CAST(:wstart AS DATE)'), counted[0].sql);

    made.state.readinessRows = [{ row_count: '1200' }];
    await eventDate().selectOption('main.s.returns.order_date');
    await toDelivery(page);
    await page.getByText('Inspire found 1,200 rows to work with in main.s.orders. This count leaves out the date window on main.s.returns; the preview run applies it.').waitFor();
    assert.equal(made.jobs.length, 0);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('what blocks a step shows in the footer, opens Advanced on the field to fix, and clears as it is fixed', async () => {
  const ui = await openUi('wizard', { useCase: { ...HARNESS_USE_CASE, statement: '', sponsor: '' }, me: { userName: '', displayName: '' } });
  const { page, made } = ui;
  try {
    await toData(page);
    assert.deepEqual(await footerErrors(page), [], 'nothing is flagged before the person tries to move on');
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page), ['write the goal sentence', 'name the decision owner']);
    assert.equal(await advanced(page).getAttribute('aria-expanded'), 'true');
    await page.getByLabel('Goal sentence').fill('Cut churn in the top segment');
    await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"] p')].length === 1);
    assert.deepEqual(await footerErrors(page), ['name the decision owner']);
    await page.getByLabel('Decision owner').fill('Head of Retention');
    await toDelivery(page);
    await page.getByRole('checkbox', { name: /^Alert/ }).check();
    await page.getByText('Nobody gets it yet: add an email under Advanced settings.').waitFor();
    assert.equal(await advanced(page).getAttribute('aria-expanded'), 'false');
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page), ['an alert needs at least one recipient email or notification destination']);
    assert.equal(await advanced(page).getAttribute('aria-expanded'), 'true');
    assert.equal(made.jobs.length, 0);
    await page.getByLabel('Email recipients (comma separated)').fill(OWNER);
    await page.locator('[role="alert"]').waitFor({ state: 'detached' });
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.deepEqual(submittedSpec(made).outputs.alert_recipients, [OWNER]);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('an App name another App already uses offers the next name, and Implement waits until the name is free', async () => {
  const ui = await openUi('wizard', {
    me: { userName: OWNER, displayName: 'Owner' },
    appsByName: { 'inspire-hub-acme': { name: 'inspire-hub-acme', description: 'Sales forecasting tool' } },
  });
  const { page, made } = ui;
  try {
    await toData(page);
    await toDelivery(page);
    await page.getByRole('checkbox', { name: /^App / }).check();
    await next(page);
    await onStep(page, 'App placement');
    await page.getByText("'inspire-hub-acme' is used by another App in this workspace; pick another name.", { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Back' }).click();
    await onStep(page, 'Delivery');
    await throughApp(page);
    await toVibes(page);
    await page.locator('[role="alert"] p', { hasText: "App name: 'inspire-hub-acme' is used by another App in this workspace; pick another name (fix it on App placement)" }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Start MVP', exact: true }).isDisabled(), true);
    for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Back' }).click();
    await onStep(page, 'App placement');
    await page.getByRole('button', { name: 'Use inspire-hub-acme-2' }).click();
    assert.equal(await page.getByLabel('App name').inputValue(), 'inspire-hub-acme-2');
    await page.getByText("'inspire-hub-acme-2' is free").waitFor();
    await next(page);
    await onStep(page, 'App access');
    await page.getByRole('radio', { name: /^Internal data/ }).check();
    await next(page);
    await onStep(page, 'App look');
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.equal(submittedSpec(made).outputs.app_name, 'inspire-hub-acme-2');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Change swaps a table for a similar one or drops it, and never offers to drop the primary table', async () => {
  const ui = await openUi('wizard', {
    me: { userName: OWNER, displayName: 'Owner' },
    swapRows: [{ table_schema: 's2', table_name: 'orders_v2', matched: '5', total: '6' }],
  });
  const { page, made } = ui;
  try {
    await toData(page);
    const row = (table) => page.locator(`[data-table="${table}"]`);
    await row('main.s.orders').getByRole('button', { name: 'Change' }).click();
    const ordersPick = page.getByLabel('Table to use for main.s.orders');
    await page.waitForFunction(() => [...document.querySelectorAll('option')].some((o) => o.textContent === 'main.s2.orders_v2 (5 of 6 columns match)'));
    const drop = ordersPick.locator('option', { hasText: "Don't use this table" });
    assert.equal(await drop.textContent(), "Don't use this table (the primary table can be swapped, not removed)");
    assert.equal(await drop.isDisabled(), true);
    await ordersPick.selectOption('main.s2.orders_v2');
    await row('main.s.orders').getByText('main.s2.orders_v2', { exact: true }).waitFor();
    await row('main.s.orders').getByText('instead of main.s.orders').waitFor();
    await row('main.s.returns').getByRole('button', { name: 'Change' }).click();
    await page.getByLabel('Table to use for main.s.returns').selectOption('__remove__');
    await page.getByText('Removed main.s.returns.', { exact: false }).waitFor();
    await row('main.s.returns').getByRole('button', { name: 'Use it again' }).waitFor();
    await toDelivery(page);
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const spec = submittedSpec(made);
    assert.deepEqual(spec.data.tables, { 'main.s.orders': 'main.s2.orders_v2' });
    assert.deepEqual(spec.data.removed_tables, ['main.s.returns']);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

const NOTEBOOK_PATH = '/Users/owner@example.com/inspire/Acme/N01-U01';

test('the Build page has two views and opens a ready MVP on the Control Tower, with the notebook tile first and a Details drawer per output that shows what its old tab showed', async () => {
  const ui = await openUi('implement', { ...STUDIO_STATE, useCase: { ...HARNESS_USE_CASE, has_genie_code: 'Y', notebook_path: NOTEBOOK_PATH } });
  const { page } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await statusLoaded(page);
    const listed = page.getByRole('navigation', { name: 'Use cases' });
    await listed.getByRole('region', { name: 'Ready' }).getByText('MVP ready', { exact: true }).waitFor();
    assert.equal(await listed.locator('[aria-current="true"]').innerText().then((t) => t.includes(HARNESS_USE_CASE.Name)), true);
    const tabs = page.getByRole('tablist', { name: 'MVP views' }).getByRole('tab');
    assert.deepEqual(await tabs.allTextContents(), ['Progress', 'Control Tower']);
    for (const gone of ['Dashboard', 'Genie', 'App', 'Alert', 'History', 'Edit', 'Results']) {
      assert.equal(await page.getByRole('tab', { name: gone, exact: true }).count(), 0, `no ${gone} tab`);
    }
    assert.deepEqual(await tabs.evaluateAll((els) => els.map((t) => t.getAttribute('aria-selected'))), ['false', 'true'], 'a ready MVP opens on the Control Tower');
    const panelId = await tabs.nth(1).getAttribute('aria-controls');
    assert.equal(await page.locator(`[id="${panelId}"]`).getAttribute('role'), 'tabpanel');
    assert.equal(await page.locator(`[id="${panelId}"]`).getAttribute('aria-labelledby'), await tabs.nth(1).getAttribute('id'));
    assert.equal(await page.getByRole('tabpanel').count(), 1, 'only the chosen view shows');
    assert.equal(await page.getByRole('region', { name: 'Build failed' }).count(), 0, 'a ready build has no failed banner');

    const tower = towerOf(page);
    assert.deepEqual(await tower.locator('[data-tile]').evaluateAll((els) => els.map((e) => e.dataset.tile)), ['notebook', 'dashboard', 'genie_space', 'app', 'alert'],
      'the Genie Code notebook tile comes first');
    const notebookTile = tower.locator('[data-tile="notebook"]');
    await notebookTile.getByText('Notebook ready', { exact: true }).waitFor();
    await notebookTile.getByText(NOTEBOOK_PATH, { exact: true }).waitFor();
    assert.equal(await notebookTile.getByRole('link', { name: 'Open the notebook', exact: true }).getAttribute('href'),
      `https://workspace.example.com/#workspace/Workspace${NOTEBOOK_PATH}`);
    assert.equal(await page.locator('[data-implement-page] section[aria-label="Use case"] > div').first().getByText(NOTEBOOK_PATH).count(), 0,
      'the notebook left the header');
    for (const label of ['Genie Code notebook', 'Dashboard', 'Genie Agent', 'App', 'Alert']) {
      assert.equal(await tower.getByRole('button', { name: `${label} details`, exact: true }).count(), 1, `${label} has its Details`);
    }
    await shot(page, 'control-tower-ready');

    await tabs.nth(1).focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await selectedTab(page), 'Progress', 'the arrow keys move between the two tabs');
    assert.equal(await focusedName(page), 'Progress');
    await page.getByRole('progressbar', { name: 'Build progress' }).waitFor();
    assert.equal(await towerOf(page).count(), 0);
    await page.keyboard.press('ArrowRight');
    assert.equal(await selectedTab(page), 'Control Tower');
    await page.keyboard.press('ArrowRight');
    assert.equal(await selectedTab(page), 'Progress', 'the arrows wrap');
    await page.keyboard.press('End');
    assert.equal(await selectedTab(page), 'Control Tower');
    assert.equal(await focusedName(page), 'Control Tower');

    let drawer = await openDetails(page, 'Genie Code notebook');
    await drawer.getByText(NOTEBOOK_PATH, { exact: true }).waitFor();
    await drawer.getByText('Notebook ready', { exact: true }).waitFor();
    assert.equal(await drawer.getByRole('link', { name: 'Open the notebook', exact: true }).getAttribute('href'),
      `https://workspace.example.com/#workspace/Workspace${NOTEBOOK_PATH}`);
    await closeDetails(page, drawer);

    drawer = await openDetails(page, 'Dashboard');
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), true, 'the focus moves into the drawer');
    assert.equal(await drawer.getAttribute('aria-modal'), 'true');
    await drawer.getByText('The decision list, trend and run health Genie built').waitFor();
    assert.equal(await drawer.getByRole('link', { name: 'Open dashboard' }).getAttribute('href'), 'https://workspace.example.com/dashboardsv3/d1/published');
    await closeDetails(page, drawer);
    assert.equal(await focusedName(page), 'Dashboard details', 'Escape gives the focus back to Details');

    drawer = await openDetails(page, 'Genie Agent');
    await drawer.getByText('Sample questions in the Genie Agent').waitFor();
    assert.deepEqual(await drawer.locator('ul.list-disc li > span').allTextContents(), ['Which customers should we call first?', 'How many customers are in Act now?']);
    assert.deepEqual(await drawer.locator('ul.list-disc li').evaluateAll((items) => items.map((li) => li.querySelector('p')?.textContent || '')),
      ['', 'The rows are accounts, so it counts accounts in Act now.']);
    await drawer.getByText('Inspire checked the Genie Agent with: Which customers should we call first?').waitFor();
    await drawer.getByText(`SELECT entity_id FROM ${RESULT_TABLE} ORDER BY rank LIMIT 10`).waitFor();
    await shot(page, 'details-drawer-genie-agent', false);
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await drawer.waitFor({ state: 'detached' });
    assert.equal(await focusedName(page), 'Genie Agent details', 'the close button gives the focus back to Details');

    drawer = await openDetails(page, 'App');
    const appRows = await drawer.locator('table tr').evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent)));
    assert.deepEqual(appRows.slice(0, 3), [
      ['App', 'RUNNING: App is running'],
      ['Compute', 'ACTIVE'],
      ['Last deployment', 'SUCCEEDED: App started successfully (2026-10-25T04:10:00Z)'],
    ]);
    assert.ok(appRows.some(([label]) => label === 'Health check'));
    assert.deepEqual(appRows.find(([label]) => label === 'Built on'), ['Built on', 'v1']);
    assert.equal(await drawer.getByRole('link', { name: 'Open App' }).getAttribute('href'), 'https://churn-desk-1.aws.databricksapps.com');
    await closeDetails(page, drawer);

    drawer = await openDetails(page, 'Alert');
    await drawer.getByText('Fires when: Act now rows in the latest run >= 1').waitFor();
    await drawer.getByText(`Notifies: ${OWNER}`).waitFor();
    await drawer.getByText('Subscribers on the job task: 1').waitFor();
    await drawer.getByText('Last check: OK').waitFor();
    await drawer.getByText('Preview re-runs never send it.', { exact: false }).waitFor();
    await page.locator('[data-details-drawer] > button[aria-label="Close the Alert details"]').click({ position: { x: 80, y: 400 } });
    await drawer.waitFor({ state: 'detached' });

    const toggle = historyToggle(page);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'History starts collapsed');
    assert.match(await toggle.innerText(), /1 spec version · 2 job runs/);
    assert.equal(await historyPane(page).getByText('v1 · ready · initial').isVisible(), false);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`).isVisible(), true);
    await page.getByText('v1 · ready · initial').waitFor();
    await page.getByText('SUCCESS · preview · started by hand').waitFor();
    await page.getByText('FAILED · full (job default) · scheduled').waitFor();
    await page.getByText('Workload failed').waitFor();
    assert.equal(await page.getByRole('link', { name: 'Open run' }).first().getAttribute('href'), 'https://workspace.example.com/#job/77/run/9001');
    await toggle.click();
    assert.equal(await historyPane(page).getByText('v1 · ready · initial').isVisible(), false, 'History folds again');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a quick re-run is a preview that sends only the widgets the person changed and never the result table', async () => {
  const ui = await openUi('implement', STUDIO_STATE);
  const { page, made } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const quick = runPane(page);
    const rerun = quick.getByRole('button', { name: 'Preview re-run' });
    await rerun.waitFor();
    await quick.getByPlaceholder('25').waitFor();
    const ownText = (labels) => labels.map((l) => [...l.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim());
    assert.deepEqual(await quick.locator('label').evaluateAll(ownText), ['Top K', 'Schedule on']);
    assert.equal(await quick.locator('label', { hasText: 'Top K' }).locator('span').textContent(), 'whole number, at least 1');
    await quick.getByPlaceholder('25').fill(' 10 ');
    await rerun.click();
    await until(() => made.fetches.some((f) => f.path === '/api/2.1/jobs/run-now'), 'the run-now call');
    const body = JSON.parse(made.fetches.find((f) => f.path === '/api/2.1/jobs/run-now').opts.body);
    assert.equal(body.job_id, 77);
    assert.deepEqual(body.notebook_params, { top_k: '10', run_profile: 'preview' });
    assert.equal(made.jobs.length, 0);
    assert.equal(made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO')).length, 0);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a version that ended with a warning says why under its status, and a ready one stays quiet', async () => {
  const why = 'Decision list: no row of the latest run reached Act now or Review (1000 Monitor), so it has nobody to act on yet; '
    + "the run's output says why, such as a model that missed its acceptance check: https://workspace.example.com/jobs/77/runs/9001";
  const warned = await openUi('implement', { ...STUDIO_STATE, history: [built({ status: 'ready_with_warnings', status_message: why })] });
  try {
    await warned.page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await statusLoaded(warned.page);
    assert.equal(await selectedTab(warned.page), 'Control Tower', 'a build that ended with warnings opens on the Control Tower');
    assert.equal(await warned.page.getByRole('region', { name: 'Build failed' }).count(), 0, 'warnings are not a failed build');
    await studioTab(warned.page, 'Progress');
    const chip = warned.page.locator('p', { hasText: /^Warnings$/ }).first();
    await chip.waitFor();
    assert.equal(await chip.evaluate((p) => p.nextElementSibling?.textContent), why);
    assert.deepEqual(warned.pageErrors, []);
  } finally {
    await warned.close();
  }
  const ready = await openUi('implement', { ...STUDIO_STATE, history: [built({ status_message: 'ready: preview wrote 3 row(s)' })] });
  try {
    await ready.page.getByRole('tab', { name: 'Progress', exact: true }).click();
    await ready.page.locator('p', { hasText: /^Ready$/ }).first().waitFor();
    assert.equal(await ready.page.getByText('ready: preview wrote 3 row(s)').count(), 0);
  } finally {
    await ready.close();
  }
});

test('a version whose run stopped reads as Stopped with the reason and the run, and Edit and the schedule work again', async () => {
  const stopped = built({ spec_version: 2, status: 'filling', status_message: 'filling: v2', implement_run_id: '5555555555555555',
    updated_at: new Date().toISOString() });
  const run = { run_id: 5555555555555555, run_page_url: 'https://workspace.example.com/#job/77/run/5555555555555555',
    state: { life_cycle_state: 'TERMINATED', result_state: 'CANCELED', state_message: 'Run cancelled' } };
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [stopped, built()], implementRun: run });
  const { page } = ui;
  const why = 'the run building v2 ended (CANCELED: Run cancelled) while v2 was still filling. Edit submits a new version.';
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const failed = page.getByRole('region', { name: 'Build failed' });
    await failed.getByText(why, { exact: true }).waitFor();
    assert.equal(await selectedTab(page), 'Control Tower', 'a stopped build opens on the Control Tower');
    assert.equal(await failed.locator('p').first().innerText(), 'The build stopped');
    await failed.getByRole('button', { name: 'See the build' }).click();
    assert.equal(await selectedTab(page), 'Progress');
    const chip = page.locator('p', { hasText: /^Stopped$/ }).first();
    await chip.waitFor();
    assert.equal(await chip.evaluate((p) => p.nextElementSibling?.textContent), why);
    assert.equal(await page.getByRole('link', { name: 'Open the run that stopped' }).getAttribute('href'), run.run_page_url);
    await page.getByRole('navigation', { name: 'Use cases' }).getByRole('region', { name: 'Failed' }).getByText('MVP stopped', { exact: true }).waitFor();
    await studioTab(page, 'Control Tower');
    assert.equal(await runPane(page).getByRole('button', { name: 'Edit the MVP' }).isEnabled(), true);
    assert.equal(await page.getByRole('checkbox', { name: 'Schedule on' }).isEnabled(), true);
    await openHistory(page);
    await page.getByText('v2 · stopped before it finished · initial').waitFor();
    await page.getByText('v1 · ready · initial').waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const busy = await openUi('implement', { ...STUDIO_STATE, history: [stopped, built()],
    implementRun: { run_id: 5555555555555555, state: { life_cycle_state: 'RUNNING' } } });
  try {
    await busy.page.locator('p', { hasText: /^filling$/ }).first().waitFor();
    assert.equal(await selectedTab(busy.page), 'Progress', 'a running build opens on Progress');
    await busy.page.getByRole('navigation', { name: 'Use cases' }).getByRole('region', { name: 'In progress' }).getByText('MVP running', { exact: true }).waitFor();
    await studioTab(busy.page, 'Control Tower');
    assert.equal(await busy.page.getByRole('button', { name: 'Edit applies after this run' }).isEnabled(), false);
    assert.equal(await busy.page.getByRole('checkbox', { name: 'Schedule on' }).isEnabled(), false);
    assert.equal(await busy.page.getByText('Open the run that stopped').count(), 0);
    assert.equal(await busy.page.getByRole('region', { name: 'Build failed' }).count(), 0, 'a running build has no failed banner');
    assert.deepEqual(busy.pageErrors, []);
  } finally {
    await busy.close();
  }
});

const stepRow = (phase, status, time) => ({
  stage_name: 'Implement Use Cases', step_id: phase.length, step_name: `Inspire is working on ${phase.toLowerCase()}`, sub_step_name: 'Completed: n01-u01',
  status, last_updated: `2026-10-26T${time}.000Z`, result_json: JSON.stringify({ use_case_id: 'N01-U01', phase }),
});

const genieLogLine = (second, words) => `2026-10-26 10:${String(Math.floor(second / 60)).padStart(2, '0')}:${String(second % 60).padStart(2, '0')}`
  + ` - inspire - INFO - [GENIE N01-U01] [build] Genie: ${words}`;
const logText = (lines) => `${lines.join('\n')}\n`;

test('while Genie builds, a log read mid-copy never empties the message box or shows cut-off words', async () => {
  const said = (i) => `Check ${i}: I profiled the pickup zones and the hourly demand before the forecast.`;
  const first = Array.from({ length: 6 }, (_, i) => genieLogLine(i, said(i)));
  const building = built({ status: 'building_outputs', status_message: 'building outputs', implement_run_id: '5555555555555555', updated_at: new Date().toISOString() });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [building], liveLog: logText(first),
    implementRun: { run_id: 5555555555555555, state: { life_cycle_state: 'RUNNING' } } });
  const { page, made } = ui;
  const box = page.getByRole('log', { name: "Genie's messages" });
  const polled = () => page.waitForResponse((r) => r.url().includes('/api/inspire/implement/status'), { timeout: 20000 });
  const twoPolls = async () => { await polled(); await polled(); await page.waitForTimeout(300); };
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await box.getByText(said(5)).waitFor();
    made.state.liveLog = '';
    await twoPolls();
    for (let i = 0; i < 6; i += 1) assert.ok((await box.innerText()).includes(said(i)), `an empty read keeps message ${i}`);
    const next = genieLogLine(20, 'Next I am writing the forecast table and its confidence band.');
    made.state.liveLog = `${logText(first)}${next.slice(0, next.length - 25)}`;
    await twoPolls();
    const text = await box.innerText();
    assert.ok(text.includes(said(5)), 'a cut-off read keeps what was there');
    assert.ok(!text.includes('Next I am writing'), 'the line the agent is still writing waits for the next poll');
    made.state.liveLog = logText([...first, next]);
    await box.getByText('Next I am writing the forecast table and its confidence band.').waitFor({ timeout: 20000 });
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the Progress tab keeps Genie\'s messages in a tall box the person can drag taller, that scrolls as they arrive, types them out, and never shows log lines or JSON', async () => {
  const said = (i) => `Step ${i}: I'm checking the notebook instructions and the Databricks workflow before I build the dashboard.`;
  const first = Array.from({ length: 24 }, (_, i) => genieLogLine(i, said(i)));
  first.push(genieLogLine(30, JSON.stringify({ status: 'built', summary: 'Built the dashboard and checked every tile.', files: ['x.py'] })));
  first.push(genieLogLine(31, 'I ran it once with `run_profile=preview` and the **preview run** passed.'));
  const building = built({ status: 'building_outputs', status_message: 'building outputs', implement_run_id: '5555555555555555', updated_at: new Date().toISOString() });
  const steps = [stepRow('Plan', 'ended_success', '10:01:00'), stepRow('Instruction', 'started', '10:01:05'),
    stepRow('Instruction', 'ended_success', '10:03:50'), stepRow('Genie build', 'started', '10:04:05')];
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [building], liveLog: logText(first), steps,
    implementRun: { run_id: 5555555555555555, state: { life_cycle_state: 'RUNNING' } } });
  const { page, made } = ui;
  const box = page.getByRole('log', { name: "Genie's messages" });
  const metrics = () => box.evaluate((el) => ({
    height: el.offsetHeight, scroll: el.scrollHeight, gap: el.scrollHeight - el.scrollTop - el.clientHeight,
    page: document.scrollingElement.scrollHeight, y: window.scrollY,
  }));
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await box.getByText('Built the dashboard and checked every tile.').waitFor();
    await page.locator('[data-stage-state="done"]', { hasText: '2m 45s' }).waitFor();
    assert.equal(await selectedTab(page), 'Progress', 'a running build opens on Progress');
    assert.equal(await towerOf(page).count(), 0, 'the Control Tower waits behind its tab while Genie builds');
    const text = await box.innerText();
    assert.ok(text.includes(said(23)), 'messages already in the log show at once');
    for (const raw of ['[GENIE', '[build]', 'Genie: ', '{"status"', '"summary"', 'x.py', '`', '**']) assert.ok(!text.includes(raw), `the box never shows ${raw}`);
    assert.equal(await box.locator('code', { hasText: 'run_profile=preview' }).count(), 1, "Genie's inline code reads as code");
    assert.equal(await box.locator('strong', { hasText: 'preview run' }).count(), 1, "Genie's bold reads as bold");
    assert.ok(await box.locator('svg').count() >= 25, 'every Genie message carries the Genie logo');
    assert.equal(await page.getByRole('progressbar', { name: 'Build progress' }).isVisible(), true);
    assert.equal(await page.locator('[data-genie-working]').isVisible(), true, 'a working row shows while Genie builds');
    const before = await metrics();
    assert.equal(before.height, 576, 'the box opens 36rem tall');
    assert.equal(await box.evaluate((el) => getComputedStyle(el).resize), 'vertical', 'the person can drag it taller or shorter');
    assert.ok(before.scroll > before.height, 'the messages scroll inside the box');
    assert.ok(before.gap < 48, 'the box opens on the latest message');

    const later = Array.from({ length: 12 }, (_, i) => genieLogLine(40 + i, `Now wiring tile ${i} of the Drivers page with its own query and a short caption.`));
    made.state.liveLog = logText([...first, ...later]);
    await page.locator('[data-genie-feed] .animate-cursor-blink').waitFor({ timeout: 20000 });
    await box.getByText('Now wiring tile 11 of the Drivers page with its own query and a short caption.').waitFor({ timeout: 30000 });
    const after = await metrics();
    assert.equal(after.height, 576, 'new messages never change its height');
    assert.ok(after.scroll > before.scroll, 'new messages land inside the box');
    assert.ok(after.gap < 48, 'the box follows new messages to the bottom');
    assert.equal(after.page, before.page, 'the page does not grow as messages arrive');
    assert.equal(after.y, before.y, 'the page does not scroll as messages arrive');
    await box.scrollIntoViewIfNeeded();
    const edge = await box.boundingBox();
    await page.mouse.move(edge.x + edge.width - 3, edge.y + edge.height - 3);
    await page.mouse.down();
    await page.mouse.move(edge.x + edge.width - 3, edge.y + edge.height + 400, { steps: 8 });
    await page.mouse.up();
    const dragged = await metrics();
    assert.ok(dragged.height > 576 && dragged.height <= 850, `the drag makes it taller, up to 85% of the screen (${dragged.height})`);
    await shot(page, 'progress-running');
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const progress = await lowContrast(page, ['[data-mvp-progress]', '[data-genie-feed]']);
      assert.ok(progress.checked >= 20, `measured ${progress.checked} progress elements`);
      assert.deepEqual(progress.low, [], dark ? 'dark Progress tab' : 'light Progress tab');
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

const FAILED_REASON = 'Genie stopped the build: No approved model yet: candidate precision 0.455 was below baseline precision 0.527.';
const NOTHING_BUILT = { result_rows: null, asset_status: null, dashboard_id: null, dashboard_url: null, genie_space_id: null, genie_space_url: null,
  app_name: null, app_url: null, alert_id: null, alert_url: null };

test('a failed build opens on the Control Tower under a red banner with the failed step and the reason, See the build opens Progress, and Edit opens the wizard', async () => {
  const failed = built({ status: 'failed', status_message: FAILED_REASON, ...NOTHING_BUILT });
  const steps = [stepRow('Plan', 'ended_success', '10:01:00'), stepRow('Instruction', 'ended_success', '10:03:50'), stepRow('Genie Code', 'ended_success', '10:04:00'),
    stepRow('Genie build', 'started', '10:04:05'), stepRow('Genie build', 'ended_error', '10:20:00')];
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [failed], steps, me: { userName: OWNER, displayName: 'Owner' } });
  const { page } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const tower = towerOf(page);
    const banner = tower.getByRole('region', { name: 'Build failed' });
    await banner.getByText('Step: Genie builds the notebook', { exact: true }).waitFor();
    assert.equal(await selectedTab(page), 'Control Tower', 'a failed build opens on the Control Tower');
    assert.deepEqual(await banner.locator('p').allInnerTexts(),
      ['The build failed', 'Step: Genie builds the notebook', FAILED_REASON, buildAgainHint({ spec_version: 1 })]);
    assert.deepEqual((await banner.getByRole('button').allInnerTexts()).map((t) => t.trim()), ['Build again', 'See the build', 'Edit the MVP']);
    const top = async (locator) => (await locator.boundingBox()).y;
    assert.ok(await top(banner) < await top(tower.locator('[data-tile]').first()), 'the banner sits at the top of the Control Tower, above the tiles');
    assert.match(await banner.evaluate((el) => el.className), /bg-error-bg/);
    await shot(page, 'control-tower-failed');

    await banner.getByRole('button', { name: 'See the build' }).click();
    assert.equal(await selectedTab(page), 'Progress');
    assert.equal(await focusedName(page), 'Progress', 'the focus lands on the Progress tab');
    await page.locator('[data-stage-state="error"]', { hasText: 'Genie builds the notebook' }).waitFor();
    const chip = page.locator('p', { hasText: /^Failed$/ }).first();
    assert.equal(await chip.evaluate((p) => p.nextElementSibling?.textContent), FAILED_REASON);
    assert.equal(await page.getByRole('region', { name: 'Build failed' }).count(), 0, 'the banner belongs to the Control Tower');

    await studioTab(page, 'Control Tower');
    await tower.getByRole('region', { name: 'Build failed' }).getByRole('button', { name: 'Edit the MVP' }).click();
    await onStep(page, 'Choose');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Build again on a failed build sends the version that failed again as the next one, with its asks, and a notebook edit keeps its own rebuild', async () => {
  const spec = builtSpec();
  const vibe = 'Put the riskiest customers first';
  const failed = built({ spec_version: 2, status: 'failed', status_message: FAILED_REASON, change_classes: 'vibe',
    spec_json: JSON.stringify({ ...spec, based_on_version: 1, vibes: vibe, vibe_previous: 'keep' }) });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [failed, built()] });
  const { page, made } = ui;
  try {
    const banner = towerOf(page).getByRole('region', { name: 'Build failed' });
    await banner.getByText(buildAgainHint({ spec_version: 2 }), { exact: true }).waitFor();
    const again = banner.getByRole('button', { name: 'Build again' });
    assert.match(await again.evaluate((el) => el.className), /bg-db-red-solid/, 'Build again is the main way forward');
    assert.doesNotMatch(await banner.getByRole('button', { name: 'Edit the MVP' }).evaluate((el) => el.className), /bg-db-red-solid/);
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(300);
      const seen = await lowContrast(page, ['section[aria-label="Build failed"]']);
      assert.ok(seen.checked >= 5, `measured ${seen.checked} banner elements`);
      assert.deepEqual(seen.low, [], dark ? 'dark banner' : 'light banner');
    }
    assert.equal(made.jobs.length, 0);
    await again.click();
    await until(() => made.jobs.length === 1, 'the Build again run');
    const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(inserts.length, 1);
    const value = (name) => inserts[0].parameters.find((p) => p.name === name).value;
    assert.deepEqual([value('v'), value('based'), value('classes')], ['3', '2', 'vibe']);
    const sent = JSON.parse(value('spec'));
    assert.deepEqual([sent.vibes, sent.vibe_previous, sent.based_on_version], [vibe, 'keep', 2], 'the ask of the failed version goes again');
    assert.equal(made.jobs[0].params.inspire_implement_spec_version, '3');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const edited = await openUi('implement', { ...STUDIO_STATE, history: [editedVersion(), built()] });
  try {
    const banner = towerOf(edited.page).getByRole('region', { name: 'Build failed' });
    await banner.getByRole('button', { name: 'Edit the MVP' }).waitFor();
    assert.equal(await banner.getByRole('button', { name: 'Build again' }).count(), 0, 'a hand-edited notebook keeps its own rebuild');
    assert.match(await banner.getByRole('button', { name: 'Edit the MVP' }).evaluate((el) => el.className), /bg-db-red-solid/);
    assert.deepEqual(edited.pageErrors, []);
  } finally {
    await edited.close();
  }
});

test('the view follows the build: Progress while it runs, the Control Tower once it ends, Progress when a new version starts, and a click in between stays', async () => {
  const run = { run_id: 5555555555555555, state: { life_cycle_state: 'RUNNING' } };
  const building = (v) => built({ spec_version: v, status: 'building_outputs', status_message: 'building outputs', implement_run_id: String(run.run_id),
    updated_at: new Date().toISOString() });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [building(2), built()], implementRun: run });
  const { page, made } = ui;
  const polled = () => page.waitForResponse((r) => r.url().includes('/api/inspire/implement/status'), { timeout: 20000 });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await page.getByRole('progressbar', { name: 'Build progress' }).waitFor();
    assert.equal(await selectedTab(page), 'Progress', 'the build runs');

    made.state.history = [built({ spec_version: 2 }), built()];
    await towerOf(page).waitFor({ timeout: 25000 });
    assert.equal(await selectedTab(page), 'Control Tower', 'the build ended');

    made.state.history = [building(3), built({ spec_version: 2 }), built()];
    await page.getByRole('progressbar', { name: 'Build progress' }).waitFor({ timeout: 25000 });
    assert.equal(await selectedTab(page), 'Progress', 'a new version started');

    await studioTab(page, 'Control Tower');
    await polled();
    await polled();
    assert.equal(await selectedTab(page), 'Control Tower', 'the click stays while the build keeps running');
    await openHistory(page);
    await page.getByText('v3 · building_outputs · initial').waitFor();

    made.state.history = [built({ spec_version: 3 }), built({ spec_version: 2 }), built()];
    await page.getByText('v3 · ready · initial').waitFor({ timeout: 25000 });
    assert.equal(await selectedTab(page), 'Control Tower', 'the build ended while the Control Tower was open');
    await studioTab(page, 'Progress');
    await polled();
    assert.equal(await selectedTab(page), 'Progress', 'a click after the build stays too');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('an App that wanted Lakebase and fell back to Delta tables says so on its tile, and Switch to Lakebase rebuilds only the App', async () => {
  const assets = JSON.parse(built().asset_status);
  const spec = builtSpec();
  const fallback = 'App: it reads Delta tables, so its pages take a few seconds to load, because Inspire could not set up Lakebase: no capacity.';
  const fell = built({
    spec_version: 2, status: 'ready_with_warnings', status_message: fallback,
    spec_json: JSON.stringify({ ...spec, outputs: { ...spec.outputs, app_access: 'sp', app_backend: 'lakebase' } }),
    asset_status: JSON.stringify({ ...assets, app: { ...assets.app, backend: 'delta', warnings: [fallback] } }),
  });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [fell] });
  const { page, made } = ui;
  try {
    const tile = towerOf(page).locator('[data-tile="app"]');
    await tile.locator('[data-app-backend]').waitFor();
    assert.equal(await tile.locator('[data-app-backend]').innerText(), 'Reads Delta tables: pages take a few seconds to load');
    await tile.getByRole('list', { name: 'App warnings' }).getByText(fallback).waitFor();
    for (const id of ['dashboard', 'genie_space', 'alert']) {
      assert.equal(await towerOf(page).locator(`[data-tile="${id}"]`).getByRole('button', { name: 'Switch to Lakebase' }).count(), 0, id);
    }
    await tile.getByRole('button', { name: 'Switch to Lakebase' }).click();
    await until(() => made.jobs.length === 1, 'the Lakebase rebuild run');
    const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(inserts.length, 1);
    const sent = JSON.parse(inserts[0].parameters.find((p) => p.name === 'spec').value);
    assert.deepEqual([sent.retry_outputs, sent.outputs.app_backend], [['app'], 'lakebase']);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('an App on Lakebase says so on its tile and offers no switch', async () => {
  const assets = JSON.parse(built().asset_status);
  const spec = builtSpec();
  const onLakebase = built({
    spec_json: JSON.stringify({ ...spec, outputs: { ...spec.outputs, app_access: 'sp', app_backend: 'lakebase' } }),
    asset_status: JSON.stringify({ ...assets, app: { ...assets.app, backend: 'lakebase' } }),
  });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [onLakebase] });
  const { page } = ui;
  try {
    const tile = towerOf(page).locator('[data-tile="app"]');
    await tile.locator('[data-app-backend]').waitFor();
    assert.equal(await tile.locator('[data-app-backend]').innerText(), 'Reads Lakebase: pages load instantly');
    assert.equal(await tile.getByRole('button', { name: 'Switch to Lakebase' }).count(), 0);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the picked view sticks to its use case: Progress picked on one MVP is still open after looking at another use case', async () => {
  const useCases = [
    { ...HARNESS_USE_CASE, _domain: 'Retention' },
    { id: 'N01-U02', Name: 'Forecast demand', use_case: 'Forecast demand', _domain: 'Supply', statement: 'Plan stock a week ahead',
      primary_table: 'main.s.orders', tables_involved: 'main.s.orders' },
  ];
  const ui = await openUi('implement', { ...STUDIO_STATE, useCases });
  const { page } = ui;
  const nav = page.getByRole('navigation', { name: 'Use cases' });
  try {
    await page.getByRole('heading', { name: 'Predict churn', exact: true }).waitFor();
    await towerOf(page).waitFor();
    assert.equal(await selectedTab(page), 'Control Tower', 'a ready MVP opens on the Control Tower');
    await studioTab(page, 'Progress');
    assert.equal(await selectedTab(page), 'Progress');

    await nav.getByRole('button', { name: /Forecast demand/ }).click();
    await page.getByRole('heading', { name: 'Forecast demand', exact: true }).waitFor();
    await nav.getByRole('button', { name: /Predict churn/ }).click();
    await page.getByRole('heading', { name: 'Predict churn', exact: true }).waitFor();
    await page.getByRole('tablist', { name: 'MVP views' }).waitFor();
    assert.equal(await selectedTab(page), 'Progress', 'the view picked on Predict churn is still open');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a failed output offers its own retry, which submits the next version that rebuilds only that output', async () => {
  const assets = JSON.parse(built().asset_status);
  const warned = built({
    spec_version: 2, status: 'ready_with_warnings', status_message: 'Genie Agent: space create 403',
    asset_status: JSON.stringify({ ...assets, genie_space: { state: 'failed', error: 'space create 403', spec_version: 1 } }),
  });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [warned] });
  const { page, made } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await page.getByText('The Genie Agent failed.', { exact: false }).waitFor();
    assert.equal(await page.getByText('Retry on the Edit tab').count(), 0, 'no pointer names a tab that is gone');
    const tower = towerOf(page);
    await tower.locator('[data-tile="genie_space"]').getByRole('button', { name: 'Retry the Genie Agent' }).waitFor();
    const retried = [];
    for (const id of ['dashboard', 'genie_space', 'app', 'alert']) {
      if (await tower.locator(`[data-tile="${id}"]`).getByRole('button', { name: /^Retry the / }).count()) retried.push(id);
    }
    assert.deepEqual(retried, ['genie_space'], 'only the failed output\'s tile offers a retry');
    assert.equal(await tower.locator('[data-tile="genie_space"]').getByRole('button', { name: 'Retry the Genie Agent' }).getAttribute('title'), 'space create 403');
    await studioTab(page, 'Progress');
    await page.getByRole('button', { name: 'Open the Genie Agent details', exact: true }).click();
    assert.equal(await selectedTab(page), 'Control Tower', 'the banner opens the drawer on the Control Tower');
    const genie = page.getByRole('dialog', { name: 'Genie Agent details', exact: true });
    await genie.getByText('The Genie Agent failed on v1: space create 403').waitFor();
    await genie.getByRole('button', { name: 'Retry the Genie Agent' }).waitFor();
    await closeDetails(page, genie);
    assert.equal(await focusedName(page), 'Open the Genie Agent details', 'closing gives the focus back to the banner');
    const app = await openDetails(page, 'App');
    await app.locator('table tr').first().waitFor();
    assert.equal(await app.getByText(/failed on v1/).count(), 0, 'only the failed output\'s drawer shows its failure');
    await closeDetails(page, app);
    assert.equal(made.jobs.length, 0);

    const retries = runPane(page).getByRole('button', { name: /^Retry the / });
    await retries.first().waitFor();
    assert.deepEqual((await retries.allTextContents()).map((t) => t.trim()), ['Retry the Genie Agent']);
    await retries.first().click();
    await until(() => made.jobs.length === 1, 'the retry implement run');
    const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(inserts.length, 1);
    const value = (name) => inserts[0].parameters.find((p) => p.name === name).value;
    assert.deepEqual([value('v'), value('based'), value('classes')], ['3', '2', 'retry']);
    const spec = JSON.parse(value('spec'));
    assert.deepEqual(spec.retry_outputs, ['genie_space']);
    assert.deepEqual(
      { dashboard: spec.outputs.dashboard, genie_space: spec.outputs.genie_space, app: spec.outputs.app, alert: spec.outputs.alert },
      { dashboard: true, genie_space: true, app: true, alert: true },
    );
    assert.equal(made.jobs[0].params['15_operation'], 'Implement Use Cases');
    assert.equal(made.jobs[0].params.inspire_implement_spec_version, '3');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a retry of a version that wrote to the old shared result table another use case holds moves to its own table and says so on the Build page', async () => {
  const shared = 'main.inspire.n01_u01_out';
  const assets = JSON.parse(built().asset_status);
  const warned = built({
    spec_version: 2, status: 'ready_with_warnings', status_message: 'Genie Agent: space create 403',
    spec_json: JSON.stringify({ ...builtSpec(), config: { ...builtSpec().config, result_table: shared } }),
    asset_status: JSON.stringify({ ...assets, genie_space: { state: 'failed', error: 'space create 403', spec_version: 1 } }),
  });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [warned],
    resultTableHolders: { [shared]: [{ session_id: '2222222222222222222', use_case_id: 'N01-U01' }] } });
  const { page, made } = ui;
  try {
    await page.getByText('The Genie Agent failed.', { exact: false }).waitFor();
    const retries = runPane(page).getByRole('button', { name: 'Retry the Genie Agent' });
    await retries.first().click();
    await until(() => made.jobs.length === 1, 'the retry implement run');
    const note = page.getByRole('status').filter({ hasText: 'Result table: results move to' });
    await note.waitFor();
    assert.equal((await note.textContent()).trim(), `Result table: results move to ${RESULT_TABLE}, because ${shared} holds the results of use case N01-U01 `
      + 'of session 2222222222222222222; earlier versions of this use case wrote there under the old shared name');
    const insert = made.sqlCalls.find((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(JSON.parse(insert.parameters.find((p) => p.name === 'spec').value).config.result_table, RESULT_TABLE);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

const OUTPUT_LABELS = ['Dashboard', 'Genie Agent', 'App', 'Alert'];

test('an output that was built can be rebuilt on its own from its Details drawer, and a failed one stays under the retries', async () => {
  const assets = JSON.parse(built().asset_status);
  const warned = built({
    spec_version: 2, status: 'ready_with_warnings', status_message: 'Genie Agent: space create 403',
    asset_status: JSON.stringify({ ...assets, genie_space: { state: 'failed', error: 'space create 403', spec_version: 2 } }),
  });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [warned] });
  const { page, made } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await statusLoaded(page);
    const rebuilds = {};
    for (const label of OUTPUT_LABELS) {
      const drawer = await openDetails(page, label);
      rebuilds[label] = (await drawer.getByRole('button', { name: 'Rebuild this', exact: true }).allTextContents()).map((t) => t.trim());
      await closeDetails(page, drawer);
    }
    assert.deepEqual(rebuilds, { Dashboard: [], 'Genie Agent': [], App: ['Rebuild this'], Alert: ['Rebuild this'] });
    assert.deepEqual((await runPane(page).getByRole('button', { name: /^Retry the / }).allTextContents()).map((t) => t.trim()),
      ['Retry the Genie Agent']);
    const app = await openDetails(page, 'App');
    await app.getByRole('button', { name: 'Rebuild this', exact: true }).click();
    await until(() => made.jobs.length === 1, 'the rebuild implement run');
    const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(inserts.length, 1);
    const value = (name) => inserts[0].parameters.find((p) => p.name === name).value;
    assert.deepEqual([value('v'), value('based'), value('classes')], ['3', '2', 'retry']);
    const spec = JSON.parse(value('spec'));
    assert.deepEqual(spec.retry_outputs, ['app']);
    assert.equal(spec.outputs.app_name, 'churn-desk', 'the rebuild keeps the App it replaces');
    assert.equal(made.jobs[0].params.inspire_implement_spec_version, '3');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const busy = await openUi('implement', { ...STUDIO_STATE, history: [built({ status: 'building_outputs' })],
    implementRun: { run_id: 5555555555555555, state: { life_cycle_state: 'RUNNING' } } });
  try {
    await busy.page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await studioTab(busy.page, 'Control Tower');
    await busy.page.getByRole('checkbox', { name: 'Schedule on' }).waitFor();
    await statusLoaded(busy.page);
    for (const label of OUTPUT_LABELS) {
      const drawer = await openDetails(busy.page, label);
      assert.equal(await drawer.getByRole('button', { name: 'Rebuild this', exact: true }).count(), 0, `nothing is rebuilt while a version runs: ${label}`);
      await closeDetails(busy.page, drawer);
    }
    assert.deepEqual(busy.pageErrors, []);
  } finally {
    await busy.close();
  }
});

test('a version saved while the App offered downloads rebuilds and opens in Edit without them', async () => {
  const saved = builtSpec();
  const withDownloads = built({ spec_json: JSON.stringify({ ...saved, outputs: { ...saved.outputs, app_access: 'sp',
    app_options: { download: true, modify: true, replace_edits: false, decisions: false } } }) });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [withDownloads] });
  try {
    await ui.page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await statusLoaded(ui.page);
    const app = await openDetails(ui.page, 'App');
    await app.getByRole('button', { name: 'Rebuild this', exact: true }).click();
    await until(() => ui.made.jobs.length === 1, 'the rebuild implement run');
    const spec = submittedSpec(ui.made);
    assert.deepEqual(spec.retry_outputs, ['app']);
    assert.deepEqual(spec.outputs.app_options, { modify: true, replace_edits: false, decisions: false, alerts: false });
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const edit = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' }, history: [withDownloads] });
  try {
    await toData(edit.page);
    await toDelivery(edit.page);
    await toAppAccess(edit.page);
    const access = edit.page.getByRole('region', { name: 'App access' });
    assert.equal(await access.getByRole('checkbox', { name: /^Let people edit data/ }).isChecked(), true, 'the saved choices come back');
    await access.getByRole('checkbox', { name: /^Record decisions/ }).check();
    await next(edit.page);
    await onStep(edit.page, 'App look');
    await implementWhenReady(edit.page);
    await edit.page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.deepEqual(submittedSpec(edit.made).outputs.app_options, { modify: true, replace_edits: false, decisions: true, alerts: false });
    assert.deepEqual(edit.pageErrors, []);
  } finally {
    await edit.close();
  }
});

test('a dropped source table stops the re-run with its name, and Edit opens the Data step with that table marked and its Change open', async () => {
  const ui = await openUi('implement', { ...STUDIO_STATE, probeErrors: { '`main`.`s`.`returns`': GONE } });
  const { page, made } = ui;
  const missing = [{ table: 'main.s.returns', reason: 'not found' }];
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await statusLoaded(page);
    await runPane(page).getByRole('button', { name: 'Preview re-run' }).click();
    await page.getByText(lostTablesText(missing)).waitFor();
    await page.getByText('the preview cannot run because these source tables are missing or not readable: main.s.returns (not found).', { exact: false }).waitFor();
    assert.equal(await page.getByText('409:', { exact: false }).count(), 0, 'no HTTP status code reaches the screen');
    assert.ok(!made.fetches.some((f) => f.path === '/api/2.1/jobs/run-now'));

    await page.getByRole('button', { name: 'Edit the Data step' }).click();
    await onStep(page, 'Data');
    await page.getByRole('dialog').getByText(lostTablesText(missing)).waitFor();
    const lostRow = page.locator('[data-table="main.s.returns"]');
    await lostRow.getByText('not found', { exact: true }).waitFor();
    assert.match(await lostRow.getAttribute('class'), /border-error\/50/);
    await page.getByLabel('Table to use for main.s.returns').waitFor();
    const primaryRow = page.locator('[data-table="main.s.orders"]');
    await primaryRow.getByText('Primary', { exact: true }).waitFor();
    assert.doesNotMatch(await primaryRow.getAttribute('class'), /border-error/);
    assert.equal(await page.getByLabel('Table to use for main.s.orders').count(), 0, 'only the lost table opens its Change');
    assert.equal(made.sqlCalls.some((c) => /FROM `main`\.`inspire`\.`n01_u01_s42_out` WHERE as_of_date/.test(String(c.sql))), false, 'no result rows are read');
    assert.equal(made.jobs.length, 0);
    assert.deepEqual(ui.pageErrors, ['Failed to load resource: the server responded with a status of 409 (Conflict)'], 'the refused re-run is the only error');
  } finally {
    await ui.close();
  }
});

test('Edit of a use case whose own App no longer exists says so and puts the use case in its domain App by default', async () => {
  const hubRow = {
    session_id: '42', use_case_id: 'N01-U05', spec_version: 1, status: 'ready', updated_at: '2026-10-26T00:00:00Z', asset_status: null,
    spec_json: JSON.stringify({ use_case_id: 'N01-U05', use_case_name: 'Price promos', outputs: { app: true, app_access: 'sp' } }),
    dashboard_id: null, genie_space_id: null, app_name: 'inspire-hub-acme',
  };
  const ui = await openUi('wizard', {
    me: { userName: OWNER, displayName: 'Owner' }, history: [built()], registry: [hubRow],
    appsByName: { 'inspire-hub-acme': { name: 'inspire-hub-acme', description: 'Inspire use case N01-U05 (session 42): Price promos' } },
    useCaseScope: [{ session_id: '42', use_case_id: 'N01-U05', business: 'Acme', domain: '' }],
  });
  const { page, made } = ui;
  try {
    await toData(page);
    await toDelivery(page);
    await page.getByText('The App this use case had, churn-desk, no longer exists, so Genie can add the use case to one Inspire built or create a new one.').waitFor();
    assert.equal(await page.locator('[data-merge="dashboard"]').count(), 0, 'a dashboard that still exists is updated in place');
    await next(page);
    await onStep(page, 'App placement');
    const place = page.getByRole('region', { name: 'App placement' });
    await place.getByRole('note', { name: 'The App this use case joins' }).waitFor();
    assert.equal(await place.locator('[data-app-target="inspire-hub-acme"] input[type="radio"]').isChecked(), true);
    assert.match(await place.locator('[data-app-target="inspire-hub-acme"]').textContent(), /Holds Price promos/);
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const spec = submittedSpec(made);
    assert.deepEqual([spec.outputs.app_name, spec.outputs.merge.app], ['inspire-hub-acme', 'inspire-hub-acme']);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

const GONE_OLD = '[TABLE_OR_VIEW_NOT_FOUND] The table or view `main`.`s`.`returns_old` cannot be found. Verify the spelling. SQLSTATE: 42P01';
const lostSwapVersions = () => {
  const saved = builtSpec();
  const spec = { ...saved, outputs: { ...saved.outputs, app_access: 'sp' }, data: { ...saved.data, tables: { 'main.s.returns': 'main.s.returns_old' } } };
  return [
    built({ spec_version: 2, status: 'failed', status_message: 'the preview cannot run', spec_json: JSON.stringify({ ...spec, data: { ...spec.data, notes: 'try again' } }) }),
    built({ spec_json: JSON.stringify(spec) }),
  ];
};

test('Edit of a version whose swapped table is gone goes back to the use case\'s own table, says so on the Data step, and Start builds on it', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' }, history: lostSwapVersions(),
    probeErrors: { '`main`.`s`.`returns_old`': GONE_OLD } });
  const { page, made } = ui;
  try {
    await toData(page);
    const said = 'main.s.returns_old is missing or not readable (not found), so this version goes back to main.s.returns, the table Inspire picked. '
      + 'Use Change to pick another table.';
    await page.getByRole('dialog').getByText(said).waitFor();
    const row = page.locator('[data-table="main.s.returns"]');
    await row.getByText('main.s.returns', { exact: true }).waitFor();
    assert.equal(await row.getByText('instead of', { exact: false }).count(), 0, 'the row shows the use case\'s own table');
    assert.doesNotMatch(await row.getAttribute('class'), /border-error/);
    await toDelivery(page);
    await toAppAccess(page);
    await next(page);
    await onStep(page, 'App look');
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.deepEqual(submittedSpec(made).data.tables, {});
    assert.equal(made.jobs.length, 1);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Edit of a version whose swapped table and own table are both gone marks the table, and Start stays off with the table named', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' }, history: lostSwapVersions(),
    probeErrors: { '`main`.`s`.`returns_old`': GONE_OLD, '`main`.`s`.`returns`': GONE } });
  const { page, made } = ui;
  try {
    await toData(page);
    await page.getByRole('dialog').getByText(lostTablesText([{ table: 'main.s.returns_old', reason: 'not found' }])).waitFor();
    const row = page.locator('[data-table="main.s.returns"]');
    await row.getByText('not found', { exact: true }).waitFor();
    await page.getByLabel('Table to use for main.s.returns').waitFor();
    await toDelivery(page);
    await toAppAccess(page);
    await next(page);
    await onStep(page, 'App look');
    await toVibes(page);
    const named = 'the preview cannot run because these source tables are missing or not readable: main.s.returns_old (not found).';
    await page.waitForFunction((text) => [...document.querySelectorAll('[role="alert"] p')].some((p) => p.textContent.includes(text)), named, { timeout: 15000 });
    assert.equal(await page.getByRole('button', { name: 'Start MVP', exact: true }).isDisabled(), true);
    assert.equal(made.jobs.length, 0);
    assert.equal(made.sqlCalls.some((c) => /INSERT INTO/.test(String(c.sql))), false);
  } finally {
    await ui.close();
  }
});

test('Use case details on the Implement page open the full use case in a drawer that closes with Escape and leaves the tabs alone', async () => {
  const ui = await openUi('implement', STUDIO_STATE);
  const { page } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await studioTab(page, 'Progress');
    await page.getByRole('button', { name: 'Use case details' }).click();
    const drawer = page.getByRole('dialog', { name: `Use case details: ${HARNESS_USE_CASE.Name}` });
    await drawer.getByRole('heading', { name: HARNESS_USE_CASE.Name, level: 2 }).waitFor();
    await drawer.getByText(HARNESS_USE_CASE.statement).first().waitFor();
    await drawer.getByText('MVP ready', { exact: true }).first().waitFor();
    assert.equal(await drawer.getByRole('button', { name: 'Open in Build' }).count(), 0, 'already on the Implement page');
    assert.equal(await drawer.getByRole('button', { name: /^(Previous|Next) use case$/ }).count(), 0, 'one use case, no paging');
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('tab', { name: 'Progress', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await focusedName(page), 'Use case details', 'the focus comes back to the button that opened it');
    await page.getByRole('button', { name: 'Use case details' }).click();
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await drawer.waitFor({ state: 'detached' });
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a use case with no MVP offers to start one, reads no result table, and the wizard shows its title and id on every step', async () => {
  const never = await openUi('implement', { ...STUDIO_STATE, history: [] });
  try {
    await never.page.getByText('No MVP yet.', { exact: false }).waitFor();
    await never.page.getByRole('navigation', { name: 'Use cases' }).getByRole('region', { name: 'Not started' }).getByText(HARNESS_USE_CASE.Name).waitFor();
    assert.equal(await never.page.getByRole('tablist', { name: 'MVP views' }).count(), 0, 'no tabs before an MVP exists');
    assert.equal(await towerOf(never.page).count(), 0, 'nothing to control before an MVP or a notebook exists');
    assert.equal(never.made.sqlCalls.some((c) => /^SELECT \* FROM `main`\.`inspire`\.`n01_u01_s42_out`/.test(String(c.sql))), false, 'no result table read');
    await never.page.getByRole('button', { name: 'Start Use Case MVP with Genie' }).click();
    await onStep(never.page, 'Choose');
    assert.equal(await never.page.getByRole('region', { name: 'Executive summary' }).locator('h3').innerText(), HARNESS_USE_CASE.Name);
    const header = never.page.locator('[data-wizard-header]');
    for (const label of ['Choose', 'Data', 'Results', 'Delivery']) {
      if (label !== 'Choose') {
        await next(never.page);
        await onStep(never.page, label);
      }
      assert.equal(await header.getByRole('heading', { level: 2 }).innerText(), HARNESS_USE_CASE.Name, label);
      assert.equal(await header.getByRole('list', { name: 'About this use case' }).innerText().then((t) => t.replace(/\s+/g, ' ').trim()), 'ID N01-U01', label);
    }
    await never.page.getByRole('dialog', { name: `Start Use Case MVP with Genie: ${HARNESS_USE_CASE.Name}` }).waitFor();
    assert.deepEqual(never.pageErrors, []);
  } finally {
    await never.close();
  }
});

const EDITED_AT = Date.UTC(2026, 9, 25, 5, 0, 0);
const EDITED_REASON = 'the notebook /tmp/out/acme_implemented/Sales/N01-U01 was edited after Inspire last built it, so this version did not '
  + 'rebuild it: rebuild it with Edit the MVP on the Build page to overwrite those edits, or keep them and change only the outputs or the schedule';

const editedVersion = () => {
  const spec = builtSpec();
  const assets = JSON.parse(built().asset_status);
  return built({
    spec_version: 2, status: 'failed', status_message: EDITED_REASON,
    spec_json: JSON.stringify({ ...spec, config: { ...spec.config, profiles: { ...spec.config.profiles, preview: { entity_cap: 500 } } } }),
    asset_status: JSON.stringify({ ...assets, notebook: { modified_at: EDITED_AT - 60000, spec_version: 1, state: 'edited', edited_at: EDITED_AT } }),
  });
};

test('a version stopped by notebook edits offers a rebuild that overwrites them, submitted as the next version', async () => {
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [editedVersion(), built()] });
  const { page, made } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await page.getByText(EDITED_REASON).waitFor();
    assert.equal(await page.getByText(EDITED_REASON).count(), 1, 'the reason shows once, next to its action');
    assert.equal(made.jobs.length, 0);
    await page.getByRole('button', { name: 'Rebuild and overwrite the edits' }).click();
    await until(() => made.jobs.length === 1, 'the rebuild implement run');
    const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(inserts.length, 1);
    const value = (name) => inserts[0].parameters.find((p) => p.name === name).value;
    assert.deepEqual([value('v'), value('based'), value('classes')], ['3', '2', 'config']);
    const spec = JSON.parse(value('spec'));
    assert.equal(spec.confirm_notebook_overwrite, true);
    assert.equal(spec.config.profiles.preview.entity_cap, 500, 'the rebuild keeps the change the stopped version was making');
    assert.equal('retry_outputs' in spec && spec.retry_outputs.length > 0, false);
    assert.equal(made.jobs[0].params.inspire_implement_spec_version, '3');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const assets = JSON.parse(built().asset_status);
  const kept = await openUi('implement', { ...STUDIO_STATE,
    history: [built({ asset_status: JSON.stringify({ ...assets, notebook: { modified_at: 1, state: 'edited', edited_at: EDITED_AT } }) })] });
  try {
    await statusLoaded(kept.page);
    assert.equal(await kept.page.getByRole('button', { name: 'Rebuild and overwrite the edits' }).count(), 0,
      'a built version that kept the edits offers no overwrite');
  } finally {
    await kept.close();
  }
});

test('Edit after notebook edits asks on Delivery whether to overwrite them, and only a ticked box confirms', async () => {
  const ui = await openUi('wizard', { ...STUDIO_STATE, history: [editedVersion(), built()], me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await toData(page);
    await toDelivery(page);
    const box = page.getByRole('checkbox', { name: /^Overwrite the edits made to the notebook on / });
    await box.waitFor();
    assert.equal(await box.isChecked(), false, 'an Edit never starts confirmed');
    const asks = page.getByText('This version rebuilds the notebook, so it stops and asks again unless you tick this.');
    await asks.waitFor();
    await box.check();
    await asks.waitFor({ state: 'detached' });
    await throughApp(page);
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(inserts.length, 1);
    const value = (name) => inserts[0].parameters.find((p) => p.name === name).value;
    assert.deepEqual([value('v'), value('based')], ['3', '2']);
    assert.equal(JSON.parse(value('spec')).confirm_notebook_overwrite, true);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const fresh = await openUi('wizard', { ...STUDIO_STATE, me: { userName: OWNER, displayName: 'Owner' } });
  try {
    await toData(fresh.page);
    await toDelivery(fresh.page);
    assert.equal(await fresh.page.getByRole('checkbox', { name: /^Overwrite the edits/ }).count(), 0, 'no recorded edit, no question');
    assert.equal(await fresh.page.locator('[data-merge]').count(), 0, 'an output the use case already has is updated in place, never moved');
    await next(fresh.page);
    await onStep(fresh.page, 'App placement');
    await fresh.page.getByText('This use case already has its App, churn-desk, so Genie rebuilds it there.').waitFor();
    assert.equal(await fresh.page.getByLabel('App name').inputValue(), 'churn-desk', 'an edit keeps the live App name');
    assert.equal(await fresh.page.locator('[data-app-target]').count(), 0, 'an App the use case already has is never moved');
    await next(fresh.page);
    await onStep(fresh.page, 'App access');
    assert.equal(await fresh.page.getByRole('radio', { name: /^Internal data/ }).isChecked(), true,
      'an App built before the access choice existed shows the service principal it signs in with');
    await next(fresh.page);
    await onStep(fresh.page, 'App look');
    await toVibes(fresh.page);
    const note = fresh.page.getByRole('note', { name: 'Nothing to build' });
    await note.waitFor();
    assert.match(await note.innerText(), /Nothing changed since version 1, so there is nothing new to build\. Change a choice in any step to build version 2/);
    assert.equal(await fresh.page.getByRole('button', { name: 'Start MVP', exact: true }).isDisabled(), true, 'an edit with no change cannot submit');
    assert.equal(await fresh.page.getByRole('alert').count(), 0, 'an unchanged edit is a note, never an error');
    assert.equal(await fresh.page.getByText(/^\d{3}:/).count(), 0, 'no HTTP status code reaches the screen');
    const lookStep = async () => {
      await fresh.page.getByRole('button', { name: 'Back' }).click();
      await onStep(fresh.page, 'App look');
      await fresh.page.getByRole('region', { name: 'App look' }).getByRole('tab', { name: 'Palette', exact: true }).click();
      return fresh.page.getByRole('region', { name: 'App look' }).getByRole('group', { name: 'Light or dark' });
    };
    await (await lookStep()).getByRole('button', { name: 'Dark' }).click();
    await toVibes(fresh.page);
    await fresh.page.waitForFunction(() => {
      const start = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Start MVP');
      return start && !start.disabled;
    });
    assert.equal(await note.count(), 0, 'a changed look is something to build');
    await (await lookStep()).getByRole('button', { name: 'Light' }).click();
    await toVibes(fresh.page);
    await note.waitFor();
    await note.getByRole('button', { name: 'Go to the Build page' }).click();
    await fresh.page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.equal(fresh.made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO')).length, 0, 'an unchanged edit records no new version');
    assert.deepEqual(fresh.pageErrors, []);
  } finally {
    await fresh.close();
  }
});

test('Notebook only skips the MVP settings, flags only this use case, starts Generate Use Cases, and the Implement page follows the notebook run', async () => {
  const notebookPath = '/Users/owner@example.com/inspire/Acme/N01-U01';
  const flaggedRow = { ...HARNESS_USE_CASE, generate_genie_code_instruction: 'Yes', has_genie_code: 'N' };
  const runUrl = 'https://workspace.example.com/#job/7/run/99';
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  made.state.afterTrigger = () => {
    made.state.useCase = flaggedRow;
    made.state.jobsList = { jobs: [{ job_id: 7, created_time: 1, settings: { name: 'Inspire AI - Genie Code - 42' } }] };
    made.state.runsByJob = { 7: { runs: [{ run_id: 99, state: { life_cycle_state: 'RUNNING' }, run_page_url: runUrl }] } };
  };
  try {
    await onStep(page, 'Choose');
    await page.getByRole('radio', { name: /^Notebook only/ }).check();
    assert.deepEqual(await page.locator('ol li').allTextContents(), ['1. Choose', '2. Data', '3. Notebook']);
    await next(page);
    await onStep(page, 'Data');
    const tables = page.getByRole('region', { name: 'Tables the notebook uses' });
    assert.deepEqual(await tables.locator('li > span.font-mono').allTextContents(), ['main.s.orders', 'main.s.returns']);
    await tables.locator('li', { hasText: 'main.s.orders' }).getByText('primary', { exact: true }).waitFor();
    assert.equal(await advanced(page).count(), 0, 'Notebook only has no MVP settings');
    assert.equal(await page.getByRole('button', { name: 'Change' }).count(), 0, 'Notebook only never swaps a table');
    await next(page);
    await onStep(page, 'Notebook');
    const step = page.getByRole('region', { name: 'Notebook' });
    await step.getByRole('heading', { name: 'Write the Genie Code notebook' }).waitFor();
    await step.getByText('under /tmp/out/acme.', { exact: false }).waitFor();
    assert.equal(made.jobs.length, 0);
    await page.getByRole('button', { name: 'Generate notebook' }).click();
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();

    assert.equal(made.jobs.length, 1);
    assert.equal(made.jobs[0].jobType, 'genie_regen');
    assert.equal(made.jobs[0].jobName, 'Inspire AI - Genie Code - 42');
    assert.equal(made.jobs[0].params['15_operation'], 'Generate Use Cases');
    assert.deepEqual(made.flagged.map((f) => [f.sid, f.ids]), [['42', ['N01-U01']]]);
    assert.equal(made.sqlCalls.some((c) => String(c.sql).includes('INSERT INTO')), false, 'Notebook only writes no MVP version');

    const nav = page.getByRole('navigation', { name: 'Use cases' });
    await nav.getByRole('region', { name: 'In progress' }).getByText('Notebook running', { exact: true }).waitFor();
    const tower = towerOf(page);
    const panel = tower.locator('[data-tile="notebook"]');
    assert.equal(await panel.getByRole('link', { name: 'Open the notebook run' }).getAttribute('href'), runUrl);
    assert.equal(await page.getByRole('tablist', { name: 'MVP views' }).count(), 0, 'a notebook alone shows the Control Tower without tabs');
    assert.deepEqual(await tower.locator('[data-tile]').evaluateAll((tiles) => tiles.map((t) => t.dataset.tile)), ['notebook'], 'only the notebook tile');
    assert.equal(await tower.getByRole('button', { name: 'Check the live status now' }).count(), 0, 'a notebook has no live status to check');
    assert.equal(await page.getByRole('region', { name: 'Run and schedule', exact: true }).count(), 0);
    assert.equal(await page.getByRole('region', { name: 'History', exact: true }).count(), 0);
    assert.equal(await panel.getByRole('link', { name: 'Open the notebook', exact: true }).count(), 0, 'no notebook link before it is written');

    made.state.useCase = { ...flaggedRow, generate_genie_code_instruction: 'No', has_genie_code: 'Y', notebook_path: notebookPath };
    made.state.runsByJob = { 7: { runs: [{ run_id: 99, state: { life_cycle_state: 'TERMINATED', result_state: 'SUCCESS' }, run_page_url: runUrl }] } };
    await nav.getByRole('region', { name: 'Ready' }).getByText('Notebook ready', { exact: true }).waitFor({ timeout: 25000 });
    assert.equal(await panel.getByRole('link', { name: 'Open the notebook', exact: true }).getAttribute('href'),
      `https://workspace.example.com/#workspace/Workspace${notebookPath}`);
    await page.getByRole('button', { name: 'Start Use Case MVP with Genie' }).waitFor();
    await page.getByText('No MVP yet.', { exact: false }).waitFor();
    await shot(page, 'notebook-only');
    const drawer = await openDetails(page, 'Genie Code notebook');
    await drawer.getByText(notebookPath, { exact: true }).waitFor();
    assert.equal(await drawer.getByRole('link', { name: 'Open the notebook', exact: true }).getAttribute('href'),
      `https://workspace.example.com/#workspace/Workspace${notebookPath}`);
    await drawer.getByText('Notebook ready', { exact: true }).waitFor();
    assert.equal(await drawer.locator('[data-vibe-card]').count(), 0, 'a notebook without an MVP has no vibes to rebuild');
    await closeDetails(page, drawer);
    assert.equal(await focusedName(page), 'Genie Code notebook details');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Notebook only started from the Build page of a use case that has a notebook shows it running at once, not the old notebook as ready', async () => {
  const notebookPath = '/Users/owner@example.com/inspire/Acme/N01-U01';
  const runUrl = 'https://workspace.example.com/#job/7/run/99';
  const ui = await openUi('implement', { useCase: { ...HARNESS_USE_CASE, has_genie_code: 'Y', generate_genie_code_instruction: 'No', notebook_path: notebookPath } });
  const { page, made } = ui;
  made.state.afterTrigger = () => {
    made.state.useCase = { ...HARNESS_USE_CASE, has_genie_code: 'N', generate_genie_code_instruction: 'Yes', notebook_path: notebookPath };
    made.state.jobsList = { jobs: [{ job_id: 7, created_time: 1, settings: { name: 'Inspire AI - Genie Code - 42' } }] };
    made.state.runsByJob = { 7: { runs: [{ run_id: 99, state: { life_cycle_state: 'RUNNING' }, run_page_url: runUrl }] } };
  };
  try {
    const nav = page.getByRole('navigation', { name: 'Use cases' });
    await nav.getByRole('region', { name: 'Ready' }).getByText('Notebook ready', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Start Use Case MVP with Genie' }).click();
    await onStep(page, 'Choose');
    await page.getByRole('radio', { name: /^Notebook only/ }).check();
    await next(page);
    await onStep(page, 'Data');
    await next(page);
    await onStep(page, 'Notebook');
    await page.getByRole('button', { name: 'Generate notebook' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(made.jobs.length, 1);
    await nav.getByRole('region', { name: 'In progress' }).getByText('Notebook running', { exact: true }).waitFor({ timeout: 5000 });
    assert.equal(await nav.getByRole('region', { name: 'Ready' }).getByText('Notebook ready', { exact: true }).count(), 0, 'the rewritten notebook is no longer listed as ready');
    const panel = towerOf(page).locator('[data-tile="notebook"]');
    await panel.getByText('Notebook running', { exact: true }).waitFor({ timeout: 5000 });
    assert.equal(await panel.getByRole('link', { name: 'Open the notebook run' }).getAttribute('href'), runUrl);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the Implement page groups every use case by its state, searches by name, id or domain, and starts an MVP from one with none', async () => {
  const useCases = [
    { ...HARNESS_USE_CASE, _domain: 'Retention' },
    { id: 'N01-U02', Name: 'Forecast demand', use_case: 'Forecast demand', _domain: 'Supply', statement: 'Plan stock a week ahead',
      primary_table: 'main.s.orders', tables_involved: 'main.s.orders' },
    { id: 'N02-U01', Name: 'Score suppliers', use_case: 'Score suppliers', _domain: 'Supply', has_genie_code: 'Y',
      notebook_path: '/Users/owner@example.com/inspire/Acme/N02-U01' },
  ];
  const ui = await openUi('implement', { ...STUDIO_STATE, useCases });
  const { page } = ui;
  const nav = page.getByRole('navigation', { name: 'Use cases' });
  const group = (name) => nav.getByRole('region', { name });
  const names = (name) => group(name).locator('button > div:first-child').allTextContents();
  const search = (text) => page.getByLabel('Search use cases').fill(text);
  try {
    await group('Ready').getByText('MVP ready', { exact: true }).waitFor();
    assert.deepEqual(await nav.locator('h2').allTextContents(), ['In progress (0)', 'Ready (2)', 'Failed (0)', 'Not started (1)']);
    assert.deepEqual(await names('Ready'), ['Predict churn', 'Score suppliers']);
    assert.deepEqual(await names('Not started'), ['Forecast demand']);
    await group('Ready').getByRole('button', { name: /Score suppliers/ }).getByText('Notebook ready', { exact: true }).waitFor();
    assert.equal(await group('Not started').locator('[data-implement-status]').count(), 0, 'a use case with nothing built has no label');
    await page.getByRole('heading', { name: 'Predict churn', exact: true }).waitFor();

    await search('supply');
    await group('Ready').getByText('Predict churn').waitFor({ state: 'detached' });
    assert.deepEqual(await names('Ready'), ['Score suppliers']);
    assert.deepEqual(await names('Not started'), ['Forecast demand']);
    await page.getByRole('heading', { name: 'Predict churn', exact: true }).waitFor();
    await search('N01-U02');
    await group('Ready').getByText('Score suppliers').waitFor({ state: 'detached' });
    assert.deepEqual(await names('Not started'), ['Forecast demand']);
    await search('nothing like this');
    await nav.getByText('No use case matches "nothing like this".').waitFor();
    await search('');

    await group('Not started').getByRole('button', { name: /Forecast demand/ }).click();
    await page.getByRole('heading', { name: 'Forecast demand', exact: true }).waitFor();
    await page.getByText('No MVP yet.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('tablist', { name: 'MVP views' }).count(), 0);
    await page.getByRole('button', { name: 'Start Use Case MVP with Genie' }).click();
    await onStep(page, 'Choose');
    assert.equal(await page.getByRole('region', { name: 'Executive summary' }).locator('h3').innerText(), 'Forecast demand');
    await page.getByRole('button', { name: 'Close' }).click();
    await page.locator('[data-implement-overlay]').waitFor({ state: 'detached' });

    await group('Ready').getByRole('button', { name: /Score suppliers/ }).click();
    const panel = towerOf(page).locator('[data-tile="notebook"]');
    assert.equal(await page.getByRole('tablist', { name: 'MVP views' }).count(), 0, 'a notebook alone has no tabs');
    assert.equal(await panel.getByRole('link', { name: 'Open the notebook', exact: true }).getAttribute('href'),
      'https://workspace.example.com/#workspace/Workspace/Users/owner@example.com/inspire/Acme/N02-U01');
    await page.getByRole('button', { name: 'Start Use Case MVP with Genie' }).waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a card offers Start Use Case MVP with Genie until an MVP starts, then Open MVP, a notebook-only card adds Open notebook, and the status label is text, not a control', async () => {
  const ui = await openUi('card');
  const { page } = ui;
  const card = (id) => page.locator(`[data-card="${id}"]`);
  const buttons = async (id) => (await card(id).getByRole('button').allTextContents()).map((t) => t.trim());
  try {
    await card('running').getByText('MVP running', { exact: true }).waitFor();
    for (const [id, shown] of [['not-started', ['Start Use Case MVP with Genie']], ['running', ['Open MVP']], ['notebook', ['Start Use Case MVP with Genie']],
      ['uninstalled', ['Start Use Case MVP with Genie']]]) {
      assert.deepEqual(await buttons(id), shown, id);
    }
    const link = card('notebook').getByRole('link', { name: /Open notebook/ });
    assert.equal(await link.getAttribute('href'), 'https://workspace.example.com/#workspace/nb/notebook');
    assert.equal(await link.getAttribute('target'), '_blank');
    for (const id of ['not-started', 'running', 'uninstalled', 'no-session']) assert.equal(await card(id).getByRole('link').count(), 0, `${id} has no notebook link`);
    assert.equal(await card('not-started').locator('[data-implement-status]').count(), 0, 'nothing built, no label');
    assert.equal(await card('uninstalled').locator('[data-implement-status]').textContent(), 'MVP uninstalled');
    const label = card('notebook').locator('[data-implement-status]');
    assert.equal(await label.textContent(), 'Notebook ready');
    assert.equal(await label.evaluate((el) => el.tagName), 'SPAN');
    assert.equal(await card('no-session').getByRole('button').count(), 0, 'without a session and warehouse the card offers no start and no open');
    await card('no-session').getByText('MVP ready', { exact: true }).waitFor();
    await card('running').getByRole('button').click();
    await card('notebook').getByRole('button').click();
    await label.click();
    assert.equal(await page.getByLabel('Clicks').textContent(), 'open:running,start:notebook,card:notebook',
      'the buttons never toggle the card, and the label has no action of its own');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the control tower shows each asset live, stops the App through Inspire, and removes the dashboard only once the use case id is typed', async () => {
  const mvpJob = { job_id: 77, settings: { tags: { dbx_inspire_ai_run_type: 'implement', dbx_inspire_ai_session_id: '42', dbx_inspire_ai_usecase_id: 'N01-U01' },
    schedule: { quartz_cron_expression: '0 0 6 * * ?', timezone_id: 'UTC', pause_status: 'UNPAUSED' } } };
  const ui = await openUi('implement', { ...STUDIO_STATE, job: mvpJob, spacesOk: true, alertsOk: true,
    responses: { 'POST /api/2.0/apps/churn-desk/stop': [{}] } });
  const { page, made } = ui;
  try {
    const tower = page.getByRole('region', { name: 'Control tower' });
    await tower.locator('[data-control="app"]').getByText('Running', { exact: true }).waitFor();
    assert.deepEqual(await tower.locator('[data-control]').evaluateAll((rows) => rows.map((r) => r.dataset.control)),
      ['job', 'dashboard', 'genie_space', 'app', 'alert']);
    await tower.locator('[data-control="dashboard"]').getByText('Published', { exact: true }).waitFor();
    await tower.locator('[data-control="job"]').getByText('Scheduled: 0 0 6 * * ? (UTC)').waitFor();
    assert.equal(await tower.locator('[data-control="genie_space"]').getByRole('button', { name: /Stop|Start|Publish/ }).count(), 0,
      'a Genie Agent has nothing to stop or start');

    await tower.getByRole('button', { name: 'Stop the App' }).click();
    await until(() => made.fetches.some((f) => f.path === '/api/2.0/apps/churn-desk/stop' && f.opts.method === 'POST'), 'the App stop call');
    await until(() => made.sqlCalls.some((c) => String(c.sql).startsWith('INSERT INTO `main`.`inspire`.`__inspire_control_log`')), 'the audit row');
    assert.equal(made.jobs.length, 0, 'stopping the App starts no Inspire run');

    await tower.locator('[data-control="dashboard"]').getByRole('button', { name: 'Remove' }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove the Dashboard' });
    const confirm = dialog.getByRole('button', { name: 'Remove the Dashboard' });
    assert.equal(await confirm.isDisabled(), true);
    await dialog.getByText('You can add it back with Edit the MVP.', { exact: false }).waitFor();
    assert.equal(await dialog.getByText('Edit tab', { exact: false }).count(), 0, 'the dialog points at a button that exists');
    await dialog.getByLabel('Type the use case id to confirm').fill('n01-u01');
    assert.equal(await confirm.isDisabled(), true, 'the id must match exactly');
    await dialog.getByLabel('Type the use case id to confirm').fill('N01-U01');
    await confirm.click();
    await until(() => made.jobs.length === 1, 'the implement run that deletes the dashboard');
    const spec = submittedSpec(made);
    assert.deepEqual([spec.outputs.dashboard, spec.outputs.genie_space, spec.outputs.app, spec.outputs.alert], [false, true, true, true]);
    assert.deepEqual(spec.removed_outputs, { dashboard: 'delete' });
    assert.equal(made.jobs[0].params['15_operation'], 'Implement Use Cases');
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the control tower job row shows the share of records the built version holds back to measure impact', async () => {
  const mvpJob = { job_id: 77, settings: { tags: { dbx_inspire_ai_run_type: 'implement', dbx_inspire_ai_session_id: '42', dbx_inspire_ai_usecase_id: 'N01-U01' },
    schedule: { quartz_cron_expression: '0 0 6 * * ?', timezone_id: 'UTC', pause_status: 'UNPAUSED' } } };
  const held = built({ spec_json: JSON.stringify({ ...builtSpec(), holdout: { enabled: true, share: 0.15 } }) });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [held], job: mvpJob, spacesOk: true, alertsOk: true });
  const { page } = ui;
  try {
    const job = towerOf(page).locator('[data-control="job"]');
    await job.getByText('Scheduled: 0 0 6 * * ? (UTC). Holds back 15% of the records to measure impact', { exact: true }).waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('while its status loads, the Build page shows the built version from the rail, never an empty one', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const ui = await openUi('implement', { ...STUDIO_STATE, hold: { '/status': held, '/live': held } });
  const { page } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const tower = page.getByRole('region', { name: 'Control tower' });
    await tower.locator('li').first().waitFor();
    assert.equal(await selectedTab(page), 'Control Tower', 'the built version from the rail opens on the Control Tower');
    assert.equal(await tower.locator('[data-tile-kind="checking"]').count(), 4, 'every built output reads its live status');
    assert.equal(await tower.getByRole('button', { name: /^Add the / }).count(), 0, 'no built output is offered as missing');
    await studioTab(page, 'Progress');
    const bar = page.getByRole('progressbar', { name: 'Build progress' });
    assert.equal(await bar.getAttribute('aria-valuenow'), '100', 'a ready version reads 100%, not 0%');
    assert.equal(await page.locator('[data-stage-state="waiting"]').count(), 0, 'no stage reads not started');
    await studioTab(page, 'Control Tower');
    const genie = await openDetails(page, 'Genie Agent');
    await genie.getByRole('link', { name: /Open Genie Agent/ }).waitFor();
    assert.equal(await genie.getByText('No Genie Agent on this version.').count(), 0);
    await closeDetails(page, genie);
    assert.equal(await historyToggle(page).innerText().then((t) => t.includes('Loading…')), true, 'the History header waits for the counts');
    await openHistory(page);
    await page.getByText('Loading the versions and job runs…').waitFor();
    assert.equal(await page.getByText('This use case has no job yet.').count(), 0, 'loading is not read as no job');
    release();
    await page.getByText(/^v1 · /).waitFor();
    assert.equal(await page.getByText('Loading the versions and job runs…').count(), 0);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    release();
    await ui.close();
  }
});

test('the control tower offers each output the version lacks by its name', async () => {
  const spec = builtSpec();
  const dashboardOnly = built({ spec_json: JSON.stringify({ ...spec, outputs: { ...spec.outputs, genie_space: false, app: false, alert: false } }),
    genie_space_id: null, genie_space_url: null, app_name: null, app_url: null, alert_id: null, alert_url: null });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [dashboardOnly] });
  const { page } = ui;
  try {
    const tower = page.getByRole('region', { name: 'Control tower' });
    await tower.getByRole('button', { name: /^Add the / }).first().waitFor();
    assert.deepEqual((await tower.getByRole('button', { name: /^Add the / }).allInnerTexts()).map((t) => t.trim()),
      ['Add the Genie Agent', 'Add the App', 'Add the Alert']);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the whole Implement page, the use case details and the wizard read at 4.5:1 or better in light and in dark', async () => {
  const ui = await openUi('implement', STUDIO_STATE);
  const { page } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await statusLoaded(page);
    await openHistory(page);
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const mode = dark ? 'dark' : 'light';
      const plain = await lowContrast(page, ['body']);
      assert.ok(plain.checked >= 40, `${mode}: measured ${plain.checked} text elements`);
      assert.deepEqual(plain.low, [], `${mode} Implement page on the Control Tower`);
      await studioTab(page, 'Progress');
      await page.getByRole('progressbar', { name: 'Build progress' }).waitFor();
      const progress = await lowContrast(page, ['body']);
      assert.ok(progress.checked >= 40, `${mode}: measured ${progress.checked} text elements on Progress`);
      assert.deepEqual(progress.low, [], `${mode} Implement page on Progress`);
      await studioTab(page, 'Control Tower');
      await page.getByRole('button', { name: 'Use case details' }).click();
      const details = await lowContrast(page, ['[role="dialog"]']);
      assert.ok(details.checked >= 15, `${mode}: measured ${details.checked} detail elements`);
      assert.deepEqual(details.low, [], `${mode} use case details`);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      for (const label of ['Genie Agent', 'Alert']) {
        const drawer = await openDetails(page, label);
        const output = await lowContrast(page, ['[role="dialog"]']);
        assert.ok(output.checked >= 8, `${mode}: measured ${output.checked} ${label} details elements`);
        assert.deepEqual(output.low, [], `${mode} ${label} details`);
        await closeDetails(page, drawer);
      }
      await runPane(page).getByRole('button', { name: 'Edit the MVP' }).click();
      await onStep(page, 'Choose');
      await page.getByRole('region', { name: 'Executive summary' }).getByText(HARNESS_USE_CASE.statement).waitFor();
      const wizard = await lowContrast(page, ['[role="dialog"]']);
      assert.ok(wizard.checked >= 15, `${mode}: measured ${wizard.checked} wizard elements`);
      assert.deepEqual(wizard.low, [], `${mode} wizard`);
      await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the control tower and its Remove dialog read at 4.5:1 or better in light and in dark', async () => {
  const mvpJob = { job_id: 77, settings: { tags: { dbx_inspire_ai_run_type: 'implement', dbx_inspire_ai_session_id: '42', dbx_inspire_ai_usecase_id: 'N01-U01' },
    schedule: { quartz_cron_expression: '0 0 6 * * ?', timezone_id: 'UTC', pause_status: 'UNPAUSED' } } };
  const note = "Ask Genie is off because this use case's Genie Agent is not ready: the space has no tables";
  const assets = JSON.parse(built().asset_status);
  const warned = built({ status: 'ready_with_warnings', status_message: `App: ${note}`,
    asset_status: JSON.stringify({ ...assets, app: { ...assets.app, warnings: [note] } }) });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [warned], job: mvpJob, spacesOk: true, alertsOk: true,
    controlLog: [{ asset: 'app', asset_id: 'churn-desk', action: 'stop', result: 'done', message: 'Stop the App: done', acted_by: OWNER, acted_at: '2026-10-26T10:00:00.000Z' },
      { asset: 'dashboard', asset_id: 'd1', action: 'unpublish', result: 'failed', message: 'Unpublish the dashboard: failed', acted_by: OWNER, acted_at: '2026-10-26T09:00:00.000Z' }],
    responses: { 'GET /api/2.0/lakeview/dashboards/d1/published': [{ embed_credentials: true, revision_create_time: '2026-10-26T08:00:00.000Z' }] } });
  const { page } = ui;
  try {
    const tower = page.getByRole('region', { name: 'Control tower' });
    await tower.locator('[data-control="app"]').getByText('Running', { exact: true }).waitFor();
    await tower.getByRole('list', { name: 'Recent control actions' }).waitFor();
    await tower.locator('[data-control="dashboard"]').getByText('Shares its publisher’s access', { exact: true }).waitFor();
    await tower.locator('[data-control="dashboard"]').getByRole('button', { name: 'Publish again' }).waitFor();
    await tower.locator('[data-control="app"]').getByRole('list', { name: 'App warnings' }).getByText(note, { exact: true }).waitFor();
    assert.equal(await tower.getByRole('list', { name: /warnings$/ }).count(), 1, 'only the App ended with a warning');
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const mode = dark ? 'dark' : 'light';
      const plain = await lowContrast(page);
      assert.ok(plain.checked >= 20, `${mode}: measured ${plain.checked} text elements`);
      assert.deepEqual(plain.low, [], `${mode} tower`);
      await tower.locator('[data-control="dashboard"]').getByRole('button', { name: 'Remove' }).click();
      const dialog = page.getByRole('dialog', { name: 'Remove the Dashboard' });
      await dialog.getByLabel('Type the use case id to confirm').fill('N01');
      const withDialog = await lowContrast(page);
      assert.ok(withDialog.checked > plain.checked, `${mode}: the dialog was measured`);
      assert.deepEqual(withDialog.low, [], `${mode} Remove dialog`);
      await dialog.getByLabel('Type the use case id to confirm').fill('N01-U01');
      const confirm = dialog.getByRole('button', { name: /^Remove/ }).last();
      assert.equal(await confirm.isEnabled(), true, 'the right id enables the confirm');
      const armed = await lowContrast(page);
      assert.ok(armed.checked > withDialog.checked, `${mode}: the enabled confirm was measured`);
      assert.deepEqual(armed.low, [], `${mode} armed Remove dialog`);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await dialog.waitFor({ state: 'detached' });
    }
    const times = await tower.getByRole('list', { name: 'Recent control actions' }).innerText();
    assert.doesNotMatch(times, /T10:00|\.000Z/, 'times read as a local date and time');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});
