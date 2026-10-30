#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { apiWatch, recordMvpApp, routeInspireDemo, walkInspireDemo } from './showcaseRecorder.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(root, 'frontend/node_modules/playwright'));
const { makeRecorder, mvpUrlsFrom, showcaseLeaks } = require('../backend/lib/showcaseRecord.js');

const env = process.env;
const need = (name) => {
  const value = String(env[name] || '').trim();
  if (!value) {
    console.error(`Set ${name}. Usage: INSPIRE_URL=<Inspire App URL> DATABRICKS_PROFILE=<profile> SESSION_ID=<session> SHOWCASE_ID=<id> SHOWCASE_TITLE=<title> MVPS=<use case ids, comma separated> node scripts/record-showcase.mjs`);
    process.exit(2);
  }
  return value;
};

const profile = need('DATABRICKS_PROFILE');
const cli = (...args) => JSON.parse(execFileSync('databricks', [...args, '-p', profile, '-o', 'json'], { encoding: 'utf8' }));
const appName = (url) => new URL(url).hostname.split('.')[0].replace(/-\d+$/, '');

const inspireUrl = need('INSPIRE_URL').replace(/\/+$/, '');
const sessionId = need('SESSION_ID');
const id = need('SHOWCASE_ID');
const title = need('SHOWCASE_TITLE');
const mvpIds = need('MVPS').split(',').map((s) => s.trim()).filter(Boolean);
const out = path.resolve(env.OUT || path.join(root, 'backend/showcase', `${id}.json`));
const distDir = path.resolve(env.DIST || path.join(root, 'frontend/dist'));
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error(`${distDir} has no index.html: run npm run build in app/frontend first`);
  process.exit(2);
}

const token = cli('auth', 'token').access_token;
const authHeaders = { Authorization: `Bearer ${token}` };
const defaults = await (await fetch(`${inspireUrl}/api/defaults`, { headers: authHeaders })).json();
const real = { inspire_database: defaults.inspireDatabase, warehouse_id: defaults.warehouseId };

const log = (line) => console.log(`[record] ${line}`);
const inspire = [];
const mvpExchanges = Object.fromEntries(mvpIds.map((m) => [m, []]));
const blocked = [];
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: authHeaders });
  const page = await context.newPage();
  const settle = apiWatch(page);
  await routeInspireDemo(page, {
    origin: new URL(inspireUrl).origin,
    distDir,
    summary: { id, title, business: env.SHOWCASE_BUSINESS || title, summary: env.SHOWCASE_SUMMARY || '', session_id: sessionId, mvps: [] },
    real,
    authHeaders,
    exchanges: inspire,
    blocked,
  });
  await page.goto(`${inspireUrl}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await walkInspireDemo(page, { settle, log });
  await page.close();

  const urls = mvpUrlsFrom(inspire, mvpIds);
  const lost = mvpIds.filter((m) => !urls[m]);
  if (lost.length) throw new Error(`the session has no App for ${lost.join(', ')}`);
  for (const m of mvpIds) {
    await recordMvpApp(context, { url: urls[m], authHeaders, exchanges: mvpExchanges[m], blocked, log: (line) => log(`${m} ${line}`) });
  }

  const replace = {};
  const me = cli('current-user', 'me');
  if (me.displayName) replace[me.displayName] = 'Demo User';
  if (me.userName) replace[me.userName] = 'person@example.com';
  const catalog = String(real.inspire_database).split('.')[0];
  if (catalog && !['main', 'samples', 'hive_metastore'].includes(catalog)) replace[catalog] = 'demo_catalog';
  for (const url of [inspireUrl, ...Object.values(urls)]) {
    const app = cli('apps', 'get', appName(url));
    if (app.service_principal_name) replace[app.service_principal_name] = 'the App service principal';
    if (app.service_principal_client_id) replace[app.service_principal_client_id] = 'the App service principal';
  }
  Object.assign(replace, env.SHOWCASE_REPLACE ? JSON.parse(env.SHOWCASE_REPLACE) : {});

  const titleOf = (m) => {
    const home = mvpExchanges[m].find((x) => x.method === 'GET' && new URL(x.url).pathname === '/api/app' && x.status === 200);
    return (home && home.body && home.body.title) || m;
  };
  const recorder = makeRecorder({
    id, title, business: env.SHOWCASE_BUSINESS || title, summary: env.SHOWCASE_SUMMARY || '', sessionId, replace,
    mvps: mvpIds.map((m) => ({ id: m, title: titleOf(m), url: urls[m] })),
  });
  for (const x of inspire) recorder.addInspire(x);
  for (const m of mvpIds) for (const x of mvpExchanges[m]) recorder.addMvp(m, x);
  const bundle = recorder.bundle();
  const leaks = showcaseLeaks(bundle, [...Object.keys(replace), sessionId, new URL(inspireUrl).hostname]);
  if (leaks.length) {
    console.error(`The recording still names private details, so nothing was written:\n${leaks.slice(0, 40).join('\n')}`);
    process.exitCode = 1;
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const text = `${JSON.stringify(bundle, null, 1)}\n`;
    fs.writeFileSync(out, text);
    log(`wrote ${out}: ${Object.keys(bundle.inspire).length} Inspire answers, ${mvpIds.map((m) => `${m} ${Object.keys(bundle.mvps[m].api).length}`).join(', ')} MVP answers, ${(text.length / 1024).toFixed(0)} KB`);
  }
  if (blocked.length) log(`refused ${blocked.length} writes during the walk: ${[...new Set(blocked)].join(', ')}`);
} finally {
  await browser.close();
}
