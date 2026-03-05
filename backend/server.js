const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AdmZip = require('adm-zip');

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
  path.resolve(__dirname, '..', 'databricks_inspire_v41.dbc'),
  path.resolve(__dirname, 'databricks_inspire_v41.dbc'),
  path.resolve(__dirname, '..', 'notebooks', 'databricks_inspire_v41.dbc'),
];
const BUNDLED_DBC_PATH = DBC_CANDIDATES.find(p => fs.existsSync(p)) || DBC_CANDIDATES[0];

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
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  // Fall back to service-principal token from env (Databricks App)
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
//  Basic endpoints
// ═══════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  const hasBundledDbc = fs.existsSync(BUNDLED_DBC_PATH);
  const host = resolveHost(req);
  res.json({
    status: 'ok',
    host: host ? host.replace(/https?:\/\//, '').split('.')[0] + '...' : 'not configured',
    hostConfigured: !!host,
    hasBundledDbc,
    hasServiceToken: !!SERVICE_TOKEN,
  });
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
      return res.status(400).json({ error: 'Notebook path is required. Publish the notebook first.' });
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

    const payload = {
      run_name: `Inspire AI - ${params['00_business_name'] || 'Run'} - ${new Date().toISOString().slice(0, 19)}`,
      tasks: [{
          task_key: 'inspire_notebook',
          notebook_task: {
            notebook_path: resolvedPath,
            base_parameters: params,
            source: 'WORKSPACE',
          },
          ...(cluster_id ? { existing_cluster_id: cluster_id } : {}),
      }],
    };

    console.log(`📋 Submitting run: ${resolvedPath}`);
    const response = await dbFetch(req.dbHost, req.dbToken, '/api/2.1/jobs/runs/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Run submit failed (${response.status}): ${errText}`);
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
//  V41 Session & Step Tracking (READY/DONE Protocol)
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

    let sql;
    if (session_id) {
      sql = `SELECT session_id, processing_status, completed_percent, create_at, last_updated, completed_on, widget_values, inspire_json, results_json FROM ${table} WHERE session_id = ${session_id} LIMIT 1`;
    } else {
      // Get the latest session
      sql = `SELECT session_id, processing_status, completed_percent, create_at, last_updated, completed_on, widget_values, inspire_json, results_json FROM ${table} ORDER BY create_at DESC LIMIT 1`;
    }

    const result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    const rows = sqlResultToObjects(result);

    if (rows.length === 0) {
      return res.json({ session: null, message: 'No session found. The notebook may still be initializing.' });
    }

    const session = rows[0];
    // Parse JSON fields
    try { session.widget_values = JSON.parse(session.widget_values); } catch { session.widget_values = null; }
    try { session.inspire_json = JSON.parse(session.inspire_json); } catch { session.inspire_json = null; }
    try { session.results_json = JSON.parse(session.results_json); } catch { session.results_json = null; }

    // Parse numeric fields
    session.completed_percent = parseFloat(session.completed_percent) || 0;
    session.session_id = session.session_id;

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
    const sql = `SELECT session_id, processing_status, completed_percent, create_at, completed_on, widget_values FROM ${table} ORDER BY create_at DESC LIMIT 20`;

    const result = await executeSql(req.dbHost, req.dbToken, warehouse_id, sql);
    const sessions = sqlResultToObjects(result);

    for (const s of sessions) {
      try { s.widget_values = JSON.parse(s.widget_values); } catch { s.widget_values = null; }
      s.completed_percent = parseFloat(s.completed_percent) || 0;
    }

    res.json({ sessions });
  } catch (err) {
    if (err.message.includes('TABLE_OR_VIEW_NOT_FOUND') || err.message.includes('does not exist')) {
      return res.json({ sessions: [], message: 'Session table not found.' });
    }
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

const PORT = process.env.PORT || 3001;
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
