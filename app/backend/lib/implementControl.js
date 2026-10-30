const I = require('./inspireImplement');

const CONTROL_CACHE_MS = 15000;
const CONTROL_LOG_TABLE = '__inspire_control_log';
const CONTROL_LOG_COLUMNS = [
  ['session_id', 'BIGINT'], ['use_case_id', 'STRING'], ['asset', 'STRING'], ['asset_id', 'STRING'], ['action', 'STRING'],
  ['result', 'STRING'], ['message', 'STRING'], ['acted_by', 'STRING'], ['acted_at', 'TIMESTAMP'],
];
const CONTROL_ACTIONS = {
  app: { stop: 'Stop the App', start: 'Start the App' },
  dashboard: { unpublish: 'Unpublish the dashboard', publish: 'Publish the dashboard' },
  job: { cancel: 'Stop the running job' },
  build: { cancel: 'Stop the build' },
};
const RUN_ENDED = ['TERMINATED', 'SKIPPED', 'INTERNAL_ERROR'];
const LAKEBASE_KIND = 'lakebase';
const LAKEBASE_PROBE_PATH = '/api/2.0/postgres/projects?page_size=1';
const LAKEBASE_ABSENT_CODES = ['FEATURE_DISABLED', 'NOT_IMPLEMENTED', 'ENDPOINT_NOT_FOUND'];

const str = (v) => (v == null ? '' : String(v).trim());
const dataOf = (got) => (got && got.data && typeof got.data === 'object' ? got.data : {});
const errorOf = (got) => {
  const d = dataOf(got);
  const status = Number(got && got.status);
  return str(d.message || d.error || d.raw || (status > 0 ? `HTTP ${status}` : 'no response'));
};

function controlPhrase(label) {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function controlTargets(history) {
  const rows = [...(history || [])].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0));
  const assets = I.carriedAssets(rows);
  const jobId = str((rows.find((r) => r.job_id) || {}).job_id);
  const latest = rows[0] || {};
  const runId = I.IMPLEMENT_ACTIVE_STATUSES.includes(latest.status) ? str(latest.implement_run_id) : '';
  return { ...assets, ...(/^\d{1,19}$/.test(jobId) ? { job: jobId } : {}), ...(/^\d{1,19}$/.test(runId) ? { build: runId } : {}) };
}

function controlAction(asset, action) {
  const known = Object.hasOwn(CONTROL_ACTIONS, asset) && Object.hasOwn(CONTROL_ACTIONS[asset], action);
  const label = known ? CONTROL_ACTIONS[asset][action] : '';
  if (!label) {
    const known = Object.entries(CONTROL_ACTIONS).flatMap(([a, acts]) => Object.keys(acts).map((x) => `${a} ${x}`));
    throw I.badRequest(`${str(asset)} ${str(action)} is not an action the control tower runs; it runs ${known.join(', ')}`);
  }
  return label;
}

function controlTarget(asset, targets) {
  const id = Object.hasOwn(targets || {}, asset) ? str(targets[asset]) : '';
  if (!id && asset === 'build') throw I.badRequest('no version of this MVP is building now', 409);
  if (!id) throw I.badRequest(`this MVP has no ${asset === 'job' ? 'job' : I.IMPLEMENT_OUTPUT_LABELS[asset]} that Inspire built`, 409);
  return id;
}

function jobOwnerProblem(got, { useCaseId, sessionId } = {}) {
  if (!got || !got.ok) return `Inspire cannot read this job: ${errorOf(got)}`;
  const tags = (dataOf(got).settings || {}).tags || {};
  if (str(tags.dbx_inspire_ai_run_type) !== 'implement') return 'the job is not an Inspire MVP job';
  if (str(tags.dbx_inspire_ai_session_id) !== str(sessionId)) return 'the job belongs to another Inspire session';
  if (tags.dbx_inspire_ai_usecase_id && str(tags.dbx_inspire_ai_usecase_id) !== str(useCaseId)) return 'the job belongs to another use case';
  return '';
}

function appOwnerProblem(got, ctx) {
  const status = I.appStatusFrom(got, ctx);
  return status && status.ok ? '' : (status ? status.error : 'Inspire cannot read the App');
}

function controlRequest(asset, action, id, { warehouseId } = {}) {
  const enc = encodeURIComponent(id);
  if (asset === 'app') return { method: 'POST', path: `/api/2.0/apps/${enc}/${action}`, body: {} };
  if (asset === 'job') return { method: 'POST', path: '/api/2.1/jobs/runs/cancel-all', body: { job_id: Number(id) } };
  if (asset === 'build') return { method: 'POST', path: '/api/2.1/jobs/runs/cancel', body: { run_id: Number(id) } };
  if (action === 'unpublish') return { method: 'DELETE', path: `/api/2.0/lakeview/dashboards/${enc}/published` };
  if (!str(warehouseId)) throw I.badRequest('the MVP spec has no SQL warehouse to publish the dashboard on', 409);
  return { method: 'POST', path: `/api/2.0/lakeview/dashboards/${enc}/published`, body: { warehouse_id: str(warehouseId), embed_credentials: false } };
}

