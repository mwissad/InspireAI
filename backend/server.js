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
const BUNDLED_DBC_PATH = path.resolve(__dirname, '..', 'databricks_inspire_v38.dbc');

// Path to the split notebooks directory
const NOTEBOOKS_DIR = path.resolve(__dirname, '..', 'notebooks');

// Workflow definition
const WORKFLOW_DEF_PATH = path.resolve(NOTEBOOKS_DIR, 'workflow_definition.json');

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
  const hasPipeline = fs.existsSync(NOTEBOOKS_DIR) && fs.existsSync(WORKFLOW_DEF_PATH);
  res.json({ status: 'ok', host: DATABRICKS_HOST, hasBundledDbc, hasPipeline });
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

// ─── Publish split notebooks (multi-task pipeline) ───
app.post('/api/publish/pipeline', requireToken, async (req, res) => {
  try {
    const { destination_path } = req.body;
    if (!destination_path) {
      return res.status(400).json({ error: 'destination_path is required.' });
    }

    // Check that the notebooks directory exists
    if (!fs.existsSync(NOTEBOOKS_DIR)) {
      return res.status(404).json({ error: 'Split notebooks directory not found. Run split_notebook.py first.' });
    }

    // Get all .py notebook files
    const notebookFiles = fs.readdirSync(NOTEBOOKS_DIR)
      .filter(f => f.endsWith('.py'))
      .sort();

    if (notebookFiles.length === 0) {
      return res.status(404).json({ error: 'No notebook files found in notebooks directory.' });
    }

    console.log(`📦 Publishing ${notebookFiles.length} notebooks to ${destination_path}/`);

    // Ensure the destination directory exists
    try {
      await dbFetch(req.dbToken, '/api/2.0/workspace/mkdirs', {
        method: 'POST',
        body: JSON.stringify({ path: destination_path }),
      });
    } catch (_) {}

    const published = [];
    const errors = [];

    for (const filename of notebookFiles) {
      const notebookName = filename.replace('.py', '');
      const notebookPath = `${destination_path}/${notebookName}`;
      const filePath = path.join(NOTEBOOKS_DIR, filename);

      try {
        // Read the notebook source file
        let content = fs.readFileSync(filePath, 'utf-8');

        // Remove the "# Databricks notebook source" header — the API adds it
        content = content.replace(/^# Databricks notebook source\n/, '');

        const base64Content = Buffer.from(content, 'utf-8').toString('base64');

        // Upload as SOURCE format (Python)
        const response = await dbFetch(req.dbToken, '/api/2.0/workspace/import', {
          method: 'POST',
          body: JSON.stringify({
            path: notebookPath,
            format: 'SOURCE',
            language: 'PYTHON',
            content: base64Content,
            overwrite: true,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`   ❌ ${notebookName}: ${errText}`);
          errors.push({ notebook: notebookName, error: errText });
        } else {
          console.log(`   ✅ ${notebookName}`);
          published.push(notebookPath);
        }
      } catch (err) {
        console.error(`   ❌ ${notebookName}: ${err.message}`);
        errors.push({ notebook: notebookName, error: err.message });
      }
    }

    console.log(`📦 Published ${published.length}/${notebookFiles.length} notebooks`);

    res.json({
      success: errors.length === 0,
      published,
      errors,
      base_path: destination_path,
      total: notebookFiles.length,
      message: `Published ${published.length}/${notebookFiles.length} notebooks to ${destination_path}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Submit multi-task Lakeflow workflow ───
app.post('/api/run/pipeline', requireToken, async (req, res) => {
  try {
    const { params, cluster_id, notebook_base_path, inspire_database } = req.body;

    if (!notebook_base_path) {
      return res.status(400).json({ error: 'notebook_base_path is required. Publish the pipeline notebooks first.' });
    }

    // Load the workflow definition
    let workflowDef;
    try {
      workflowDef = JSON.parse(fs.readFileSync(WORKFLOW_DEF_PATH, 'utf-8'));
    } catch (err) {
      return res.status(500).json({ error: `Could not load workflow definition: ${err.message}` });
    }

    const businessName = params?.['00_business_name'] || 'Run';
    const runName = `Inspire AI Pipeline - ${businessName} - ${new Date().toISOString().slice(0, 19)}`;

    // Build the tasks array with resolved paths and parameters
    const tasks = workflowDef.tasks.map(task => {
      // Replace placeholders in notebook_path
      const notebookPath = task.notebook_task.notebook_path
        .replace('{{BASE_PATH}}', notebook_base_path);

      // Build base_parameters: merge task-specific params with the inspire_database
      const baseParams = { ...(task.notebook_task.base_parameters || {}) };
      if (baseParams.inspire_database === '{{INSPIRE_DATABASE}}') {
        baseParams.inspire_database = inspire_database || '';
      }

      // The first task (01_init_validate) gets all widget params
      if (task.task_key === '01_init_validate') {
        Object.assign(baseParams, params);
      }

      const taskDef = {
        task_key: task.task_key,
        notebook_task: {
          notebook_path: notebookPath,
          base_parameters: baseParams,
          source: 'WORKSPACE',
        },
      };

      // Add dependencies
      if (task.depends_on) {
        taskDef.depends_on = task.depends_on;
      }

      // Add cluster
      if (cluster_id) {
        taskDef.existing_cluster_id = cluster_id;
      }

      return taskDef;
    });

    const payload = {
      run_name: runName,
      tasks,
    };

    console.log(`📋 Submitting multi-task pipeline with ${tasks.length} tasks`);
    console.log(`   Base path: ${notebook_base_path}`);
    console.log(`   Cluster: ${cluster_id || '(auto/job cluster)'}`);
    tasks.forEach(t => {
      console.log(`   📌 ${t.task_key}: ${t.notebook_task.notebook_path}`);
    });

    const response = await dbFetch(req.dbToken, '/api/2.1/jobs/runs/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Pipeline submit failed (${response.status}): ${errText}`);
      let errorMsg;
      try { errorMsg = JSON.parse(errText).message || errText; } catch { errorMsg = errText; }
      return res.status(response.status).json({ error: errorMsg });
    }

    const data = await response.json();
    console.log(`✅ Pipeline submitted: run_id=${data.run_id}`);
    res.json({
      run_id: data.run_id,
      mode: 'pipeline',
      task_count: tasks.length,
      task_keys: tasks.map(t => t.task_key),
    });
  } catch (err) {
    console.error(`❌ Pipeline submit exception:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get pipeline status (info about split notebooks availability) ───
app.get('/api/pipeline/info', (req, res) => {
  const hasNotebooks = fs.existsSync(NOTEBOOKS_DIR);
  const hasWorkflow = fs.existsSync(WORKFLOW_DEF_PATH);
  let notebooks = [];
  let workflowDef = null;

  if (hasNotebooks) {
    notebooks = fs.readdirSync(NOTEBOOKS_DIR)
      .filter(f => f.endsWith('.py'))
      .sort()
      .map(f => f.replace('.py', ''));
  }

  if (hasWorkflow) {
    try {
      workflowDef = JSON.parse(fs.readFileSync(WORKFLOW_DEF_PATH, 'utf-8'));
    } catch (_) {}
  }

  res.json({
    available: hasNotebooks && hasWorkflow && notebooks.length > 0,
    notebooks,
    task_count: workflowDef?.tasks?.length || 0,
    tasks: (workflowDef?.tasks || []).map(t => ({
      task_key: t.task_key,
      description: t.description,
      depends_on: t.depends_on?.map(d => d.task_key) || [],
    })),
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
    // Filter to pipeline tables only
    const pipelineTables = tables.filter(t =>
      t.name.startsWith('_pipeline_') || t.name === '_inspire_tracking'
    );
    res.json({ tables: pipelineTables, all_tables: tables, count: pipelineTables.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Fetch use cases from the Delta table ───
app.get('/api/results/use-cases', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id } = req.query;
    if (!inspire_database || !warehouse_id) {
      return res.status(400).json({ error: 'inspire_database and warehouse_id query params required.' });
    }

    // First, discover what tables exist
    const [catalog, schema] = inspire_database.split('.');
    let availableTables = [];
    try {
      const listResp = await dbFetch(
        req.dbToken,
        `/api/2.1/unity-catalog/tables?catalog_name=${encodeURIComponent(catalog)}&schema_name=${encodeURIComponent(schema)}&max_results=500`
      );
      if (listResp.ok) {
        const listData = await listResp.json();
        availableTables = (listData.tables || []).map(t => t.name);
        console.log(`📋 Tables in ${inspire_database}: ${availableTables.join(', ')}`);
      }
    } catch (e) {
      console.log(`   ⚠️ Could not list tables: ${e.message}`);
    }

    // Try known use case table suffixes, plus any table containing "use_case" in its name
    const knownSuffixes = ['_pipeline_use_cases_final', '_pipeline_use_cases_scored', '_pipeline_use_cases_raw'];
    const dynamicTables = availableTables.filter(t =>
      t.toLowerCase().includes('use_case') && !knownSuffixes.includes(t)
    );
    const tableSuffixes = [...knownSuffixes, ...dynamicTables];

    let useCases = [];
    let sourceTable = '';
    const triedTables = [];

    for (const suffix of tableSuffixes) {
      // Only try tables that actually exist (if we have the list)
      if (availableTables.length > 0 && !availableTables.includes(suffix)) {
        continue;
      }
      const tableName = `\`${catalog}\`.\`${schema}\`.\`${suffix}\``;
      triedTables.push(suffix);
      try {
        console.log(`   🔍 Trying: ${tableName}`);
        const result = await executeSqlStatement(
          req.dbToken,
          warehouse_id,
          `SELECT * FROM ${tableName} ORDER BY idx LIMIT 1000`
        );

        console.log(`   📄 Result status: ${result.status?.state}, rows: ${result.result?.row_count || 0}`);

        if (result.result?.data_array && result.result.data_array.length > 0) {
          // Find the column index for use_case_json
          const columns = result.manifest?.schema?.columns || [];
          const colNames = columns.map(c => c.name);
          const jsonColIdx = colNames.indexOf('use_case_json');

          console.log(`   📊 Columns: ${colNames.join(', ')}, use_case_json at index: ${jsonColIdx}`);

          if (jsonColIdx >= 0) {
            useCases = result.result.data_array.map(row => {
              try { return JSON.parse(row[jsonColIdx]); } catch { return null; }
            }).filter(Boolean);
          } else {
            // If there's no use_case_json column, try to build from available columns
            console.log(`   ⚠️ No use_case_json column found. Columns: ${colNames.join(', ')}`);
            // Try returning all columns as a use case object
            useCases = result.result.data_array.map(row => {
              const obj = {};
              colNames.forEach((col, i) => { obj[col] = row[i]; });
              return obj;
            });
          }
          sourceTable = suffix;
          break;
        }
      } catch (e) {
        console.log(`   ℹ️ Table ${suffix}: ${e.message}`);
        continue;
      }
    }

    console.log(`📊 Fetched ${useCases.length} use cases from ${sourceTable || 'none'} (tried: ${triedTables.join(', ')})`);
    res.json({
      use_cases: useCases,
      source_table: sourceTable,
      count: useCases.length,
      available_tables: availableTables,
      tried_tables: triedTables,
    });
  } catch (err) {
    console.error(`❌ Use cases fetch error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Fetch pipeline state from Delta ───
app.get('/api/results/pipeline-state', requireToken, async (req, res) => {
  try {
    const { inspire_database, warehouse_id } = req.query;
    if (!inspire_database || !warehouse_id) {
      return res.status(400).json({ error: 'inspire_database and warehouse_id query params required.' });
    }

    const tableName = `${inspire_database}._pipeline_state`;
    const result = await executeSqlStatement(
      req.dbToken,
      warehouse_id,
      `SELECT phase_name, state_json, updated_at FROM ${tableName} ORDER BY updated_at`
    );

    const states = {};
    if (result.result?.data_array) {
      for (const row of result.result.data_array) {
        try {
          states[row[0]] = { data: JSON.parse(row[1]), updated_at: row[2] };
        } catch { /* skip */ }
      }
    }

    res.json({ states, phases: Object.keys(states) });
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
  const hasNotebooks = fs.existsSync(NOTEBOOKS_DIR);
  const notebookCount = hasNotebooks ? fs.readdirSync(NOTEBOOKS_DIR).filter(f => f.endsWith('.py')).length : 0;
  console.log(`\n🚀 Inspire Backend running on http://localhost:${PORT}`);
  console.log(`   Databricks Host: ${DATABRICKS_HOST}`);
  console.log(`   Bundled DBC:     ${hasDbc ? '✅ Found' : '❌ Not found'}`);
  console.log(`   Pipeline Mode:   ${hasNotebooks ? `✅ ${notebookCount} notebooks` : '❌ Not available'}`);
  console.log(`   Default Notebook: ${DEFAULT_NOTEBOOK_PATH || '(publish via UI)'}\n`);
});
