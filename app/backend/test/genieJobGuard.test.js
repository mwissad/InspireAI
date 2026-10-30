const test = require('node:test');
const assert = require('node:assert/strict');
const { createGenieJobGuard } = require('../lib/genieJobGuard');

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('a second Genie job for a session is refused while the first is starting or running', async () => {
  const c = clock();
  const guard = createGenieJobGuard({ now: c.now });
  const states = { r1: 'RUNNING' };
  const runState = async (id) => states[id] ?? null;
  assert.equal((await guard.claim('s1', runState)).ok, true);
  assert.equal((await guard.claim('s1', runState)).ok, false, 'a double click while the job is being created');
  assert.equal((await guard.claim('s2', runState)).ok, true, 'other sessions are not blocked');
  guard.launched('s1', { run_id: 'r1', job_run_url: 'https://x/run/r1' });
  const refused = await guard.claim('s1', runState);
  assert.equal(refused.ok, false);
  assert.equal(refused.entry.run_id, 'r1');
  states.r1 = 'TERMINATED';
  assert.equal((await guard.claim('s1', runState)).ok, true, 'a finished job no longer blocks');
});

test('a failed launch clears the claim and a stale start or an old unknown run does not block forever', async () => {
  const c = clock();
  const guard = createGenieJobGuard({ now: c.now });
  const unknown = async () => { throw new Error('jobs api down'); };
  await guard.claim('s1', unknown);
  guard.failed('s1');
  assert.equal((await guard.claim('s1', unknown)).ok, true);
  c.advance(11 * 60 * 1000);
  assert.equal((await guard.claim('s1', unknown)).ok, true, 'a start that never finished expires after 10 minutes');
  guard.launched('s1', { run_id: 'r9' });
  assert.equal((await guard.claim('s1', unknown)).ok, false, 'an unreadable recent run is treated as still running');
  c.advance(4 * 60 * 60 * 1000);
  assert.equal((await guard.claim('s1', unknown)).ok, true, 'after 3 hours an unreadable run no longer blocks');
});

test('two requests that race while the previous run is being checked launch at most one job', async () => {
  const guard = createGenieJobGuard();
  guard.launched('s1', { run_id: 'r1' });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const slow = async () => { await gate; return 'TERMINATED'; };
  const first = guard.claim('s1', slow);
  const second = await guard.claim('s1', slow);
  release();
  assert.deepEqual([(await first).ok, second.ok], [true, false]);
});