function ownerCheckPath(asset, id) {
  if (asset === 'app') return `/api/2.0/apps/${encodeURIComponent(id)}`;
  if (asset === 'job') return `/api/2.1/jobs/get?job_id=${Number(id)}`;
  if (asset === 'build') return `/api/2.1/jobs/runs/get?run_id=${Number(id)}`;
  return `/api/2.0/lakeview/dashboards/${encodeURIComponent(id)}`;
}

function ownerProblem(asset, got, ctx) {
  if (asset === 'app') return appOwnerProblem(got, ctx);
  if (asset === 'job') return jobOwnerProblem(got, ctx);
  if (asset === 'build') {
    if (!got || !got.ok) return `Inspire cannot read the build run: ${errorOf(got)}`;
    return RUN_ENDED.includes(str((dataOf(got).state || {}).life_cycle_state)) ? 'the build already ended' : '';
  }
  if (!got || !got.ok) return `Inspire cannot read the dashboard: ${errorOf(got)}`;
  return str(dataOf(got).lifecycle_state) === 'TRASHED' ? 'the dashboard is in the trash' : '';
}

function liveStatus(targets, got, ctx) {
  const out = {};
  if (targets.app) out.app = I.appStatusFrom(got.app, ctx);
  if (targets.job) {
    const problem = jobOwnerProblem(got.job, ctx);
    const schedule = (dataOf(got.job).settings || {}).schedule || null;
    const runs = Array.isArray(dataOf(got.runs).runs) ? dataOf(got.runs).runs : [];
    out.job = problem ? { ok: false, error: problem } : {
      ok: true,
      job_id: targets.job,
      schedule: schedule ? { cron: str(schedule.quartz_cron_expression), timezone: str(schedule.timezone_id), paused: str(schedule.pause_status) === 'PAUSED' } : null,
      active_runs: got.runs && got.runs.ok ? runs.map((r) => ({ run_id: r.run_id, state: str((r.state || {}).life_cycle_state), url: str(r.run_page_url) })) : null,
      runs_error: got.runs && !got.runs.ok ? errorOf(got.runs) : '',
    };
  }
  if (targets.dashboard) {
    const d = dataOf(got.dashboard);
    out.dashboard = !got.dashboard || !got.dashboard.ok
      ? { ok: false, error: got.dashboard && got.dashboard.status === 404 ? 'the dashboard no longer exists' : `Inspire cannot read the dashboard: ${errorOf(got.dashboard)}` }
      : { ok: true, name: str(d.display_name), trashed: str(d.lifecycle_state) === 'TRASHED', published: Boolean(got.published && got.published.ok),
          published_at: got.published && got.published.ok ? str(dataOf(got.published).revision_create_time) : '',
          embedded: Boolean(got.published && got.published.ok && dataOf(got.published).embed_credentials === true) };
  }
  if (targets.genie_space) {
    out.genie_space = got.genie_space && got.genie_space.ok
      ? { ok: true, title: str(dataOf(got.genie_space).title) }
      : { ok: false, error: got.genie_space && got.genie_space.status === 404 ? 'the Genie Agent no longer exists' : `Inspire cannot read the Genie Agent: ${errorOf(got.genie_space)}` };
  }
  if (targets.alert) {
    const a = dataOf(got.alert);
    out.alert = got.alert && got.alert.ok
      ? { ok: true, name: str(a.display_name), state: str((a.evaluation || {}).state || a.state), checked_at: str((a.evaluation || {}).last_evaluated_at),
        trashed: str(a.lifecycle_state) === 'TRASHED' }
      : { ok: false, error: got.alert && got.alert.status === 404 ? 'the alert no longer exists' : `Inspire cannot read the alert: ${errorOf(got.alert)}` };
  }
  return out;
}

function livePaths(targets) {
  const paths = {};
  if (targets.app) paths.app = `/api/2.0/apps/${encodeURIComponent(targets.app)}`;
  if (targets.job) {
    paths.job = `/api/2.1/jobs/get?job_id=${Number(targets.job)}`;
    paths.runs = `/api/2.1/jobs/runs/list?job_id=${Number(targets.job)}&active_only=true&limit=5`;
  }
  if (targets.dashboard) {
    paths.dashboard = `/api/2.0/lakeview/dashboards/${encodeURIComponent(targets.dashboard)}`;
    paths.published = `/api/2.0/lakeview/dashboards/${encodeURIComponent(targets.dashboard)}/published`;
  }
  if (targets.genie_space) paths.genie_space = `/api/2.0/genie/spaces/${encodeURIComponent(targets.genie_space)}`;
  if (targets.alert) paths.alert = `/api/2.0/alerts/${encodeURIComponent(targets.alert)}`;
  return paths;
}

