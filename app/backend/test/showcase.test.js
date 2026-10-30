const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { listen } = require('./support/implementApp');
const S = require('../lib/showcase');

const SHELL = {
  'static/index.html': '<!doctype html><script type="module" src="./assets/app.js"></script>',
  'static/assets/app.js': 'console.log("shell")',
  'static/assets/index.css': 'body{}',
  'shell_core.py': 'print(1)',
};

function bundle(overrides = {}) {
  const k = S.showcaseKey;
  return {
    version: 1,
    id: 'taxi',
    title: 'NYC Taxi Operations',
    business: 'NYC Taxi Operations',
    summary: 'Use cases on the public taxi trips sample',
    session_id: '1001',
    inspire: {
      [k('GET', '/api/inspire/results', { session_id: '1001' })]: { status: 200, body: { results: { title: 'Taxi' } } },
      [k('GET', '/api/inspire/sessions', {})]: { status: 200, body: { sessions: [{ session_id: '1001' }] } },
    },
    mvps: {
      'N01-U01': {
        title: 'Detect fare irregularities',
        api: {
          [k('GET', '/api/app')]: { status: 200, body: { title: 'Fare desk' } },
          [k('POST', '/api/page', {}, { page: 'n01_u01', filters: {} })]: { status: 200, body: { kpis: [1] } },
          [k('POST', '/api/genie/ask', {}, { question: 'Which zones?', conversation_id: '' })]: { status: 200, body: { conversation_id: 'c1' } },
        },
      },
    },
    ...overrides,
  };
}

function dirWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-'));
  for (const [name, value] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
  }
  return dir;
}

async function serve(files = { 'taxi.json': bundle() }) {
  const errors = [];
  const reached = [];
  const app = express();
  app.use(express.json());
  S.registerShowcaseRoutes(app, { dir: dirWith(files), shellFiles: SHELL, log: { error: (m) => errors.push(m) } });
  app.all('/api/*rest', (req, res) => {
    reached.push(`${req.method} ${req.path}`);
    res.json({ real: true });
  });
  const srv = await listen(app);
  return { srv, errors, reached };
}

