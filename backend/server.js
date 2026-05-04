const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
// Load backend/.env then repo root — second file only fills keys not already set.
// Never overrides process.env so Databricks App runtime–injected vars always win.
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const multer = require('multer');
const AdmZip = require('adm-zip');
const crypto = require('crypto');
const yaml = require('js-yaml');
const { stripAiDemoDisclaimerHtml, stripDisclaimerDeep } = require('./stripAiDisclaimer');

const app = express();
app.use(express.json({ limit: '50mb' }));

// ═══════════════════════════════════════════════════
//  Environment Configuration (generic — no defaults)
// ═══════════════════════════════════════════════════

// DATABRICKS_HOST: required — set by the Databricks App runtime or by the admin.
// No hardcoded workspace URL — the app is customer-agnostic.
const DATABRICKS_HOST = (process.env.DATABRICKS_HOST || '').trim();
const DEFAULT_NOTEBOOK_PATH = process.env.NOTEBOOK_PATH || '';

// Installer-injected defaults — pre-fill the Setup Wizard so users skip manual config.
const DEFAULT_WAREHOUSE_ID = process.env.INSPIRE_WAREHOUSE_ID || '';
const DEFAULT_INSPIRE_DB = process.env.INSPIRE_DATABASE || '';

// Static token (legacy / manual config) — trim so pasted PATs with trailing newlines are accepted
let SERVICE_TOKEN = (process.env.DATABRICKS_TOKEN || '').trim();

// SP OAuth credentials — Databricks App runtime injects these automatically
// when a service principal resource is declared in app.yaml.
// Fallback: installer may also set these via SP_CLIENT_ID/SP_CLIENT_SECRET env vars.
const SP_CLIENT_ID = process.env.DATABRICKS_CLIENT_ID || process.env.SP_CLIENT_ID || '';
const SP_CLIENT_SECRET = process.env.DATABRICKS_CLIENT_SECRET || process.env.SP_CLIENT_SECRET || '';
let spTokenCache = '';    // cached OAuth token
let spTokenExpiry = 0;    // epoch ms when cached token expires
/** In-flight OIDC fetch — concurrent callers await the same promise (singleflight). */
let spRefreshInFlight = null;
/** One chained refresh timer; cleared before rescheduling so bursts don’t stack timers. */
let spScheduledRefreshTimer = null;
const DEBUG_SP_AUTH = process.env.DEBUG_SP_AUTH === '1' || process.env.INSPIRE_DEBUG_SP_AUTH === '1';

function spOAuthTokenStillFresh() {
  if (!spTokenCache) return false;
  if (!spTokenExpiry) return true;
  return Date.now() < spTokenExpiry - 120000; // 2 min skew before expiry
}

/** True when the process has App / installer–style auth (not “host only” from a dev .env). */
function hasDatabricksPlatformAuth() {
  return !!(SERVICE_TOKEN || (SP_CLIENT_ID && SP_CLIENT_SECRET));
}

// Path to the bundled notebook file — try several candidate locations
// v47: switched from DBC archive to direct JUPYTER (.ipynb) format
const NOTEBOOK_CANDIDATES = [
  path.resolve(__dirname, '..', 'dbx_inspire_ai_agent.ipynb'),
  path.resolve(__dirname, 'dbx_inspire_ai_agent.ipynb'),
];
let BUNDLED_NOTEBOOK_PATH = NOTEBOOK_CANDIDATES.find(p => fs.existsSync(p)) || '';
const IS_IPYNB = BUNDLED_NOTEBOOK_PATH.endsWith('.ipynb');

// If no physical notebook found, try to materialize from embedded base64 bundle
if (!BUNDLED_NOTEBOOK_PATH) {
  try {
    const b64 = require('./notebook_bundle');
    const materializedPath = path.resolve(__dirname, 'dbx_inspire_ai_agent.ipynb');
    fs.writeFileSync(materializedPath, Buffer.from(b64, 'base64'));
    BUNDLED_NOTEBOOK_PATH = materializedPath;
    console.log('Notebook materialized from embedded bundle.');
  } catch (_) {
    BUNDLED_NOTEBOOK_PATH = NOTEBOOK_CANDIDATES[0]; // fallback path (will show "not found")
  }
}

// ═══════════════════════════════════════════════════
//  Middleware
// ═══════════════════════════════════════════════════

// CORS — only needed in dev (separate Vite server);
// in production the backend serves the static frontend.
if (process.env.NODE_ENV !== 'production') {
  app.use(cors());
}

// Frontend build dir — `express.static` is mounted AFTER all `/api/*` routes (see SPA block below)
// so API POST/PUT never hit static file middleware first.
const STATIC_DIR = path.resolve(__dirname, '..', 'frontend', 'dist');

// OpenAPI / API Docs
const openapiSpec = yaml.load(fs.readFileSync(path.resolve(__dirname, 'openapi.yaml'), 'utf8'));
const apiDocsHtml = fs.readFileSync(path.resolve(__dirname, 'api-docs.html'), 'utf8');
app.get('/api-docs', (req, res) => res.type('html').send(apiDocsHtml));
app.get('/api/openapi.json', (req, res) => res.json(openapiSpec));

// Request logger
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
    });
  }
  next();
});

// Multer for file uploads (store in memory)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ═══════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════

// ── SP Token Management ──
// Refresh token using client_credentials OAuth2 flow.
// Singleflight: parallel callers share one OIDC request. One scheduled timer for proactive refresh.
function scheduleSpTokenRefresh(delayMs) {
  if (spScheduledRefreshTimer) clearTimeout(spScheduledRefreshTimer);
  spScheduledRefreshTimer = setTimeout(() => {
    spScheduledRefreshTimer = null;
    refreshSpToken().catch((e) => console.error('🔑 Scheduled SP refresh failed:', e.message));
  }, delayMs);
}