function createLiveCache(ttlMs = CONTROL_CACHE_MS, now = () => Date.now()) {
  const entries = new Map();
  return {
    async get(key, load) {
      const hit = entries.get(key);
      if (hit && hit.value && now() - hit.at < ttlMs) return { ...hit.value, cached: true };
      const pending = hit && hit.pending;
      if (pending) return pending;
      const token = {};
      const promise = load().then((value) => {
        if ((entries.get(key) || {}).token === token) entries.set(key, { at: now(), value });
        return { ...value, cached: false };
      }, (err) => {
        if ((entries.get(key) || {}).token === token) entries.delete(key);
        throw err;
      });
      entries.set(key, { ...(hit || { at: 0 }), pending: promise, token });
      return promise;
    },
    forget(key) {
      entries.delete(key);
    },
  };
}

function controlLogTableName(catalog, schema) {
  return `\`${catalog}\`.\`${schema}\`.\`${CONTROL_LOG_TABLE}\``;
}

function controlLogCreateSql(table) {
  const columns = CONTROL_LOG_COLUMNS.map(([name, kind]) => `\`${name}\` ${kind}`).join(', ');
  return `CREATE TABLE IF NOT EXISTS ${table} (${columns}) USING DELTA CLUSTER BY (\`session_id\`, \`use_case_id\`) `
    + "COMMENT 'Start Use Case MVP with Genie control tower: one row per Stop, Start, Publish, Unpublish or Stop-the-run click in the Inspire App'";
}

function controlLogInsert(table, { sessionId, useCaseId, asset, assetId, action, result, message, actedBy }) {
  return {
    sql: `INSERT INTO ${table} (session_id, use_case_id, asset, asset_id, action, result, message, acted_by, acted_at) `
      + 'VALUES (:sid, :uc, :asset, :id, :action, :result, :message, :by, current_timestamp())',
    parameters: [
      { name: 'sid', value: String(sessionId), type: 'BIGINT' },
      { name: 'uc', value: str(useCaseId), type: 'STRING' },
      { name: 'asset', value: str(asset), type: 'STRING' },
      { name: 'id', value: str(assetId).slice(0, 255), type: 'STRING' },
      { name: 'action', value: str(action), type: 'STRING' },
      { name: 'result', value: str(result), type: 'STRING' },
      { name: 'message', value: str(message).slice(0, 2000), type: 'STRING' },
      { name: 'by', value: str(actedBy).slice(0, 320), type: 'STRING' },
    ],
  };
}

function controlLogSelect(table, { sessionId, useCaseId, limit = 50 }) {
  return {
    sql: `SELECT l.asset, l.asset_id, l.action, l.result, l.message, l.acted_by, date_format(l.acted_at, 'yyyy-MM-dd\\'T\\'HH:mm:ss.SSSXXX') AS acted_at FROM ${table} AS l `
      + `WHERE l.session_id = :sid AND l.use_case_id = :uc ORDER BY l.acted_at DESC LIMIT ${Math.max(1, Math.min(200, Number(limit) || 50))}`,
    parameters: [
      { name: 'sid', value: String(sessionId), type: 'BIGINT' },
      { name: 'uc', value: str(useCaseId), type: 'STRING' },
    ],
  };
}

function controlLogOwnerSql(catalog, schema) {
  return {
    sql: `SELECT table_name, table_owner FROM \`${catalog}\`.information_schema.tables WHERE table_schema = lower(:schema) `
      + `AND table_name IN ('${I.IMPLEMENT_TABLE}', '${CONTROL_LOG_TABLE}')`,
    parameters: [{ name: 'schema', value: str(schema), type: 'STRING' }],
  };
}

function controlLogOwnerFix(rows, logTable) {
  const owners = {};
  for (const row of rows || []) owners[str(row.table_name).toLowerCase()] = str(row.table_owner);
  const want = owners[I.IMPLEMENT_TABLE];
  const have = owners[CONTROL_LOG_TABLE];
  if (!want || !have || want === have || want.includes('`')) return '';
  return `ALTER TABLE ${logTable} OWNER TO \`${want}\``;
}

function lakebaseOffer(got, backends) {
  if (!(backends || []).includes(LAKEBASE_KIND)) return { state: 'absent', detail: 'the App in this Inspire version reads only Delta tables' };
  if (got && got.ok) return { state: 'available', detail: '' };
  const code = str(dataOf(got).error_code).toUpperCase();
  if (got && (got.status === 404 || got.status === 501 || LAKEBASE_ABSENT_CODES.includes(code))) {
    return { state: 'absent', detail: 'this workspace does not have Lakebase' };
  }
  if (got && got.status === 403) return { state: 'denied', detail: errorOf(got) };
  return { state: 'unknown', detail: errorOf(got) };
}

module.exports = {
  CONTROL_ACTIONS,
  CONTROL_CACHE_MS,
  CONTROL_LOG_TABLE,
  controlAction,
  controlLogCreateSql,
  controlLogInsert,
  controlLogOwnerFix,
  controlLogOwnerSql,
  controlLogSelect,
  controlLogTableName,
  controlPhrase,
  controlRequest,
  controlTarget,
  controlTargets,
  createLiveCache,
  jobOwnerProblem,
  LAKEBASE_PROBE_PATH,
  lakebaseOffer,
  livePaths,
  liveStatus,
  ownerCheckPath,
  ownerProblem,
};
