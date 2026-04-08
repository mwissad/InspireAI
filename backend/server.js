const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));

// ═══════════════════════════════════════════════════
//  Environment Configuration (generic — no defaults)
// ═══════════════════════════════════════════════════

// DATABRICKS_HOST: required — set by the Databricks App runtime or by the admin.
// No hardcoded workspace URL — the app is customer-agnostic.
const DATABRICKS_HOST = process.env.DATABRICKS_HOST || '';
const DEFAULT_NOTEBOOK_PATH = process.env.NOTEBOOK_PATH || '';

// Optional: when deployed as a Databricks App, the runtime may inject a
// service-principal token automatically. Individual users can still
// override this by passing their own PAT via the Authorization header.
const SERVICE_TOKEN = process.env.DATABRICKS_TOKEN || '';

// Path to the bundled DBC file — try several candidate locations
const DBC_CANDIDATES = [
  path.resolve(__dirname, '..', 'databricks_inspire_v46.dbc'),
  path.resolve(__dirname, 'databricks_inspire_v46.dbc'),
  path.resolve(__dirname, '..', 'notebooks', 'databricks_inspire_v46.dbc'),
];
let BUNDLED_DBC_PATH = DBC_CANDIDATES.find(p => fs.existsSync(p)) || '';

// If no physical DBC file found, try to materialize from embedded base64 bundle
if (!BUNDLED_DBC_PATH) {
  try {
    const b64 = require('./dbc_bundle');
    const materializedPath = path.resolve(__dirname, 'databricks_inspire_v46.dbc');
    fs.writeFileSync(materializedPath, Buffer.from(b64, 'base64'));
    BUNDLED_DBC_PATH = materializedPath;
    console.log('DBC materialized from embedded bundle.');
  } catch (_) {
    BUNDLED_DBC_PATH = DBC_CANDIDATES[0]; // fallback path (will show "not found")
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

// Serve frontend static build in production
const STATIC_DIR = path.resolve(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
}

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

function resolveHost(req) {
  // Priority: 1) per-request header  2) env var
  const headerHost = req.headers['x-databricks-host'];
  return headerHost || DATABRICKS_HOST;
}

async function dbFetch(host, token, apiPath, options = {}) {
  if (!host) throw new Error('Databricks host not configured. Set DATABRICKS_HOST or provide it in Settings.');
  const url = `${host}${apiPath}`;
  try {
    const resp = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!resp.ok && resp.status === 401) {
      const tokenPreview = token ? `${token.slice(0, 4)}...${token.slice(-4)} (len=${token.length})` : 'MISSING';
      console.error(`   🔑 Token debug: ${tokenPreview}, Host: ${host}, API: ${apiPath}`);
    }
    return resp;
  } catch (err) {
    console.error(`❌ Fetch failed for ${apiPath}:`, err.message);
    throw new Error(`Network error calling Databricks API (${apiPath}): ${err.message}`);
  }
}

function getToken(req) {
  // 1) Custom header from frontend — survives Databricks App proxy (which strips Authorization)
  const customToken = req.headers['x-db-pat-token'];
  if (customToken) return customToken;
  // 2) Standard Authorization header (works in local dev / non-proxy mode)
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  // 3) Databricks Apps inject the logged-in user's OAuth token here
  const forwarded = req.headers['x-forwarded-access-token'];
  if (forwarded) return forwarded;
  // 4) Fall back to service-principal token from env
  return SERVICE_TOKEN || null;
}

function requireToken(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Databricks token required. Set it in Settings or configure DATABRICKS_TOKEN.' });
  req.dbToken = token;
  req.dbHost = resolveHost(req);
  next();
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

// Helper: convert SQL result to array of objects
function sqlResultToObjects(result) {
  const columns = result.manifest?.schema?.columns || [];
  const colNames = columns.map(c => c.name);
  const rows = result.result?.data_array || [];
  return rows.map(row => {
    const obj = {};
    colNames.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

// ═══════════════════════════════════════════════════
//  Auto-publish — seamless notebook deployment
// ═══════════════════════════════════════════════════

const NOTEBOOK_DEST = '/Shared/inspire_ai';
let cachedNotebookPath = DEFAULT_NOTEBOOK_PATH || '';

async function ensureNotebookPublished(host, token, force = false) {
  if (!force) {
    // 1. If we already know the notebook path, verify it still exists
    if (cachedNotebookPath) {
      try {
        const check = await dbFetch(host, token, `/api/2.0/workspace/get-status?path=${encodeURIComponent(cachedNotebookPath)}`);
        if (check.ok) return cachedNotebookPath;
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
          return cachedNotebookPath;
        }
        if (data.object_type === 'DIRECTORY') {
          const listResp = await dbFetch(host, token, `/api/2.0/workspace/list?path=${encodeURIComponent(NOTEBOOK_DEST)}`);
          if (listResp.ok) {
            const listData = await listResp.json();
            const nb = (listData.objects || []).find(o => o.object_type === 'NOTEBOOK');
            if (nb) {
              cachedNotebookPath = nb.path;
              console.log(`📓 Notebook found in folder: ${cachedNotebookPath}`);
              return cachedNotebookPath;
            }
          }
        }
      }
    } catch (_) {}
  } else {
    console.log('🔄 Force re-publish requested — overwriting existing notebook...');
  }

  // 3. Publish the bundled DBC
  if (!BUNDLED_DBC_PATH || !fs.existsSync(BUNDLED_DBC_PATH)) {
    throw new Error('No bundled DBC file available to publish.');
  }

  console.log(`📦 Auto-publishing notebook to ${NOTEBOOK_DEST}...`);
  const fileBuffer = fs.readFileSync(BUNDLED_DBC_PATH);
  const base64Content = fileBuffer.toString('base64');

  // Delete old if exists
  try {
    await dbFetch(host, token, '/api/2.0/workspace/delete', {
      method: 'POST',
      body: JSON.stringify({ path: NOTEBOOK_DEST, recursive: true }),
    });
  } catch (_) {}

  const resp = await dbFetch(host, token, '/api/2.0/workspace/import', {
    method: 'POST',
    body: JSON.stringify({ path: NOTEBOOK_DEST, format: 'DBC', content: base64Content }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Publish failed: ${err}`);
  }

  // Find the notebook inside the imported folder
  cachedNotebookPath = NOTEBOOK_DEST;
  try {
    const listResp = await dbFetch(host, token, `/api/2.0/workspace/list?path=${encodeURIComponent(NOTEBOOK_DEST)}`);
    if (listResp.ok) {
      const listData = await listResp.json();
      const nb = (listData.objects || []).find(o => o.object_type === 'NOTEBOOK');
      if (nb) cachedNotebookPath = nb.path;
    }
  } catch (_) {}

  console.log(`✅ Notebook published: ${cachedNotebookPath}`);
  return cachedNotebookPath;
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

app.get('/api/workspace/list', requireToken, async (req, res) => {
  try {
    const wsPath = req.query.path;
    if (!wsPath) return res.status(400).json({ error: 'path query param required.' });

    // Handle Volumes paths via Files API
    if (wsPath.startsWith('/Volumes/')) {
      const response = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/fs/directories${wsPath}`);
      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }
      const data = await response.json();
      const contents = (data.contents || []).map(f => ({
        path: f.path,
        name: f.name || f.path.split('/').pop(),
        is_directory: f.is_directory || false,
        file_size: f.file_size || 0,
      }));
      return res.json({ files: contents });
    }

    // Workspace paths
    const response = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/workspace/list?path=${encodeURIComponent(wsPath)}`);
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    const files = (data.objects || []).map(o => ({
      path: o.path,
      name: o.path.split('/').pop(),
      is_directory: o.object_type === 'DIRECTORY',
      object_type: o.object_type,
      file_size: o.size || 0,
    }));
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/workspace/export', requireToken, async (req, res) => {
  try {
    const wsPath = req.query.path;
    if (!wsPath) return res.status(400).json({ error: 'path query param required.' });

    // Handle Volumes paths via Files API (direct download)
    if (wsPath.startsWith('/Volumes/')) {
      const response = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/fs/files${wsPath}`);
      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }
      const fileName = wsPath.split('/').pop();
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      const buffer = Buffer.from(await response.arrayBuffer());
      return res.send(buffer);
    }

    // Workspace paths — try export with format=AUTO (base64 JSON response)
    const fileName = wsPath.split('/').pop();

    // First try: JSON export with base64 content
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
      // If direct_download returned raw bytes
      const buffer = Buffer.from(await resp1.arrayBuffer());
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(buffer);
    }

    // Second try: direct_download=true
    const resp2 = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/workspace/export?path=${encodeURIComponent(wsPath)}&direct_download=true`);
    if (!resp2.ok) {
      const err = await resp2.text();
      return res.status(resp2.status).json({ error: err });
    }
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    const buffer = Buffer.from(await resp2.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  Basic endpoints
// ═══════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  const hasBundledDbc = fs.existsSync(BUNDLED_DBC_PATH);
  const host = resolveHost(req);
  const hasForwardedToken = !!req.headers['x-forwarded-access-token'];
  res.json({
    status: 'ok',
    host: host ? host.replace(/https?:\/\//, '').split('.')[0] + '...' : 'not configured',
    hostConfigured: !!host,
    hasBundledDbc,
    hasServiceToken: !!SERVICE_TOKEN,
    isDatabricksApp: hasForwardedToken || !!DATABRICKS_HOST,
    hasUserToken: hasForwardedToken,
  });
});

// Auto-publish and return the notebook path
app.get('/api/notebook', requireToken, async (req, res) => {
  try {
    const force = req.query.force === 'true';
    if (force) {
      cachedNotebookPath = ''; // clear cache to force re-publish
    }
    const nbPath = await ensureNotebookPublished(req.dbHost, req.dbToken, force);
    res.json({ path: nbPath, republished: force });
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
    const response = await dbFetch(req.dbHost, req.dbToken, '/api/2.1/unity-catalog/catalogs');
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    const catalogs = (data.catalogs || []).map(c => ({
      name: c.name,
      comment: c.comment || '',
      owner: c.owner || '',
    }));
    res.json({ catalogs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/catalogs/:catalog/schemas', requireToken, async (req, res) => {
  try {
    const { catalog } = req.params;
    const response = await dbFetch(req.dbHost, req.dbToken, `/api/2.1/unity-catalog/schemas?catalog_name=${encodeURIComponent(catalog)}`);
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    const schemas = (data.schemas || []).map(s => ({
      name: s.name,
      full_name: s.full_name,
      comment: s.comment || '',
    }));
    res.json({ schemas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tables/:catalog/:schema', requireToken, async (req, res) => {
  try {
    const { catalog, schema } = req.params;
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
      catalog_name: t.catalog_name || catalog,
      schema_name: t.schema_name || schema,
      table_type: t.table_type,
      data_source_format: t.data_source_format || '',
      updated_at: t.updated_at ? new Date(t.updated_at).toISOString() : null,
      created_at: t.created_at ? new Date(t.created_at).toISOString() : null,
      comment: t.comment || '',
      owner: t.owner || '',
      columns: (t.columns || []).length,
    }));
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

    if (!fs.existsSync(BUNDLED_DBC_PATH)) {
      return res.status(404).json({ error: 'Bundled DBC file not found on server.' });
    }

    const fileBuffer = fs.readFileSync(BUNDLED_DBC_PATH);
    const base64Content = fileBuffer.toString('base64');

    // DBC format doesn't support overwrite — delete first
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
        format: 'DBC',
        content: base64Content,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    // DBC imports as a folder — find the actual notebook inside
    let notebookPath = destination_path;
    try {
      const listResp = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/workspace/list?path=${encodeURIComponent(destination_path)}`);
      if (listResp.ok) {
        const listData = await listResp.json();
        const notebook = (listData.objects || []).find(o => o.object_type === 'NOTEBOOK');
        if (notebook) notebookPath = notebook.path;
      }
    } catch (_) {}

    console.log(`✅ Published DBC to: ${destination_path}, notebook: ${notebookPath}`);
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
    if (!fs.existsSync(BUNDLED_DBC_PATH)) {
      return res.status(404).json({ error: 'Bundled DBC file not found.' });
    }

    const zip = new AdmZip(BUNDLED_DBC_PATH);
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
      file: path.basename(BUNDLED_DBC_PATH),
      size: fs.statSync(BUNDLED_DBC_PATH).size,
      notebooks,
      entry_count: entries.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  Submit notebook run
