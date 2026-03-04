const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Multer for file uploads (store in memory)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const DATABRICKS_HOST = process.env.DATABRICKS_HOST || 'https://adb-3642885996758754.14.azuredatabricks.net';
const DEFAULT_NOTEBOOK_PATH = process.env.NOTEBOOK_PATH || '';

// Path to the bundled DBC file (one level up from backend/)
const BUNDLED_DBC_PATH = path.resolve(__dirname, '..', 'databricks_inspire_v41.dbc');

// Path to the split notebooks directory
const NOTEBOOKS_DIR = path.resolve(__dirname, '..', 'notebooks');

// Helper: make authenticated Databricks API calls
async function dbFetch(token, apiPath, options = {}) {
  const url = `${DATABRICKS_HOST}${apiPath}`;
  try {
    const resp = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return resp;
  } catch (err) {
    console.error(`❌ Fetch failed for ${apiPath}:`, err.message);
    throw new Error(`Network error calling Databricks API (${apiPath}): ${err.message}`);
  }
}

// Extract token from Authorization header
function getToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

// Middleware to check for token
function requireToken(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Databricks token required. Set it in Settings.' });
  req.dbToken = token;
  next();
}

// Health check
app.get('/api/health', (req, res) => {
  const hasBundledDbc = fs.existsSync(BUNDLED_DBC_PATH);
  const hasNotebooks = fs.existsSync(NOTEBOOKS_DIR);
  res.json({ status: 'ok', host: DATABRICKS_HOST, hasBundledDbc, hasNotebooks, version: 'v41' });
});

