import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSpecFromUseCase } from '../../src/lib/implementWizard.js';
import { HARNESS_USE_CASE, HARNESS_SETTINGS, HARNESS_SESSION_ID } from './implementFixtures.js';
import { closeBrowser, lowContrast, openUi } from './uiSupport.mjs';

const OWNER = ['owner', 'example.com'].join('@');

test.after(closeBrowser);

const spec = () => ({
  ...defaultSpecFromUseCase(HARNESS_USE_CASE, { warehouseId: HARNESS_SETTINGS.warehouseId, inspireDatabase: HARNESS_SETTINGS.inspireDatabase, sessionId: HARNESS_SESSION_ID, owner: OWNER }),
});

const BUILT = {
  session_id: '42', use_case_id: 'N01-U01', spec_version: 2, status: 'ready', change_classes: 'outputs', created_by: OWNER, updated_at: '2026-10-22T04:00:00Z',
  spec_json: JSON.stringify(spec()), job_id: '77', last_preview_run_id: '9001', result_rows: '3',
  asset_status: JSON.stringify({ notebook: { spec_version: 2, modified_at: 1 }, ai_reasoning: { state: 'ready', spec_version: 2 }, value_formula: { state: 'ready', spec_version: 2 } }),
};

const SUMMARY = {
  use_case_id: 'N01-U01', run_id: 'r-9', updated_at: '2026-10-20T07:00:00Z', currency: 'USD', decision_basis: 'measured', act_now_amount: '5000',
  review_amount: '1000', act_now_records: '0', review_records: '0', records: '40', value_at_stake: null,
  nothing_to_act: 'No record has 1,000 USD or more at stake, the amount this use case reviews from; the most at stake on one record is 812.5 USD.',
  value_formula: '{units:number} units lost x {PRICE:money} a unit x {KEEP:percent} kept', value_expression: 'greatest(0, units * PRICE * KEEP)',
  value_assumptions: JSON.stringify([{ name: 'PRICE', value: 20, kind: 'money' }, { name: 'KEEP', value: 0.5, kind: 'percent' }]), accepted: null,
};
const EDITS = [{ name: 'PRICE', value: '30', changed_by: OWNER, changed_at: '2026-10-23T09:00:00Z', note: 'list price' },
  { name: 'PRICE', value: '25', changed_by: OWNER, changed_at: '2026-10-22T09:00:00Z', note: '' }];

async function openMoney(state) {
  const ui = await openUi('implement', { history: [BUILT], ...state });
  try {
    await ui.page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const control = ui.page.getByRole('tab', { name: 'Control Tower', exact: true });
    if (await control.getAttribute('aria-selected') !== 'true') await control.click();
    await ui.page.getByRole('region', { name: 'Control tower' }).getByRole('button', { name: 'Genie Code notebook details', exact: true }).click({ timeout: 15000 });
    const drawer = ui.page.getByRole('dialog', { name: 'Genie Code notebook details', exact: true });
    await drawer.getByRole('tablist', { name: 'Pick a part to vibe' }).getByRole('tab', { name: 'Money at stake, Ready', exact: true }).click();
    await drawer.locator('[data-vibe-card="value_formula"]').waitFor({ timeout: 15000 });
    return { ...ui, card: drawer.locator('[data-vibe-card="value_formula"]') };
  } catch (e) {
    await ui.close();
    throw e;
  }
}

