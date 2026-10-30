const fs = require('fs');
const path = require('path');
const { buildDemoSchemaName } = require('./demoDataService');
const {
  buildDemoInspireDiscoveryParams,
  inspireJobTags,
  inspireTaskCompute,
} = require('./inspireJobParams');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_ROOT = path.resolve(__dirname, '..');
const GENERATE_NOTEBOOK_DEST = '/Shared/inspire-ai/dbx_generate_demo_data';

/** Paths where dbx_generate_demo_data.py may exist (App cwd varies). */
function demoNotebookLocalCandidates() {
  const cwd = process.cwd();
  return [
    path.join(REPO_ROOT, 'dbx_generate_demo_data.py'),
    path.join(BACKEND_ROOT, 'dbx_generate_demo_data.py'),
    path.join(cwd, 'dbx_generate_demo_data.py'),
    path.join(cwd, 'backend', 'dbx_generate_demo_data.py'),
  ];
}

function readDemoNotebookBase64FromDisk() {
  for (const p of demoNotebookLocalCandidates()) {
    if (fs.existsSync(p)) {
      return { base64: fs.readFileSync(p).toString('base64'), source: p };
    }
  }
  return null;
}

function readDemoNotebookBase64FromBundle() {
  try {
    const b64 = require('../demo_notebook_bundle');
    if (b64 && typeof b64 === 'string') return { base64: b64, source: 'demo_notebook_bundle.js' };
  } catch (_) {
    /* optional until package/build */
  }
  return null;
}

function loadDemoNotebookBase64() {
  return readDemoNotebookBase64FromDisk() || readDemoNotebookBase64FromBundle();
}

