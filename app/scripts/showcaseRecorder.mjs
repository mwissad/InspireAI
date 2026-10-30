import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SHOWCASE_HEADER, SHOWCASE_READ_ONLY, showcaseCanRead } = require('../backend/lib/showcase.js');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
};
const REAL_KEYS = ['inspire_database', 'warehouse_id'];
const GENIE_WAIT_MS = 180000;

export function apiWatch(page) {
  let inflight = 0;
  let last = Date.now();
  const mine = (request) => new URL(request.url()).pathname.includes('/api/');
  page.on('request', (r) => { if (mine(r)) { inflight += 1; last = Date.now(); } });
  const done = (r) => { if (mine(r)) { inflight = Math.max(0, inflight - 1); last = Date.now(); } };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return async ({ quiet = 1500, max = 90000 } = {}) => {
    const end = Date.now() + max;
    while (Date.now() < end) {
      if (inflight === 0 && Date.now() - last >= quiet) return true;
      await page.waitForTimeout(200);
    }
    return false;
  };
}

const parsed = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

function refuse(route, blocked, method, pathname) {
  blocked.push(`${method} ${pathname}`);
  return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: SHOWCASE_READ_ONLY, showcase: true }) });
}

async function passOn(route, exchanges, { url, headers, postData }) {
  const request = route.request();
  const response = await route.fetch({ url, method: request.method(), headers, postData });
  const text = await response.text();
  exchanges.push({ method: request.method(), url: request.url(), postData: request.postData() || undefined, status: response.status(), body: parsed(text) });
  return route.fulfill({ response, body: text });
}

function withReal(url, postData, real) {
  const target = new URL(url);
  for (const k of REAL_KEYS) if (target.searchParams.has(k)) target.searchParams.set(k, real[k]);
  if (!postData) return { url: target.toString(), postData: undefined };
  const body = parsed(postData);
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const k of REAL_KEYS) if (k in body) body[k] = real[k];
    return { url: target.toString(), postData: JSON.stringify(body) };
  }
  return { url: target.toString(), postData };
}

function serveDist(route, distDir, pathname) {
  const root = path.resolve(distDir);
  const file = path.resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
  const found = file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, 'index.html');
  return route.fulfill({ status: 200, contentType: TYPES[path.extname(found)] || 'application/octet-stream', body: fs.readFileSync(found) });
}

export async function routeInspireDemo(page, { origin, distDir = '', summary, real, authHeaders = {}, exchanges, blocked }) {
  for (const k of REAL_KEYS) if (!real[k]) throw new Error(`the Inspire App has no ${k}, so the demo cannot be recorded`);
  await page.route((u) => u.origin === origin, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/showcase') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ showcases: [summary] }) });
    }
    if (url.pathname.startsWith('/api/')) {
      const { [SHOWCASE_HEADER]: demo, ...headers } = request.headers();
      if (!demo) return route.continue({ headers: { ...headers, ...authHeaders } });
      if (!showcaseCanRead(request.method(), url.pathname)) return refuse(route, blocked, request.method(), url.pathname);
      return passOn(route, exchanges, { ...withReal(request.url(), request.postData(), real), headers: { ...headers, ...authHeaders } });
    }
    return distDir ? serveDist(route, distDir, url.pathname) : route.continue();
  });
}

export async function walkInspireDemo(page, { settle, log = () => {} }) {
  await page.getByRole('button', { name: 'See Demo Results' }).first().click();
  const list = page.getByRole('region', { name: 'Use case list' });
  const cards = list.locator('[aria-expanded]');
  await cards.first().waitFor({ timeout: 180000 });
  await settle();
  const n = await cards.count();
  for (let i = 0; i < n; i += 1) {
    await cards.nth(i).click();
    await settle();
  }
  log(`Results: opened ${n} use cases`);
  const open = list.getByRole('button', { name: 'Open MVP' });
  if (!(await open.count())) throw new Error('the demo session has no MVP on the Results page');
  await open.first().click();
  const rail = page.locator('nav[aria-label="Use cases"] section button');
  await rail.first().waitFor({ timeout: 120000 });
  await settle();
  const m = await rail.count();
  for (let i = 0; i < m; i += 1) {
    await rail.nth(i).click();
    await settle();
    const tabs = page.locator('[role="tablist"][aria-label="MVP views"] [role="tab"]');
    const t = await tabs.count();
    for (let j = 0; j < t; j += 1) {
      await tabs.nth(j).click();
      await settle();
      const drawers = page.getByRole('region', { name: 'Control tower' }).getByRole('button', { name: / details$/ });
      const d = await drawers.count();
      for (let k = 0; k < d; k += 1) {
        await drawers.nth(k).click();
        await settle();
        await page.keyboard.press('Escape');
        await settle();
      }
    }
    const details = page.getByRole('button', { name: 'Use case details' });
    if (await details.count()) {
      await details.first().click();
      await settle();
      await page.keyboard.press('Escape');
      await settle();
    }
  }
  log(`Build: opened ${m} use cases`);
}

