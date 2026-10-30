import test from 'node:test';
import assert from 'node:assert/strict';
import { closeBrowser, openUi, onStep, startMvp, toAppAccess } from './uiSupport.mjs';

const OWNER = ['owner', 'example.com'].join('@');
const PAT = ['pat', 'example.com'].join('@');
const LEE = ['lee', 'example.com'].join('@');
const OPS = ['ops', 'example.com'].join('@');
const SHARE_PROBLEM = 'the share of records to hold back must be 1% to 50%';
const NO_LAKEBASE = { 'GET /api/2.0/postgres/projects': [{ projects: [] }, 200] };

test.after(closeBrowser);

const next = (page) => page.getByRole('button', { name: 'Next' }).click();
const footerErrors = (page) => page.locator('[role="alert"] p').allTextContents();
const advanced = (page) => page.getByRole('button', { name: 'Advanced settings' });

async function toResults(page) {
  await onStep(page, 'Choose');
  await next(page);
  await onStep(page, 'Data');
  await next(page);
  await onStep(page, 'Results');
}

async function startWhenReady(page) {
  await startMvp(page);
  await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
}

function submittedSpec(made) {
  const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'));
  assert.equal(inserts.length, 1);
  return JSON.parse(inserts[0].parameters.find((p) => p.name === 'spec').value);
}

async function throughApp(page) {
  await toAppAccess(page);
  await page.getByRole('region', { name: 'App access' }).getByRole('radio', { name: /^Internal data/ }).check();
  await next(page);
  await onStep(page, 'App look');
}

test('a build left alone sends no holdout and no App owners', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await toResults(page);
    await next(page);
    await onStep(page, 'Delivery');
    await startWhenReady(page);
    const spec = submittedSpec(made);
    assert.equal(Object.prototype.hasOwnProperty.call(spec, 'holdout'), false, 'the agent reads no holdout when the person never turned it on');
    assert.deepEqual(spec.outputs.app_owners, []);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Measure impact on Results is off until ticked, takes a share from 1% to 50% at 10% by default, and sends what the person typed', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await toResults(page);
    const impact = page.getByRole('group', { name: 'Measure impact' });
    const box = impact.getByRole('checkbox', { name: /^Hold back a share of records to measure impact\./ });
    assert.equal(await box.isChecked(), false, 'nothing is held back unless the person asks');
    await impact.getByText('Inspire leaves the held-back records alone, so it can compare their results with the records people acted on.', { exact: false }).waitFor();
    assert.equal(await impact.getByRole('spinbutton').count(), 0, 'no share to type while it is off');
    await box.check();
    const share = impact.getByRole('spinbutton', { name: 'Share of records held back, in percent' });
    assert.equal(await share.inputValue(), '10');
    await impact.getByText('picked at random and kept the same on every run', { exact: false }).waitFor();
    assert.doesNotMatch(await impact.textContent(), /\u2014|\u2013/);
    await share.fill('60');
    await impact.getByText(SHARE_PROBLEM, { exact: true }).waitFor();
    await next(page);
    await page.locator('[role="alert"] p', { hasText: SHARE_PROBLEM }).waitFor();
    assert.equal(await page.locator('[aria-current="step"]').textContent(), '3. Results', 'a share above half the records keeps the person on Results');
    await share.fill('');
    await page.locator('[role="alert"] p', { hasText: SHARE_PROBLEM }).waitFor();
    await box.uncheck();
    assert.deepEqual(await footerErrors(page), [], 'turning it off clears the share problem with it');
    await box.check();
    assert.equal(await share.inputValue(), '10', 'turning it back on starts again from the default');
    await share.fill('25');
    assert.equal(await impact.getByText(SHARE_PROBLEM).count(), 0);
    await next(page);
    await onStep(page, 'Delivery');
    await startWhenReady(page);
    assert.deepEqual(submittedSpec(made).holdout, { enabled: true, share: 0.25 });
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('every list field keeps the comma or new line a person types, and sends each item', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' }, responses: NO_LAKEBASE });
  const { page, made } = ui;
  try {
    await toResults(page);
    await next(page);
    await onStep(page, 'Delivery');
    for (const name of [/^App /, /^Alert/]) await page.getByRole('checkbox', { name }).check();
    await advanced(page).click();
    const typed = [
      [page.getByPlaceholder('Filter widgets, comma separated'), 'top_k, region'],
      [page.getByPlaceholder('Up to 5 questions, one per line'), 'Who left?\nWho stays?'],
      [page.getByLabel('Email recipients (comma separated)'), `${OPS}, ${OWNER}`],
      [page.getByLabel('Failure emails (comma separated; default: the decision owner)'), `${OWNER}, ${OPS}`],
    ];
    for (const [field, text] of typed) {
      await field.fill('');
      await field.pressSequentially(text);
      assert.equal(await field.inputValue(), text, `the field keeps "${JSON.stringify(text)}" as typed`);
    }
    await throughApp(page);
    await startWhenReady(page);
    const spec = submittedSpec(made);
    assert.deepEqual(spec.outputs.dashboard_filters, ['top_k', 'region']);
    assert.deepEqual(spec.outputs.genie_questions, ['Who left?', 'Who stays?']);
    assert.deepEqual(spec.outputs.alert_recipients, [OPS, OWNER]);
    assert.deepEqual(spec.schedule.failure_emails, [OWNER, OPS]);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the alert row keeps its threshold short and its lists as wide as their choices, not the width of the dialog', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page } = ui;
  try {
    await toResults(page);
    await next(page);
    await onStep(page, 'Delivery');
    await page.getByRole('checkbox', { name: /^Alert/ }).check();
    await advanced(page).click();
    const width = async (locator) => Math.round((await locator.boundingBox()).width);
    const threshold = page.getByRole('spinbutton');
    assert.equal(await threshold.count(), 1);
    assert.ok(await width(threshold) <= 100, `the threshold is a short number field (${await width(threshold)} px)`);
    for (const value of ['act_now', '>=', 'fixed']) {
      const list = page.locator('select', { has: page.locator(`option[value="${value}"]`) });
      assert.ok(await width(list) < 300, `the list holding ${value} is as wide as its choices (${await width(list)} px)`);
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('App owners are typed under Advanced settings like alert recipients, checked as emails, and sent once each, only with an App', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' }, responses: NO_LAKEBASE });
  const { page, made } = ui;
  try {
    await toResults(page);
    await next(page);
    await onStep(page, 'Delivery');
    await advanced(page).click();
    const owners = page.getByLabel('App owners (comma separated)');
    await owners.waitFor();
    await page.getByRole('checkbox', { name: /^App / }).uncheck();
    assert.equal(await owners.count(), 0, 'no App, no owners to name');
    await page.getByRole('checkbox', { name: /^App / }).check();
    await page.getByText('You can always change the money at stake assumptions in the App. Add the work emails of other people who may change them too.').waitFor();
    assert.equal(await owners.inputValue(), '', 'nobody else unless named');
    await owners.pressSequentially(`${PAT}, nope`);
    assert.equal(await owners.inputValue(), `${PAT}, nope`);
    await next(page);
    await page.locator('[role="alert"] p', { hasText: 'App owners must be email addresses: nope' }).waitFor();
    assert.equal(await page.locator('[aria-current="step"]').textContent(), '4. Delivery');
    await owners.fill(`${PAT}, ${PAT.toUpperCase()}, ${LEE}`);
    await throughApp(page);
    await startWhenReady(page);
    assert.deepEqual(submittedSpec(made).outputs.app_owners, [PAT, LEE], 'each person once, in the order typed');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});