// ─── Get current user info (to build default publish path) ───
app.get('/api/me', requireToken, async (req, res) => {
  try {
    const response = await dbFetch(req.dbToken, '/api/2.0/preview/scim/v2/Me');
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

// ─── List Unity Catalog catalogs ───
app.get('/api/catalogs', requireToken, async (req, res) => {
  try {
    const response = await dbFetch(req.dbToken, '/api/2.1/unity-catalog/catalogs');
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

// ─── List schemas in a catalog ───
app.get('/api/catalogs/:catalog/schemas', requireToken, async (req, res) => {
  try {
    const { catalog } = req.params;
    const response = await dbFetch(req.dbToken, `/api/2.1/unity-catalog/schemas?catalog_name=${encodeURIComponent(catalog)}`);
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

// ─── Publish notebook: upload bundled DBC to workspace ───
app.post('/api/publish', requireToken, async (req, res) => {
  try {
    const { destination_path } = req.body;
    if (!destination_path) {
      return res.status(400).json({ error: 'destination_path is required.' });
    }

    // Read bundled DBC file
    if (!fs.existsSync(BUNDLED_DBC_PATH)) {
      return res.status(404).json({ error: 'Bundled notebook file not found on the server.' });
    }

    const fileBuffer = fs.readFileSync(BUNDLED_DBC_PATH);
    const base64Content = fileBuffer.toString('base64');

    // DBC format doesn't support overwrite — delete first if it exists
    try {
      await dbFetch(req.dbToken, '/api/2.0/workspace/delete', {
        method: 'POST',
        body: JSON.stringify({ path: destination_path, recursive: true }),
      });
    } catch (_) {
      // Ignore errors (path might not exist)
    }

    // Import into Databricks workspace
    const response = await dbFetch(req.dbToken, '/api/2.0/workspace/import', {
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

    // DBC imports as a folder. Find the actual notebook inside it.
    let notebookPath = destination_path;
    try {
      const listResp = await dbFetch(req.dbToken, `/api/2.0/workspace/list?path=${encodeURIComponent(destination_path)}`);
      if (listResp.ok) {
        const listData = await listResp.json();
        const objects = listData.objects || [];
        // Find the first NOTEBOOK object inside the folder
        const notebook = objects.find(o => o.object_type === 'NOTEBOOK');
        if (notebook) {
          notebookPath = notebook.path;
        }
      }
    } catch (_) {
      // If listing fails, fall back to destination_path
    }

    console.log(`✅ Published DBC to: ${destination_path}`);
    console.log(`   Detected notebook path: ${notebookPath}`);

    res.json({
      success: true,
      path: notebookPath,
      folder_path: destination_path,
      message: `Notebook published to ${notebookPath}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Upload & publish a custom DBC file from browser ───
app.post('/api/publish/upload', requireToken, upload.single('file'), async (req, res) => {
  try {
    const { destination_path } = req.body;
    if (!destination_path) {
      return res.status(400).json({ error: 'destination_path is required.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const base64Content = req.file.buffer.toString('base64');

    // Detect format from extension
    const ext = path.extname(req.file.originalname).toLowerCase();
    let format = 'DBC';
    if (ext === '.py') format = 'SOURCE';
    else if (ext === '.ipynb') format = 'JUPYTER';

    // DBC format doesn't support overwrite — delete first if it exists
    if (format === 'DBC') {
      try {
        await dbFetch(req.dbToken, '/api/2.0/workspace/delete', {
          method: 'POST',
          body: JSON.stringify({ path: destination_path, recursive: true }),
        });
      } catch (_) {}
    }

    const response = await dbFetch(req.dbToken, '/api/2.0/workspace/import', {
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

    res.json({
      success: true,
      path: destination_path,
      message: `Notebook published to ${destination_path}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get pipeline info (v41: single notebook) ───
app.get('/api/pipeline/info', (req, res) => {
  const hasDbc = fs.existsSync(BUNDLED_DBC_PATH);
  res.json({
    available: hasDbc,
    version: 'v41',
    mode: 'single_notebook',
    description: 'Inspire AI v41 single-notebook pipeline with session/step tracking',
  });
});

// ─── Check if a notebook exists at a given path ───
app.get('/api/workspace/status', requireToken, async (req, res) => {
  try {
    const notebookPath = req.query.path;
    if (!notebookPath) return res.status(400).json({ error: 'path query param required.' });

    const response = await dbFetch(req.dbToken, `/api/2.0/workspace/get-status?path=${encodeURIComponent(notebookPath)}`);
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

// ─── List available clusters ───
app.get('/api/clusters', requireToken, async (req, res) => {
  try {
    const response = await dbFetch(req.dbToken, '/api/2.0/clusters/list');
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    const clusters = (data.clusters || []).map(c => ({
      cluster_id: c.cluster_id,
      cluster_name: c.cluster_name,
      state: c.state,
      spark_version: c.spark_version,
    }));
    res.json({ clusters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── List SQL warehouses ───
app.get('/api/warehouses', requireToken, async (req, res) => {
  try {
    const response = await dbFetch(req.dbToken, '/api/2.0/sql/warehouses');
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

// ─── List tables in a schema (for step tracking) ───
app.get('/api/tables/:catalog/:schema', requireToken, async (req, res) => {
  try {
    const { catalog, schema } = req.params;
    const response = await dbFetch(
      req.dbToken,
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
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));
    res.json({ tables, count: tables.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Submit a notebook job (one-time run) ───
app.post('/api/run', requireToken, async (req, res) => {
  try {
    const { params, cluster_id, notebook_path } = req.body;

    let resolvedPath = notebook_path || DEFAULT_NOTEBOOK_PATH;
    if (!resolvedPath) {
      return res.status(400).json({ error: 'Notebook path is required. Publish the notebook first or set the path.' });
    }

    // Verify the path points to a NOTEBOOK (not a DIRECTORY).
    // DBC imports create folders — we need the notebook inside.
    try {
      const statusResp = await dbFetch(req.dbToken, `/api/2.0/workspace/get-status?path=${encodeURIComponent(resolvedPath)}`);
      if (statusResp.ok) {
        const statusData = await statusResp.json();
        if (statusData.object_type === 'DIRECTORY') {
          console.log(`📂 Path "${resolvedPath}" is a DIRECTORY — searching for notebook inside...`);
          const listResp = await dbFetch(req.dbToken, `/api/2.0/workspace/list?path=${encodeURIComponent(resolvedPath)}`);
          if (listResp.ok) {
            const listData = await listResp.json();
            const objects = listData.objects || [];
            const notebook = objects.find(o => o.object_type === 'NOTEBOOK');
            if (notebook) {
              console.log(`📓 Found notebook: ${notebook.path}`);
              resolvedPath = notebook.path;
            } else {
              return res.status(400).json({ error: `Path "${resolvedPath}" is a folder but contains no notebooks. Contents: ${objects.map(o => o.path).join(', ') || 'empty'}` });
            }
          }
        }
      } else {
        console.warn(`⚠️ Could not verify path "${resolvedPath}" — proceeding anyway`);
      }
    } catch (verifyErr) {
      console.warn(`⚠️ Path verification failed: ${verifyErr.message} — proceeding anyway`);
    }

    const payload = {
      run_name: `Inspire AI - ${params['00_business_name'] || 'Run'} - ${new Date().toISOString().slice(0, 19)}`,
      tasks: [
        {
          task_key: 'inspire_notebook',
          notebook_task: {
            notebook_path: resolvedPath,
            base_parameters: params,
            source: 'WORKSPACE',
          },
          ...(cluster_id ? { existing_cluster_id: cluster_id } : {}),
        },
      ],
    };

    console.log(`📋 Submitting run with notebook_path: ${resolvedPath}`);
    console.log(`   Cluster: ${cluster_id || '(auto/job cluster)'}`);

    const response = await dbFetch(req.dbToken, '/api/2.1/jobs/runs/submit', {
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
    console.error(`❌ Run submit exception:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get run status ───
app.get('/api/run/:runId', requireToken, async (req, res) => {
  try {
    const response = await dbFetch(req.dbToken, `/api/2.1/jobs/runs/get?run_id=${req.params.runId}`);
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();

    // Flatten the state for easier frontend consumption
    const state = data.state || {};
    const result = {
      run_id: data.run_id,
      // Flattened state fields
      life_cycle_state: state.life_cycle_state || 'UNKNOWN',
      result_state: state.result_state || null,
      state_message: state.state_message || '',
      // Timing
      start_time: data.start_time,
      end_time: data.end_time,
      setup_duration: data.setup_duration,
      execution_duration: data.execution_duration,
      cleanup_duration: data.cleanup_duration,
      // Links
      run_page_url: data.run_page_url,
      run_name: data.run_name,
      // Tasks (enriched for multi-task pipeline monitoring)
      tasks: data.tasks?.map(t => ({
        task_key: t.task_key,
        description: t.description || '',
        life_cycle_state: t.state?.life_cycle_state,
        result_state: t.state?.result_state,
        state_message: t.state?.state_message || '',
        run_id: t.run_id,
        start_time: t.start_time,
        end_time: t.end_time,
        setup_duration: t.setup_duration,
        execution_duration: t.execution_duration,
        depends_on: t.depends_on?.map(d => d.task_key) || [],
      })),
    };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get run output ───
app.get('/api/run/:runId/output', requireToken, async (req, res) => {
  try {
    const response = await dbFetch(req.dbToken, `/api/2.1/jobs/runs/get-output?run_id=${req.params.runId}`);
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

// ─── Execute SQL query via Databricks SQL Statement Execution API ───
async function executeSqlStatement(token, warehouseId, sqlStatement) {
  console.log(`   🔶 SQL: ${sqlStatement.substring(0, 120)}...`);

  // Submit the statement with explicit INLINE disposition
  // wait_timeout must be 0s (disabled) or between 5s and 50s per Databricks API
  const submitResp = await dbFetch(token, '/api/2.0/sql/statements', {
    method: 'POST',
    body: JSON.stringify({
      warehouse_id: warehouseId,
      statement: sqlStatement,
      wait_timeout: '50s',
      on_wait_timeout: 'CONTINUE',
      disposition: 'INLINE',
      format: 'JSON_ARRAY',
    }),
  });
  if (!submitResp.ok) {
    const errText = await submitResp.text();
    console.error(`   ❌ SQL submit failed (${submitResp.status}): ${errText.substring(0, 200)}`);
    throw new Error(`SQL statement submission failed (${submitResp.status}): ${errText}`);
  }
  let result = await submitResp.json();
  console.log(`   📄 SQL state: ${result.status?.state}, statement_id: ${result.statement_id}`);

  // Poll if still running
  let pollCount = 0;
  while (result.status?.state === 'PENDING' || result.status?.state === 'RUNNING') {
    pollCount++;
    await new Promise(r => setTimeout(r, 2000));
    console.log(`   ⏳ Polling (${pollCount})...`);
    const pollResp = await dbFetch(token, `/api/2.0/sql/statements/${result.statement_id}`);
    if (!pollResp.ok) {
      const errText = await pollResp.text();
      throw new Error(`SQL polling failed: ${errText}`);
    }
    result = await pollResp.json();
    console.log(`   📄 Poll state: ${result.status?.state}`);
  }

  if (result.status?.state === 'FAILED') {
    const errMsg = result.status?.error?.message || 'SQL statement execution failed';
    console.error(`   ❌ SQL failed: ${errMsg}`);
    throw new Error(errMsg);
  }

  // Log result structure for debugging
  const rowCount = result.result?.row_count ?? result.manifest?.total_row_count ?? 'unknown';
  const hasData = !!(result.result?.data_array);
  const chunkCount = result.manifest?.total_chunk_count ?? 'unknown';
  console.log(`   ✅ SQL done: rows=${rowCount}, has_data_array=${hasData}, chunks=${chunkCount}`);

  // Handle chunked results — fetch all chunks if needed
  if (result.manifest?.total_chunk_count > 1 && result.manifest?.chunks) {
    console.log(`   📦 Multi-chunk result, fetching ${result.manifest.total_chunk_count} chunks...`);
    let allData = result.result?.data_array || [];
    for (const chunk of result.manifest.chunks) {
      if (chunk.chunk_index === 0) continue; // Already have first chunk
      const chunkResp = await dbFetch(token,
        `/api/2.0/sql/statements/${result.statement_id}/result/chunks/${chunk.chunk_index}`
      );
      if (chunkResp.ok) {
        const chunkData = await chunkResp.json();
        if (chunkData.data_array) {
          allData = allData.concat(chunkData.data_array);
        }
      }
    }
    result.result = result.result || {};
    result.result.data_array = allData;
    console.log(`   📦 Total rows after chunk merge: ${allData.length}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// V41 INTEGRATION: Session & Step Tracking (Inspire Integration Guide)
// ═══════════════════════════════════════════════════════════════

// ─── List all Inspire sessions ───
app.get('/api/inspire/sessions', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id } = req.query;
    if (!inspire_database || !warehouse_id) {
      return res.status(400).json({ error: 'inspire_database and warehouse_id query params required.' });
    }
    const [catalog, schema] = inspire_database.split('.');
    const tableName = `\`${catalog}\`.\`${schema}\`.\`__inspire_session\``;

    const result = await executeSqlStatement(
      req.dbToken, warehouse_id,
      `SELECT session_id, processing_status, completed_percent, create_at, last_updated, completed_on,
              widget_values::STRING AS widget_values_str
       FROM ${tableName}
       ORDER BY create_at DESC
       LIMIT 50`
    );

    const columns = (result.manifest?.schema?.columns || []).map(c => c.name);
    const sessions = (result.result?.data_array || []).map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      // Parse widget_values
      try { obj.widget_values = JSON.parse(obj.widget_values_str); } catch { obj.widget_values = null; }
      delete obj.widget_values_str;
      return obj;
    });

    console.log(`📋 Found ${sessions.length} Inspire sessions`);
    res.json({ sessions, count: sessions.length });
  } catch (err) {
    console.error(`❌ Sessions error:`, err.message);
    res.json({ sessions: [], count: 0, error: err.message });
  }
});

// ─── Poll a specific session (for progress monitoring) ───
app.get('/api/inspire/session', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id, session_id } = req.query;
    if (!inspire_database || !warehouse_id || !session_id) {
      return res.status(400).json({ error: 'inspire_database, warehouse_id, and session_id are required.' });
    }
    const [catalog, schema] = inspire_database.split('.');
    const tableName = `\`${catalog}\`.\`${schema}\`.\`__inspire_session\``;

    const result = await executeSqlStatement(
      req.dbToken, warehouse_id,
      `SELECT session_id, processing_status, completed_percent, create_at, last_updated, completed_on,
              widget_values::STRING AS widget_values_str,
              inspire_json::STRING AS inspire_json_str,
              results_json::STRING AS results_json_str
       FROM ${tableName}
       WHERE session_id = ${session_id}
       LIMIT 1`
    );

    if (!result.result?.data_array?.length) {
      return res.json({ session: null });
    }

    const columns = (result.manifest?.schema?.columns || []).map(c => c.name);
    const row = result.result.data_array[0];
    const session = {};
    columns.forEach((col, i) => { session[col] = row[i]; });

    // Parse JSON fields
    try { session.widget_values = JSON.parse(session.widget_values_str); } catch { session.widget_values = null; }
    try { session.inspire_json = JSON.parse(session.inspire_json_str); } catch { session.inspire_json = null; }
    try { session.results_json = JSON.parse(session.results_json_str); } catch { session.results_json = null; }
    delete session.widget_values_str;
    delete session.inspire_json_str;
    delete session.results_json_str;

    res.json({ session });
  } catch (err) {
    console.error(`❌ Session poll error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get steps (delta: new steps since last poll) ───
app.get('/api/inspire/steps', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id, session_id, since } = req.query;
    if (!inspire_database || !warehouse_id || !session_id) {
      return res.status(400).json({ error: 'inspire_database, warehouse_id, and session_id are required.' });
    }
    const [catalog, schema] = inspire_database.split('.');
    const tableName = `\`${catalog}\`.\`${schema}\`.\`__inspire_step\``;

    let sql = `SELECT step_id, session_id, last_updated, stage_name, step_name, sub_step_name,
                      progress_increment, message, status,
                      result_json::STRING AS result_json_str
               FROM ${tableName}
               WHERE session_id = ${session_id}`;

    if (since) {
      sql += ` AND last_updated > '${since}'`;
    }
    sql += ` ORDER BY last_updated, step_id`;

    const result = await executeSqlStatement(req.dbToken, warehouse_id, sql);

    const columns = (result.manifest?.schema?.columns || []).map(c => c.name);
    const steps = (result.result?.data_array || []).map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      try { obj.result_json = JSON.parse(obj.result_json_str); } catch { obj.result_json = null; }
      delete obj.result_json_str;
      return obj;
    });

    res.json({ steps, count: steps.length });
  } catch (err) {
    console.error(`❌ Steps error:`, err.message);
    res.json({ steps: [], count: 0, error: err.message });
  }
});

// ─── ACK: Set processing_status = 'done' (READY/DONE handshake) ───
app.post('/api/inspire/ack', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id, session_id } = req.body;
    if (!inspire_database || !warehouse_id || !session_id) {
      return res.status(400).json({ error: 'inspire_database, warehouse_id, and session_id are required.' });
    }
    const [catalog, schema] = inspire_database.split('.');
    const tableName = `\`${catalog}\`.\`${schema}\`.\`__inspire_session\``;

    await executeSqlStatement(
      req.dbToken, warehouse_id,
      `UPDATE ${tableName} SET processing_status = 'done' WHERE session_id = ${session_id} AND processing_status = 'ready'`
    );

    console.log(`✅ ACK sent for session ${session_id}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`❌ ACK error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get final results (results_json from completed session) ───
app.get('/api/inspire/results', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id, session_id } = req.query;
    if (!inspire_database || !warehouse_id || !session_id) {
      return res.status(400).json({ error: 'inspire_database, warehouse_id, and session_id are required.' });
    }
    const [catalog, schema] = inspire_database.split('.');
    const tableName = `\`${catalog}\`.\`${schema}\`.\`__inspire_session\``;

    const result = await executeSqlStatement(
      req.dbToken, warehouse_id,
      `SELECT results_json::STRING AS results_json_str, completed_percent, completed_on
       FROM ${tableName}
       WHERE session_id = ${session_id} AND completed_on IS NOT NULL
       LIMIT 1`
    );

    if (!result.result?.data_array?.length) {
      return res.json({ results: null, completed: false });
    }

    const columns = (result.manifest?.schema?.columns || []).map(c => c.name);
    const row = result.result.data_array[0];
    const data = {};
    columns.forEach((col, i) => { data[col] = row[i]; });

    let results = null;
    try { results = JSON.parse(data.results_json_str); } catch { results = null; }

    console.log(`📊 Results for session ${session_id}: ${results ? 'found' : 'null'}`);
    res.json({ results, completed: true, completed_on: data.completed_on });
  } catch (err) {
    console.error(`❌ Results error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── List pipeline tables in inspire_database ───
app.get('/api/results/tables', requireToken, async (req, res) => {
  try {
    const inspireDb = req.query.inspire_database;
    if (!inspireDb || !inspireDb.includes('.')) {
      return res.status(400).json({ error: 'inspire_database query param required (format: catalog.schema).' });
    }
    const [catalog, schema] = inspireDb.split('.');
    const response = await dbFetch(
      req.dbToken,
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
    const inspireTables = tables.filter(t =>
      t.name.startsWith('__inspire_') || t.name.startsWith('_pipeline_') || t.name.startsWith('_inspire_')
    );
    res.json({ tables: inspireTables, all_tables: tables, count: inspireTables.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Cancel a run ───
app.post('/api/run/:runId/cancel', requireToken, async (req, res) => {
  try {
    const response = await dbFetch(req.dbToken, '/api/2.1/jobs/runs/cancel', {
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  const hasDbc = fs.existsSync(BUNDLED_DBC_PATH);
  console.log(`\n🚀 Inspire AI v41 Backend running on http://localhost:${PORT}`);
  console.log(`   Databricks Host: ${DATABRICKS_HOST}`);
  console.log(`   Bundled DBC:     ${hasDbc ? '✅ v41 Found' : '❌ Not found'}`);
  console.log(`   Mode:            Single notebook with session/step tracking`);
  console.log(`   Default Notebook: ${DEFAULT_NOTEBOOK_PATH || '(publish via UI)'}\n`);
});
