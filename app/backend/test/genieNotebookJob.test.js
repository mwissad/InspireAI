const test = require('node:test');
const assert = require('node:assert/strict');
const { genieNotebookJobName, latestGenieNotebookRun, newestJobNamed, notebookRunOf } = require('../lib/genieNotebookJob');

const NAME = 'Inspire AI - Genie Code - 42';

function fakeJobs(pages, runsByJob = {}, failures = {}) {
  const calls = [];
  const fetchJson = async (path) => {
    calls.push(path);
    const url = new URL(`https://x${path}`);
    if (url.pathname === '/api/2.1/jobs/list') {
      if (failures.list) return { ok: false, status: 403, data: { message: 'no access to jobs' } };
      return { ok: true, status: 200, data: pages[url.searchParams.get('page_token') || '0'] || { jobs: [] } };
    }
    if (url.pathname === '/api/2.1/jobs/runs/list') {
      if (failures.runs) return { ok: false, status: 500, data: { error_code: 'INTERNAL_ERROR' } };
      return { ok: true, status: 200, data: runsByJob[url.searchParams.get('job_id')] || { runs: [] } };
    }
    return { ok: false, status: 404, data: {} };
  };
  return { fetchJson, calls };
}

const job = (id, name, created) => ({ job_id: id, created_time: created, settings: { name } });

test('the notebook job is named after the session and refuses a non-numeric session id', () => {
  assert.equal(genieNotebookJobName('42'), NAME);
  assert.equal(genieNotebookJobName(' 42 '), NAME);
  for (const bad of ['', '4 2', 'abc', null, undefined, '42; DROP']) {
    assert.throws(() => genieNotebookJobName(bad), /numeric Inspire session id/);
  }
});

test('the newest job with exactly the session name wins across pages, and look-alike names never match', async () => {
  const { fetchJson, calls } = fakeJobs({
    0: { jobs: [job(1, NAME, 100), job(2, 'inspire ai - genie code - 42', 900), job(3, `${NAME}0`, 950)], next_page_token: '1' },
    1: { jobs: [job(4, NAME, 300), job(5, 'Inspire AI - Genie Code - 420', 999)] },
  });
  const found = await newestJobNamed(fetchJson, NAME);
  assert.equal(found.job_id, 4);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /name=Inspire%20AI%20-%20Genie%20Code%20-%2042/);
  assert.equal(await newestJobNamed(fakeJobs({ 0: { jobs: [job(2, 'Inspire AI - Genie Code - 420', 1)] } }).fetchJson, NAME), null);
});

test('listing stops after five pages so a runaway page token cannot loop', async () => {
  const pages = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), { jobs: [job(i, NAME, i)], next_page_token: String(i + 1) }]));
  const { fetchJson, calls } = fakeJobs(pages);
  const found = await newestJobNamed(fetchJson, NAME);
  assert.equal(calls.length, 5);
  assert.equal(found.job_id, 4);
});

test('a run reads as running, succeeded or failed from its life cycle and result', () => {
  const run = (life, result, extra = {}) => notebookRunOf({ run_id: 9, job_id: 4, state: { life_cycle_state: life, result_state: result, state_message: ' boom ' }, ...extra });
  for (const life of ['QUEUED', 'PENDING', 'RUNNING', 'BLOCKED', 'TERMINATING', 'WAITING_FOR_RETRY']) {
    assert.equal(run(life, '').state, 'running', life);
  }
  assert.equal(run('TERMINATED', 'SUCCESS').state, 'succeeded');
  for (const [life, result] of [['TERMINATED', 'FAILED'], ['TERMINATED', 'CANCELED'], ['INTERNAL_ERROR', ''], ['SKIPPED', ''], ['', '']]) {
    assert.equal(run(life, result).state, 'failed', `${life}/${result}`);
  }
  const done = run('TERMINATED', 'FAILED', { run_page_url: 'https://w/#job/4/run/9', start_time: Date.UTC(2026, 9, 26, 7, 0, 0) });
  assert.deepEqual(done, {
    run_id: 9, job_id: 4, state: 'failed', life_cycle_state: 'TERMINATED', result_state: 'FAILED', message: 'boom',
    url: 'https://w/#job/4/run/9', started_at: '2026-10-26T07:00:00.000Z',
  });
});

test('the latest run of the newest session job is returned, or null when there is no job or no run', async () => {
  const runs = { 4: { runs: [{ run_id: 12, state: { life_cycle_state: 'RUNNING' } }] } };
  const { fetchJson, calls } = fakeJobs({ 0: { jobs: [job(1, NAME, 1), job(4, NAME, 5)] } }, runs);
  const latest = await latestGenieNotebookRun(fetchJson, '42');
  assert.equal(latest.run_id, 12);
  assert.equal(latest.job_id, 4);
  assert.equal(latest.state, 'running');
  assert.match(calls[1], /^\/api\/2\.1\/jobs\/runs\/list\?job_id=4&limit=1$/);
  assert.equal(await latestGenieNotebookRun(fakeJobs({ 0: { jobs: [] } }).fetchJson, '42'), null);
  assert.equal(await latestGenieNotebookRun(fakeJobs({ 0: { jobs: [job(4, NAME, 5)] } }).fetchJson, '42'), null);
});

test('a failed jobs call is an error that names the call, never an empty answer', async () => {
  await assert.rejects(latestGenieNotebookRun(fakeJobs({}, {}, { list: true }).fetchJson, '42'),
    (err) => err.statusCode === 502 && /Listing the Genie Code notebook jobs failed \(403\): no access to jobs/.test(err.message));
  await assert.rejects(latestGenieNotebookRun(fakeJobs({ 0: { jobs: [job(4, NAME, 5)] } }, {}, { runs: true }).fetchJson, '42'),
    /Reading the Genie Code notebook run failed \(500\): INTERNAL_ERROR/);
});