async function refreshSpToken() {
  if (!SP_CLIENT_ID || !SP_CLIENT_SECRET) return;
  if (spRefreshInFlight) return spRefreshInFlight;

  const run = async () => {
    let host = DATABRICKS_HOST || '';
    if (host && !host.startsWith('http')) host = `https://${host}`;
    if (!host) return;

    if (DEBUG_SP_AUTH) console.log('🔑 SP OAuth: fetching token…');
    try {
      const resp = await fetch(`${host}/oidc/v1/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: SP_CLIENT_ID,
          client_secret: SP_CLIENT_SECRET,
          scope: 'all-apis',
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        spTokenCache = data.access_token || '';
        const expiresIn = data.expires_in || 3600;
        spTokenExpiry = Date.now() + expiresIn * 1000;
        if (DEBUG_SP_AUTH) console.log(`🔑 SP OAuth: cached (expires_in=${expiresIn}s)`);
        const refreshIn = Math.max((expiresIn - 300) * 1000, 60000);
        scheduleSpTokenRefresh(refreshIn);
      } else {
        const errText = await resp.text();
        console.error(`🔑 SP token refresh failed (${resp.status}): ${errText.slice(0, 300)}`);
        scheduleSpTokenRefresh(30000);
      }
    } catch (err) {
      console.error('🔑 SP token refresh error:', err.message);
      scheduleSpTokenRefresh(30000);
    }
  };

  spRefreshInFlight = run();
  try {
    await spRefreshInFlight;
  } finally {
    spRefreshInFlight = null;
  }
}

function resolveHost(req) {
  // In a deployed Databricks App with platform auth, always use the runtime-injected host.
  // A stale X-Databricks-Host from browser localStorage can point at another workspace and
  // make Unity Catalog calls use the wrong realm while the token is still the app SP.
  if (process.env.NODE_ENV === 'production' && DATABRICKS_HOST && hasDatabricksPlatformAuth()) {
    let h = String(DATABRICKS_HOST).replace(/\/+$/, '');
    if (h && !h.startsWith('http')) h = `https://${h}`;
    return h || null;
  }
  let host = req.headers['x-databricks-host'] || DATABRICKS_HOST || '';
  host = host.replace(/\/+$/, '');
  if (host && !host.startsWith('http')) host = `https://${host}`;
  return host || null;
}

async function dbFetch(host, token, apiPath, options = {}) {
  if (!host) throw new Error('Databricks host not configured.');
  const url = `${host}${apiPath}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return resp;
}

/** Unity Catalog REST: list all catalogs (paginated). */
async function listCatalogsRest(host, token) {
  const all = [];
  let pageToken = '';
  for (let page = 0; page < 40; page++) {
    const qs = new URLSearchParams();
    qs.set('max_results', '200');
    if (pageToken) qs.set('page_token', pageToken);
    const response = await dbFetch(host, token, `/api/2.1/unity-catalog/catalogs?${qs}`);
    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || `HTTP ${response.status}`);
    }
    const data = await response.json();
    const batch = data.catalogs || [];
    all.push(...batch);
    pageToken = data.next_page_token || '';
    if (!pageToken) break;
  }
  return all;
}

/** SQL warehouse fallback when REST catalog list is empty (SP often sees catalogs here first). */
async function listCatalogNamesSql(host, token, warehouseId) {
  if (!warehouseId) return [];
  try {
    const result = await executeSql(host, token, warehouseId, 'SHOW CATALOGS');
    const rows = sqlResultToObjects(result);
    const names = [];
    for (const row of rows) {
      const n =
        row.catalog ??
        row.CATALOG ??
        row.catalog_name ??
        row.namespace ??
        (typeof row.database === 'string' ? row.database : null);
      if (n && typeof n === 'string' && !n.startsWith('__')) names.push(n);
    }
    return [...new Set(names)].sort();
  } catch (err) {
    console.warn(`   ⚠️ SHOW CATALOGS fallback failed: ${err.message}`);
    return [];
  }
}

function quoteSqlIdent(part) {
  return '`' + String(part).replace(/`/g, '') + '`';
}

/** Unity Catalog REST: list all schemas in a catalog (paginated — first page alone is often truncated). */
async function listSchemasRest(host, token, catalog) {
  const all = [];
  let pageToken = '';
  for (let page = 0; page < 100; page++) {
    const qs = new URLSearchParams();
    qs.set('catalog_name', catalog);
    qs.set('max_results', '500');
    if (pageToken) qs.set('page_token', pageToken);
    const response = await dbFetch(host, token, `/api/2.1/unity-catalog/schemas?${qs}`);
    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || `HTTP ${response.status}`);
    }
    const data = await response.json();
    const batch = data.schemas || [];
    all.push(...batch);
    pageToken = data.next_page_token || '';
    if (!pageToken) break;
  }
  return all;
}

/** Unity Catalog REST: list all tables in a schema (paginated). */
async function listTablesRest(host, token, catalog, schema) {
  const all = [];
  let pageToken = '';
  for (let page = 0; page < 200; page++) {
    const qs = new URLSearchParams();
    qs.set('catalog_name', catalog);
    qs.set('schema_name', schema);
    qs.set('max_results', '500');
    if (pageToken) qs.set('page_token', pageToken);
    const response = await dbFetch(host, token, `/api/2.1/unity-catalog/tables?${qs}`);
    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || `HTTP ${response.status}`);
    }
    const data = await response.json();
    const batch = data.tables || [];
    all.push(...batch);
    pageToken = data.next_page_token || '';
    if (!pageToken) break;
  }
  return all;
}

async function listSchemasSql(host, token, warehouseId, catalog) {
  if (!warehouseId || !catalog) return [];
  try {
    const stmt = `SHOW SCHEMAS IN ${quoteSqlIdent(catalog)}`;
    const result = await executeSql(host, token, warehouseId, stmt);
    const rows = sqlResultToObjects(result);
    const out = [];
    for (const row of rows) {
      const name =
        row.databaseName ??
        row.database_name ??
        row.namespace ??
        row.schemaName ??
        row.name;
      if (!name || typeof name !== 'string') continue;
      const full = `${catalog}.${name}`;
      out.push({ name, full_name: full, comment: '' });
    }
    return out;
  } catch (err) {
    console.warn(`   ⚠️ SHOW SCHEMAS fallback failed for ${catalog}: ${err.message}`);
    return [];
  }
}

async function listTablesSql(host, token, warehouseId, catalog, schema) {
  if (!warehouseId || !catalog || !schema) return [];
  try {
    const stmt = `SHOW TABLES IN ${quoteSqlIdent(catalog)}.${quoteSqlIdent(schema)}`;
    const result = await executeSql(host, token, warehouseId, stmt);
    const rows = sqlResultToObjects(result);
    const out = [];
    for (const row of rows) {
      const tname = row.tableName ?? row.table_name ?? row.name;
      if (!tname || typeof tname !== 'string') continue;
      out.push({
        name: tname,
        full_name: `${catalog}.${schema}.${tname}`,
        catalog_name: catalog,
        schema_name: schema,
        table_type: 'MANAGED',
        data_source_format: '',
        updated_at: null,
        created_at: null,
        comment: '',
        owner: '',
        columns: 0,
      });
    }
    return out;
  } catch (err) {
    console.warn(`   ⚠️ SHOW TABLES fallback failed for ${catalog}.${schema}: ${err.message}`);
    return [];
  }
}

// Synchronous token resolution — uses pre-warmed cached token.
function getToken(req) {
  // Local dev: PAT from .env wins over browser headers so rotating DATABRICKS_TOKEN works without clearing localStorage.
  if (process.env.NODE_ENV !== 'production' && SERVICE_TOKEN) {
    return SERVICE_TOKEN;
  }

  // 1) Explicit PAT from frontend header
  const pat = req.headers['x-db-pat-token'];
  if (pat) return String(pat).trim();

  // 2) Authorization Bearer header
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }

  const forwarded = req.headers['x-forwarded-access-token'];
  const forwardedClean = forwarded
    ? (forwarded.startsWith('Bearer ') ? forwarded.slice(7).trim() : forwarded.trim())
    : '';

  // 3–5) Databricks App (production + SP): prefer static / SP token over x-forwarded-access-token.
  // Delegated user tokens expire; Inspire Results/SQL should keep working on the app service principal.
  const spBackedApp = process.env.NODE_ENV === 'production' && SP_CLIENT_ID && SP_CLIENT_SECRET;
  if (spBackedApp) {
    if (SERVICE_TOKEN) return SERVICE_TOKEN;
    if (spOAuthTokenStillFresh()) return spTokenCache;
    if (spTokenCache) return spTokenCache;
    if (forwardedClean) return forwardedClean;
    return null;
  }

  if (forwardedClean) return forwardedClean;
  if (SERVICE_TOKEN) return SERVICE_TOKEN;
  if (spTokenCache) return spTokenCache;

  return null;
}

async function requireToken(req, res, next) {
  try {
    if (SP_CLIENT_ID && SP_CLIENT_SECRET) {
      const needRefresh = !spTokenCache || !spTokenExpiry || Date.now() >= spTokenExpiry - 120000;
      if (needRefresh) await refreshSpToken();
    }
    const token = getToken(req);
    if (!token) {
      console.error(`🔒 No token for ${req.method} ${req.path} | forwarded=${!!req.headers['x-forwarded-access-token']} spCache=${!!spTokenCache} serviceToken=${!!SERVICE_TOKEN}`);
      return res.status(401).json({ error: 'No authentication token available.' });
    }
    req.dbToken = token;
    req.dbHost = resolveHost(req);
    if (!req.dbHost) {
      return res.status(400).json({ error: 'Databricks host not configured.' });
    }
    next();
  } catch (err) {
    console.error(`🔒 requireToken error: ${err.message}`);
    next(err);
  }
}

// Execute SQL via Databricks SQL Statement Execution API
async function executeSql(host, token, warehouseId, sql) {
  console.log(`   🔶 SQL: ${sql.substring(0, 150)}...`);

  const submitResp = await dbFetch(host, token, '/api/2.0/sql/statements', {
    method: 'POST',
    body: JSON.stringify({
      warehouse_id: warehouseId,
      statement: sql,
      wait_timeout: '50s',
      on_wait_timeout: 'CONTINUE',
      disposition: 'INLINE',
      format: 'JSON_ARRAY',
    }),
  });
  if (!submitResp.ok) {
    const errText = await submitResp.text();
    console.error(`   ❌ SQL submit failed (${submitResp.status}): ${errText.substring(0, 200)}`);
    throw new Error(`SQL failed (${submitResp.status}): ${errText}`);
  }
  let result = await submitResp.json();
  console.log(`   📄 SQL state: ${result.status?.state}`);

  // Poll if still running
  let pollCount = 0;
  while (result.status?.state === 'PENDING' || result.status?.state === 'RUNNING') {
    pollCount++;
    await new Promise(r => setTimeout(r, 2000));
    const pollResp = await dbFetch(host, token, `/api/2.0/sql/statements/${result.statement_id}`);
    if (!pollResp.ok) throw new Error(`SQL polling failed`);
    result = await pollResp.json();
    if (pollCount % 5 === 0) console.log(`   ⏳ Polling (${pollCount})...`);
  }

  if (result.status?.state === 'FAILED') {
    const errMsg = result.status?.error?.message || 'SQL statement execution failed';
    throw new Error(errMsg);
  }

  // Handle chunked results
  if (result.manifest?.total_chunk_count > 1 && result.manifest?.chunks) {
    let allData = result.result?.data_array || [];
    for (const chunk of result.manifest.chunks) {
      if (chunk.chunk_index === 0) continue;
      const chunkResp = await dbFetch(host, token, `/api/2.0/sql/statements/${result.statement_id}/result/chunks/${chunk.chunk_index}`);
      if (chunkResp.ok) {
        const chunkData = await chunkResp.json();
        if (chunkData.data_array) allData = allData.concat(chunkData.data_array);
      }
    }
    result.result = result.result || {};
    result.result.data_array = allData;
  }

  const rowCount = result.result?.data_array?.length ?? 0;
  console.log(`   ✅ SQL done: ${rowCount} rows`);
  return result;
}

/** Delta optimistic concurrency (notebook + UI can touch __inspire_usecases at once). */
function isDeltaConcurrentWriteConflict(message) {
  const m = String(message || '');
  return (
    /DELTA_CONCURRENT_APPEND|ROW_LEVEL_CHANGES|Transaction conflict|ConcurrentTransaction|concurrent update|Cannot write.*conflict|CONCURRENT_APPEND/i.test(
      m,
    )
  );
}

/** Re-run the same SQL statement after short backoff when Delta reports a row-level conflict. */
async function executeSqlWithDeltaRetry(host, token, warehouseId, sql, options = {}) {
  const maxAttempts = options.maxAttempts ?? 6;
  const baseDelayMs = options.baseDelayMs ?? 100;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await executeSql(host, token, warehouseId, sql);
    } catch (e) {
      const msg = e.message || String(e);
      if (!isDeltaConcurrentWriteConflict(msg) || attempt === maxAttempts) {
        throw e;
      }
      const jitter = baseDelayMs * attempt + Math.floor(Math.random() * baseDelayMs);
      console.warn(`   🔄 Delta conflict, SQL retry ${attempt}/${maxAttempts - 1} in ${jitter}ms`);
      await new Promise((r) => setTimeout(r, jitter));
    }
  }
  throw new Error('executeSqlWithDeltaRetry: unreachable');
}

// Helper: convert SQL result to array of objects
function sqlResultToObjects(result) {
  const columns = result.manifest?.schema?.columns;
  if (!Array.isArray(columns) || columns.length === 0) {
    console.warn('sqlResultToObjects: missing or empty manifest.schema.columns; treating as 0 rows.');
    return [];
  }
  const colNames = columns.map(c => c.name);
  const rows = result.result?.data_array || [];
  return rows.map(row => {
    const obj = {};
    colNames.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

/** inspire_database must be exactly `catalog_name`.`schema_name` (one dot). */
function splitInspireDatabase(inspire_database) {
  if (!inspire_database || typeof inspire_database !== 'string') return null;
  const s = inspire_database.trim();
  const parts = s.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { catalog: parts[0], schema: parts[1] };
}

function escapeSqlStringLiteral(value) {
  return String(value ?? '').replace(/'/g, "''");
}

/** True if ALTER TABLE ADD COLUMN failed only because the column is already present. */
function isAlterAddColumnAlreadyExistsError(message) {
  const m = String(message || '');
  return (
    /already exists|ALREADY_EXISTS|DUPLICATE_COLUMN|FIELD_ALREADY_EXISTS|already present|already defined|is already a column|Cannot add column.*already|nested column.*already exists|Column.*already exists|duplicate column name|field.*already exists|Duplicate field/i.test(
      m,
    )
  );
}

/**
 * Older __inspire_usecases Delta tables lack Route-1 Genie columns; add them before UPDATE.
 * Tries `ADD COLUMN` (Spark/Inspire notebook style), then `ADD COLUMNS (...)` if the warehouse
 * rejects the first form. Ignores "already exists" so this is safe to repeat.
 */
async function ensureUsecasesGenieRoute1Columns(host, token, warehouseId, ucTable) {
  const tryAddColumn = async (colName, colType) => {
    const colSql = `${colName} ${colType}`;
    const variants = [
      `ALTER TABLE ${ucTable} ADD COLUMN ${colSql}`,
      `ALTER TABLE ${ucTable} ADD COLUMNS (${colSql})`,
    ];
    for (let i = 0; i < variants.length; i++) {
      const sql = variants[i];
      try {
        await executeSql(host, token, warehouseId, sql);
        console.log(`   📌 Added column ${colName} (${i === 0 ? 'ADD COLUMN' : 'ADD COLUMNS'})`);
        return;
      } catch (e) {
        const msg = e.message || String(e);
        if (isAlterAddColumnAlreadyExistsError(msg)) {
          return;
        }
        const tryNext =
          i < variants.length - 1 &&
          /PARSE_SYNTAX_ERROR|ParseException|syntax error|near `ADD`|Unsupported operation|ParsingException|INVALID_SYNTAX|unexpected/i.test(
            msg,
          );
        if (tryNext) {
          console.warn(`   ⚠️ ${colName}: trying alternate ALTER syntax (${msg.substring(0, 140)})`);
          continue;
        }
        throw e;
      }
    }
  };
  await tryAddColumn('generate_genie_code_instruction', 'STRING');
  await tryAddColumn('has_genie_code', 'STRING');
}

function workspaceOriginFromHost(host) {
  const h = String(host || '').trim().replace(/\/$/, '');
  if (!h) return '';
  return h.startsWith('http') ? h : `https://${h}`;
}

/** Deep link to a one-off job run in the Databricks workspace UI. */
function databricksJobRunUrl(host, jobId, runId) {
  const origin = workspaceOriginFromHost(host);
  if (!origin || jobId == null || runId == null) return null;
  return `${origin}/#job/${encodeURIComponent(String(jobId))}/run/${encodeURIComponent(String(runId))}`;
}

/**
 * Route 1: one UPDATE per request (fewer Delta commits than reset+mark) + retries on row conflicts.
 * Selected ids → generate_genie_code_instruction Yes + has_genie_code N; others in session → flag No; has_genie unchanged.
 * Empty safeIds → only reset generate_genie_code_instruction to No for the session.
 */
async function runRoute1GenieFlagUpdates(host, token, warehouseId, catalog, schema, sidStr, safeIds) {
  const ucTable = `\`${catalog}\`.\`${schema}\`.\`__inspire_usecases\``;
  const inList =
    safeIds.length > 0 ? safeIds.map((id) => `'${escapeSqlStringLiteral(id)}'`).join(',') : '';
  const flagSql =
    safeIds.length === 0
      ? `UPDATE ${ucTable} SET generate_genie_code_instruction = 'No' WHERE session_id = ${sidStr}`
      : `UPDATE ${ucTable} SET
          generate_genie_code_instruction = CASE WHEN id IN (${inList}) THEN 'Yes' ELSE 'No' END,
          has_genie_code = CASE WHEN id IN (${inList}) THEN 'N' ELSE has_genie_code END
        WHERE session_id = ${sidStr}`;

  const runOnce = async () => {
    await executeSqlWithDeltaRetry(host, token, warehouseId, flagSql, { maxAttempts: 6, baseDelayMs: 120 });
  };

  await ensureUsecasesGenieRoute1Columns(host, token, warehouseId, ucTable);
  try {
    await runOnce();
  } catch (e) {
    const m = e.message || String(e);
    if (
      !/UNRESOLVED_COLUMN|42703|cannot be resolved.*generate_genie_code_instruction|generate_genie_code_instruction.*cannot be resolved/i.test(
        m,
      )
    ) {
      throw e;
    }
    console.warn('   🔄 Route1 flags: column unresolved; re-running schema ensure and retry.');
    await ensureUsecasesGenieRoute1Columns(host, token, warehouseId, ucTable);
    await runOnce();
  }
}

/** Mutates params: map canonical quality labels → widget labels; default when empty. */
function normalizeUseCasesQualityParams(params) {
  const uq = String(params['05_use_cases_quality'] || '').trim();
  const QUALITY_CANONICAL_TO_WIDGET = {
    Balanced: 'High Quality',
    'Strict Quality': 'Very High Quality',
    'Coverage Mode (All)': 'Good Quality',
  };
  if (QUALITY_CANONICAL_TO_WIDGET[uq]) {
    params['05_use_cases_quality'] = QUALITY_CANONICAL_TO_WIDGET[uq];
  }
  if (!params['05_use_cases_quality']) {
    params['05_use_cases_quality'] = 'High Quality';
  }
  return params;
}

/** v0.9.0+ notebook `dbutils.widgets` / `_NOTEBOOK_WIDGET_NAMES` — strip legacy keys Jobs API may forward. */
const INSPIRE_NOTEBOOK_WIDGET_KEYS = [
  '15_operation',
  '00_business_name',
  '01_uc_metadata',
  '02_inspire_database',
  '04_table_election',
  '05_use_cases_quality',
  '06_business_domains',
  '07_business_priorities',
  '08_generation_instructions',
  '09_generation_options',
  '11_generation_path',
  '12_documents_languages',
  '13_generate_genie_code_for',
  '14_session_id',
];

function sanitizeInspireNotebookJobParams(params) {
  const out = {};
  for (const k of INSPIRE_NOTEBOOK_WIDGET_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
    const v = params[k];
    if (v == null) continue;
    out[k] = String(v);
  }
  if (!out['13_generate_genie_code_for']) out['13_generate_genie_code_for'] = '5';
  return out;
}

function buildUcMetadataFromSessionRow(session) {
  const jf = String(session.json_file_path || '').trim();
  if (jf.startsWith('/')) return jf;
  const parts = [];
  const pushSplit = (raw) => {
    for (const x of String(raw || '').split(',')) {
      const t = x.trim();
      if (t) parts.push(t);
    }
  };
  pushSplit(session.tables_str);
  pushSplit(session.schemas_str);
  pushSplit(session.catalogs);
  return parts.join(',');
}

function mapSessionQualityToWidget(v) {
  const uq = String(v || '').trim();
  const QUALITY_CANONICAL_TO_WIDGET = {
    Balanced: 'High Quality',
    'Strict Quality': 'Very High Quality',
    'Coverage Mode (All)': 'Good Quality',
  };
  return QUALITY_CANONICAL_TO_WIDGET[uq] || uq || 'High Quality';
}

/** Rebuild notebook base_parameters for Operation = Generate Use Cases (Route 1). */
function notebookParamsFromSessionForGenerateRun(session, targetSessionIdStr) {
  const ucMeta = buildUcMetadataFromSessionRow(session);
  const genPath = String(session.generation_path || './../demos/').trim() || './../demos/';
  const genChoices = String(session.generate_choices || '').trim();
  const genOptions = genChoices
    ? genChoices
        .split(',')
        .map((x) => x.trim())
        .filter((g) => g === 'PDF Catalog' || g === 'Presentation' || g === 'Genie Code Instructions')
        .join(',')
    : 'PDF Catalog,Genie Code Instructions';
  const outLang = String(session.output_language || 'English').trim() || 'English';
  const priorities = String(session.business_priorities || 'Increase Revenue').trim() || 'Increase Revenue';
  const instruct = String(session.generation_instructions_section || '').trim();

  return {
    '15_operation': 'Generate Use Cases',
    '00_business_name': String(session.business_name || '').trim(),
    '01_uc_metadata': ucMeta,
    '02_inspire_database': String(session.inspire_database_name || '').trim(),
    '04_table_election': String(session.table_election_mode || 'Let Inspire Decides').trim() || 'Let Inspire Decides',
    '05_use_cases_quality': mapSessionQualityToWidget(session.use_cases_quality),
    '06_business_domains': String(session.business_domains || '').trim(),
    '07_business_priorities': priorities,
    '08_generation_instructions': instruct,
    '09_generation_options': genOptions || 'PDF Catalog,Genie Code Instructions',
    '11_generation_path': genPath,
    '12_documents_languages': outLang,
    '13_generate_genie_code_for': '5',
    '14_session_id': String(targetSessionIdStr).trim(),
  };
}

async function fetchInspireSessionWidgetRow(host, token, warehouseId, catalog, schema, sessionIdStr) {
  const table = `\`${catalog}\`.\`${schema}\`.\`__inspire_session\``;
  const widgetColsBase = `business_name, inspire_database_name, operation_mode, table_election_mode, use_cases_quality, strategic_goals, business_priorities, business_domains, catalogs, schemas_str, tables_str, generate_choices, generation_path, output_language, sql_generation_per_domain, technical_exclusion_strategy, json_file_path`;
  const widgetColsV08 = `${widgetColsBase}, enriched_business_context, enriched_strategic_goals, enriched_business_priorities, enriched_strategic_initiative, enriched_value_chain, enriched_revenue_model, generation_instructions_section`;
  const baseCols = `session_id, processing_status, completed_percent, create_at, last_updated, completed_on, inspire_json, results_json`;
  let sql = `SELECT ${baseCols}, ${widgetColsV08} FROM ${table} WHERE session_id = ${sessionIdStr} LIMIT 1`;
  try {
    const result = await executeSql(host, token, warehouseId, sql);
    const rows = sqlResultToObjects(result);
    return rows[0] || null;
  } catch (e1) {
    const msg = String(e1.message || e1);
    if (/enriched_|generation_instructions_section|UNRESOLVED_COLUMN|FIELD_NOT_FOUND|cannot resolve/i.test(msg)) {
      sql = `SELECT ${baseCols}, ${widgetColsBase} FROM ${table} WHERE session_id = ${sessionIdStr} LIMIT 1`;
      const result = await executeSql(host, token, warehouseId, sql);
      const rows = sqlResultToObjects(result);
      return rows[0] || null;
    }
    throw e1;
  }
}

/**
 * Resolve a workspace path to a NOTEBOOK path Jobs can execute (not a bare folder).
 * Tries DIRECTORY listing and /Users/... vs /Workspace/Users/... when get-status fails on legacy paths.
 * @returns {Promise<string|null>}
 */
async function resolveWorkspaceNotebookObjectPath(host, token, candidatePath) {
  if (!candidatePath || typeof candidatePath !== 'string') return null;
  const trimmed = candidatePath.trim();
  if (!trimmed) return null;

  const tryPath = async (basePath) => {
    const statusResp = await dbFetch(host, token, `/api/2.0/workspace/get-status?path=${encodeURIComponent(basePath)}`);
    if (!statusResp.ok) return null;
    let statusData;
    try {
      statusData = await statusResp.json();
    } catch {
      return null;
    }
    const type = statusData.object_type;
    if (type === 'NOTEBOOK') return basePath;
    if (type === 'DIRECTORY') {
      const listResp = await dbFetch(host, token, `/api/2.0/workspace/list?path=${encodeURIComponent(basePath)}`);
      if (!listResp.ok) return null;
      let listData;
      try {
        listData = await listResp.json();
      } catch {
        return null;
      }
      const notebook = (listData.objects || []).find((o) => o.object_type === 'NOTEBOOK');
      return notebook && notebook.path ? notebook.path : null;
    }
    return null;
  };

  let found = await tryPath(trimmed);
  if (found) return found;
  if (trimmed.startsWith('/Users/') && !trimmed.startsWith('/Workspace/')) {
    found = await tryPath(`/Workspace${trimmed}`);
    if (found) return found;
  }
  return null;
}

/**
 * Create a one-off job and trigger run-now (shared by /api/run and /api/inspire/generate-genie).
 * @param {object} opts
 * @param {Record<string,string>} opts.params notebook base_parameters
 * @param {string} [opts.notebook_path]
 * @param {string} [opts.cluster_id]
 * @param {'discovery'|'genie_regen'} [opts.jobType]
 */
async function triggerInspireNotebookJob(host, token, { params, notebook_path, cluster_id, jobType = 'discovery' }) {
  normalizeUseCasesQualityParams(params);
  const sanitized = sanitizeInspireNotebookJobParams(params);
  for (const k of Object.keys(params)) delete params[k];
  Object.assign(params, sanitized);

  let resolvedPath = String(notebook_path || DEFAULT_NOTEBOOK_PATH || '').trim();
  console.log(`📓 Notebook resolution: frontend="${notebook_path || ''}", env="${DEFAULT_NOTEBOOK_PATH}", resolved="${resolvedPath}"`);

  if (resolvedPath) {
    try {
      const verified = await resolveWorkspaceNotebookObjectPath(host, token, resolvedPath);
      if (verified) {
        resolvedPath = verified;
        console.log(`📓 Resolved configured path to runnable notebook: ${resolvedPath}`);
      } else {
        console.warn(
          `⚠️ Notebook path missing, no permission, or folder has no .ipynb: "${resolvedPath}" — using ${NOTEBOOK_DEST} (auto-publish).`,
        );
        resolvedPath = '';
      }
    } catch (e) {
      console.warn(`⚠️ Notebook path verify error: ${e.message || e}`);
      resolvedPath = '';
    }
  }

  if (!resolvedPath) {
    try {
      const pub = await ensureNotebookPublished(host, token);
      resolvedPath = pub.path;
      console.log(
        pub.republished
          ? `📓 Notebook re-published to workspace: ${resolvedPath}`
          : `📓 Using workspace notebook: ${resolvedPath}`,
      );
    } catch (pubErr) {
      const err = new Error(`Could not auto-publish notebook: ${pubErr.message}`);
      err.statusCode = 400;
      throw err;
    }
  }

  try {
    const verified = await resolveWorkspaceNotebookObjectPath(host, token, resolvedPath);
    if (verified) resolvedPath = verified;
  } catch (_) {}

  const businessName = params['00_business_name'] || 'Run';
  const sanitizeTag = (v) => String(v || '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 255);
  const jobName = `Inspire AI - ${businessName} - ${new Date().toISOString().slice(0, 19)}`;
  const jobSessionId = crypto.randomUUID();
  const notebookFilename = resolvedPath.split('/').pop() || 'inspire_notebook';

  const createPayload = {
    name: jobName,
    tags: {
      inspire_version: 'v0.9.0',
      dbx_inspire_ai_business: sanitizeTag(businessName),
      dbx_inspire_ai_type: jobType === 'genie_regen' ? 'genie_regen' : 'discovery',
      dbx_inspire_ai_session: sanitizeTag(jobSessionId),
      dbx_inspire_ai_usecases: '0',
      dbx_inspire_ai_notebook: sanitizeTag(notebookFilename),
    },
    tasks: [{
      task_key: 'inspire_notebook',
      notebook_task: {
        notebook_path: resolvedPath,
        base_parameters: params,
        source: 'WORKSPACE',
      },
      ...(cluster_id
        ? { existing_cluster_id: cluster_id }
        : { environment_key: 'Default' }
      ),
    }],
    ...(!cluster_id ? {
      environments: [{
        environment_key: 'Default',
        spec: { client: '1' },
      }],
    } : {}),
    max_concurrent_runs: 1,
  };

  console.log(`📋 Creating job: ${resolvedPath}`);
  const createResp = await dbFetch(host, token, '/api/2.1/jobs/create', {
    method: 'POST',
    body: JSON.stringify(createPayload),
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    console.error(`❌ Job create failed (${createResp.status}): ${errText}`);
    const err = new Error(`Job creation failed: ${errText}`);
    err.statusCode = createResp.status;
    throw err;
  }

  const { job_id } = await createResp.json();
  console.log(`✅ Job created: ${job_id}`);

  const response = await dbFetch(host, token, '/api/2.1/jobs/run-now', {
    method: 'POST',
    body: JSON.stringify({ job_id }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`❌ Job run failed (${response.status}): ${errText}`);
    let errorMsg;
    try { errorMsg = JSON.parse(errText).message || errText; } catch { errorMsg = errText; }
    const err = new Error(errorMsg);
    err.statusCode = response.status;
    throw err;
  }

  const data = await response.json();
  const runId = data.run_id;
  const jobRunUrl = databricksJobRunUrl(host, job_id, runId);
  console.log(`✅ Run submitted: ${runId}, job_id=${job_id}, notebook: ${resolvedPath}`);
  return {
    run_id: runId,
    job_id,
    notebook_path: resolvedPath,
    job_run_url: jobRunUrl,
  };
}

/**
 * Attach compact per-session use case stats from __inspire_usecases (sessions list omits results_json).
 */
async function attachSessionUsecaseOverviews(host, token, warehouseId, catalog, schema, sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return;
  const ucTable = `\`${catalog}\`.\`${schema}\`.\`__inspire_usecases\``;
  const safeIds = [
    ...new Set(
      sessions
        .map((s) => s.session_id)
        .filter((id) => id != null && /^\d+$/.test(String(id).trim()))
        .map((id) => String(Number(id))),
    ),
  ];
  if (safeIds.length === 0) return;
  const idList = safeIds.join(',');
  try {
    const aggSql = `SELECT session_id,
        CAST(COUNT(*) AS INT) AS usecase_count,
        CAST(SUM(CASE WHEN COALESCE(priority_score, 0) >= 3 THEN 1 ELSE 0 END) AS INT) AS high_priority_count,
        CAST(COUNT(DISTINCT NULLIF(TRIM(business_domain), '')) AS INT) AS domain_count
      FROM ${ucTable}
      WHERE session_id IN (${idList})
      GROUP BY session_id`;
    const aggRows = sqlResultToObjects(await executeSql(host, token, warehouseId, aggSql));
    const previewSql = `SELECT session_id, title, rn FROM (
        SELECT session_id,
          COALESCE(NULLIF(TRIM(use_case), ''), CONCAT('Use case ', CAST(id AS STRING))) AS title,
          ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY COALESCE(priority_score, 0) DESC, use_case) AS rn
        FROM ${ucTable}
        WHERE session_id IN (${idList})
      ) z
      WHERE z.rn <= 4
      ORDER BY session_id, rn`;
    const prevRows = sqlResultToObjects(await executeSql(host, token, warehouseId, previewSql));
    const titlesBySid = {};
    for (const r of prevRows) {
      const sid = String(r.session_id);
      if (!titlesBySid[sid]) titlesBySid[sid] = [];
      if (r.title && titlesBySid[sid].length < 4) titlesBySid[sid].push(String(r.title));
    }
    const map = {};
    for (const r of aggRows) {
      const sid = String(r.session_id);
      map[sid] = {
        total: Number(r.usecase_count) || 0,
        high: Number(r.high_priority_count) || 0,
        domains: Number(r.domain_count) || 0,
        preview_titles: titlesBySid[sid] || [],
      };
    }
    for (const s of sessions) {
      const sid = String(s.session_id);
      s.usecase_overview = map[sid] || { total: 0, high: 0, domains: 0, preview_titles: [] };
    }
  } catch (e) {
    console.warn('attachSessionUsecaseOverviews:', e.message || e);
    for (const s of sessions) {
      s.usecase_overview = null;
    }
  }
}

// ═══════════════════════════════════════════════════
//  Auto-publish — seamless notebook deployment
// ═══════════════════════════════════════════════════

const NOTEBOOK_DEST = '/Shared/inspire_ai';
/** SHA-256 of last successfully imported bundled notebook — triggers re-import when the file on disk changes. */
const NOTEBOOK_PUBLISH_SIG_FILE = path.join(__dirname, '.notebook_publish_sig');
let cachedNotebookPath = DEFAULT_NOTEBOOK_PATH || '';

function getBundledNotebookFingerprint() {
  try {
    if (!BUNDLED_NOTEBOOK_PATH || !fs.existsSync(BUNDLED_NOTEBOOK_PATH)) return '';
    const h = crypto.createHash('sha256');
    h.update(fs.readFileSync(BUNDLED_NOTEBOOK_PATH));
    return h.digest('hex');
  } catch {
    return '';
  }
}

/**
 * Ensure the workspace has the bundled notebook. Re-imports automatically when the local
 * `dbx_inspire_ai_agent.ipynb` bytes change (signature in `.notebook_publish_sig`).
 * @returns {{ path: string, republished: boolean }}
 */
async function ensureNotebookPublished(host, token, force = false) {
  const fp = getBundledNotebookFingerprint();
  if (fp) {
    try {
      const prev = fs.existsSync(NOTEBOOK_PUBLISH_SIG_FILE)
        ? fs.readFileSync(NOTEBOOK_PUBLISH_SIG_FILE, 'utf8').trim()
        : '';
      if (prev !== fp) {
        console.log(
          prev
            ? '📓 Bundled Inspire notebook changed since last workspace publish — re-importing.'
            : '📓 Publishing bundled notebook to workspace (new or unsigned bundle).',
        );
        force = true;
        cachedNotebookPath = '';
      }
    } catch (_) {}
  }

  if (!force) {
    // 1. If we already know the notebook path, verify it still exists
    if (cachedNotebookPath) {
      try {
        const check = await dbFetch(host, token, `/api/2.0/workspace/get-status?path=${encodeURIComponent(cachedNotebookPath)}`);
        if (check.ok) return { path: cachedNotebookPath, republished: false };
      } catch (_) {}
      // Path gone — re-publish
      cachedNotebookPath = '';
    }

    // 2. Check if notebook already exists at the destination
    try {
      const check = await dbFetch(host, token, `/api/2.0/workspace/get-status?path=${encodeURIComponent(NOTEBOOK_DEST)}`);
      if (check.ok) {
        const data = await check.json();
        if (data.object_type === 'NOTEBOOK') {
          cachedNotebookPath = NOTEBOOK_DEST;
          console.log(`📓 Notebook already exists: ${cachedNotebookPath}`);
          return { path: cachedNotebookPath, republished: false };
        }
        if (data.object_type === 'DIRECTORY') {
          const listResp = await dbFetch(host, token, `/api/2.0/workspace/list?path=${encodeURIComponent(NOTEBOOK_DEST)}`);
          if (listResp.ok) {
            const listData = await listResp.json();
            const nb = (listData.objects || []).find(o => o.object_type === 'NOTEBOOK');
            if (nb) {
              cachedNotebookPath = nb.path;
              console.log(`📓 Notebook found in folder: ${cachedNotebookPath}`);
              return { path: cachedNotebookPath, republished: false };
            }
          }
        }
      }
    } catch (_) {}
  } else {
    console.log('🔄 Re-publishing notebook — overwriting workspace path...');
  }

  // 3. Publish the bundled notebook
  if (!BUNDLED_NOTEBOOK_PATH || !fs.existsSync(BUNDLED_NOTEBOOK_PATH)) {
    throw new Error('No bundled notebook file available to publish.');
  }

  const isIpynb = BUNDLED_NOTEBOOK_PATH.endsWith('.ipynb');
  const importFormat = isIpynb ? 'JUPYTER' : 'DBC';
  console.log(`📦 Auto-publishing notebook (${importFormat}) to ${NOTEBOOK_DEST}...`);
  const fileBuffer = fs.readFileSync(BUNDLED_NOTEBOOK_PATH);
  const base64Content = fileBuffer.toString('base64');

  // Delete old if exists
  try {
    await dbFetch(host, token, '/api/2.0/workspace/delete', {
      method: 'POST',
      body: JSON.stringify({ path: NOTEBOOK_DEST, recursive: true }),
    });
  } catch (_) {}

  const importPath = isIpynb ? NOTEBOOK_DEST : NOTEBOOK_DEST;
  const resp = await dbFetch(host, token, '/api/2.0/workspace/import', {
    method: 'POST',
    body: JSON.stringify({
      path: importPath,
      format: importFormat,
      content: base64Content,
      language: isIpynb ? 'PYTHON' : undefined,
      overwrite: true,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Publish failed: ${err}`);
  }

  if (isIpynb) {
    // JUPYTER import creates the notebook directly at the path
    cachedNotebookPath = NOTEBOOK_DEST;
  } else {
    // DBC imports as a folder — find the actual notebook inside
    cachedNotebookPath = NOTEBOOK_DEST;
    try {
      const listResp = await dbFetch(host, token, `/api/2.0/workspace/list?path=${encodeURIComponent(NOTEBOOK_DEST)}`);
      if (listResp.ok) {
        const listData = await listResp.json();
        const nb = (listData.objects || []).find(o => o.object_type === 'NOTEBOOK');
        if (nb) cachedNotebookPath = nb.path;
      }
    } catch (_) {}
  }

  const newFp = getBundledNotebookFingerprint();
  if (newFp) {
    try {
      fs.writeFileSync(NOTEBOOK_PUBLISH_SIG_FILE, newFp, 'utf8');
    } catch (e) {
      console.warn('Could not write notebook publish signature:', e.message || e);
    }
  }

  console.log(`✅ Notebook published: ${cachedNotebookPath}`);
  return { path: cachedNotebookPath, republished: true };
}

// ═══════════════════════════════════════════════════
//  Service Principal OAuth2 Token
// ═══════════════════════════════════════════════════

app.post('/api/auth/sp-token', async (req, res) => {
  try {
    const { client_id, client_secret, tenant_id, databricks_host } = req.body;
    if (!client_id || !client_secret || !tenant_id || !databricks_host) {
      return res.status(400).json({ error: 'client_id, client_secret, tenant_id, and databricks_host required.' });
    }

    // Azure AD OAuth2 client credentials flow
    const tokenUrl = `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`;
    // The scope for Databricks is the host + /.default
    const scope = `${databricks_host.replace(/\/$/, '')}/.default`;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id,
      client_secret,
      scope,
    });

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`SP token failed (${resp.status}): ${errText.substring(0, 200)}`);
      return res.status(resp.status).json({ error: `Azure AD token request failed: ${errText}` });
    }

    const data = await resp.json();
    console.log('✅ SP token obtained successfully');
    res.json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  Workspace File Operations (list & download artifacts)
// ═══════════════════════════════════════════════════

/** Collapse /./ and /../ so `/Shared/../demos/x` → `/demos/x`. Leaves /Volumes/ unchanged. */
function normalizeWorkspaceApiPath(input) {
  if (!input || typeof input !== 'string') return '';
  const t = input.trim().replace(/\/+/g, '/');
  if (!t) return '';
  if (t.startsWith('/Volumes/')) return t;
  if (!t.startsWith('/')) return t;
  const segments = t.split('/').filter(Boolean);
  const stack = [];
  for (const seg of segments) {
    if (seg === '.') continue;
    if (seg === '..') {
      if (stack.length) stack.pop();
    } else stack.push(seg);
  }
  return stack.length ? `/${stack.join('/')}` : '/';
}

/**
 * Databricks workspace REST expects repo paths under /Workspace/... for GCP/AWS.
 * Try normalized path, then /Workspace{path} when path is /Shared, /Users, /Repos, /demos, etc.
 */
function workspaceApiPathCandidates(input) {
  const n = normalizeWorkspaceApiPath(input);
  const out = [];
  const add = (x) => {
    const y = normalizeWorkspaceApiPath(x);
    if (y && !out.includes(y)) out.push(y);
  };
  add(n);
  if (!n.startsWith('/')) return out;
  if (n.startsWith('/Volumes/')) return out;
  if (!n.startsWith('/Workspace')) add(`/Workspace${n}`);
  if (n.startsWith('/Workspace/')) {
    const stripped = n.slice('/Workspace'.length) || '/';
    add(stripped);
  }
  return out;
}

app.get('/api/workspace/list', requireToken, async (req, res) => {
  try {
    const rawPath = req.query.path;
    if (!rawPath) return res.status(400).json({ error: 'path query param required.' });

    const candidates = workspaceApiPathCandidates(rawPath);
    let lastErr = 'not found';
    let lastStatus = 404;

    for (const wsPath of candidates) {
      // Handle Volumes paths via Files API
      if (wsPath.startsWith('/Volumes/')) {
        const response = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/fs/directories${wsPath}`);
        if (!response.ok) {
          lastStatus = response.status;
          lastErr = await response.text();
          continue;
        }
        const data = await response.json();
        const contents = (data.contents || []).map(f => ({
          path: f.path,
          name: f.name || f.path.split('/').pop(),
          is_directory: f.is_directory || false,
          file_size: f.file_size || 0,
        }));
        return res.json({ files: contents, resolved_path: wsPath });
      }

      const response = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/workspace/list?path=${encodeURIComponent(wsPath)}`);
      if (!response.ok) {
        lastStatus = response.status;
        lastErr = await response.text();
        continue;
      }
      const data = await response.json();
      const files = (data.objects || []).map(o => ({
        path: o.path,
        name: o.path.split('/').pop(),
        is_directory: o.object_type === 'DIRECTORY',
        object_type: o.object_type,
        file_size: o.size || 0,
      }));
      return res.json({ files, resolved_path: wsPath });
    }

    return res.status(lastStatus).json({ error: lastErr, tried: candidates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/workspace/export', requireToken, async (req, res) => {
  try {
    const rawPath = req.query.path;
    if (!rawPath) return res.status(400).json({ error: 'path query param required.' });

    const candidates = workspaceApiPathCandidates(rawPath);
    const baseName = (normalizeWorkspaceApiPath(rawPath).split('/').pop() || 'file');
    let lastErr = 'not found';
    let lastStatus = 404;

    for (const wsPath of candidates) {
      if (wsPath.startsWith('/Volumes/')) {
        const response = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/fs/files${wsPath}`);
        if (!response.ok) {
          lastStatus = response.status;
          lastErr = await response.text();
          continue;
        }
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}"`);
        return res.send(Buffer.from(await response.arrayBuffer()));
      }

      const fileName = wsPath.split('/').pop() || baseName;

      const resp1 = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/workspace/export?path=${encodeURIComponent(wsPath)}&format=AUTO`);
      if (resp1.ok) {
        const contentType = resp1.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await resp1.json();
          if (data.content) {
            const buffer = Buffer.from(data.content, 'base64');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            return res.send(buffer);
          }
        }
        const buffer = Buffer.from(await resp1.arrayBuffer());
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.send(buffer);
      }

      const resp2 = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/workspace/export?path=${encodeURIComponent(wsPath)}&direct_download=true`);
      if (resp2.ok) {
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.send(Buffer.from(await resp2.arrayBuffer()));
      }
      lastStatus = resp2.status;
      lastErr = await resp2.text();
    }

    return res.status(lastStatus).json({ error: lastErr, tried: candidates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  Basic endpoints
// ═══════════════════════════════════════════════════

// Debug: check what auth headers the proxy sends (call from browser console: fetch('/api/debug/auth').then(r=>r.json()).then(console.log))
app.get('/api/debug/auth', async (req, res) => {
  const forwarded = req.headers['x-forwarded-access-token'] || '';
  if (SP_CLIENT_ID && SP_CLIENT_SECRET && (!spTokenCache || Date.now() >= spTokenExpiry - 120000)) {
    try {
      await refreshSpToken();
    } catch { /* ignore */ }
  }
  const token = getToken(req);
  let testResult = null;

  // If we got a token, test it against the catalogs API
  if (token) {
    try {
      const host = resolveHost(req);
      const testResp = await fetch(`${host}/api/2.1/unity-catalog/catalogs`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      testResult = { status: testResp.status, ok: testResp.ok };
      if (testResp.ok) {
        const data = await testResp.json();
        testResult.catalogCount = (data.catalogs || []).length;
        testResult.catalogNames = (data.catalogs || []).map(c => c.name).slice(0, 10);
      } else {
        testResult.error = (await testResp.text()).slice(0, 200);
      }
    } catch (err) {
      testResult = { error: err.message };
    }
  }

  res.json({
    headers: {
      'x-forwarded-access-token': forwarded ? `present (len=${forwarded.length}, starts=${forwarded.slice(0, 12)}...)` : 'MISSING',
      'x-db-pat-token': req.headers['x-db-pat-token'] ? 'present' : 'MISSING',
      'authorization': req.headers['authorization'] ? `present (${req.headers['authorization'].slice(0, 20)}...)` : 'MISSING',
    },
    tokenSource: !token ? 'NONE' : forwarded && token === forwarded.trim() ? 'x-forwarded-access-token' : token === SERVICE_TOKEN ? 'SERVICE_TOKEN' : spTokenCache && token === spTokenCache ? 'SP_OAUTH' : 'other',
    hasToken: !!token,
    host: resolveHost(req),
    spCredentials: { clientId: SP_CLIENT_ID ? 'set' : 'MISSING', clientSecret: SP_CLIENT_SECRET ? 'set' : 'MISSING' },
    catalogTest: testResult,
  });
});

app.get('/api/health', (req, res) => {
  const hasBundledNotebook = fs.existsSync(BUNDLED_NOTEBOOK_PATH);
  const host = resolveHost(req);
  const forwardedToken = req.headers['x-forwarded-access-token'] || '';
  const syncToken = getToken(req);
  const platformAuth = hasDatabricksPlatformAuth();
  res.json({
    status: 'ok',
    host: host ? host.replace(/https?:\/\//, '').split('.')[0] + '...' : 'not configured',
    hostFull: host || 'NOT SET',
    hostConfigured: !!host,
    hasBundledDbc: hasBundledNotebook,
    hasServiceToken: !!SERVICE_TOKEN,
    /** True when env has DATABRICKS_TOKEN and/or SP OAuth creds (Databricks App service principal). */
    hasPlatformAuth: platformAuth,
    /** Present when the Apps proxy attaches a user access token (delegated auth). */
    hasUserToken: !!forwardedToken,
    serviceTokenPreview: SERVICE_TOKEN ? `${SERVICE_TOKEN.slice(0, 8)}...${SERVICE_TOKEN.slice(-4)} (len=${SERVICE_TOKEN.length})` : 'NONE',
    // Do not treat “DATABRICKS_HOST in local .env” as a Databricks App — that skips the PAT wizard incorrectly.
    isDatabricksApp:
      !!forwardedToken ||
      (!!DATABRICKS_HOST && hasDatabricksPlatformAuth() && process.env.NODE_ENV === 'production'),
    hasForwardedToken: !!forwardedToken,
    forwardedTokenPreview: forwardedToken ? `${forwardedToken.slice(0, 8)}...${forwardedToken.slice(-4)} (len=${forwardedToken.length})` : 'NONE',
    resolvedTokenSource: syncToken === SERVICE_TOKEN && SERVICE_TOKEN ? 'DATABRICKS_TOKEN' : syncToken === spTokenCache && spTokenCache ? 'SP_OAUTH' : forwardedToken && syncToken ? 'x-forwarded-access-token' : syncToken ? 'header' : 'NONE',
    hasSpCredentials: !!(SP_CLIENT_ID && SP_CLIENT_SECRET),
    spTokenCached: spOAuthTokenStillFresh(),
    /** Confirms this server build exposes the Route-1 Genie regen API (POST). */
    hasGenerateGenieEndpoint: true,
    envVars: {
      DATABRICKS_HOST: DATABRICKS_HOST ? 'set' : 'NOT SET',
      DATABRICKS_TOKEN: SERVICE_TOKEN ? 'set' : 'NOT SET',
      DATABRICKS_CLIENT_ID: process.env.DATABRICKS_CLIENT_ID ? 'set (runtime)' : 'NOT SET',
      DATABRICKS_CLIENT_SECRET: process.env.DATABRICKS_CLIENT_SECRET ? 'set (runtime)' : 'NOT SET',
      SP_CLIENT_ID_resolved: SP_CLIENT_ID ? `set (${SP_CLIENT_ID.slice(0, 8)}...)` : 'NOT SET',
      SP_CLIENT_SECRET_resolved: SP_CLIENT_SECRET ? 'set' : 'NOT SET',
      INSPIRE_WAREHOUSE_ID: DEFAULT_WAREHOUSE_ID || 'NOT SET',
      INSPIRE_DATABASE: DEFAULT_INSPIRE_DB || 'NOT SET',
      NOTEBOOK_PATH: DEFAULT_NOTEBOOK_PATH || 'NOT SET',
    },
  });
});

// Pre-configured defaults (injected by the installer notebook via app.yaml env vars)
app.get('/api/defaults', (req, res) => {
  const host = resolveHost(req);
  // In Databricks Apps, DATABRICKS_HOST may be just the hostname — normalize
  let fullHost = host;
  if (fullHost && !fullHost.startsWith('http')) fullHost = `https://${fullHost}`;
  const platformAuth = hasDatabricksPlatformAuth();
  // Local dev / App: skip Setup Wizard when server has platform auth + host + warehouse + tracking DB.
  const envSkipsSetupWizard = !!(platformAuth && fullHost && DEFAULT_WAREHOUSE_ID && DEFAULT_INSPIRE_DB);
  res.json({
    databricksHost: fullHost || '',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    inspireDatabase: DEFAULT_INSPIRE_DB,
    notebookPath: DEFAULT_NOTEBOOK_PATH,
    isDatabricksApp:
      !!DATABRICKS_HOST && platformAuth && process.env.NODE_ENV === 'production',
    autoSetup: process.env.INSPIRE_AUTO_SETUP === 'true',
    /** Literal DATABRICKS_TOKEN in env (optional when SP OAuth creds are used instead). */
    hasServiceToken: !!SERVICE_TOKEN,
    /** True when the Node server can call Databricks APIs without a browser PAT (token or SP OAuth). */
    hasServerPlatformAuth: platformAuth,
    envSkipsSetupWizard,
  });
});

// ═══════════════════════════════════════════════════
//  Setup Verification — validates all prerequisites
// ═══════════════════════════════════════════════════
app.post('/api/setup/verify', async (req, res) => {
  if (SP_CLIENT_ID && SP_CLIENT_SECRET && (!spTokenCache || Date.now() >= spTokenExpiry - 120000)) {
    try {
      await refreshSpToken();
    } catch { /* ignore */ }
  }
  const token = getToken(req);
  const host = resolveHost(req);
  const { warehouse_id, inspire_database } = req.body || {};

  const checks = {
    workspace: { ok: false, message: '' },
    auth: { ok: false, message: '' },
    warehouse: { ok: false, message: '' },
    catalog: { ok: false, message: '' },
    notebook: { ok: false, message: '' },
  };

  // 1. Workspace connectivity
  try {
    if (!host) throw new Error('No Databricks host configured');
    const resp = await fetch(`${host}/api/2.0/clusters/spark-versions`, {
      headers: { Authorization: `Bearer ${token || 'invalid'}` },
    });
    checks.workspace = { ok: resp.status !== 0, message: resp.ok ? host : `Host reachable but returned ${resp.status}` };
  } catch (err) {
    checks.workspace = { ok: false, message: `Cannot reach ${host || 'no host'}: ${err.message}` };
  }

  // 2. Authentication
  if (token && host) {
    try {
      const resp = await dbFetch(host, token, '/api/2.0/preview/scim/v2/Me');
      if (resp.ok) {
        const me = await resp.json();
        checks.auth = { ok: true, message: `Authenticated as ${me.displayName || me.userName || 'user'}` };
      } else {
        checks.auth = { ok: false, message: `Token invalid (${resp.status})` };
      }
    } catch (err) {
      checks.auth = { ok: false, message: err.message };
    }
  } else {
    checks.auth = { ok: false, message: token ? 'No host configured' : 'No token provided' };
  }

  // 3. Warehouse access
  if (checks.auth.ok && warehouse_id) {
    try {
      const resp = await dbFetch(host, token, `/api/2.0/sql/warehouses/${warehouse_id}`);
      if (resp.ok) {
        const wh = await resp.json();
        checks.warehouse = { ok: true, message: `${wh.name} (${wh.state})`, state: wh.state };
      } else {
        checks.warehouse = { ok: false, message: `Cannot access warehouse ${warehouse_id}` };
      }
    } catch (err) {
      checks.warehouse = { ok: false, message: err.message };
    }
  } else if (!warehouse_id) {
    checks.warehouse = { ok: false, message: 'No warehouse selected' };
  }

  // 4. Catalog/database access
  if (checks.auth.ok && inspire_database) {
    try {
      const parts = inspire_database.split('.');
      if (parts.length !== 2) throw new Error('Format must be catalog.schema');
      const [catalog, schema] = parts;
      // Test catalog access
      const catResp = await dbFetch(host, token, `/api/2.1/unity-catalog/catalogs/${encodeURIComponent(catalog)}`);
      if (!catResp.ok) throw new Error(`Cannot access catalog "${catalog}"`);
      // Test schema access or creation
      const schResp = await dbFetch(host, token, `/api/2.1/unity-catalog/schemas/${encodeURIComponent(catalog)}.${encodeURIComponent(schema)}`);
      if (schResp.ok) {
        checks.catalog = { ok: true, message: `${inspire_database} exists and accessible` };
      } else {
        // Schema doesn't exist — check if we can create it
        checks.catalog = { ok: true, message: `Catalog "${catalog}" accessible. Schema "${schema}" will be created on first run.` };
      }
    } catch (err) {
      checks.catalog = { ok: false, message: err.message };
    }
  } else if (!inspire_database) {
    checks.catalog = { ok: false, message: 'No inspire database specified' };
  }

  // 5. Notebook bundle
  const hasNotebook = fs.existsSync(BUNDLED_NOTEBOOK_PATH);
  checks.notebook = { ok: hasNotebook, message: hasNotebook ? 'Notebook bundle found' : 'Notebook file not found — notebook publish will fail' };

  const allOk = Object.values(checks).every(c => c.ok);
  res.json({ ok: allOk, checks });
});

// Create inspire database schema if it doesn't exist
app.post('/api/setup/create-database', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id } = req.body;
    if (!inspire_database || !warehouse_id) return res.status(400).json({ error: 'inspire_database and warehouse_id required' });
    const parts = inspire_database.split('.');
    if (parts.length !== 2) return res.status(400).json({ error: 'Format: catalog.schema' });
    const [catalog, schema] = parts;

    // Create schema if not exists
    const sql = `CREATE SCHEMA IF NOT EXISTS \`${catalog}\`.\`${schema}\``;
    const result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    res.json({ ok: true, message: `Schema ${inspire_database} ready` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Auto-publish and return the notebook path
app.get('/api/notebook', requireToken, async (req, res) => {
  try {
    const force = req.query.force === 'true';
    if (force) {
      cachedNotebookPath = ''; // clear cache to force re-publish
    }
    const { path: nbPath, republished } = await ensureNotebookPublished(req.dbHost, req.dbToken, force);
    res.json({ path: nbPath, republished });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/me', requireToken, async (req, res) => {
  try {
    const response = await dbFetch(req.dbHost, req.dbToken, '/api/2.0/preview/scim/v2/Me');
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    const username = data.userName || data.emails?.[0]?.value || '';
    res.json({ username, displayName: data.displayName || username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  Unity Catalog browsing
// ═══════════════════════════════════════════════════

app.get('/api/catalogs', requireToken, async (req, res) => {
  try {
    const warehouseId = String(req.query.warehouse_id || '').trim();
    let raw = [];
    let restErr = null;
    try {
      raw = await listCatalogsRest(req.dbHost, req.dbToken);
    } catch (e) {
      restErr = e.message || String(e);
      console.warn(`   ⚠️ UC REST catalogs failed: ${restErr}`);
    }
    const byName = new Map();
    for (const c of raw) {
      if (c && c.name) {
        byName.set(c.name, {
          name: c.name,
          comment: c.comment || '',
          owner: c.owner || '',
        });
      }
    }
    const countAfterRest = byName.size;
    if (warehouseId) {
      const sqlNames = await listCatalogNamesSql(req.dbHost, req.dbToken, warehouseId);
      for (const name of sqlNames) {
        if (!byName.has(name)) {
          byName.set(name, { name, comment: '', owner: '' });
        }
      }
    }
    const catalogs = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    let source = 'none';
    if (raw.length > 0 && byName.size > countAfterRest) source = 'rest+sql';
    else if (raw.length > 0) source = 'rest';
    else if (catalogs.length > 0) source = 'sql';
    console.log(`   📚 catalogs: REST=${raw.length} merged=${catalogs.length} warehouse=${warehouseId ? 'yes' : 'no'} (${source})`);
    res.json({
      catalogs,
      source,
      restError: restErr && catalogs.length === 0 ? restErr : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/catalogs/:catalog/schemas', requireToken, async (req, res) => {
  try {
    const { catalog } = req.params;
    const warehouseId = String(req.query.warehouse_id || '').trim();
    let raw = [];
    let restErr = null;
    try {
      raw = await listSchemasRest(req.dbHost, req.dbToken, catalog);
    } catch (e) {
      restErr = e.message || String(e);
      console.warn(`   ⚠️ UC REST schemas failed for ${catalog}: ${restErr}`);
    }
    const byKey = new Map();
    for (const s of raw) {
      if (!s) continue;
      const full = s.full_name || `${catalog}.${s.name}`;
      byKey.set(full, {
        name: s.name,
        full_name: full,
        comment: s.comment || '',
      });
    }
    if (warehouseId) {
      const sqlRows = await listSchemasSql(req.dbHost, req.dbToken, warehouseId, catalog);
      for (const row of sqlRows) {
        const k = row.full_name || `${catalog}.${row.name}`;
        if (!byKey.has(k)) byKey.set(k, row);
      }
    }
    const schemas = [...byKey.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
    console.log(`   📂 schemas ${catalog}: REST=${raw.length} merged=${schemas.length}`);
    if (raw.length === 0 && schemas.length === 0 && restErr) {
      return res.status(502).json({ error: restErr });
    }
    res.json({ schemas, count: schemas.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tables/:catalog/:schema', requireToken, async (req, res) => {
  try {
    const { catalog, schema } = req.params;
    const warehouseId = String(req.query.warehouse_id || '').trim();
    let raw = [];
    let restErr = null;
    try {
      raw = await listTablesRest(req.dbHost, req.dbToken, catalog, schema);
    } catch (e) {
      restErr = e.message || String(e);
      console.warn(`   ⚠️ UC REST tables failed for ${catalog}.${schema}: ${restErr}`);
    }
    const mapRow = (t) => ({
      name: t.name,
      full_name: t.full_name || `${catalog}.${schema}.${t.name}`,
      catalog_name: t.catalog_name || catalog,
      schema_name: t.schema_name || schema,
      table_type: t.table_type,
      data_source_format: t.data_source_format || '',
      updated_at: t.updated_at ? new Date(t.updated_at).toISOString() : null,
      created_at: t.created_at ? new Date(t.created_at).toISOString() : null,
      comment: t.comment || '',
      owner: t.owner || '',
      columns: (t.columns || []).length,
    });
    const byKey = new Map();
    for (const t of raw) {
      if (!t || !t.name) continue;
      const row = mapRow(t);
      byKey.set(row.full_name, row);
    }
    if (warehouseId) {
      const sqlRows = await listTablesSql(req.dbHost, req.dbToken, warehouseId, catalog, schema);
      for (const row of sqlRows) {
        if (!byKey.has(row.full_name)) byKey.set(row.full_name, row);
      }
    }
    const tables = [...byKey.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
    console.log(`   📋 tables ${catalog}.${schema}: REST=${raw.length} merged=${tables.length}`);
    if (raw.length === 0 && tables.length === 0 && restErr) {
      return res.status(502).json({ error: restErr });
    }
    res.json({ tables, count: tables.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  SQL Warehouses & Clusters
// ═══════════════════════════════════════════════════

app.get('/api/warehouses', requireToken, async (req, res) => {
  try {
    const response = await dbFetch(req.dbHost, req.dbToken, '/api/2.0/sql/warehouses');
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    const warehouses = (data.warehouses || []).map(w => ({
      id: w.id,
      name: w.name,
      state: w.state,
      cluster_size: w.cluster_size,
    }));
    res.json({ warehouses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clusters', requireToken, async (req, res) => {
  try {
    const response = await dbFetch(req.dbHost, req.dbToken, '/api/2.0/clusters/list');
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    const clusters = (data.clusters || []).map(c => ({
      cluster_id: c.cluster_id,
      cluster_name: c.cluster_name,
      state: c.state,
    }));
    res.json({ clusters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  Publish notebook (DBC upload)
// ═══════════════════════════════════════════════════

app.post('/api/publish', requireToken, async (req, res) => {
  try {
    const { destination_path } = req.body;
    if (!destination_path) {
      return res.status(400).json({ error: 'destination_path is required.' });
    }

    if (!fs.existsSync(BUNDLED_NOTEBOOK_PATH)) {
      return res.status(404).json({ error: 'Bundled notebook file not found on server.' });
    }

    const fileBuffer = fs.readFileSync(BUNDLED_NOTEBOOK_PATH);
    const base64Content = fileBuffer.toString('base64');
    const isIpynb = BUNDLED_NOTEBOOK_PATH.endsWith('.ipynb');
    const importFormat = isIpynb ? 'JUPYTER' : 'DBC';

    // Delete old if exists
    try {
      await dbFetch(req.dbHost, req.dbToken, '/api/2.0/workspace/delete', {
        method: 'POST',
        body: JSON.stringify({ path: destination_path, recursive: true }),
      });
    } catch (_) {}

    const response = await dbFetch(req.dbHost, req.dbToken, '/api/2.0/workspace/import', {
      method: 'POST',
      body: JSON.stringify({
        path: destination_path,
        format: importFormat,
        content: base64Content,
        language: isIpynb ? 'PYTHON' : undefined,
        overwrite: true,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    let notebookPath = destination_path;
    if (!isIpynb) {
      // DBC imports as a folder — find the actual notebook inside
      try {
        const listResp = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/workspace/list?path=${encodeURIComponent(destination_path)}`);
        if (listResp.ok) {
          const listData = await listResp.json();
          const notebook = (listData.objects || []).find(o => o.object_type === 'NOTEBOOK');
          if (notebook) notebookPath = notebook.path;
        }
      } catch (_) {}
    }

    console.log(`✅ Published notebook to: ${destination_path}, notebook: ${notebookPath}`);
    res.json({ success: true, path: notebookPath, folder_path: destination_path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/publish/upload', requireToken, upload.single('file'), async (req, res) => {
  try {
    const { destination_path } = req.body;
    if (!destination_path) return res.status(400).json({ error: 'destination_path is required.' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const base64Content = req.file.buffer.toString('base64');
    const ext = path.extname(req.file.originalname).toLowerCase();
    let format = 'DBC';
    if (ext === '.py') format = 'SOURCE';
    else if (ext === '.ipynb') format = 'JUPYTER';

    if (format === 'DBC') {
      try {
        await dbFetch(req.dbHost, req.dbToken, '/api/2.0/workspace/delete', {
          method: 'POST',
          body: JSON.stringify({ path: destination_path, recursive: true }),
        });
      } catch (_) {}
    }

    const response = await dbFetch(req.dbHost, req.dbToken, '/api/2.0/workspace/import', {
      method: 'POST',
      body: JSON.stringify({
        path: destination_path,
        format,
        content: base64Content,
        ...(format !== 'DBC' ? { overwrite: true } : {}),
        ...(format === 'SOURCE' ? { language: 'PYTHON' } : {}),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    res.json({ success: true, path: destination_path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  DBC Notebook Extraction (preview contents)
// ═══════════════════════════════════════════════════

app.get('/api/dbc/info', (req, res) => {
  try {
    if (!fs.existsSync(BUNDLED_NOTEBOOK_PATH)) {
      return res.status(404).json({ error: 'Bundled notebook file not found.' });
    }

    const isIpynb = BUNDLED_NOTEBOOK_PATH.endsWith('.ipynb');

    if (isIpynb) {
      // JUPYTER notebook — parse ipynb JSON
      const content = fs.readFileSync(BUNDLED_NOTEBOOK_PATH, 'utf8');
      const nb = JSON.parse(content);
      const cells = nb.cells || [];
      res.json({
        file: path.basename(BUNDLED_NOTEBOOK_PATH),
        size: fs.statSync(BUNDLED_NOTEBOOK_PATH).size,
        format: 'JUPYTER',
        notebooks: [{
          name: path.basename(BUNDLED_NOTEBOOK_PATH),
          language: nb.metadata?.kernelspec?.language || 'python',
          cell_count: cells.length,
          code_cells: cells.filter(c => c.cell_type === 'code').length,
          markdown_cells: cells.filter(c => c.cell_type === 'markdown').length,
        }],
        entry_count: 1,
      });
    } else {
      // Legacy DBC archive
      const zip = new AdmZip(BUNDLED_NOTEBOOK_PATH);
      const entries = zip.getEntries();
      const notebooks = [];

      for (const entry of entries) {
        if (entry.entryName.endsWith('.python') || entry.entryName.endsWith('.sql') || entry.entryName.endsWith('.scala')) {
          try {
            const content = entry.getData().toString('utf8');
            const data = JSON.parse(content);
            const commands = data.commands || [];
            notebooks.push({
              name: entry.entryName,
              language: data.language || 'python',
              command_count: commands.length,
              version: data.version || 'unknown',
            });
          } catch {
            notebooks.push({ name: entry.entryName, error: 'Could not parse' });
          }
        }
      }

      res.json({
        file: path.basename(BUNDLED_NOTEBOOK_PATH),
        size: fs.statSync(BUNDLED_NOTEBOOK_PATH).size,
        format: 'DBC',
        notebooks,
        entry_count: entries.length,
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  Submit notebook run
// ═══════════════════════════════════════════════════

app.post('/api/run', requireToken, async (req, res) => {
  try {
    const { cluster_id, notebook_path } = req.body;
    const params = (req.body.params && typeof req.body.params === 'object') ? { ...req.body.params } : {};
    const out = await triggerInspireNotebookJob(req.dbHost, req.dbToken, {
      params,
      notebook_path,
      cluster_id,
      jobType: 'discovery',
    });
    res.json(out);
  } catch (err) {
    const code = err.statusCode && Number.isFinite(err.statusCode) ? err.statusCode : 500;
    res.status(code).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  Run status & output
// ═══════════════════════════════════════════════════

app.get('/api/run/:runId', requireToken, async (req, res) => {
  try {
    const response = await dbFetch(req.dbHost, req.dbToken, `/api/2.1/jobs/runs/get?run_id=${req.params.runId}`);
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    const state = data.state || {};
    res.json({
      run_id: data.run_id,
      life_cycle_state: state.life_cycle_state || 'UNKNOWN',
      result_state: state.result_state || null,
      state_message: state.state_message || '',
      start_time: data.start_time,
      end_time: data.end_time,
      setup_duration: data.setup_duration,
      execution_duration: data.execution_duration,
      cleanup_duration: data.cleanup_duration,
      run_page_url: data.run_page_url,
      run_name: data.run_name,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/run/:runId/output', requireToken, async (req, res) => {
  try {
    const response = await dbFetch(req.dbHost, req.dbToken, `/api/2.1/jobs/runs/get-output?run_id=${req.params.runId}`);
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    res.json({
      notebook_output: data.notebook_output,
      metadata: data.metadata,
      error: data.error,
      error_trace: data.error_trace,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/run/:runId/cancel', requireToken, async (req, res) => {
  try {
    const response = await dbFetch(req.dbHost, req.dbToken, '/api/2.1/jobs/runs/cancel', {
      method: 'POST',
      body: JSON.stringify({ run_id: parseInt(req.params.runId) }),
    });
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  V43 Session & Step Tracking (READY/DONE Protocol)
// ═══════════════════════════════════════════════════

// Poll session status
app.get('/api/inspire/session', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id, session_id } = req.query;
    if (!inspire_database || !warehouse_id) {
      return res.status(400).json({ error: 'inspire_database and warehouse_id required.' });
    }

    const parsedDb = splitInspireDatabase(inspire_database);
    if (!parsedDb) {
      return res.status(400).json({ error: 'inspire_database must be exactly catalog.schema (one dot).' });
    }
    const { catalog, schema } = parsedDb;
    const table = `\`${catalog}\`.\`${schema}\`.\`__inspire_session\``;

    // Notebook uses individual widget columns (not a single widget_values VARIANT)
    const widgetColsBase = `business_name, inspire_database_name, operation_mode, table_election_mode, use_cases_quality, strategic_goals, business_priorities, business_domains, catalogs, schemas_str, tables_str, generate_choices, generation_path, output_language, sql_generation_per_domain, technical_exclusion_strategy, json_file_path`;
    const widgetColsV08 = `${widgetColsBase}, enriched_business_context, enriched_strategic_goals, enriched_business_priorities, enriched_strategic_initiative, enriched_value_chain, enriched_revenue_model, generation_instructions_section`;
    const baseCols = `session_id, processing_status, completed_percent, create_at, last_updated, completed_on, inspire_json, results_json`;

    let sql;
    if (session_id) {
      sql = `SELECT ${baseCols}, ${widgetColsV08} FROM ${table} WHERE session_id = ${session_id} LIMIT 1`;
    } else {
      sql = `SELECT ${baseCols}, ${widgetColsV08} FROM ${table} ORDER BY create_at DESC LIMIT 1`;
    }

    let result;
    try {
      result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    } catch (e1) {
      const msg = String(e1.message || e1);
      if (/enriched_|generation_instructions_section|UNRESOLVED_COLUMN|FIELD_NOT_FOUND|cannot resolve/i.test(msg)) {
        sql = session_id
          ? `SELECT ${baseCols}, ${widgetColsBase} FROM ${table} WHERE session_id = ${session_id} LIMIT 1`
          : `SELECT ${baseCols}, ${widgetColsBase} FROM ${table} ORDER BY create_at DESC LIMIT 1`;
        result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
      } else {
        throw e1;
      }
    }
    const rows = sqlResultToObjects(result);

    if (rows.length === 0) {
      return res.json({ session: null, message: 'No session found. The notebook may still be initializing.' });
    }

    const session = rows[0];

    // Reconstruct widget_values from individual columns for frontend compatibility
    session.widget_values = {
      business: session.business_name || '',
      '00_business_name': session.business_name || '',
      inspire_database: session.inspire_database_name || '',
      operation_mode: session.operation_mode || '',
      '15_operation': session.operation_mode || '',
      table_election_mode: session.table_election_mode || '',
      use_cases_quality: session.use_cases_quality || '',
      strategic_goals: session.strategic_goals || '',
      business_priorities: session.business_priorities || '',
      business_domains: session.business_domains || '',
      catalogs: session.catalogs || '',
      schemas: session.schemas_str || '',
      tables: session.tables_str || '',
      generate: session.generate_choices || '',
      generation_path: session.generation_path || '',
      output_language: session.output_language || '',
      enriched_business_context: session.enriched_business_context || '',
      enriched_strategic_goals: session.enriched_strategic_goals || '',
      enriched_business_priorities: session.enriched_business_priorities || '',
      enriched_strategic_initiative: session.enriched_strategic_initiative || '',
      enriched_value_chain: session.enriched_value_chain || '',
      enriched_revenue_model: session.enriched_revenue_model || '',
      generation_instructions_section: session.generation_instructions_section || '',
    };

    // Parse VARIANT fields (may come as object or string)
    for (const field of ['inspire_json', 'results_json']) {
      if (session[field] && typeof session[field] === 'string') {
        try { session[field] = JSON.parse(session[field]); } catch { session[field] = null; }
      } else if (!session[field]) {
        session[field] = null;
      }
    }

    // Parse numeric fields
    session.completed_percent = parseFloat(session.completed_percent) || 0;

    res.json({ session });
  } catch (err) {
    // Table might not exist yet — return null session
    if (err.message.includes('TABLE_OR_VIEW_NOT_FOUND') || err.message.includes('does not exist')) {
      return res.json({ session: null, message: 'Session table not yet created. Notebook is initializing...' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Get step delta (new steps since last poll)
app.get('/api/inspire/steps', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id, session_id, since } = req.query;
    if (!inspire_database || !warehouse_id) {
      return res.status(400).json({ error: 'inspire_database and warehouse_id required.' });
    }

    const parsedDb = splitInspireDatabase(inspire_database);
    if (!parsedDb) {
      return res.status(400).json({ error: 'inspire_database must be exactly catalog.schema (one dot).' });
    }
    const { catalog, schema } = parsedDb;
    const table = `\`${catalog}\`.\`${schema}\`.\`__inspire_step\``;

    let sql;
    if (session_id && since) {
      sql = `SELECT step_id, session_id, last_updated, stage_name, step_name, sub_step_name, progress_increment, message, status, result_json FROM ${table} WHERE session_id = ${session_id} AND last_updated > '${since}' ORDER BY last_updated, step_id`;
    } else if (session_id) {
      sql = `SELECT step_id, session_id, last_updated, stage_name, step_name, sub_step_name, progress_increment, message, status, result_json FROM ${table} WHERE session_id = ${session_id} ORDER BY last_updated, step_id`;
    } else {
      sql = `SELECT step_id, session_id, last_updated, stage_name, step_name, sub_step_name, progress_increment, message, status, result_json FROM ${table} ORDER BY last_updated DESC, step_id DESC LIMIT 100`;
    }

    const result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    const steps = sqlResultToObjects(result);

    // Parse result_json and progress_increment for each step
    for (const step of steps) {
      try { step.result_json = JSON.parse(step.result_json); } catch { step.result_json = null; }
      step.progress_increment = parseFloat(step.progress_increment) || 0;
    }

    res.json({ steps, count: steps.length });
  } catch (err) {
    if (err.message.includes('TABLE_OR_VIEW_NOT_FOUND') || err.message.includes('does not exist')) {
      return res.json({ steps: [], count: 0, message: 'Step table not yet created.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Build progressive results from __inspire_step result_json (no need to wait for final results_json)
app.get('/api/inspire/step-results', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id, session_id } = req.query;
    if (!inspire_database || !warehouse_id || !session_id) {
      return res.status(400).json({ error: 'inspire_database, warehouse_id, and session_id required.' });
    }

    const parsedDb = splitInspireDatabase(inspire_database);
    if (!parsedDb) {
      return res.status(400).json({ error: 'inspire_database must be exactly catalog.schema (one dot).' });
    }
    const { catalog, schema } = parsedDb;
    const stepTable = `\`${catalog}\`.\`${schema}\`.\`__inspire_step\``;

    // Fetch all ended_success steps that carry payload data
    const sql = `SELECT step_id, stage_name, step_name, status, result_json FROM ${stepTable} WHERE session_id = ${session_id} AND status IN ('ended_success', 'ended_warning') ORDER BY last_updated, step_id`;

    const result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    const steps = sqlResultToObjects(result);

    // Parse result_json for each step
    for (const step of steps) {
      try {
        if (step.result_json && typeof step.result_json === 'string') {
          step.result_json = JSON.parse(step.result_json);
        }
      } catch { step.result_json = null; }
    }

    // ── Assemble progressive results from step payloads ──
    // Use cases keyed by id to allow merging across phases
    const ucMap = new Map();       // id → use case object
    const domainsList = [];        // { domain_name, use_case_ids }
    let executiveSummary = '';
    let businessContext = null;

    for (const step of steps) {
      const rj = step.result_json;
      if (!rj) continue;
      const prompt = rj.prompt_name || '';

      // 1) Use Case Generation (BASE, AI, STATS, UNSTRUCTURED)
      if (prompt.endsWith('_USE_CASE_GEN_PROMPT') && Array.isArray(rj.use_cases)) {
        for (const uc of rj.use_cases) {
          if (!uc.id) continue;
          const existing = ucMap.get(uc.id) || {};
          ucMap.set(uc.id, {
            ...existing,
            No: uc.id,
            Name: uc.name || existing.Name || '',
            'Business Domain': uc.business_domain || existing['Business Domain'] || '',
            Subdomain: uc.subdomain || existing.Subdomain || '',
            type: uc.type || existing.type || '',
            _source_prompt: prompt,
          });
        }
      }

      // 2) Domain Clustering
      if (prompt === 'DOMAIN_FINDER_PROMPT' && Array.isArray(rj.domains)) {
        for (const d of rj.domains) {
          domainsList.push({
            domain_name: d.domain_name || '',
            use_case_ids: d.use_case_ids || [],
          });
        }
      }

      // 3) Scoring (COMBINED_VALUE_QUALITY_SCORE_PROMPT)
      if (prompt === 'COMBINED_VALUE_QUALITY_SCORE_PROMPT' && Array.isArray(rj.scored_use_cases)) {
        for (const sc of rj.scored_use_cases) {
          if (!sc.id) continue;
          const existing = ucMap.get(sc.id) || {};
          ucMap.set(sc.id, {
            ...existing,
            No: sc.id,
            Name: sc.name || existing.Name || '',
            Priority: sc.priority || existing.Priority || '',
            Quality: sc.quality || existing.Quality || '',
            _value: sc.value || existing._value || '',
            _feasibility: sc.feasibility || existing._feasibility || '',
          });
        }
      }

      // 4) Review / dedup (REVIEW_USE_CASES_PROMPT) — may contain full use case rows
      if (prompt === 'REVIEW_USE_CASES_PROMPT' && Array.isArray(rj.rows)) {
        for (const row of rj.rows) {
          if (!row.No && !row.id) continue;
          const id = String(row.No || row.id);
          const existing = ucMap.get(id) || {};
          ucMap.set(id, { ...existing, ...row, No: id });
        }
      }

      // 5) Genie Code Instructions (v47) / SQL Generation (legacy)
      if ((prompt === 'USE_CASE_GENIE_CODE_INSTRUCTION_GEN_PROMPT' || prompt === 'USE_CASE_SQL_GEN_PROMPT') && (rj.response_chars || rj.sql_preview)) {
        // entity_id format: USE_CASE_GENIE_CODE_INSTRUCTION_GEN_PROMPT:Genie_Instruction_Generator:uc_42
        const ucIdMatch = (rj.entity_id || '').match(/uc_(\d+)/);
        if (ucIdMatch) {
          const id = ucIdMatch[1];
          const existing = ucMap.get(id) || {};
          ucMap.set(id, { ...existing, No: id, _hasGenieCode: true });
        }
      }

      // 6) Summary
      if (prompt === 'SUMMARY_GEN_PROMPT' && rj.response_chars) {
        executiveSummary = rj.summary || executiveSummary;
      }

      // 7) Business Context
      if (prompt === 'BUSINESS_CONTEXT_WORKER_PROMPT' && rj.json) {
        businessContext = rj.json;
      }

      // 8) Translation rows — may carry full use case objects
      if (prompt === 'USE_CASE_TRANSLATE_PROMPT' && Array.isArray(rj.rows)) {
        for (const row of rj.rows) {
          if (!row.No) continue;
          const id = String(row.No);
          const existing = ucMap.get(id) || {};
          ucMap.set(id, { ...existing, ...row, No: id });
        }
      }
    }

    // ── Build domain → use_cases structure ──
    const allUcs = Array.from(ucMap.values());

    // Assign domains to use cases based on clustering
    if (domainsList.length > 0) {
      const idToDomain = {};
      for (const d of domainsList) {
        for (const ucId of d.use_case_ids) {
          idToDomain[String(ucId)] = d.domain_name;
        }
      }
      for (const uc of allUcs) {
        if (!uc['Business Domain'] && idToDomain[String(uc.No)]) {
          uc['Business Domain'] = idToDomain[String(uc.No)];
        }
      }
    }

    // Group use cases by domain
    const domainMap = new Map();
    for (const uc of allUcs) {
      const dName = uc['Business Domain'] || 'Uncategorized';
      if (!domainMap.has(dName)) domainMap.set(dName, []);
      domainMap.get(dName).push(uc);
    }

    const domains = Array.from(domainMap.entries()).map(([domain_name, use_cases]) => ({
      domain_name,
      use_cases,
    }));

    const progressiveResults = {
      title: businessContext ? `${businessContext.business_context || ''} Use Cases Catalog` : 'Use Cases Catalog (In Progress)',
      executive_summary: executiveSummary || '',
      domains_summary: domains.map(d => `${d.domain_name}: ${d.use_cases.length} use cases`).join(', '),
      domains,
      table_registry: {},
      column_registry: {},
      _progressive: true,
      _use_case_count: allUcs.length,
      _step_count: steps.length,
    };

    console.log(`   📊 step-results: ${allUcs.length} use cases from ${steps.length} steps, ${domains.length} domains`);
    res.json({ results: progressiveResults, session_id });
  } catch (err) {
    if (err.message.includes('TABLE_OR_VIEW_NOT_FOUND') || err.message.includes('does not exist')) {
      return res.json({ results: null, message: 'Step table not yet created.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Get use cases from __inspire_usecases table (final polished data)
app.get('/api/inspire/usecases', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id, session_id, all_sessions, limit: limitRaw } = req.query;
    if (!inspire_database || !warehouse_id) {
      return res.status(400).json({ error: 'inspire_database and warehouse_id required.' });
    }
    const listAll =
      String(all_sessions || '').toLowerCase() === '1' ||
      String(all_sessions || '').toLowerCase() === 'true';
    if (!listAll && (session_id == null || String(session_id).trim() === '')) {
      return res.status(400).json({
        error: 'session_id required, or pass all_sessions=1 to list use cases from every session.',
      });
    }
    const parsedDb = splitInspireDatabase(inspire_database);
    if (!parsedDb) {
      return res.status(400).json({ error: 'inspire_database must be exactly catalog.schema (one dot).' });
    }
    const { catalog, schema } = parsedDb;
    const table = `\`${catalog}\`.\`${schema}\`.\`__inspire_usecases\``;
    let sql;
    if (listAll) {
      const lim = Math.min(Math.max(parseInt(String(limitRaw || '300'), 10) || 300, 1), 1000);
      sql = `SELECT * FROM ${table} ORDER BY session_id DESC, id LIMIT ${lim}`;
    } else {
      sql = `SELECT * FROM ${table} WHERE session_id = ${session_id} ORDER BY id`;
    }
    const result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    const rows = sqlResultToObjects(result);
    // Normalize tracking table snake_case → frontend Title Case
    for (const row of rows) {
      row.No = row.id || '';
      row.Name = row.use_case || row.Name || '';
      row.short_name = row.short_name || row.use_case || '';
      row['Business Domain'] = row.business_domain || '';
      row.Subdomain = row.subdomain || '';
      row.Statement = row.statement || row.description || '';
      row.Solution = row.solution || '';
      row['Business Value'] = row.business_value || '';
      row.Beneficiary = row.beneficiary || '';
      row.Sponsor = row.sponsor || '';
      row.Priority = row.priority_score ? (row.priority_score >= 4 ? 'Very High' : row.priority_score >= 3 ? 'High' : row.priority_score >= 2 ? 'Medium' : 'Low') : '';
      row.Quality = row.quality_score ? (row.quality_score >= 4 ? 'Very High' : row.quality_score >= 3 ? 'High' : row.quality_score >= 2 ? 'Medium' : 'Low') : '';
      row.type = row.type || '';
      row['Analytics Technique'] = row.analytics_technique || '';
      row['Business Priority Alignment'] = row.business_priority_alignment || '';
      row['Tables Involved'] = row.tables_involved || '';
      row['Primary Table'] = row.primary_table || '';
      row.notebook_path = row.notebook_path || row.NOTEBOOK_PATH || row.Notebook_Path || '';
      row.genie_instruction = stripAiDemoDisclaimerHtml(
        row.genie_instruction || row.GENIE_INSTRUCTION || row.Genie_Instruction || '',
      );
      row['Technical Design'] = row.high_level_design || '';
      row._domain = row.business_domain || '';
      row['Idea Theme'] = row.idea_theme || '';
      row['BoB Score'] = row.bob_score != null && row.bob_score !== '' ? row.bob_score : '';
      row['BoB Technical'] = row.bob_tier1_score != null && row.bob_tier1_score !== '' ? row.bob_tier1_score : '';
      row['BoB Business'] = row.bob_tier2_score != null && row.bob_tier2_score !== '' ? row.bob_tier2_score : '';
      row['BoB PBA'] = row.bob_tier3_score != null && row.bob_tier3_score !== '' ? row.bob_tier3_score : '';
      const hgc = (row.has_genie_code || '').toString().trim();
      row.has_genie_code_flag = hgc === 'Y' || hgc === 'Yes';
      row.generate_genie_code_instruction = row.generate_genie_code_instruction || '';
    }
    console.log(
      listAll
        ? `   📋 usecases: ${rows.length} rows (all_sessions, limit applied)`
        : `   📋 usecases: ${rows.length} rows for session ${session_id}`
    );
    res.json({ usecases: rows, count: rows.length, all_sessions: listAll });
  } catch (err) {
    if (err.message.includes('TABLE_OR_VIEW_NOT_FOUND') || err.message.includes('does not exist')) {
      return res.json({ usecases: [], count: 0, message: 'Usecases table not found.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ACK: set processing_status = 'done'
app.post('/api/inspire/ack', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id, session_id } = req.body;
    if (!inspire_database || !warehouse_id || !session_id) {
      return res.status(400).json({ error: 'inspire_database, warehouse_id, and session_id required.' });
    }

    const parsedDb = splitInspireDatabase(inspire_database);
    if (!parsedDb) {
      return res.status(400).json({ error: 'inspire_database must be exactly catalog.schema (one dot).' });
    }
    const { catalog, schema } = parsedDb;
    const table = `\`${catalog}\`.\`${schema}\`.\`__inspire_session\``;
    const sql = `UPDATE ${table} SET processing_status = 'done' WHERE session_id = ${session_id} AND processing_status = 'ready'`;

    await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    console.log(`   ✅ ACK sent for session ${session_id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Route 1: set generate_genie_code_instruction = 'Yes' for selected UC ids, then submit
 * notebook job with 15_operation = Generate Use Cases and 14_session_id = session.
 */
async function handleInspireGenerateGenie(req, res) {
  try {
    const {
      inspire_database,
      warehouse_id,
      session_id,
      use_case_ids: useCaseIdsRaw,
      cluster_id,
      notebook_path,
    } = req.body || {};

    if (!inspire_database || !warehouse_id) {
      return res.status(400).json({ error: 'inspire_database and warehouse_id are required.' });
    }
    const sidStr = String(session_id ?? '').trim();
    if (!/^\d+$/.test(sidStr)) {
      return res.status(400).json({ error: 'session_id must be a numeric Inspire session id.' });
    }

    const use_case_ids = Array.isArray(useCaseIdsRaw)
      ? useCaseIdsRaw.map((x) => String(x).trim()).filter(Boolean)
      : [];
    if (use_case_ids.length === 0) {
      return res.status(400).json({ error: 'use_case_ids must be a non-empty array of use case id strings.' });
    }
    if (use_case_ids.length > 50) {
      return res.status(400).json({ error: 'At most 50 use cases per Generate request.' });
    }

    const safeIds = use_case_ids.filter((id) => /^[a-zA-Z0-9_.\-]+$/.test(id));
    if (safeIds.length !== use_case_ids.length) {
      return res.status(400).json({
        error: 'Each use_case_id must match /^[a-zA-Z0-9_.\\-]+$/ (Inspire tracking table id / No).',
      });
    }

    const parsedDb = splitInspireDatabase(inspire_database);
    if (!parsedDb) {
      return res.status(400).json({ error: 'inspire_database must be exactly catalog.schema (one dot).' });
    }
    const { catalog, schema } = parsedDb;

    const session = await fetchInspireSessionWidgetRow(
      req.dbHost,
      req.dbToken,
      warehouse_id,
      catalog,
      schema,
      sidStr,
    );
    if (!session) {
      return res.status(404).json({ error: `No __inspire_session row for session_id=${sidStr}.` });
    }

    const params = notebookParamsFromSessionForGenerateRun(session, sidStr);
    if (!params['02_inspire_database']) {
      params['02_inspire_database'] = inspire_database.trim();
    }
    if (!params['01_uc_metadata']) {
      return res.status(400).json({
        error:
          'This session has no UC metadata (catalogs/schemas/tables or docs-only JSON path) stored on __inspire_session. Run Discover from this app first, or set metadata manually.',
      });
    }

    await runRoute1GenieFlagUpdates(
      req.dbHost,
      req.dbToken,
      warehouse_id,
      catalog,
      schema,
      sidStr,
      safeIds,
    );

    const out = await triggerInspireNotebookJob(req.dbHost, req.dbToken, {
      params,
      notebook_path,
      cluster_id,
      jobType: 'genie_regen',
    });

    console.log(`   🧞 Generate Genie: session=${sidStr}, flagged=${safeIds.length}, run_id=${out.run_id}`);
    res.json({
      ...out,
      session_id: sidStr,
      flagged_use_case_ids: safeIds,
    });
  } catch (err) {
    const code = err.statusCode && Number.isFinite(err.statusCode) ? err.statusCode : 500;
    res.status(code).json({ error: err.message });
  }
}

app.post('/api/inspire/generate-genie', requireToken, handleInspireGenerateGenie);
app.post('/api/inspire/generate_genie', requireToken, handleInspireGenerateGenie);

/**
 * Sync Route 1 flags to Delta while selecting (debounced in UI). Same SQL as generate-genie minus the job.
 * use_case_ids may be empty → only clears generate_genie_code_instruction to 'No' for the session.
 */
app.post('/api/inspire/sync-genie-flags', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id, session_id, use_case_ids: useCaseIdsRaw } = req.body || {};
    if (!inspire_database || !warehouse_id) {
      return res.status(400).json({ error: 'inspire_database and warehouse_id are required.' });
    }
    const sidStr = String(session_id ?? '').trim();
    if (!/^\d+$/.test(sidStr)) {
      return res.status(400).json({ error: 'session_id must be a numeric Inspire session id.' });
    }
    const use_case_ids = Array.isArray(useCaseIdsRaw)
      ? useCaseIdsRaw.map((x) => String(x).trim()).filter(Boolean)
      : [];
    if (use_case_ids.length > 50) {
      return res.status(400).json({ error: 'At most 50 use cases per sync.' });
    }
    const safeIds = use_case_ids.filter((id) => /^[a-zA-Z0-9_.\-]+$/.test(id));
    if (safeIds.length !== use_case_ids.length && use_case_ids.length > 0) {
      return res.status(400).json({
        error: 'Each use_case_id must match /^[a-zA-Z0-9_.\\-]+$/ (Inspire tracking table id / No).',
      });
    }
    const parsedDb = splitInspireDatabase(inspire_database);
    if (!parsedDb) {
      return res.status(400).json({ error: 'inspire_database must be exactly catalog.schema (one dot).' });
    }
    const { catalog, schema } = parsedDb;
    await runRoute1GenieFlagUpdates(req.dbHost, req.dbToken, warehouse_id, catalog, schema, sidStr, safeIds);
    console.log(`   🧞 sync-genie-flags: session=${sidStr}, flagged=${safeIds.length}`);
    res.json({ success: true, session_id: sidStr, flagged_use_case_ids: safeIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Progress for Genie regen on selected use cases only: rows still flagged generate_genie_code_instruction=Yes.
 * (Using "not Yes" as "done" wrongly showed 100% for already-finished rows before a new run.)
 * Optional run_id adds Jobs API life_cycle_state for the notebook run.
 */
app.get('/api/inspire/genie-progress', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id, session_id, use_case_ids, run_id } = req.query;
    if (!inspire_database || !warehouse_id || !session_id) {
      return res.status(400).json({ error: 'inspire_database, warehouse_id, and session_id required.' });
    }
    const sidStr = String(session_id).trim();
    if (!/^\d+$/.test(sidStr)) {
      return res.status(400).json({ error: 'session_id must be numeric.' });
    }
    const ids = String(use_case_ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'use_case_ids required (comma-separated tracking ids).' });
    }
    if (ids.length > 50) {
      return res.status(400).json({ error: 'At most 50 ids.' });
    }
    const safeIds = ids.filter((id) => /^[a-zA-Z0-9_.\-]+$/.test(id));
    if (safeIds.length !== ids.length) {
      return res.status(400).json({ error: 'Invalid use_case_ids.' });
    }
    const parsedDb = splitInspireDatabase(String(inspire_database));
    if (!parsedDb) {
      return res.status(400).json({ error: 'inspire_database must be exactly catalog.schema (one dot).' });
    }
    const { catalog, schema } = parsedDb;
    const ucTable = `\`${catalog}\`.\`${schema}\`.\`__inspire_usecases\``;
    const inList = safeIds.map((id) => `'${escapeSqlStringLiteral(id)}'`).join(',');
    const sql = `SELECT
        CAST(COUNT(*) AS INT) AS selected_total,
        CAST(SUM(CASE WHEN UPPER(TRIM(COALESCE(generate_genie_code_instruction, 'No'))) = 'YES' THEN 1 ELSE 0 END) AS INT) AS remaining_yes
      FROM ${ucTable}
      WHERE session_id = ${sidStr} AND id IN (${inList})`;
    const result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    const rows = sqlResultToObjects(result);
    const row = rows[0] || {};
    const total = Number(row.selected_total) || 0;
    const remainingYes = Number(row.remaining_yes) || 0;
    const done = Math.max(0, total - remainingYes);
    const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

    let run_life_cycle_state = null;
    let run_result_state = null;
    if (run_id && String(run_id).trim()) {
      const jr = await dbFetch(
        req.dbHost,
        req.dbToken,
        `/api/2.1/jobs/runs/get?run_id=${encodeURIComponent(String(run_id).trim())}`,
      );
      if (jr.ok) {
        try {
          const j = await jr.json();
          run_life_cycle_state = j.state?.life_cycle_state ?? null;
          run_result_state = j.state?.result_state ?? j.status?.state ?? null;
        } catch { /* ignore */ }
      }
    }

    res.json({
      session_id: sidStr,
      selected_total: total,
      remaining_yes: remainingYes,
      /** Rows among selected that are no longer flagged Yes (same as done count). */
      cleared: done,
      percent,
      run_life_cycle_state,
      run_result_state,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get results_json for completed session
app.get('/api/inspire/results', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id, session_id } = req.query;
    if (!inspire_database || !warehouse_id) {
      return res.status(400).json({ error: 'inspire_database and warehouse_id required.' });
    }

    const parsedDb = splitInspireDatabase(inspire_database);
    if (!parsedDb) {
      return res.status(400).json({ error: 'inspire_database must be exactly catalog.schema (one dot).' });
    }
    const { catalog, schema } = parsedDb;
    const table = `\`${catalog}\`.\`${schema}\`.\`__inspire_session\``;

    let sql;
    if (session_id) {
      sql = `SELECT results_json, completed_on, session_id FROM ${table} WHERE session_id = ${session_id} AND completed_on IS NOT NULL LIMIT 1`;
    } else {
      // Get latest completed session
      sql = `SELECT results_json, completed_on, session_id FROM ${table} WHERE completed_on IS NOT NULL ORDER BY completed_on DESC LIMIT 1`;
    }

    const result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    const rows = sqlResultToObjects(result);

    if (rows.length === 0) {
      return res.json({ results: null, message: 'No completed session found.' });
    }

    let results = null;
    const raw = rows[0].results_json;
    if (raw && typeof raw === 'object') {
      // VARIANT type already returned as object
      results = raw;
    } else if (raw && typeof raw === 'string') {
      try { results = JSON.parse(raw); } catch { results = null; }
    }
    console.log('   📊 results_json type:', typeof raw, '| domains:', Array.isArray(results?.domains) ? results.domains.length : 'N/A', '| has use_cases:', !!results?.use_cases);

    if (results && typeof results === 'object') {
      results = stripDisclaimerDeep(results);
    }

    res.json({
      results,
      session_id: rows[0].session_id,
      completed_on: rows[0].completed_on,
    });
  } catch (err) {
    if (err.message.includes('TABLE_OR_VIEW_NOT_FOUND') || err.message.includes('does not exist')) {
      return res.json({ results: null, message: 'Session table not found.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// List all sessions (for results page - pick which session to view)
app.get('/api/inspire/sessions', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id } = req.query;
    if (!inspire_database || !warehouse_id) {
      return res.status(400).json({ error: 'inspire_database and warehouse_id required.' });
    }

    const parsed = splitInspireDatabase(inspire_database);
    if (!parsed) {
      return res.status(400).json({
        error: 'inspire_database must be exactly catalog.schema (one dot), e.g. workspace._inspire',
      });
    }
    const { catalog, schema } = parsed;
    const table = `\`${catalog}\`.\`${schema}\`.\`__inspire_session\``;
    // Omit results_json — payloads can exceed SQL Statement API INLINE (~25MB) limit for LIMIT 20.
    // Full results load per session via GET /api/inspire/results.
    const sql = `SELECT session_id, processing_status, completed_percent, create_at, completed_on, business_name, inspire_database_name, operation_mode, generation_path, business_domains, catalogs FROM ${table} ORDER BY create_at DESC LIMIT 20`;

    const result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    const sessions = sqlResultToObjects(result);

    for (const s of sessions) {
      // Reconstruct widget_values from individual columns
      s.widget_values = {
        business: s.business_name || '',
        '00_business_name': s.business_name || '',
        inspire_database: s.inspire_database_name || '',
        operation_mode: s.operation_mode || '',
        generation_path: s.generation_path || '',
      };
      s.completed_percent = parseFloat(s.completed_percent) || 0;
    }

    await attachSessionUsecaseOverviews(
      req.dbHost,
      req.dbToken,
      warehouse_id,
      catalog,
      schema,
      sessions
    );

    res.json({ sessions });
  } catch (err) {
    if (err.message.includes('TABLE_OR_VIEW_NOT_FOUND') || err.message.includes('does not exist')) {
      return res.json({ sessions: [], message: 'Session table not found.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Delete a session by session_id
app.delete('/api/inspire/session', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id, session_id } = req.query;
    if (!inspire_database || !warehouse_id || !session_id) {
      return res.status(400).json({ error: 'inspire_database, warehouse_id, and session_id required.' });
    }
    const parsedDb = splitInspireDatabase(inspire_database);
    if (!parsedDb) {
      return res.status(400).json({ error: 'inspire_database must be exactly catalog.schema (one dot).' });
    }
    const { catalog, schema } = parsedDb;
    const sessionTable = `\`${catalog}\`.\`${schema}\`.\`__inspire_session\``;
    const stepTable = `\`${catalog}\`.\`${schema}\`.\`__inspire_step\``;

    // Delete from step tracking table first (may not exist)
    try {
      await executeSql(req.dbHost, req.dbToken, warehouse_id,
        `DELETE FROM ${stepTable} WHERE session_id = ${session_id}`);
    } catch { /* step table may not exist */ }

    // Delete from session table
    await executeSql(req.dbHost, req.dbToken, warehouse_id,
      `DELETE FROM ${sessionTable} WHERE session_id = ${session_id}`);

    res.json({ success: true, message: `Session ${session_id} deleted.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  Legacy results endpoints (fallback for old data)
// ═══════════════════════════════════════════════════

app.get('/api/results/tables', requireToken, async (req, res) => {
  try {
    const inspireDb = req.query.inspire_database;
    if (!inspireDb || !inspireDb.includes('.')) {
      return res.status(400).json({ error: 'inspire_database required (catalog.schema).' });
    }
    const [catalog, schema] = inspireDb.split('.');
    const response = await dbFetch(
      req.dbHost, req.dbToken,
      `/api/2.1/unity-catalog/tables?catalog_name=${encodeURIComponent(catalog)}&schema_name=${encodeURIComponent(schema)}&max_results=500`
    );
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    const tables = (data.tables || []).map(t => ({
      name: t.name,
      full_name: t.full_name,
      table_type: t.table_type,
    }));
    res.json({ tables, count: tables.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  Workspace status check
// ═══════════════════════════════════════════════════

app.get('/api/workspace/status', requireToken, async (req, res) => {
  try {
    const notebookPath = req.query.path;
    if (!notebookPath) return res.status(400).json({ error: 'path query param required.' });
    const response = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/workspace/get-status?path=${encodeURIComponent(notebookPath)}`);
    if (!response.ok) {
      if (response.status === 404) return res.json({ exists: false });
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    res.json({ exists: true, object_type: data.object_type, path: data.path, language: data.language });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  Static frontend + SPA fallback (must run after all API routes)
// ═══════════════════════════════════════════════════

if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));

  // When running as a Databricks App with installer-injected config,
  // inject a script that auto-completes the Setup Wizard so users
  // don't need to manually enter a PAT (the app proxy provides auth).
  const indexHtmlRaw = fs.readFileSync(path.join(STATIC_DIR, 'index.html'), 'utf8');
  const AUTO_SETUP = process.env.INSPIRE_AUTO_SETUP === 'true';
  const autoSetupSnippet = `<script>
(function(){
  if(localStorage.getItem('db_setup_complete'))return;
  fetch('/api/defaults').then(function(r){return r.json()}).then(function(d){
    if(!d.isDatabricksApp&&!d.autoSetup)return;
    fetch('/api/health').then(function(r){return r.json()}).then(function(h){
      if(!h.hasUserToken&&!h.hasPlatformAuth&&!d.autoSetup)return;
      if(d.databricksHost)localStorage.setItem('db_databricks_host',d.databricksHost);
      if(d.warehouseId)localStorage.setItem('db_warehouse_id',d.warehouseId);
      if(d.inspireDatabase)localStorage.setItem('db_inspire_database',d.inspireDatabase);
      // Auto-publish notebook in background
      fetch('/api/notebook').then(function(r){return r.json()}).then(function(nb){
        if(nb.path)localStorage.setItem('db_notebook_path',nb.path);
      }).catch(function(){});
      if(d.databricksHost&&d.warehouseId&&d.inspireDatabase){
        localStorage.setItem('db_setup_complete','1');
        localStorage.setItem('db_auth_mode','pat');
        location.reload();
      }
    });
  });
})();
</script>`;
  const isDatabricksAppEnv =
    AUTO_SETUP ||
    (!!DATABRICKS_HOST && hasDatabricksPlatformAuth() && process.env.NODE_ENV === 'production');
  const indexHtml = isDatabricksAppEnv
    ? indexHtmlRaw.replace('</head>', autoSetupSnippet + '</head>')
    : indexHtmlRaw;

  app.get('{*path}', (req, res) => {
    res.type('html').send(indexHtml);
  });
}

// ═══════════════════════════════════════════════════
//  Start server
// ═══════════════════════════════════════════════════

// ── Start server ──
// Pre-warm SP token BEFORE listening so the first request already has a valid token.
const PORT = process.env.PORT || 8080;

(async () => {
  // Pre-warm SP OAuth token before accepting any requests
  if (SP_CLIENT_ID && SP_CLIENT_SECRET && !SERVICE_TOKEN) {
    await refreshSpToken();
  }

  app.listen(PORT, () => {
    const hasNotebook = fs.existsSync(BUNDLED_NOTEBOOK_PATH);
    const servingStatic = fs.existsSync(STATIC_DIR);
    console.log(`\n🚀 Inspire AI running on http://localhost:${PORT}`);
    console.log(`   Databricks Host: ${DATABRICKS_HOST || '⚠️  Not configured'}`);
    console.log(`   Auth:            ${spTokenCache ? '✅ SP OAuth token ready' : SERVICE_TOKEN ? '✅ Static token' : '⚠️  No token (user auth required)'}`);
    console.log(`   SP Credentials:  ${SP_CLIENT_ID ? '✅ Set' : '—  Not configured'}`);
    console.log(`   Notebook:        ${hasNotebook ? '✅ Found' : '❌ Not found'}`);
    console.log(`   Frontend:        ${servingStatic ? '✅ ' + STATIC_DIR : '—  (dev proxy mode)'}`);
    console.log(`   Warehouse:       ${DEFAULT_WAREHOUSE_ID || '—  Not configured'}`);
    console.log(`   Database:        ${DEFAULT_INSPIRE_DB || '—  Not configured'}\n`);
  });
})();