async function askEach(page, settle, buttons, max, log, where) {
  let asked = 0;
  for (let i = 0; i < max; i += 1) {
    const button = page.locator(buttons).nth(i);
    if (!(await button.count())) break;
    const question = (await button.innerText()).trim();
    await button.click();
    await page.waitForFunction(() => document.querySelectorAll('.msg--genie').length > 0
      && !document.querySelector('.msg--genie .g-step'), null, { timeout: GENIE_WAIT_MS });
    await settle();
    asked += 1;
    log(`${where}: Genie answered "${question.slice(0, 80)}"`);
    const fresh = page.locator('.genie .g-h button.link', { hasText: 'New chat' });
    if (await fresh.count()) {
      await fresh.click();
      await settle();
    }
  }
  return asked;
}

async function walkScreen(page, settle, { rows, questions, log, where }) {
  const views = page.locator('nav.views [role="tab"]');
  const v = Math.max(1, await views.count());
  for (let i = 0; i < v; i += 1) {
    if (await views.count()) {
      await views.nth(i).click();
      await settle();
    }
    const clickable = page.locator('table.tbl tbody tr.is-click');
    const r = Math.min(rows, await clickable.count());
    for (let j = 0; j < r; j += 1) {
      await clickable.nth(j).click();
      await settle();
      await page.keyboard.press('Escape');
      await settle();
    }
  }
  const pickers = page.locator('.fbar button.msel');
  const p = Math.min(4, await pickers.count());
  for (let i = 0; i < p; i += 1) {
    await pickers.nth(i).click();
    const option = page.locator('.msel-pop .opt input').first();
    if (await option.count()) {
      await option.check();
      await settle();
    }
    await page.keyboard.press('Escape');
    const clear = page.locator('.fbar button.link', { hasText: 'Clear filters' });
    if (await clear.count()) {
      await clear.click();
      await settle();
    }
  }
  const selects = page.locator('.fbar select');
  const s = await selects.count();
  for (let i = 0; i < s; i += 1) {
    const values = await selects.nth(i).locator('option').evaluateAll((os) => os.map((o) => o.value));
    for (const value of values.filter((x) => x !== 'custom').slice(1, 4)) {
      await selects.nth(i).selectOption(value);
      await settle();
    }
    if (values.length) {
      await selects.nth(i).selectOption(values[0]);
      await settle();
    }
  }
  const genie = page.locator('header.top button.genie-btn');
  if (questions && (await genie.count())) {
    if ((await genie.getAttribute('aria-expanded')) !== 'true') await genie.click();
    await askEach(page, settle, '.genie .g-sugg button.sugg', questions, log, where);
    const rowAsk = page.locator('table.tbl tbody button.row-ask').first();
    if (await rowAsk.count()) {
      await rowAsk.click();
      await settle();
      await askEach(page, settle, '.genie .g-sugg[aria-label^="Questions about"] button.sugg', 1, log, `${where} record`);
    }
    const close = page.locator('.genie button[aria-label="Close Ask Genie"]');
    if (await close.count()) await close.click();
  }
}

export async function recordMvpApp(context, { url, authHeaders = {}, exchanges, blocked, log = () => {}, rows = 2, questions = 4 }) {
  const page = await context.newPage();
  const origin = new URL(url).origin;
  await page.route((u) => u.origin === origin && u.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (!showcaseCanRead(request.method(), pathname)) return refuse(route, blocked, request.method(), pathname);
    return passOn(route, exchanges, { url: request.url(), headers: { ...request.headers(), ...authHeaders }, postData: request.postData() || undefined });
  });
  const settle = apiWatch(page);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('.app').waitFor({ timeout: 120000 });
    await settle();
    const nav = page.locator('nav.side button');
    const n = await nav.count();
    for (let i = 0; i < n; i += 1) {
      const title = (await nav.nth(i).innerText()).split('\n')[0].trim();
      await nav.nth(i).click();
      await settle();
      const shared = ['Overview', 'Impact'].includes(title);
      await walkScreen(page, settle, { rows, questions: shared ? 0 : questions, log, where: title });
    }
    log(`MVP App ${origin}: walked ${n} screens`);
  } finally {
    await page.close();
  }
}