// ═══════════════════════════════════════════════════

app.post('/api/run', requireToken, async (req, res) => {
  try {
    const { params, cluster_id, notebook_path } = req.body;

    let resolvedPath = notebook_path || DEFAULT_NOTEBOOK_PATH;
    if (!resolvedPath) {
      // Auto-publish seamlessly
      try {
        resolvedPath = await ensureNotebookPublished(req.dbHost, req.dbToken);
      } catch (pubErr) {
        return res.status(400).json({ error: `Could not auto-publish notebook: ${pubErr.message}` });
      }
    }

    // Verify path points to a NOTEBOOK (DBC imports create folders)
    try {
      const statusResp = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/workspace/get-status?path=${encodeURIComponent(resolvedPath)}`);
      if (statusResp.ok) {
        const statusData = await statusResp.json();
        if (statusData.object_type === 'DIRECTORY') {
          console.log(`📂 Path "${resolvedPath}" is a DIRECTORY — searching for notebook...`);
          const listResp = await dbFetch(req.dbHost, req.dbToken, `/api/2.0/workspace/list?path=${encodeURIComponent(resolvedPath)}`);
          if (listResp.ok) {
            const listData = await listResp.json();
            const notebook = (listData.objects || []).find(o => o.object_type === 'NOTEBOOK');
            if (notebook) {
              console.log(`📓 Found notebook: ${notebook.path}`);
              resolvedPath = notebook.path;
            } else {
              return res.status(400).json({ error: `Path "${resolvedPath}" is a folder with no notebooks.` });
            }
          }
        }
      }
    } catch (verifyErr) {
      console.warn(`⚠️ Path verify failed: ${verifyErr.message}`);
    }

    const businessName = params['00_business_name'] || 'Run';
    const sanitizeTag = (v) => String(v || '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 255);
    const sanitizedTag = businessName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'run';
    const jobName = `Inspire AI - ${businessName} - ${new Date().toISOString().slice(0, 19)}`;
    const jobSessionId = crypto.randomUUID();
    const notebookFilename = resolvedPath.split('/').pop() || 'inspire_notebook';

    // Step 1: Create a job with tags
    const createPayload = {
      name: jobName,
      tags: {
        inspire_version: 'v4.6',
        dbx_inspire_ai_business: sanitizeTag(businessName),
        dbx_inspire_ai_type: 'discovery',
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
          ...(cluster_id ? { existing_cluster_id: cluster_id } : {}),
      }],
      max_concurrent_runs: 1,
    };

    console.log(`📋 Creating job: ${resolvedPath}`);
    const createResp = await dbFetch(req.dbHost, req.dbToken, '/api/2.1/jobs/create', {
      method: 'POST',
      body: JSON.stringify(createPayload),
    });

    if (!createResp.ok) {
      const errText = await createResp.text();
      console.error(`❌ Job create failed (${createResp.status}): ${errText}`);
      return res.status(createResp.status).json({ error: `Job creation failed: ${errText}` });
    }

    const { job_id } = await createResp.json();
    console.log(`✅ Job created: ${job_id}`);

    // Step 2: Run the job
    const response = await dbFetch(req.dbHost, req.dbToken, '/api/2.1/jobs/run-now', {
      method: 'POST',
      body: JSON.stringify({ job_id }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Job run failed (${response.status}): ${errText}`);
      let errorMsg;
      try { errorMsg = JSON.parse(errText).message || errText; } catch { errorMsg = errText; }
      return res.status(response.status).json({ error: errorMsg });
    }

    const data = await response.json();
    console.log(`✅ Run submitted: ${data.run_id}`);
    res.json({ run_id: data.run_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    const [catalog, schema] = inspire_database.split('.');
    const table = `\`${catalog}\`.\`${schema}\`.\`__inspire_session\``;

    // v45 session table has individual widget columns instead of a single widget_values JSON
    const widgetCols = `business_name, inspire_database_name, operation_mode, table_election_mode, use_cases_quality, strategic_goals, business_priorities, business_domains, catalogs, schemas_str, tables_str, generate_choices, generation_path, output_language, sql_generation_per_domain, technical_exclusion_strategy, json_file_path`;
    const baseCols = `session_id, processing_status, completed_percent, create_at, last_updated, completed_on, inspire_json, results_json`;

    let sql;
    if (session_id) {
      sql = `SELECT ${baseCols}, ${widgetCols} FROM ${table} WHERE session_id = ${session_id} LIMIT 1`;
    } else {
      sql = `SELECT ${baseCols}, ${widgetCols} FROM ${table} ORDER BY create_at DESC LIMIT 1`;
    }

    const result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    const rows = sqlResultToObjects(result);

    if (rows.length === 0) {
      return res.json({ session: null, message: 'No session found. The notebook may still be initializing.' });
    }

    const session = rows[0];

    // Reconstruct widget_values from individual columns for frontend compatibility
    session.widget_values = {
      business: session.business_name || '',
      inspire_database: session.inspire_database_name || '',
      operation_mode: session.operation_mode || '',
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
      sql_generation_per_domain: session.sql_generation_per_domain || '',
      technical_exclusion_strategy: session.technical_exclusion_strategy || '',
      json_file_path: session.json_file_path || '',
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

    const [catalog, schema] = inspire_database.split('.');
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

    const [catalog, schema] = inspire_database.split('.');
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

      // 5) SQL Generation
      if (prompt === 'USE_CASE_SQL_GEN_PROMPT' && rj.sql_preview) {
        // entity_id format: USE_CASE_SQL_GEN_PROMPT:SQL_Gen:uc_42
        const ucIdMatch = (rj.entity_id || '').match(/uc_(\d+)/);
        if (ucIdMatch) {
          const id = ucIdMatch[1];
          const existing = ucMap.get(id) || {};
          ucMap.set(id, { ...existing, No: id, SQL: rj.sql_preview });
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
    const { inspire_database, warehouse_id, session_id } = req.query;
    if (!inspire_database || !warehouse_id || !session_id) {
      return res.status(400).json({ error: 'inspire_database, warehouse_id, and session_id required.' });
    }
    const [catalog, schema] = inspire_database.split('.');
    const table = `\`${catalog}\`.\`${schema}\`.\`__inspire_usecases\``;
    const sql = `SELECT * FROM ${table} WHERE session_id = ${session_id} ORDER BY No`;
    const result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    const rows = sqlResultToObjects(result);
    console.log(`   📋 usecases: ${rows.length} rows for session ${session_id}`);
    res.json({ usecases: rows, count: rows.length });
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

    const [catalog, schema] = inspire_database.split('.');
    const table = `\`${catalog}\`.\`${schema}\`.\`__inspire_session\``;
    const sql = `UPDATE ${table} SET processing_status = 'done' WHERE session_id = ${session_id} AND processing_status = 'ready'`;

    await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    console.log(`   ✅ ACK sent for session ${session_id}`);
    res.json({ success: true });
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

    const [catalog, schema] = inspire_database.split('.');
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

    const [catalog, schema] = inspire_database.split('.');
    const table = `\`${catalog}\`.\`${schema}\`.\`__inspire_session\``;
    const sql = `SELECT session_id, processing_status, completed_percent, create_at, completed_on, business_name, inspire_database_name, operation_mode, generation_path, business_domains, catalogs, results_json FROM ${table} ORDER BY create_at DESC LIMIT 20`;

    const result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    const sessions = sqlResultToObjects(result);

    for (const s of sessions) {
      // Reconstruct minimal widget_values for frontend compatibility
      s.widget_values = {
        business: s.business_name || '',
        '00_business_name': s.business_name || '',
        inspire_database: s.inspire_database_name || '',
        operation_mode: s.operation_mode || '',
        generation_path: s.generation_path || '',
      };
      s.completed_percent = parseFloat(s.completed_percent) || 0;
      // Parse results_json for session summary
      if (s.results_json && typeof s.results_json === 'string') {
        try { s.results_json = JSON.parse(s.results_json); } catch { s.results_json = null; }
      }
    }

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
    const [catalog, schema] = inspire_database.split('.');
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
//  SPA Fallback — serve index.html for non-API routes
// ═══════════════════════════════════════════════════

if (fs.existsSync(STATIC_DIR)) {
  app.get('{*path}', (req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
}

// ═══════════════════════════════════════════════════
//  Start server
// ═══════════════════════════════════════════════════

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  const hasDbc = fs.existsSync(BUNDLED_DBC_PATH);
  const servingStatic = fs.existsSync(STATIC_DIR);
  console.log(`\n🚀 Inspire AI running on http://localhost:${PORT}`);
  console.log(`   Databricks Host: ${DATABRICKS_HOST || '⚠️  Not configured — set DATABRICKS_HOST'}`);
  console.log(`   Service Token:   ${SERVICE_TOKEN ? '✅ Configured' : '—  (users must provide PAT)'}`);
  console.log(`   Bundled DBC:     ${hasDbc ? '✅ Found' : '❌ Not found'}`);
  console.log(`   Static Frontend: ${servingStatic ? '✅ Serving from ' + STATIC_DIR : '—  (dev proxy mode)'}`);
  console.log(`   Default Notebook: ${DEFAULT_NOTEBOOK_PATH || '(publish via UI)'}\n`);
});
