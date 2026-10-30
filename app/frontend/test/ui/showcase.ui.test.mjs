import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { RESULTS, STUDIO_STATE } from './implementFixtures.js';
import { closeBrowser, openUi } from './uiSupport.mjs';
import { apiWatch, routeInspireDemo, walkInspireDemo } from '../../../scripts/showcaseRecorder.mjs';
import { SHOWCASE_NOTE, SHOWCASE_OPEN_APP } from '../../src/lib/showcase.js';

const require = createRequire(import.meta.url);
const { makeRecorder, showcaseLeaks } = require('../../../backend/lib/showcaseRecord.js');
const { SHOWCASE_HEADER, SHOWCASE_READ_ONLY, registerShowcaseRoutes, showcaseMvpPath } = require('../../../backend/lib/showcase.js');

test.after(closeBrowser);

const DEMO = { id: 'acme', title: 'Acme retail', business: 'Acme', summary: 'Use cases Inspire found on the Acme sales data.' };
const MVP_URL = STUDIO_STATE.history[0].app_url;
const HOSTED = showcaseMvpPath(DEMO.id, 'N01-U01');
const STATE = { ...STUDIO_STATE, results: RESULTS, useCases: [] };
const DEFAULTS = {
  envSkipsSetupWizard: true, isDatabricksApp: true, databricksHost: 'https://workspace.example.com',
  warehouseId: 'wh1', inspireDatabase: 'main.inspire', notebookPath: '/Shared/inspire_ai',
};
const SHELL = {
  'static/index.html': '<!doctype html><html><head><link rel="stylesheet" href="assets/index.css"></head><body><main class="app">Loading</main><script src="assets/app.js"></script></body></html>',
  'static/assets/app.js': "fetch('api/app').then((r) => r.json()).then((d) => { document.querySelector('.app').textContent = d.title; });",
  'static/assets/index.css': '.app { font: 16px sans-serif; }',
};
const WRITE_SQL = /\b(?:INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|MERGE\s+INTO)\b/i;
const serveDefaults = (app) => app.get('/api/defaults', (_req, res) => res.json(DEFAULTS));
const besidesRefusals = (errors) => errors.filter((e) => !/status of 403 \(Forbidden\)/.test(e));
const demoBar = (page) => page.getByRole('region', { name: 'Demo' });
const list = (page) => page.getByRole('region', { name: 'Use case list' });

let demoDir = '';

test('recording the demo walks every Results and Build view through the read-only guard and changes nothing', async () => {
  const exchanges = [];
  const blocked = [];
  const summary = { ...DEMO, session_id: '42', mvps: [] };
  const ui = await openUi('app', STATE, '', {
    mount: serveDefaults,
    init: (page, origin) => routeInspireDemo(page, {
      origin, summary, real: { inspire_database: DEFAULTS.inspireDatabase, warehouse_id: DEFAULTS.warehouseId }, exchanges, blocked,
    }),
  });
  const { page, made } = ui;
  try {
    const settle = apiWatch(page);
    await walkInspireDemo(page, { settle });
    assert.deepEqual(blocked, [], 'viewing the demo sends no write');
    await page.locator('nav[aria-label="Use cases"] section button', { hasText: 'Predict churn' }).click();
    await settle();
    await page.getByRole('region', { name: 'Run and schedule', exact: true }).getByRole('button', { name: 'Preview re-run' }).click();
    await page.getByText(SHOWCASE_READ_ONLY).first().waitFor();
    assert.deepEqual(blocked, ['POST /api/inspire/implement/rerun'], 'the recorder refuses a write before it reaches the workspace');
    assert.equal(made.jobs.length, 0);
    assert.deepEqual(made.sqlCalls.filter((c) => WRITE_SQL.test(String(c.sql))).map((c) => c.sql), []);
    assert.deepEqual(made.fetches.filter((f) => String(f.opts.method || 'GET').toUpperCase() !== 'GET').map((f) => f.path), []);
    const paths = new Set(exchanges.map((x) => `${x.method} ${new URL(x.url).pathname}`));
    for (const want of ['GET /api/inspire/sessions', 'GET /api/inspire/results', 'GET /api/inspire/implement/history']) {
      assert.ok(paths.has(want), `the walk read ${want}`);
    }

    const recorder = makeRecorder({
      ...DEMO, sessionId: '42', replace: { 'amr@x': 'person@example.com' }, mvps: [{ id: 'N01-U01', title: 'Predict churn', url: MVP_URL }],
    });
    for (const x of exchanges) recorder.addInspire(x);
    recorder.addMvp('N01-U01', { method: 'GET', url: `${MVP_URL}/api/app`, status: 200, body: { title: 'Churn desk' } });
    const bundle = recorder.bundle();
    assert.deepEqual(showcaseLeaks(bundle, ['amr@x']), []);
    const text = JSON.stringify(bundle);
    assert.ok(!text.includes(new URL(MVP_URL).host), 'the MVP App host is gone');
    assert.ok(text.includes(`"app_url":"${HOSTED}"`), 'the App link points at the MVP hosted in Inspire');
    assert.ok(text.includes(`"dashboard_url":"${HOSTED}"`) && text.includes(`"genie_space_url":"${HOSTED}"`));
    demoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inspire-showcase-'));
    fs.writeFileSync(path.join(demoDir, `${DEMO.id}.json`), JSON.stringify(bundle));
    assert.deepEqual(besidesRefusals(ui.pageErrors), []);
  } finally {
    await ui.close();
  }
});