async function call(base, url, { method = 'GET', body, headers = {} } = {}) {
  const resp = await fetch(base + url, {
    method,
    redirect: 'manual',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = resp.headers.get('content-type') || '';
  return { status: resp.status, type, location: resp.headers.get('location'), data: type.includes('json') ? await resp.json() : await resp.text() };
}

const DEMO = { [S.SHOWCASE_HEADER]: 'taxi' };

test('showcaseKey drops the workspace settings, sorts the query and the body, and keeps everything else', () => {
  const a = S.showcaseKey('get', '/api/inspire/results', { warehouse_id: 'w1', session_id: '1001', inspire_database: 'main.x', b: '2', a: '1' });
  const b = S.showcaseKey('GET', '/api/inspire/results', { a: '1', b: '2', session_id: '1001', warehouse_id: 'other' });
  assert.equal(a, 'GET /api/inspire/results?a=1&b=2&session_id=1001');
  assert.equal(a, b);
  assert.notEqual(a, S.showcaseKey('GET', '/api/inspire/results', { a: '1', b: '2', session_id: '1002' }));
  assert.equal(S.showcaseKey('POST', '/api/page', {}, { page: 'p', filters: { z: 1, a: [2] } }), 'POST /api/page {"filters":{"a":[2],"z":1},"page":"p"}');
  assert.equal(S.showcaseKey('POST', '/api/page', {}, { filters: { a: [2], z: 1 }, page: 'p', warehouse_id: 'w' }), 'POST /api/page {"filters":{"a":[2],"z":1},"page":"p"}');
  assert.equal(S.showcaseKey('POST', '/api/refresh', {}, {}), 'POST /api/refresh');
  assert.equal(S.showcaseKey('GET', '/api/app', { q: '' }), 'GET /api/app');
});

test('a demo bundle must be complete before Inspire offers it', () => {
  assert.equal(S.showcaseProblem(bundle(), '/x/taxi.json'), '');
  assert.match(S.showcaseProblem(bundle({ version: 2 }), '/x/taxi.json'), /not version 1/);
  assert.match(S.showcaseProblem(bundle(), '/x/other.json'), /must be named taxi\.json/);
  assert.match(S.showcaseProblem(bundle({ id: 'Bad Id' }), '/x/Bad Id.json'), /no valid id/);
  assert.match(S.showcaseProblem(bundle({ session_id: '' }), '/x/taxi.json'), /no session_id/);
  assert.match(S.showcaseProblem(bundle({ inspire: { 'GET /x': { status: 200, body: {} } } }), '/x/taxi.json'), /not METHOD \/api/);
  assert.match(S.showcaseProblem(bundle({ inspire: { 'GET /api/x': { body: {} } } }), '/x/taxi.json'), /no status and body/);
  assert.match(S.showcaseProblem(bundle({ mvps: { 'N01-U01': { title: 'x', api: {} } } }), '/x/taxi.json'), /no answer for GET \/api\/app/);
  assert.match(S.showcaseProblem(bundle({ mvps: { '../x': { title: 'x', api: {} } } }), '/x/taxi.json'), /MVP id/);
});

test('the demo list names each demo and the address of each hosted MVP', async () => {
  const { srv, errors } = await serve();
  try {
    const got = await call(srv.url, '/api/showcase');
    assert.equal(got.status, 200);
    assert.deepEqual(got.data.showcases, [{
      id: 'taxi', title: 'NYC Taxi Operations', business: 'NYC Taxi Operations', summary: 'Use cases on the public taxi trips sample',
      session_id: '1001', mvps: [{ id: 'N01-U01', title: 'Detect fare irregularities', url: '/showcase/taxi/mvp/N01-U01/' }],
    }]);
    assert.equal(got.data.error, undefined);
    assert.deepEqual(errors, []);
  } finally {
    await srv.close();
  }
});

test('a demo request gets the saved answer and never reaches the workspace routes', async () => {
  const { srv, reached } = await serve();
  try {
    const got = await call(srv.url, '/api/inspire/results?inspire_database=showcase&warehouse_id=showcase&session_id=1001', { headers: DEMO });
    assert.equal(got.status, 200);
    assert.deepEqual(got.data, { results: { title: 'Taxi' } });
    const missing = await call(srv.url, '/api/inspire/usecases?session_id=1001', { headers: DEMO });
    assert.equal(missing.status, 404);
    assert.equal(missing.data.error, S.SHOWCASE_MISSING);
    assert.equal(missing.data.showcase, true);
    for (const [method, url] of [['POST', '/api/inspire/implement/submit'], ['POST', '/api/inspire/feedback'], ['DELETE', '/api/inspire/session?session_id=1001'], ['POST', '/api/run/5/cancel']]) {
      const refused = await call(srv.url, url, { method, body: method === 'POST' ? { session_id: '1001' } : undefined, headers: DEMO });
      assert.equal(refused.status, 403, `${method} ${url}`);
      assert.equal(refused.data.error, S.SHOWCASE_READ_ONLY);
    }
    const unknown = await call(srv.url, '/api/inspire/results?session_id=1001', { headers: { [S.SHOWCASE_HEADER]: 'nope' } });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.data.error, S.SHOWCASE_UNKNOWN);
    assert.deepEqual(reached, []);
    const real = await call(srv.url, '/api/inspire/results?session_id=1001');
    assert.deepEqual(real.data, { real: true });
    assert.deepEqual(reached, ['GET /api/inspire/results']);
  } finally {
    await srv.close();
  }
});

test('a hosted MVP serves the App shell under its own address and answers its API from the saved answers', async () => {
  const { srv, reached } = await serve();
  try {
    const bare = await call(srv.url, '/showcase/taxi/mvp/N01-U01');
    assert.equal(bare.status, 302);
    assert.equal(bare.location, '/showcase/taxi/mvp/N01-U01/');
    const page = await call(srv.url, '/showcase/taxi/mvp/N01-U01/');
    assert.equal(page.status, 200);
    assert.match(page.type, /text\/html/);
    assert.equal(page.data, SHELL['static/index.html']);
    const js = await call(srv.url, '/showcase/taxi/mvp/N01-U01/assets/app.js');
    assert.match(js.type, /text\/javascript/);
    assert.equal(js.data, SHELL['static/assets/app.js']);
    const css = await call(srv.url, '/showcase/taxi/mvp/N01-U01/assets/index.css');
    assert.match(css.type, /text\/css/);
    assert.equal((await call(srv.url, '/showcase/taxi/mvp/N01-U01/shell_core.py')).status, 404);
    assert.equal((await call(srv.url, '/showcase/taxi/mvp/N09-U09/')).status, 404);
    assert.equal((await call(srv.url, '/showcase/other/mvp/N01-U01/')).status, 404);

    const base = '/showcase/taxi/mvp/N01-U01/api';
    assert.deepEqual((await call(srv.url, `${base}/app`)).data, { title: 'Fare desk' });
    assert.deepEqual((await call(srv.url, `${base}/page`, { method: 'POST', body: { filters: {}, page: 'n01_u01' } })).data, { kpis: [1] });
    const other = await call(srv.url, `${base}/page`, { method: 'POST', body: { filters: { zone: ['A'] }, page: 'n01_u01' } });
    assert.equal(other.status, 404);
    assert.equal(other.data.error, S.SHOWCASE_MISSING);
    assert.deepEqual((await call(srv.url, `${base}/genie/ask`, { method: 'POST', body: { question: 'Which zones?', conversation_id: '' } })).data, { conversation_id: 'c1' });
    const asked = await call(srv.url, `${base}/genie/ask`, { method: 'POST', body: { question: 'Something else', conversation_id: '' } });
    assert.equal(asked.status, 404);
    assert.equal(asked.data.error, S.SHOWCASE_GENIE);
    for (const route of ['records/act', 'refresh', 'money/assumption', 'alerts/save', 'records/update']) {
      const refused = await call(srv.url, `${base}/${route}`, { method: 'POST', body: { page: 'n01_u01' } });
      assert.equal(refused.status, 403, route);
      assert.equal(refused.data.error, S.SHOWCASE_READ_ONLY);
    }
    assert.deepEqual(reached, []);
  } finally {
    await srv.close();
  }
});

test('a broken demo bundle turns the demo off without stopping the Inspire App', async () => {
  const { srv, errors, reached } = await serve({ 'taxi.json': '{not json' });
  try {
    const got = await call(srv.url, '/api/showcase');
    assert.equal(got.status, 200);
    assert.deepEqual(got.data.showcases, []);
    assert.match(got.data.error, /taxi\.json is not valid JSON/);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^The demo is off: /);
    const demo = await call(srv.url, '/api/inspire/results?session_id=1001', { headers: DEMO });
    assert.equal(demo.status, 404);
    assert.deepEqual(reached, []);
  } finally {
    await srv.close();
  }
});

test('showcaseMiss tells reads, Genie questions and changes apart', () => {
  assert.deepEqual(S.showcaseMiss('GET', '/api/runs'), { status: 404, error: S.SHOWCASE_MISSING });
  assert.deepEqual(S.showcaseMiss('POST', '/api/records'), { status: 404, error: S.SHOWCASE_MISSING });
  assert.deepEqual(S.showcaseMiss('POST', '/api/genie/ask'), { status: 404, error: S.SHOWCASE_GENIE });
  assert.deepEqual(S.showcaseMiss('POST', '/api/records/act'), { status: 403, error: S.SHOWCASE_READ_ONLY });
  assert.deepEqual(S.showcaseMiss('PUT', '/api/page'), { status: 403, error: S.SHOWCASE_READ_ONLY });
});
