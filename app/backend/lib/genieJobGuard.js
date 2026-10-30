const ACTIVE_RUN_STATES = new Set(['QUEUED', 'PENDING', 'RUNNING', 'BLOCKED', 'TERMINATING', 'WAITING_FOR_RETRY']);
const STARTING_TIMEOUT_MS = 10 * 60 * 1000;
const UNKNOWN_STATE_WINDOW_MS = 3 * 60 * 60 * 1000;

function createGenieJobGuard({ now = () => Date.now() } = {}) {
  const entries = new Map();

  async function claim(sessionId, runState) {
    const key = String(sessionId);
    const entry = entries.get(key);
    if (entry && entry.starting && now() - entry.since < STARTING_TIMEOUT_MS) {
      return { ok: false, entry };
    }
    if (entry && !entry.starting) {
      entries.set(key, { starting: true, since: now() });
      let state = null;
      try {
        state = await runState(entry.run_id);
      } catch {
        state = null;
      }
      const unknownButRecent = state === null && now() - entry.since < UNKNOWN_STATE_WINDOW_MS;
      if (unknownButRecent || ACTIVE_RUN_STATES.has(state)) {
        entries.set(key, entry);
        return { ok: false, entry };
      }
    }
    entries.set(key, { starting: true, since: now() });
    return { ok: true };
  }

  function launched(sessionId, out) {
    entries.set(String(sessionId), { starting: false, run_id: out?.run_id, job_run_url: out?.job_run_url, since: now() });
  }

  function failed(sessionId) {
    entries.delete(String(sessionId));
  }

  return { claim, launched, failed };
}

module.exports = { ACTIVE_RUN_STATES, createGenieJobGuard };
