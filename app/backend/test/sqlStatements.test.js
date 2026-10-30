const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createExecuteSql,
  runWithRequestDeadline,
  readDeadline,
  PAGE_SQL_DEADLINE_MS,
  SLOW_WAREHOUSE_MESSAGE,
} = require('../lib/sqlStatements');

function warehouse(states, { submitMs = 0, cancelOk = true, rows = [['1']] } = {}) {
  let t = 0;
  const calls = [];
  const queue = [...states];
  const statement = (state) => ({
    statement_id: 's1',
    status: state === 'FAILED' ? { state, error: { message: 'TABLE_OR_VIEW_NOT_FOUND x' } } : { state },
    manifest: { schema: { columns: [{ name: 'x' }] } },
    result: { data_array: state === 'SUCCEEDED' ? rows : [] },
  });
  const dbFetch = async (_host, _token, apiPath, options = {}) => {
    calls.push({ apiPath, method: options.method || 'GET', at: t });
    if (calls.length > 5000) throw new Error('runaway: the statement was polled 5000 times without stopping');
    if (apiPath.endsWith('/cancel')) {
      if (cancelOk === 'throws') throw new Error('Cannot reach Databricks');
      return { ok: cancelOk, json: async () => ({}), text: async () => '' };
    }
    if (options.method === 'POST') t += submitMs;
    const state = queue.length > 1 ? queue.shift() : queue[0];
    return { ok: true, json: async () => statement(state), text: async () => '' };
  };
  const now = () => t;
  const sleep = async (ms) => { t += ms; };
  return { calls, now, executeSql: createExecuteSql(dbFetch, { now, sleep }), cancels: () => calls.filter((c) => c.apiPath.endsWith('/cancel')) };
}

const running = (n) => Array.from({ length: n }, () => 'RUNNING');

test('a page read the warehouse holds past the request deadline is cancelled and tells the user what to do', async () => {
  const w = warehouse(['RUNNING'], { submitMs: 50000 });
  await assert.rejects(
    runWithRequestDeadline(() => w.executeSql('h', 't', 'wh', 'SELECT * FROM x ORDER BY create_at DESC LIMIT 20'), PAGE_SQL_DEADLINE_MS, w.now),
    (err) => err.code === 'SQL_DEADLINE' && err.message === SLOW_WAREHOUSE_MESSAGE && err.statementId === 's1',
  );
  assert.equal(w.cancels().length, 1, 'the stuck statement is cancelled once');
  assert.equal(w.cancels()[0].method, 'POST');
  assert.equal(w.cancels()[0].apiPath, '/api/2.0/sql/statements/s1/cancel');
  assert.equal(w.calls.at(-1).apiPath, '/api/2.0/sql/statements/s1/cancel', 'nothing is polled after the cancel');
  assert.ok(w.now() <= PAGE_SQL_DEADLINE_MS + 2000, `the request ends by the deadline, not at the proxy cut-off (${w.now()} ms)`);
  assert.ok(w.now() < 300000);
});

test('the message names the deadline and a retry, and never a stack or statement text', () => {
  assert.match(SLOW_WAREHOUSE_MESSAGE, new RegExp(`within ${PAGE_SQL_DEADLINE_MS / 60000} minutes`));
  assert.match(SLOW_WAREHOUSE_MESSAGE, /Try again in a minute\.$/);
  assert.ok(PAGE_SQL_DEADLINE_MS < 300000, 'below the 300 s the Apps proxy allows a request');
});

test('a read that finishes before the deadline returns its rows and cancels nothing', async () => {
  const w = warehouse(['RUNNING', 'RUNNING', 'SUCCEEDED']);
  const result = await runWithRequestDeadline(() => w.executeSql('h', 't', 'wh', 'SELECT 1'), PAGE_SQL_DEADLINE_MS, w.now);
  assert.deepEqual(result.result.data_array, [['1']]);
  assert.equal(w.cancels().length, 0);
});

test('writes and DDL keep waiting past the deadline, so a commit is never cut off', async () => {
  for (const sql of [
    'INSERT INTO t VALUES (1)',
    'UPDATE t SET a = 1',
    'MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET *',
    'DELETE FROM t WHERE id = 1',
    'CREATE TABLE IF NOT EXISTS t (a INT)',
    'ALTER TABLE t ADD COLUMNS (b INT)',
  ]) {
    const w = warehouse([...running(200), 'SUCCEEDED']);
    const result = await runWithRequestDeadline(() => w.executeSql('h', 't', 'wh', sql), PAGE_SQL_DEADLINE_MS, w.now);
    assert.deepEqual(result.result.data_array, [['1']], sql);
    assert.equal(w.cancels().length, 0, sql);
    assert.ok(w.now() > PAGE_SQL_DEADLINE_MS, `${sql} ran past the deadline (${w.now()} ms)`);
  }
});

test('outside a request a read keeps waiting, so startup and background work are never cancelled', async () => {
  const w = warehouse([...running(200), 'SUCCEEDED']);
  const result = await w.executeSql('h', 't', 'wh', 'SELECT 1');
  assert.deepEqual(result.result.data_array, [['1']]);
  assert.equal(w.cancels().length, 0);
});

test('the deadline covers the whole request: a read that would start after it is refused without a statement', async () => {
  const w = warehouse(['SUCCEEDED']);
  let t = 0;
  const now = () => t;
  await runWithRequestDeadline(async () => {
    t = PAGE_SQL_DEADLINE_MS;
    await assert.rejects(
      createExecuteSql(async (...args) => { w.calls.push(args); return { ok: true, json: async () => ({}) }; }, { now })('h', 't', 'wh', 'SELECT 1'),
      (err) => err.code === 'SQL_DEADLINE' && err.statementId === null,
    );
  }, PAGE_SQL_DEADLINE_MS, now);
  assert.equal(w.calls.length, 0, 'no statement is submitted once the request is out of time');
});

