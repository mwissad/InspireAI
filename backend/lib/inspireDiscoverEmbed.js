const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_ROOT = path.resolve(__dirname, '..');
const EMBED_NOTEBOOK_DEST = '/Shared/inspire-ai/dbx_inspire_embed_usecases';

function embedNotebookLocalCandidates() {
  const cwd = process.cwd();
  return [
    path.join(REPO_ROOT, 'dbx_inspire_embed_usecases.py'),
    path.join(BACKEND_ROOT, 'dbx_inspire_embed_usecases.py'),
    path.join(cwd, 'dbx_inspire_embed_usecases.py'),
    path.join(cwd, 'backend', 'dbx_inspire_embed_usecases.py'),
  ];
}

function loadEmbedNotebookBase64() {
  for (const p of embedNotebookLocalCandidates()) {
    if (fs.existsSync(p)) {
      return { base64: fs.readFileSync(p).toString('base64'), source: p };
    }
  }
  return null;
}

async function publishEmbedNotebook(dbFetch, host, token) {
  try {
    await dbFetch(host, token, '/api/2.0/workspace/mkdirs', {
      method: 'POST',
      body: JSON.stringify({ path: '/Shared/inspire-ai' }),
    });
  } catch (_) {
    /* ignore */
  }
  const loaded = loadEmbedNotebookBase64();
  if (!loaded) {
    throw new Error(
      `Embed notebook missing at ${EMBED_NOTEBOOK_DEST} and no local dbx_inspire_embed_usecases.py. ` +
        'Run installer_workspace.py or npm run deploy.',
    );
  }
  const resp = await dbFetch(host, token, '/api/2.0/workspace/import', {
    method: 'POST',
    body: JSON.stringify({
      path: EMBED_NOTEBOOK_DEST,
      format: 'SOURCE',
      content: loaded.base64,
      language: 'PYTHON',
      overwrite: true,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Publish embed notebook failed: ${err.slice(0, 400)}`);
  }
  console.log(`📓 Published embed notebook from ${loaded.source} → ${EMBED_NOTEBOOK_DEST}`);
  return EMBED_NOTEBOOK_DEST;
}

/**
 * @param {{ force?: boolean }} [opts] — force=true always overwrites workspace copy (required after notebook fixes).
 */
async function ensureEmbedNotebookPublished(
  dbFetch,
  host,
  token,
  resolveWorkspaceNotebookObjectPath,
  opts = {},
) {
  const force = !!opts.force;
  if (!force) {
    if (resolveWorkspaceNotebookObjectPath) {
      const verified = await resolveWorkspaceNotebookObjectPath(host, token, EMBED_NOTEBOOK_DEST);
      if (verified) return verified;
    } else {
      try {
        const check = await dbFetch(
          host,
          token,
          `/api/2.0/workspace/get-status?path=${encodeURIComponent(EMBED_NOTEBOOK_DEST)}`,
        );
        if (check.ok) {
          const data = await check.json();
          if (data.object_type === 'NOTEBOOK') return EMBED_NOTEBOOK_DEST;
        }
      } catch (_) {
        /* publish below */
      }
    }
  }
  return publishEmbedNotebook(dbFetch, host, token);
}

/**
 * One-off serverless job: sync __inspire_usecase_search from __inspire_usecases.
 */
async function triggerDiscoverEmbedJob(dbFetch, host, token, { inspire_database, warehouse_id, embedding_model }) {
  const notebookPath = EMBED_NOTEBOOK_DEST;
  const jobName = `Inspire Discover embed — ${new Date().toISOString().slice(0, 19)}`;
  const createResp = await dbFetch(host, token, '/api/2.1/jobs/create', {
    method: 'POST',
    body: JSON.stringify({
      name: jobName,
      tasks: [
        {
          task_key: 'embed_usecases',
          notebook_task: {
            notebook_path: notebookPath,
            base_parameters: {
              inspire_database,
              warehouse_id,
              embedding_model: embedding_model || 'databricks-gte-large-en',
            },
            source: 'WORKSPACE',
          },
          environment_key: 'Default',
        },
      ],
      environments: [{ environment_key: 'Default', spec: { client: '1' } }],
      max_concurrent_runs: 1,
    }),
  });
  if (!createResp.ok) {
    const err = await createResp.text();
    throw new Error(`Embed job create failed: ${err.slice(0, 400)}`);
  }
  const { job_id: jobId } = await createResp.json();
  const runResp = await dbFetch(host, token, '/api/2.1/jobs/run-now', {
    method: 'POST',
    body: JSON.stringify({ job_id: jobId }),
  });
  if (!runResp.ok) {
    const err = await runResp.text();
    throw new Error(`Embed job run-now failed: ${err.slice(0, 400)}`);
  }
  const { run_id: runId } = await runResp.json();
  return { job_id: jobId, run_id: runId, notebook_path: notebookPath };
}

module.exports = {
  EMBED_NOTEBOOK_DEST,
  ensureEmbedNotebookPublished,
  triggerDiscoverEmbedJob,
};