async function publishPipelineNotebookContent(dbFetch, host, token, base64Content, destPath) {
  try {
    await dbFetch(host, token, '/api/2.0/workspace/mkdirs', {
      method: 'POST',
      body: JSON.stringify({ path: path.posix.dirname(destPath) }),
    });
  } catch (_) {
    /* ignore */
  }
  const resp = await dbFetch(host, token, '/api/2.0/workspace/import', {
    method: 'POST',
    body: JSON.stringify({
      path: destPath,
      format: 'SOURCE',
      content: base64Content,
      language: 'PYTHON',
      overwrite: true,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Publish ${destPath} failed: ${err}`);
  }
  return destPath;
}

async function publishPipelineNotebook(dbFetch, host, token, localPath, destPath) {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Pipeline notebook not found: ${localPath}`);
  }
  const content = fs.readFileSync(localPath).toString('base64');
  return publishPipelineNotebookContent(dbFetch, host, token, content, destPath);
}

/**
 * Resolve demo generator notebook for Jobs API.
 * Databricks Apps often omit repo-root .py files; prefer workspace copy from installer,
 * then publish from disk or embedded bundle.
 */
async function ensureDemoPipelineNotebookPublished(
  dbFetch,
  host,
  token,
  resolveWorkspaceNotebookObjectPath,
) {
  if (resolveWorkspaceNotebookObjectPath) {
    const verified = await resolveWorkspaceNotebookObjectPath(host, token, GENERATE_NOTEBOOK_DEST);
    if (verified) {
      console.log(`📓 Demo pipeline notebook already in workspace: ${verified}`);
      return verified;
    }
  } else {
    try {
      const check = await dbFetch(
        host,
        token,
        `/api/2.0/workspace/get-status?path=${encodeURIComponent(GENERATE_NOTEBOOK_DEST)}`,
      );
      if (check.ok) {
        const data = await check.json();
        if (data.object_type === 'NOTEBOOK') {
          console.log(`📓 Demo pipeline notebook already in workspace: ${GENERATE_NOTEBOOK_DEST}`);
          return GENERATE_NOTEBOOK_DEST;
        }
      }
    } catch (_) {
      /* publish below */
    }
  }

  const loaded = loadDemoNotebookBase64();
  if (!loaded) {
    throw new Error(
      `Demo pipeline notebook not found at ${GENERATE_NOTEBOOK_DEST} and no local/bundled copy. ` +
        'Run installer_workspace.py (publishes to /Shared/inspire-ai/) or redeploy with npm run deploy.',
    );
  }

  console.log(`📦 Publishing demo pipeline notebook from ${loaded.source} → ${GENERATE_NOTEBOOK_DEST}`);
  await publishPipelineNotebookContent(dbFetch, host, token, loaded.base64, GENERATE_NOTEBOOK_DEST);
  return GENERATE_NOTEBOOK_DEST;
}

async function resolveInspireNotebookPath(host, token, { ensureInspireNotebookPublished, resolveWorkspaceNotebookObjectPath }) {
  let notebookPath = '/Shared/inspire-ai/dbx_inspire_ai_agent';
  if (ensureInspireNotebookPublished) {
    const pub = await ensureInspireNotebookPublished(host, token);
    if (pub?.path) notebookPath = pub.path;
  }
  if (resolveWorkspaceNotebookObjectPath) {
    const verified = await resolveWorkspaceNotebookObjectPath(host, token, notebookPath);
    if (verified) return verified;
  }
  throw new Error(
    `Inspire agent notebook not found at ${notebookPath}. Open Workspace setup or run a normal Inspire job once to auto-publish.`,
  );
}

async function resolvePipelineClusterId(dbFetch, host, token, clusterId) {
  const explicit = String(clusterId || '').trim();
  if (explicit) return explicit;
  const fromEnv = String(
    process.env.INSPIRE_CLUSTER_ID || process.env.INSPIRE_DEPLOY_CLUSTER_ID || '',
  ).trim();
  if (fromEnv) return fromEnv;
  try {
    const resp = await dbFetch(host, token, '/api/2.0/clusters/list');
    if (resp.ok) {
      const { clusters = [] } = await resp.json();
      const running = clusters.find((c) => c.state === 'RUNNING');
      if (running?.cluster_id) {
        console.log(`📋 Demo pipeline: using running cluster ${running.cluster_id}`);
        return running.cluster_id;
      }
    }
  } catch (e) {
    console.warn('Could not list clusters for demo pipeline:', e.message || e);
  }
  return null;
}

/**
 * Two-task job: generate demo UC tables → run Inspire agent directly (no nested notebook.run).
 */
async function triggerDemoDataPipeline(
  dbFetch,
  databricksJobRunUrl,
  host,
  token,
  {
    description,
    businessName,
    inspireDatabase,
    sessionId,
    cluster_id,
    warehouse_id,
    app_sp_application_id,
    ensureInspireNotebookPublished,
    resolveWorkspaceNotebookObjectPath,
  },
) {
  const desc = String(description || '').trim();
  const business = String(businessName || '').trim();
  const inspireDb = String(inspireDatabase || '').trim();
  const sid =
    String(sessionId || '').trim() || `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

  if (!desc) throw new Error('description is required');
  if (!business) throw new Error('business_name is required');
  if (!inspireDb || !inspireDb.includes('.')) {
    throw new Error('inspire_database must be catalog._inspire');
  }

  const [catalog] = inspireDb.split('.');
  const demoSchema = buildDemoSchemaName(business, sid);

  const generateNotebookPath = await ensureDemoPipelineNotebookPublished(
    dbFetch,
    host,
    token,
    resolveWorkspaceNotebookObjectPath,
  );

  const inspireNotebookPath = await resolveInspireNotebookPath(host, token, {
    ensureInspireNotebookPublished,
    resolveWorkspaceNotebookObjectPath,
  });

  const resolvedClusterId = await resolvePipelineClusterId(dbFetch, host, token, cluster_id);
  const clusterSpec = inspireTaskCompute(resolvedClusterId);

  const inspireParams = buildDemoInspireDiscoveryParams({
    inspireDatabase: inspireDb,
    sessionId: sid,
  });

  const createPayload = {
    name: `Inspire AI Demo Pipeline - ${business} - ${new Date().toISOString().slice(0, 19)}`,
    tags: inspireJobTags({
      runType: 'demo_pipeline',
      params: inspireParams,
      businessName: business,
      notebookFilename: String(inspireNotebookPath || '').split('/').pop(),
    }),
    tasks: [
      {
        task_key: 'generate_demo_data',
        notebook_task: {
          notebook_path: generateNotebookPath,
          source: 'WORKSPACE',
          base_parameters: {
            user_description: desc,
            inspire_catalog: catalog,
            inspire_database: inspireDb,
            session_id: sid,
            business_name: business,
            demo_schema: demoSchema,
            warehouse_id: String(warehouse_id || '').trim(),
            app_sp_application_id: String(app_sp_application_id || '').trim(),
          },
        },
        ...clusterSpec,
      },
      {
        task_key: 'inspire_discovery',
        depends_on: [{ task_key: 'generate_demo_data' }],
        notebook_task: {
          notebook_path: inspireNotebookPath,
          source: 'WORKSPACE',
          base_parameters: inspireParams,
        },
        ...clusterSpec,
      },
    ],
    ...(!resolvedClusterId
      ? {
          environments: [{ environment_key: 'Default', spec: { client: '1' } }],
        }
      : {}),
    max_concurrent_runs: 1,
  };

  console.log(
    `📋 Demo pipeline: ${generateNotebookPath} → ${inspireNotebookPath} (cluster=${resolvedClusterId || 'serverless'}, session=${sid})`,
  );

  const createResp = await dbFetch(host, token, '/api/2.1/jobs/create', {
    method: 'POST',
    body: JSON.stringify(createPayload),
  });
  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error(`Demo pipeline job create failed: ${errText}`);
  }
  const { job_id: jobId } = await createResp.json();

  const runResp = await dbFetch(host, token, '/api/2.1/jobs/run-now', {
    method: 'POST',
    body: JSON.stringify({ job_id: jobId }),
  });
  if (!runResp.ok) {
    const errText = await runResp.text();
    throw new Error(`Demo pipeline run-now failed: ${errText}`);
  }
  const { run_id: runId } = await runResp.json();

  return {
    session_id: sid,
    job_id: jobId,
    run_id: runId,
    job_run_url: databricksJobRunUrl(host, jobId, runId),
    pipeline: {
      step1_notebook: generateNotebookPath,
      step2_notebook: inspireNotebookPath,
      inspire_agent_notebook: inspireNotebookPath,
      inspire_database: inspireDb,
      demo_schema_planned: `${catalog}.${demoSchema}`,
      catalog,
      cluster_id: resolvedClusterId || null,
    },
  };
}

module.exports = {
  triggerDemoDataPipeline,
  publishPipelineNotebook,
  ensureDemoPipelineNotebookPublished,
  loadDemoNotebookBase64,
};