test('two reads in one request share one deadline, so the second gets only the time left', async () => {
  const w = warehouse([...running(100), 'SUCCEEDED', ...running(1000)]);
  await assert.rejects(runWithRequestDeadline(async () => {
    await w.executeSql('h', 't', 'wh', 'SELECT 1');
    assert.ok(w.now() >= 200000, 'the first read used most of the time');
    await w.executeSql('h', 't', 'wh', 'SELECT 2');
  }, PAGE_SQL_DEADLINE_MS, w.now), (err) => err.code === 'SQL_DEADLINE');
  assert.ok(w.now() <= PAGE_SQL_DEADLINE_MS + 2000, `the request still ends by the deadline (${w.now()} ms)`);
  assert.equal(w.cancels().length, 1);
});

test('a cancel the warehouse refuses or cannot be reached for still ends the request with the same message', async () => {
  for (const cancelOk of [false, 'throws']) {
    const w = warehouse(['RUNNING'], { cancelOk });
    await assert.rejects(
      runWithRequestDeadline(() => w.executeSql('h', 't', 'wh', 'SELECT 1'), PAGE_SQL_DEADLINE_MS, w.now),
      (err) => err.code === 'SQL_DEADLINE' && err.message === SLOW_WAREHOUSE_MESSAGE,
    );
    assert.equal(w.cancels().length, 1);
  }
});

test('only statements that read get the deadline; anything else, or no request, keeps waiting', async () => {
  const reads = ['SELECT 1', 'select 1', '  WITH a AS (SELECT 1) SELECT * FROM a', 'SHOW CATALOGS', 'DESCRIBE TABLE t', 'DESC t', 'EXPLAIN SELECT 1', '\nSELECT 1'];
  const others = ['INSERT INTO t VALUES (1)', 'UPDATE t SET a = 1', 'MERGE INTO t USING s ON 1 = 1 WHEN MATCHED THEN DELETE', 'DELETE FROM t', 'CREATE SCHEMA s', 'ALTER TABLE t ADD COLUMNS (b INT)', 'DROP TABLE t', 'GRANT SELECT ON t TO u', '-- note\nSELECT 1', 'SELECTED_ROWS', '', null];
  await runWithRequestDeadline(async () => {
    await new Promise((r) => setTimeout(r, 1));
    for (const sql of reads) assert.equal(readDeadline(sql), 1000 + PAGE_SQL_DEADLINE_MS, JSON.stringify(sql));
    for (const sql of others) assert.equal(readDeadline(sql), null, JSON.stringify(sql));
  }, PAGE_SQL_DEADLINE_MS, () => 1000);
  assert.equal(readDeadline('SELECT 1'), null, 'no deadline outside a request');
});

test('each request keeps its own deadline across awaits, and none leaks into the next', async () => {
  const seen = await Promise.all([1000, 5000].map((start) => runWithRequestDeadline(async () => {
    await new Promise((r) => setTimeout(r, start === 1000 ? 5 : 1));
    return readDeadline('SELECT 1');
  }, PAGE_SQL_DEADLINE_MS, () => start)));
  assert.deepEqual(seen, [1000 + PAGE_SQL_DEADLINE_MS, 5000 + PAGE_SQL_DEADLINE_MS]);
  assert.equal(readDeadline('SELECT 1'), null);
});

test('a failed statement still throws the warehouse message, and chunked results are joined in order', async () => {
  const failed = warehouse(['RUNNING', 'FAILED']);
  await assert.rejects(failed.executeSql('h', 't', 'wh', 'SELECT 1'), /TABLE_OR_VIEW_NOT_FOUND x/);
  const chunks = [];
  const dbFetch = async (_h, _t, apiPath) => {
    chunks.push(apiPath);
    if (apiPath.includes('/result/chunks/')) return { ok: true, json: async () => ({ data_array: [[apiPath.split('/').pop()]] }) };
    return { ok: true, json: async () => ({ statement_id: 's2', status: { state: 'SUCCEEDED' }, manifest: { total_chunk_count: 3, chunks: [{ chunk_index: 0 }, { chunk_index: 1 }, { chunk_index: 2 }], schema: { columns: [{ name: 'x' }] } }, result: { data_array: [['0']] } }) };
  };
  const result = await createExecuteSql(dbFetch)('h', 't', 'wh', 'SELECT 1');
  assert.deepEqual(result.result.data_array, [['0'], ['1'], ['2']]);
  assert.deepEqual(chunks.slice(1), ['/api/2.0/sql/statements/s2/result/chunks/1', '/api/2.0/sql/statements/s2/result/chunks/2']);
});

test('the server has one SQL runner, built from the module, and every token-checked request runs inside the deadline', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(!/async function executeSql\(/.test(server), 'no second executeSql in server.js');
  assert.match(server, /const executeSql = createExecuteSql\(dbFetch\);/);
  const requireToken = server.slice(server.indexOf('async function requireToken('), server.indexOf('async function requireToken(') + 1200);
  assert.match(requireToken, /runWithRequestDeadline\(next\)/);
  assert.ok(!/\n\s+next\(\);/.test(requireToken), 'requireToken never calls next() outside the deadline');
  for (const file of ['implementRoutes.js', path.join('lib', 'demoDataService.js')]) {
    assert.ok(!/fetch\([^)]*\/api\/2\.0\/sql\/statements/.test(fs.readFileSync(path.join(__dirname, '..', file), 'utf8')), `${file} sends no statement of its own`);
  }
});
