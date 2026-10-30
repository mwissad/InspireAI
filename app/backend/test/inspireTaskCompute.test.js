const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { inspireTaskCompute } = require('../lib/inspireJobParams');
const { triggerDemoDataPipeline } = require('../lib/demoDataPipeline');

const SERVERLESS = { environment_key: 'Default', disable_auto_optimization: true };

function fakeFetch(created) {
  return async (host, token, url, opts = {}) => {
    if (url === '/api/2.0/clusters/list') return { ok: true, json: async () => ({ clusters: [] }) };
    if (url === '/api/2.1/jobs/create') {
      created.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ job_id: 7 }) };
    }
    if (url === '/api/2.1/jobs/run-now') return { ok: true, json: async () => ({ run_id: 9 }) };
    throw new Error(`unexpected call ${url}`);
  };
}

async function demoPayload(clusterId) {
  const created = [];
  const saved = { a: process.env.INSPIRE_CLUSTER_ID, b: process.env.INSPIRE_DEPLOY_CLUSTER_ID };
  delete process.env.INSPIRE_CLUSTER_ID;
  delete process.env.INSPIRE_DEPLOY_CLUSTER_ID;
  try {
    await triggerDemoDataPipeline(fakeFetch(created), () => 'https://h/run', 'https://h', 't', {
      description: 'A retailer with stores and an online shop',
      businessName: 'Acme Retail',
      inspireDatabase: 'main._inspire',
      sessionId: '42',
      cluster_id: clusterId,
      resolveWorkspaceNotebookObjectPath: async (host, token, p) => p,
    });
  } finally {
    if (saved.a !== undefined) process.env.INSPIRE_CLUSTER_ID = saved.a;
    if (saved.b !== undefined) process.env.INSPIRE_DEPLOY_CLUSTER_ID = saved.b;
  }
  assert.equal(created.length, 1);
  return created[0];
}

test('a serverless Inspire task runs once, without the automatic serverless retries', () => {
  for (const none of ['', null, undefined]) {
    assert.deepEqual(inspireTaskCompute(none), SERVERLESS);
  }
});

test('a task on a given cluster keeps that cluster and carries no serverless option', () => {
  const compute = inspireTaskCompute('0101-abc');
  assert.deepEqual(compute, { existing_cluster_id: '0101-abc' });
  assert.equal('disable_auto_optimization' in compute, false);
  assert.equal('environment_key' in compute, false);
});

test('both demo pipeline tasks run once on serverless and use the cluster when one is given', async () => {
  const serverless = await demoPayload('');
  assert.deepEqual(serverless.tasks.map((t) => t.task_key), ['generate_demo_data', 'inspire_discovery']);
  for (const task of serverless.tasks) {
    assert.equal(task.disable_auto_optimization, true, task.task_key);
    assert.equal(task.environment_key, 'Default', task.task_key);
    assert.equal(task.existing_cluster_id, undefined, task.task_key);
  }
  assert.deepEqual(serverless.environments, [{ environment_key: 'Default', spec: { client: '1' } }]);
  const classic = await demoPayload('0101-abc');
  for (const task of classic.tasks) {
    assert.equal(task.existing_cluster_id, '0101-abc', task.task_key);
    assert.equal('disable_auto_optimization' in task, false, task.task_key);
  }
  assert.equal(classic.environments, undefined);
  assert.equal(serverless.tags.dbx_inspire_ai_session, '42');
  assert.equal(serverless.tags.dbx_inspire_ai_session_id, '42');
  assert.equal(serverless.tags.dbx_inspire_ai_run_type, 'demo_pipeline');
  assert.equal(serverless.tags.dbx_inspire_ai_type, 'demo_pipeline');
  assert.equal(serverless.tags.dbx_inspire_ai_business, 'Acme_Retail');
});

test('every job the App creates takes its task compute from inspireTaskCompute', () => {
  const backend = path.join(__dirname, '..');
  const sources = [path.join(backend, 'server.js')].concat(
    fs.readdirSync(path.join(backend, 'lib')).map((name) => path.join(backend, 'lib', name)),
  );
  const creators = sources.filter((file) => fs.readFileSync(file, 'utf8').includes("'/api/2.1/jobs/create'"));
  assert.deepEqual(creators.map((file) => path.basename(file)).sort(), ['demoDataPipeline.js', 'server.js']);
  for (const file of creators) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /inspireTaskCompute\((cluster_id|resolvedClusterId)\)/, file);
    assert.doesNotMatch(source, /\{ environment_key: 'Default' \}/, file);
  }
  const server = fs.readFileSync(path.join(backend, 'server.js'), 'utf8');
  const start = server.indexOf('async function triggerInspireNotebookJob');
  const create = server.slice(start, server.indexOf("'/api/2.1/jobs/create'", start));
  assert.match(create, /\.\.\.inspireTaskCompute\(cluster_id\)/);
  assert.doesNotMatch(create, /existing_cluster_id/);
  const bundle = fs.readFileSync(path.join(backend, '..', 'databricks.yml'), 'utf8');
  assert.match(bundle, /- task_key: inspire_notebook\n(?: {10}.*\n)*? {10}disable_auto_optimization: true\n/);
});