test('the demo replays every view from the bundle with no workspace call, refuses changes in plain words, and Get Started or Leave demo leave it', async () => {
  assert.ok(demoDir, 'the recording test saved the demo');
  const ui = await openUi('app', STATE, '', {
    mount: (app) => {
      serveDefaults(app);
      registerShowcaseRoutes(app, { dir: demoDir, shellFiles: SHELL });
    },
  });
  const { page, made } = ui;
  const failed = [];
  const sent = [];
  page.on('response', (r) => {
    const p = new URL(r.url()).pathname;
    if ((p.startsWith('/api/') || p.startsWith('/showcase/')) && r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${p}`);
  });
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith('/api/') && p !== '/api/showcase') sent.push({ path: p, demo: Boolean(r.headers()[SHOWCASE_HEADER]) });
  });
  const settle = apiWatch(page);
  try {
    await page.getByRole('button', { name: 'See Demo Results' }).first().waitFor();
    await settle();
    const opened = sent.length;
    await page.getByRole('button', { name: 'See Demo Results' }).first().click();
    await demoBar(page).getByText(SHOWCASE_NOTE).waitFor();
    const cards = list(page).locator('[aria-expanded]');
    await cards.first().waitFor();
    assert.equal(await cards.count(), 6);
    assert.equal(await page.getByRole('button', { name: /Start MVP/ }).count(), 0, 'the demo offers no new build');
    await cards.filter({ hasText: 'Predict churn' }).click();
    await settle();
    await list(page).getByRole('button', { name: 'Open MVP' }).click();
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await page.locator('nav[aria-label="Use cases"] section button').first().waitFor();
    await settle();
    for (const name of ['Edit the MVP', 'Start MVP']) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0, name);
    assert.equal(await page.getByRole('button', { name: /Uninstall/ }).count(), 0);

    const rerun = page.getByRole('region', { name: 'Run and schedule', exact: true }).getByRole('button', { name: 'Preview re-run' });
    await rerun.click();
    await page.getByText(SHOWCASE_READ_ONLY).first().waitFor();

    await page.getByRole('tab', { name: 'Control Tower', exact: true }).click();
    await settle();
    await page.getByRole('region', { name: 'Control tower' }).getByRole('button', { name: 'Dashboard details', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Dashboard details', exact: true });
    const link = drawer.getByRole('link', { name: SHOWCASE_OPEN_APP });
    assert.equal(await link.getAttribute('href'), HOSTED);
    const [mvp] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
    await mvp.locator('.app', { hasText: 'Churn desk' }).waitFor();
    assert.equal(new URL(mvp.url()).pathname, HOSTED);
    await mvp.close();
    await page.keyboard.press('Escape');
    await settle();

    assert.equal(made.sqlCalls.length, 0, 'the demo reads nothing from the warehouse');
    assert.equal(made.fetches.length, 0, 'the demo calls no workspace API');
    assert.equal(made.jobs.length, 0);
    assert.deepEqual(failed, ['403 POST /api/inspire/implement/rerun'], 'every view had a saved answer');
    assert.ok(sent.length > opened, 'the demo read its saved answers');
    assert.deepEqual(sent.slice(opened).filter((s) => !s.demo).map((s) => s.path), [], 'every request in the demo was a demo request');
    assert.deepEqual(besidesRefusals(ui.pageErrors), []);

    await demoBar(page).getByRole('button', { name: 'Leave demo' }).click();
    await page.getByRole('button', { name: 'See Demo Results' }).first().waitFor();
    assert.equal(await demoBar(page).count(), 0);
    await page.getByRole('button', { name: 'See Demo Results' }).first().click();
    await demoBar(page).waitFor();
    await settle();
    const before = sent.length;
    await demoBar(page).getByRole('button', { name: 'Get Started' }).click();
    await demoBar(page).waitFor({ state: 'detached' });
    await settle();
    assert.deepEqual(sent.slice(before).filter((s) => s.demo).map((s) => s.path), [], 'Get Started works on the real workspace');
  } finally {
    await ui.close();
    if (demoDir) fs.rmSync(demoDir, { recursive: true, force: true });
  }
});
