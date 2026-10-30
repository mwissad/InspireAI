const { ACTIVE_RUN_STATES } = require('./genieJobGuard');

const LIST_PAGES = 5;

function genieNotebookJobName(sessionId) {
  const sid = String(sessionId ?? '').trim();
  if (!/^\d+$/.test(sid)) throw new Error('session_id must be a numeric Inspire session id.');
  return `Inspire AI - Genie Code - ${sid}`;
}

function apiError(what, got) {
  const err = new Error(`${what} failed (${got.status}): ${got.data?.message || got.data?.error_code || got.data?.raw || 'no message'}`);
  err.statusCode = 502;
  return err;
}

async function newestJobNamed(fetchJson, name) {
  let newest = null;
  let pageToken = '';
  for (let page = 0; page < LIST_PAGES; page += 1) {
    const got = await fetchJson(`/api/2.1/jobs/list?name=${encodeURIComponent(name)}&limit=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''}`);
    if (!got.ok) throw apiError('Listing the Genie Code notebook jobs', got);
    for (const job of got.data.jobs || []) {
      if (job?.settings?.name !== name) continue;
      if (!newest || Number(job.created_time) > Number(newest.created_time)) newest = job;
    }
    pageToken = String(got.data.next_page_token || '');
    if (!pageToken) break;
  }
  return newest;
}

function notebookRunOf(run) {
  const life = String(run?.state?.life_cycle_state || '');
  const result = String(run?.state?.result_state || '');
  const active = ACTIVE_RUN_STATES.has(life);
  return {
    run_id: run.run_id,
    job_id: run.job_id,
    state: active ? 'running' : result === 'SUCCESS' ? 'succeeded' : 'failed',
    life_cycle_state: life,
    result_state: result,
    message: String(run?.state?.state_message || '').trim(),
    url: run.run_page_url || '',
    started_at: run.start_time ? new Date(Number(run.start_time)).toISOString() : '',
  };
}

async function latestGenieNotebookRun(fetchJson, sessionId) {
  const job = await newestJobNamed(fetchJson, genieNotebookJobName(sessionId));
  if (!job) return null;
  const got = await fetchJson(`/api/2.1/jobs/runs/list?job_id=${Number(job.job_id)}&limit=1`);
  if (!got.ok) throw apiError('Reading the Genie Code notebook run', got);
  const run = (got.data.runs || [])[0];
  return run ? notebookRunOf({ job_id: job.job_id, ...run }) : null;
}

module.exports = { genieNotebookJobName, latestGenieNotebookRun, newestJobNamed, notebookRunOf };
