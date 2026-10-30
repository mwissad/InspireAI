const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'apiClient.js')).href;
const load = () => import(libUrl);

function withFetch(responder, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const { status = 200, text = '' } = responder(url, opts);
    return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) };
  };
  return Promise.resolve(run(calls)).finally(() => { globalThis.fetch = original; });
}

test('both helpers send the token and workspace host headers, and POST sends JSON', async () => {
  const { makeApiFetch, makeApiPostJson } = await load();
  await withFetch(() => ({ text: '{"ok":true}' }), async (calls) => {
    const get = makeApiFetch({ token: 'tok', databricksHost: 'https://h' });
    const post = makeApiPostJson({ token: 'tok', databricksHost: 'https://h' });
    assert.deepEqual(await get('/api/a'), { ok: true });
    assert.deepEqual(await post('/api/b', { x: 1 }), { ok: true });
    assert.deepEqual(calls[0].opts.headers, { Authorization: 'Bearer tok', 'X-DB-PAT-Token': 'tok', 'X-Databricks-Host': 'https://h' });
    assert.equal(calls[1].opts.method, 'POST');
    assert.equal(calls[1].opts.body, '{"x":1}');
    assert.deepEqual(calls[1].opts.headers, {
      'Content-Type': 'application/json', Authorization: 'Bearer tok', 'X-DB-PAT-Token': 'tok', 'X-Databricks-Host': 'https://h',
    });
  });
});

test('a demo request names the demo and sends no token or workspace host', async () => {
  const { makeApiFetch, makeApiPostJson, requestHeaders, SHOWCASE_HEADER } = await load();
  await withFetch(() => ({ text: '{}' }), async (calls) => {
    await makeApiFetch({ token: 'tok', databricksHost: 'https://h', showcase: 'nyctaxi' })('/api/a');
    await makeApiPostJson({ token: 'tok', databricksHost: 'https://h', showcase: 'nyctaxi' })('/api/b', {});
    assert.deepEqual(calls[0].opts.headers, { [SHOWCASE_HEADER]: 'nyctaxi' });
    assert.deepEqual(calls[1].opts.headers, { 'Content-Type': 'application/json', [SHOWCASE_HEADER]: 'nyctaxi' });
  });
  assert.equal(SHOWCASE_HEADER.toLowerCase(), require('../lib/showcase').SHOWCASE_HEADER);
  assert.deepEqual(requestHeaders('tok', '', { Accept: 'x' }), { Accept: 'x', Authorization: 'Bearer tok', 'X-DB-PAT-Token': 'tok' });
});

test('without a token or host no auth headers are sent', async () => {
  const { makeApiFetch, makeApiPostJson } = await load();
  await withFetch(() => ({ text: '{}' }), async (calls) => {
    await makeApiFetch()('/api/a');
    await makeApiPostJson({})('/api/b', {});
    assert.deepEqual(calls[0].opts.headers, {});
    assert.deepEqual(calls[1].opts.headers, { 'Content-Type': 'application/json' });
  });
});

test('an error keeps the status and the parsed body apart from the message, which is the server error text alone', async () => {
  const { makeApiFetch, makeApiPostJson } = await load();
  const body = { missing_tables: [{ table: 'main.s.orders', reason: 'not found' }], error: 'the preview cannot run' };
  await withFetch(() => ({ status: 409, text: JSON.stringify(body) }), async () => {
    const postErr = await makeApiPostJson({ token: 't' })('/api/x', {}).catch((e) => e);
    assert.equal(postErr.message, 'the preview cannot run');
    assert.equal(postErr.status, 409);
    assert.deepEqual(postErr.body, body);
    const getErr = await makeApiFetch({ token: 't' })('/api/x').catch((e) => e);
    assert.equal(getErr.message, 'the preview cannot run');
    assert.equal(getErr.status, 409);
    assert.deepEqual(getErr.body, body);
  });
});

test('a structured error is stringified, message and error_message are read too, plain text is kept, and a reply with no detail says the request failed with its status', async () => {
  const { makeApiPostJson } = await load();
  const post = makeApiPostJson({ token: 't' });
  const cases = [
    [400, '{"error":{"code":"BAD","why":"x"}}', '{"code":"BAD","why":"x"}', { error: { code: 'BAD', why: 'x' } }],
    [403, '{"message":"PERMISSION_DENIED: no USE CATALOG"}', 'PERMISSION_DENIED: no USE CATALOG', { message: 'PERMISSION_DENIED: no USE CATALOG' }],
    [404, '{"error_code":"NOT_FOUND","error_message":"no such job"}', 'no such job', { error_code: 'NOT_FOUND', error_message: 'no such job' }],
    [502, 'Bad Gateway', 'Bad Gateway', null],
    [400, '"quoted text"', 'quoted text', null],
    [500, '', 'The request failed (HTTP 500)', null],
    [500, 'null', 'The request failed (HTTP 500)', null],
    [500, '{}', 'The request failed (HTTP 500)', {}],
    [500, '{"error":""}', 'The request failed (HTTP 500)', { error: '' }],
    [503, '42', 'The request failed (HTTP 503)', null],
  ];
  for (const [status, text, message, body] of cases) {
    await withFetch(() => ({ status, text }), async () => {
      const err = await post('/api/x', {}).catch((e) => e);
      assert.equal(err.message, message, `${status} ${text}`);
      assert.equal(err.status, status);
      assert.deepEqual(err.body, body);
      assert.doesNotMatch(err.message, /^\d{3}:/, 'no status prefix in the message');
    });
  }
});