test('the Money at stake part shows the formula Genie proposed, its assumptions as they stand, the tiers and the last run, next to its vibes', async () => {
  const ui = await openMoney({ moneySummary: [SUMMARY], moneyEdits: EDITS });
  const { page, card, made } = ui;
  try {
    const review = card.getByRole('region', { name: 'Money at stake review' });
    await review.waitFor();
    assert.equal(await review.locator('[data-formula]').textContent(), 'Each row: units units lost x 30 USD a unit x 50% kept = its money at stake.');
    assert.deepEqual(await review.locator('[data-assumption]').evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent))),
      [['Price', '30 USD', `${OWNER} in the App`], ['Keep', '50%', 'Genie, in the notebook']]);
    await review.getByText('Owners changed an assumption in the App after the last run, so the next run uses the values above.').waitFor();
    assert.equal(await review.locator('[data-tiers]').textContent(), 'Act now from 5,000 USD at stake, Review from 1,000 USD, every other row Monitor.');
    assert.equal(await review.locator('[data-last-run]').textContent(), 'The last run flagged 0 Act now and 0 Review of 40 rows.');
    assert.deepEqual(await review.getByRole('list', { name: 'Assumption changes' }).getByRole('listitem').allTextContents(),
      [`${OWNER} set Price from 25 USD to 30 USD in the App: list price`, `${OWNER} set Price to 25 USD in the App`]);
    assert.equal(await review.locator('[data-change-how]').textContent(),
      'To change how it is counted, say so below and rebuild only this part. Owners of the App can change the assumption values there.');
    await card.getByRole('textbox', { name: 'How should it work?', exact: true }).waitFor();
    const reads = made.sqlCalls.filter((c) => c.sql.includes('n01_u01_s42_out_'));
    assert.ok(reads.some((c) => c.sql.includes('`n01_u01_s42_out_summary`')) && reads.some((c) => c.sql.includes('`n01_u01_s42_out_assumptions`')));
    const contrast = await lowContrast(page, ['[aria-label="Money at stake review"]', '[aria-label="Nothing to act on yet"]']);
    assert.ok(contrast.checked >= 8, `measured ${contrast.checked}`);
    assert.deepEqual(contrast.low, []);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('an MVP whose last run has nothing to act on says so in a plain card with the run reason, and one with records to act on shows no card', async () => {
  const ui = await openMoney({ moneySummary: [SUMMARY], moneyEdits: [] });
  try {
    const card = ui.page.getByRole('status').filter({ hasText: 'Nothing to act on yet' });
    await card.waitFor();
    assert.equal(await card.textContent(), 'Nothing to act on yet, because no record has 1,000 USD or more at stake, the amount this use case reviews from; the most at stake on '
      + 'one record is 812.5 USD.');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const acting = await openMoney({ moneySummary: [{ ...SUMMARY, act_now_records: '3', nothing_to_act: null }] });
  try {
    await acting.card.getByRole('region', { name: 'Money at stake review' }).waitFor();
    assert.equal(await acting.page.getByRole('region', { name: 'Nothing to act on yet' }).count(), 0);
  } finally {
    await acting.close();
  }
  const predicted = await openMoney({ moneySummary: [{ ...SUMMARY, decision_basis: 'predicted', accepted: false, nothing_to_act: null }] });
  try {
    await predicted.page.getByText('Nothing to act on yet, because no record reached Act now or Review in the last run').waitFor();
    assert.equal(await predicted.card.locator('[data-tiers]').textContent(),
      'No model passed this use case\u2019s acceptance check in the last run, so no row is actionable yet.');
  } finally {
    await predicted.close();
  }
  const held = await openMoney({ moneySummary: [{ ...SUMMARY, decision_basis: 'predicted', accepted: true,
    nothing_to_act: 'The test flags every series, so every record stays at Monitor' }] });
  try {
    await held.page.getByText('Nothing to act on yet, because the test flags every series, so every record stays at Monitor').waitFor();
    const tiers = await held.card.locator('[data-tiers]').textContent();
    assert.equal(tiers, 'A model passed this use case\u2019s acceptance check in the last run, so acceptance no longer holds its rows at Monitor.');
    assert.ok(!tiers.includes('can be acted on'), 'a passed acceptance check never says rows can be acted on while every row is held at Monitor');
  } finally {
    await held.close();
  }
});

test('a formula of only the row\u2019s own numbers lists no assumption and never tells owners to change one in the App', async () => {
  const own = { ...SUMMARY, value_formula: '{yhat_mean_fare:money} projected mean fare x {yhat_trips:number} projected trips', value_expression: null,
    value_assumptions: '[]' };
  const ui = await openMoney({ moneySummary: [own], moneyEdits: [] });
  try {
    const review = ui.card.getByRole('region', { name: 'Money at stake review' });
    await review.waitFor();
    assert.equal(await review.locator('[data-formula]').textContent(),
      'Each row: yhat mean fare projected mean fare x yhat trips projected trips = its money at stake.');
    assert.equal(await review.getByRole('table', { name: 'Assumptions' }).count(), 0);
    assert.equal(await review.getByText('Owners of the App can change the assumption values there').count(), 0);
    assert.equal(await review.locator('[data-change-how]').textContent(),
      'This formula uses only each row\u2019s own numbers, so the App has no assumption to change. To change how it is counted, say so below and '
      + 'rebuild only this part.');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('before the first run writes it, the part says Genie proposes the formula on its first run', async () => {
  const ui = await openMoney({});
  try {
    await ui.card.locator('[data-money-pending]').waitFor();
    assert.match(await ui.card.locator('[data-money-pending]').textContent(), /^Genie proposes how the money at stake on each row is counted, and its assumptions/);
    assert.equal(await ui.page.getByRole('region', { name: 'Nothing to act on yet' }).count(), 0);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});
