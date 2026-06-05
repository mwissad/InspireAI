#!/usr/bin/env node
/**
 * Build __inspire_usecase_search via local backend (npm run dev must be running).
 * Usage: node scripts/run-embed-discover.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) throw new Error('Missing .env');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[t.slice(0, eq).trim()] = val;
  }
  return env;
}

async function localApi(token, host, method, apiPath, body) {
  const r = await fetch(`http://localhost:8080${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Databricks-Host': host,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || `${method} ${apiPath} → ${r.status}`);
  return json;
}

async function waitForIndex(token, host, db, wh, maxMin = 15) {
  for (let i = 0; i < maxMin * 12; i += 1) {
    const q = new URLSearchParams({ inspire_database: db, warehouse_id: wh });
    const st = await localApi(token, host, 'GET', `/api/discover/status?${q}`);
    if (st.ready) return st;
    process.stdout.write(`   waiting for index… (${i * 5}s)\r`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Timed out waiting for __inspire_usecase_search');
}

async function main() {
  const env = loadEnv();
  const host = (env.DATABRICKS_HOST || '').replace(/\/$/, '');
  const token = env.DATABRICKS_TOKEN;
  const wh = env.INSPIRE_WAREHOUSE_ID;
  const db = env.INSPIRE_DATABASE;
  if (!host || !token || !wh || !db) {
    throw new Error('Set DATABRICKS_HOST, DATABRICKS_TOKEN, INSPIRE_WAREHOUSE_ID, INSPIRE_DATABASE');
  }

  console.log('\n══ Inspire Discover — embed index build (via local backend) ══\n');
  const sync = await localApi(token, host, 'POST', '/api/discover/sync', {
    inspire_database: db,
    warehouse_id: wh,
  });
  console.log('▶', sync.message);
  if (sync.job_url) console.log('   Job:', sync.job_url);

  const status = await waitForIndex(token, host, db, wh);
  console.log(`\n✅ Index ready: ${status.indexed_usecases} use case(s)`);

  const chat = await localApi(token, host, 'POST', '/api/discover/chat', {
    message: 'What are the highest priority use cases by domain?',
    inspire_database: db,
    warehouse_id: wh,
  });
  console.log('\n── Sample chat answer ──\n');
  console.log((chat.answer || '').slice(0, 600));
  if (chat.sources?.length) console.log(`\n(${chat.sources.length} sources cited)`);
  console.log('\n👉 Open http://localhost:5173/ → Get started → Discover chat\n');
}

main().catch((e) => {
  console.error('\n❌', e.message);
  process.exit(1);
});
