const express = require('express');
const { registerImplementRoutes } = require('../../implementRoutes');
const { IMPLEMENT_COLUMNS } = require('../../lib/inspireImplement');

function sqlResultToObjects(result) {
  return result.rows || [];
}

function makeApp(overrides = {}, { mount } = {}) {
  const sqlCalls = [];
  const fetches = [];
  const jobs = [];
  const altered = [];
  const flagged = [];
  const state = {
    implementColumns: IMPLEMENT_COLUMNS.map(([name]) => name),
    alertsOk: true,
    destinations: { results: [] },
    destinationsStatus: 200,
    session: { business_name: 'Acme', discovery_type: 'Deep', catalogs: 'main', schemas_str: 's', tables_str: 'main.s.orders', generation_path: '/tmp/out', inspire_database_name: 'main.inspire' },
    useCase: { id: 'N01-U01', use_case: 'Predict churn', genie_instruction: '## Parameters\n| top_k | text | 25 | Top K |\n' },
    history: [],
    columns: [{ column_name: 'order_id', data_type: 'STRING', ordinal_position: 1 }],
    warehouses: { warehouses: [{ id: 'wh1', name: 'SQL' }] },
    appsOk: true,
    spacesOk: true,
    appExists: false,
    app: {},
    appsList: {},
    access: [
      { level: 'catalog', privilege: 'OWNER', principal: 'admins', mine: 'false', me: 'amr@x' },
      { level: 'catalog', privilege: 'USE_CATALOG', principal: 'account users', mine: 'true', me: 'amr@x' },
      { level: 'schema', privilege: 'OWNER', principal: 'amr@x', mine: 'true', me: 'amr@x' },
    ],
    others: 0,
    me: { userName: 'amr@x', displayName: 'Amr' },
    warehousePermissions: { access_control_list: [{ user_name: 'amr@x', all_permissions: [{ permission_level: 'CAN_MANAGE' }] }] },
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  if (mount) mount(app);
  app.use('/api/inspire/implement', async (req, _res, next) => { await (state.hold || {})[req.path]; next(); });
  registerImplementRoutes(app, {
    requireToken: (req, _res, next) => { req.dbHost = 'https://workspace.example.com'; req.dbToken = 'tok'; next(); },
    executeSql: async (_h, _t, _w, sql, parameters) => {
      sqlCalls.push({ sql, parameters });
      for (const [needle, message] of Object.entries(state.sqlErrors || {})) if (sql.includes(needle)) throw new Error(message);
      if (sql.startsWith('SELECT table_name, table_owner FROM')) return { rows: state.tableOwners || [] };
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.startsWith('SELECT') && sql.includes('__inspire_control_log')) {
        if (state.controlLogError) throw new Error(state.controlLogError);
        return { rows: state.controlLog || [] };
      }
      if (sql.startsWith('DESCRIBE TABLE') && sql.includes('__inspire_implement')) {
        return { rows: [...state.implementColumns.map((col_name) => ({ col_name, data_type: 'string' })),
          { col_name: '', data_type: '' }, { col_name: '# Clustering Information', data_type: '' }, { col_name: 'session_id', data_type: '' }] };
      }
      if (sql.includes('__inspire_implement') && sql.includes('INSERT')) return { rows: [] };
      if (sql.includes('__inspire_implement') && sql.includes('`app_name` IS NOT NULL')) return { rows: state.registry || [] };
      if (sql.includes('__inspire_implement') && sql.includes('UPDATE')) return { rows: [] };
      if (sql.includes('__inspire_implement') && sql.includes('held AS')) {
        if (state.holderError) throw new Error(state.holderError);
        const holders = state.resultTableHolders || [];
        if (Array.isArray(holders)) return { rows: holders };
        return { rows: holders[((parameters || []).find((p) => p.name === 't') || {}).value] || [] };
      }
      if (sql.includes('__inspire_implement')) {
        const unknown = IMPLEMENT_COLUMNS.map(([name]) => name)
          .find((name) => !state.implementColumns.includes(name) && sql.includes(`\`${name}\``) && !sql.includes(`NULL AS \`${name}\``));
        if (unknown) throw new Error(`[UNRESOLVED_COLUMN.WITH_SUGGESTION] A column, variable, or function parameter with name \`${unknown}\` cannot be resolved.`);
        return { rows: state.history };
      }
      if (sql.includes('u.business_domain AS domain')) return { rows: state.useCaseScope || [] };
      if (sql.includes('__inspire_usecases')) return { rows: state.useCase ? [state.useCase] : [] };
      if (sql.includes('_summary` WHERE use_case_id = :uc')) return { rows: state.moneySummary || [] };
      if (sql.includes('_assumptions` WHERE use_case_id = :uc')) return { rows: state.moneyEdits || [] };
      if (sql.includes('system.information_schema.catalogs')) {
        if (state.accessError) throw new Error(state.accessError);
        const asked = ((parameters || []).find((p) => p.name === 's') || {}).value;
        return { rows: (state.accessBySchema || {})[asked] || state.access };
      }
      if (sql.includes('COUNT_IF(use_case_id')) return { rows: [{ others: String(state.others) }] };
      if (sql.includes('information_schema.columns') && sql.includes('WITH o AS')) return { rows: state.swapRows || [] };
      if (sql.includes('information_schema.columns')) return { rows: state.columns };
      if (sql.includes('__inspire_step')) {
        const since = (parameters || []).find((p) => p.name === 'since');
        const steps = state.steps || [];
        return { rows: since ? steps.filter((s) => Date.parse(s.last_updated) > Date.parse(since.value)) : steps };
      }
      if (sql.startsWith('SELECT COUNT(*) AS row_count')) return { rows: state.readinessRows || [{ row_count: '1200' }] };
      for (const [table, message] of Object.entries(state.probeErrors || {})) {
        if (sql === `SELECT * FROM ${table} LIMIT 0`) throw new Error(message);
      }
      return { rows: [] };
    },
    executeSqlWithDeltaRetry: async (_h, _t, _w, sql, options) => {
      sqlCalls.push({ sql, parameters: options && options.parameters });
      return { rows: [] };
    },
    sqlResultToObjects,
    dbFetch: async (_host, _token, path, opts = {}) => {
      fetches.push({ path, opts });
      const routed = `${String(opts.method || 'GET').toUpperCase()} ${path.split('?')[0]}`;
      if (state.fetchThrows && Object.prototype.hasOwnProperty.call(state.fetchThrows, routed)) throw new Error(state.fetchThrows[routed]);
      if (state.responses && Object.prototype.hasOwnProperty.call(state.responses, routed)) {
        const [data, status = 200] = state.responses[routed];
        return json(data, status);
      }
      if (path.includes('/scim/v2/Me')) return json(state.me);
      if (path.startsWith('/api/2.0/permissions/sql/warehouses/')) {
        return json(state.warehousePermissions, state.warehousePermissionsStatus || 200);
      }
      if (path.includes('/sql/warehouses')) return json(state.warehouses);
      if (path.match(/\/api\/2\.0\/apps\/.+/) && !path.includes('page_size') && state.appsByName) {
        const found = state.appsByName[decodeURIComponent(path.split('/').pop())];
        return json(found || { error_code: 'NOT_FOUND' }, found ? 200 : 404);
      }
      if (path.match(/\/api\/2\.0\/apps\/.+/ ) && !path.includes('page_size')) return json(state.app, state.appExists ? 200 : 404);
      if (path.includes('/api/2.0/apps')) return json(state.appsList, state.appsOk ? 200 : 404);
      if (path.includes('/genie/spaces')) return json({}, state.spacesOk ? 200 : 404);
      if (path.startsWith('/api/2.0/lakeview/dashboards/') && path.endsWith('/published')) return json({}, state.dashboardPublished === false ? 404 : 200);
      if (path.startsWith('/api/2.0/lakeview/dashboards/')) return json({ display_name: 'Dashboard', lifecycle_state: 'ACTIVE' });
      if (path.startsWith('/api/2.0/alerts')) return json({}, state.alertsOk ? 200 : 403);
      if (path.startsWith('/api/2.0/notification-destinations')) {
        const pages = Array.isArray(state.destinations) ? state.destinations : [state.destinations];
        const token = new URL(`https://x${path}`).searchParams.get('page_token');
        return json(pages[token ? Number(token) : 0], state.destinationsStatus);
      }
      if (path === '/api/2.1/jobs/run-now') return json({ run_id: 501 });
      if (path.startsWith('/api/2.1/jobs/runs/get')) {
        return json(state.implementRun || { run_id: 99, state: { life_cycle_state: 'RUNNING' } }, state.implementRunStatus || 200);
      }
      if (path.startsWith('/api/2.1/jobs/list')) return json(state.jobsList || { jobs: [] }, state.jobsListStatus || 200);
      if (path.startsWith('/api/2.1/jobs/runs/list')) {
        const jobId = new URL(`https://x${path}`).searchParams.get('job_id');
        return json((state.runsByJob && state.runsByJob[jobId]) || state.runs || { runs: [] }, state.runsStatus || 200);
      }
      if (path.startsWith('/api/2.1/jobs/get')) return json(state.job || { job_id: 77 }, state.jobStatus || 200);
      if (path.includes('/serving-endpoints')) return json({ endpoints: [{ name: 'databricks-meta-llama-3-3-70b-instruct' }] });
      if (path.includes('/fs/files') && state.liveLogs) {
        const log = state.liveLogs[path.split('/').pop()];
        if (log instanceof Error) return { ok: true, status: 200, text: async () => { throw log; } };
        return log === undefined ? json('raw', 404) : json(log);
      }
      if (path.includes('/fs/files')) return state.liveLog === undefined ? json('raw', 404) : json(state.liveLog);
      return json({ message: 'not mocked ' + path }, 500);
    },
    fetchInspireSessionWidgetRow: async () => state.session,
    notebookParamsFromSessionForGenerateRun: (session, sid) => ({
      '15_operation': 'Generate Use Cases',
      '00_business_name': session.business_name,
      '01_uc_metadata': state.ucMetadata === undefined ? 'main.s.orders' : state.ucMetadata,
      '02_inspire_database': 'main.inspire',
      '14_session_id': sid,
    }),
    triggerInspireNotebookJob: async (_h, _t, args) => {
      jobs.push(args);
      if (state.triggerError) throw new Error(state.triggerError);
      if (state.afterTrigger) state.afterTrigger(args);
      return { run_id: 99, job_id: 7, notebook_path: '/Shared/nb', job_run_url: 'https://example/#job/7/run/99' };
    },
    splitInspireDatabase: (v) => {
      const parts = String(v || '').split('.');
      return parts.length === 2 ? { catalog: parts[0], schema: parts[1] } : null;
    },
    databricksJobRunUrl: (_h, jobId, runId) => `https://example/#job/${jobId}/run/${runId}`,
    ensureTableColumns: async (_h, _t, _w, table, columns) => {
      altered.push({ table, columns });
      for (const [name] of columns) if (!state.implementColumns.includes(name)) state.implementColumns.push(name);
    },
    runRoute1GenieFlagUpdates: async (_h, _t, warehouseId, catalog, schema, sid, ids) => {
      flagged.push({ warehouseId, catalog, schema, sid, ids });
    },
  });
  app.get('/api/inspire/results', (_req, res) => res.json({ results: state.results || null }));
  app.get('/api/inspire/sessions', (_req, res) => {
    if (state.sessionsErrors?.length) return res.status(500).json({ error: state.sessionsErrors.shift() });
    return res.json({
      sessions: state.sessions || [{ session_id: '42', completed_percent: 100, business_name: state.session.business_name, widget_values: { business: state.session.business_name } }],
    });
  });
  app.get('/api/inspire/step-results', (_req, res) => res.json({ results: null }));
  app.get('/api/catalogs', (_req, res) => {
    if (state.catalogsError) return res.status(500).json({ error: state.catalogsError });
    return res.json({ catalogs: (state.catalogs || ['main']).map((name) => ({ name })) });
  });
  app.get('/api/catalogs/:catalog/schemas', (req, res) => {
    const names = (state.schemas || { main: ['inspire', 's'] })[req.params.catalog] || [];
    return res.json({ schemas: names.map((name) => ({ name, full_name: `${req.params.catalog}.${name}` })) });
  });
  app.get('/api/inspire/feedback', (_req, res) => res.json({ available: false, latest: [], message: '' }));
  app.get('/api/workspace/list', (_req, res) => res.json({ files: [] }));
  app.get('/api/inspire/usecases', (_req, res) => {
    const usecases = state.useCases || (state.useCase ? [state.useCase] : []);
    res.json({ usecases, count: usecases.length });
  });
  return { app, sqlCalls, fetches, jobs, state, altered, flagged };
}

function json(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
  };
}

async function listen(app) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

module.exports = { makeApp, json, listen, sqlResultToObjects };
