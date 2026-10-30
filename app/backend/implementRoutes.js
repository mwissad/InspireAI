const { isMissingTableError } = require('./lib/inspireFeedback');
const { stepsStatement } = require('./lib/sqlInputs');
const I = require('./lib/inspireImplement');
const { createGenieJobGuard } = require('./lib/genieJobGuard');
const { genieNotebookJobName, latestGenieNotebookRun } = require('./lib/genieNotebookJob');
const C = require('./lib/implementControl');
const { appShellCatalog } = require('./lib/appShell');
const { moneyStatements, moneyView } = require('./lib/implementMoney');

function sendError(res, err) {
  const code = err && Number.isFinite(err.statusCode) ? err.statusCode : 500;
  return res.status(code).json({ ...(err && err.details), error: err.message || String(err) });
}

function q(req, key) {
  const v = req.query[key] ?? req.body?.[key];
  return v == null ? '' : String(v).trim();
}

function principalsOf(req) {
  const raw = q(req, 'principals');
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw I.badRequest('principals must be a JSON list of principal names');
  }
  if (!Array.isArray(parsed)) throw I.badRequest('principals must be a JSON list of principal names');
  return parsed.map((p) => String(p == null ? '' : p).trim()).filter(Boolean).slice(0, 100);
}

function sessionIdOf(req) {
  const sid = q(req, 'session_id');
  if (!/^\d+$/.test(sid)) {
    const err = new Error('session_id must be a numeric Inspire session id.');
    err.statusCode = 400;
    throw err;
  }
  return sid;
}

function warehouseOf(req) {
  const warehouseId = q(req, 'warehouse_id');
  if (!warehouseId) {
    const err = new Error('warehouse_id is required.');
    err.statusCode = 400;
    throw err;
  }
  return warehouseId;
}

function dbOf(req, splitInspireDatabase) {
  const inspire_database = q(req, 'inspire_database');
  const parsed = splitInspireDatabase(inspire_database);
  if (!parsed) {
    const err = new Error(inspire_database ? 'inspire_database must be exactly catalog.schema (one dot).' : I.IMPLEMENT_NOT_AVAILABLE);
    err.statusCode = 400;
    throw err;
  }
  return { inspire_database: inspire_database.trim(), ...parsed };
}

async function rowsOf(executeSql, sqlResultToObjects, host, token, warehouseId, statement) {
  const result = await executeSql(host, token, warehouseId, statement.sql, statement.parameters);
  return sqlResultToObjects(result);
}

async function jsonOf(dbFetch, host, token, path, opts = {}) {
  const resp = await dbFetch(host, token, path, opts);
  const text = await resp.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return { ok: resp.ok, status: resp.status, data };
}

function identityOf(req, me) {
  const forwarded = String(req.headers['x-forwarded-email'] || '').trim();
  return String(me?.userName || me?.emails?.[0]?.value || forwarded || '').trim();
}

function requesterOf(req, me) {
  return String(req.headers['x-forwarded-email'] || '').trim() || identityOf(req, me);
}

function registerImplementRoutes(app, deps) {
  const {
    requireToken,
    executeSql,
    executeSqlWithDeltaRetry,
    sqlResultToObjects,
    dbFetch,
    fetchInspireSessionWidgetRow,
    notebookParamsFromSessionForGenerateRun,
    triggerInspireNotebookJob,
    splitInspireDatabase,
    databricksJobRunUrl,
    ensureTableColumns,
    runRoute1GenieFlagUpdates,
  } = deps;

  const sqlRows = (host, token, warehouseId, statement) =>
    rowsOf(executeSql, sqlResultToObjects, host, token, warehouseId, statement);
  const liveCache = C.createLiveCache();
  const fetchJsonFor = (req) => (path) => jsonOf(dbFetch, req.dbHost, req.dbToken, path);

  async function loadMe(req) {
    const got = await jsonOf(dbFetch, req.dbHost, req.dbToken, '/api/2.0/preview/scim/v2/Me');
    return got.ok ? got.data : {};
  }

  async function implementColumnsOf(host, token, warehouseId, table) {
    return I.describedColumnNames(await sqlRows(host, token, warehouseId, { sql: `DESCRIBE TABLE ${table}`, parameters: null }));
  }

  async function ensureImplementTable(host, token, warehouseId, table) {
    await executeSql(host, token, warehouseId, I.implementTableCreateSql(table));
    const missing = I.implementMissingColumns(await implementColumnsOf(host, token, warehouseId, table));
    if (missing.length) await ensureTableColumns(host, token, warehouseId, table, missing);
  }

  async function implementRows(host, token, warehouseId, table, statementFor) {
    try {
      let rows;
      try {
        rows = await sqlRows(host, token, warehouseId, statementFor(null));
      } catch (err) {
        if (!I.isMissingColumnError(err)) throw err;
        rows = await sqlRows(host, token, warehouseId, statementFor(await implementColumnsOf(host, token, warehouseId, table)));
      }
      return rows.map(I.parseImplementRow);
    } catch (err) {
      if (isMissingTableError(err)) return [];
      throw err;
    }
  }

  async function loadHistory(host, token, warehouseId, catalog, schema, sid, useCaseId) {
    const table = I.implementTableName(catalog, schema);
    return implementRows(host, token, warehouseId, table, (existing) => I.implementHistoryStatement(table, sid, useCaseId || null, existing));
  }

  async function loadMergeTargets(req, warehouseId, catalog, schema, sid, useCaseId, only = null) {
    const table = I.implementTableName(catalog, schema);
    const rows = await implementRows(req.dbHost, req.dbToken, warehouseId, table, (existing) => I.implementRegistryStatement(table, existing));
    const registry = I.mergeRegistry(rows, { sessionId: sid, useCaseId, only });
    const targets = {};
    await Promise.all(I.IMPLEMENT_MERGE_OUTPUTS.map(async (name) => {
      const got = await Promise.all(registry[name].map((entry) => jsonOf(dbFetch, req.dbHost, req.dbToken, I.mergeTargetPath(name, entry.id))));
      targets[name] = registry[name].map((entry, i) => I.mergeTarget(name, entry, got[i], req.dbHost)).filter(Boolean);
    }));
    return targets;
  }

  async function loadUseCase(host, token, warehouseId, catalog, schema, sid, useCaseId) {
    const table = `\`${catalog}\`.\`${schema}\`.\`__inspire_usecases\``;
    const rows = await sqlRows(host, token, warehouseId, I.useCaseRowStatement(table, sid, useCaseId));
    return rows[0] || null;
  }

  async function loadSession(host, token, warehouseId, catalog, schema, sid) {
    const session = await fetchInspireSessionWidgetRow(host, token, warehouseId, catalog, schema, sid);
    if (!session) {
      const err = new Error(`No __inspire_session row for session_id=${sid}.`);
      err.statusCode = 404;
      throw err;
    }
    return session;
  }

  async function loadFeatures(req) {
    const [apps, spaces, alerts] = await Promise.all([
      jsonOf(dbFetch, req.dbHost, req.dbToken, '/api/2.0/apps?page_size=1'),
      jsonOf(dbFetch, req.dbHost, req.dbToken, '/api/2.0/genie/spaces?page_size=1'),
      jsonOf(dbFetch, req.dbHost, req.dbToken, '/api/2.0/alerts?page_size=1'),
    ]);
    return { apps: apps.ok, genie_spaces: spaces.ok, alerts: alerts.ok };
  }

  async function appWarehouseCheck(req, warehouseId, identity, warehouseName) {
    const [permissions, me, warehouse] = await Promise.all([
      jsonOf(dbFetch, req.dbHost, req.dbToken, `/api/2.0/permissions/sql/warehouses/${encodeURIComponent(warehouseId)}`),
      loadMe(req),
      warehouseName ? null : jsonOf(dbFetch, req.dbHost, req.dbToken, `/api/2.0/sql/warehouses/${encodeURIComponent(warehouseId)}`),
    ]);
    const identities = [identity, me.userName, me.applicationId, ...(me.emails || []).map((e) => e && e.value)];
    const groups = (me.groups || []).map((g) => g && (g.display || g.value));
    const name = warehouseName || (warehouse && warehouse.ok && warehouse.data.name) || warehouseId;
    return I.warehouseManageCheck(permissions, identities, groups, name);
  }

  async function loadResultTableHolder(req, warehouseId, catalog, schema, table) {
    const rows = await sqlRows(req.dbHost, req.dbToken, warehouseId, I.resultTableHolderStatement(I.implementTableName(catalog, schema), table))
      .catch((err) => { if (isMissingTableError(err)) return []; throw err; });
    return rows[0] || null;
  }

  async function movedResultTable(req, warehouseId, useCaseId, table, history = null) {
    const { inspire_database, catalog, schema } = dbOf(req, splitInspireDatabase);
    if (!I.sameTable(table, I.sharedDefaultResultTable(inspire_database, useCaseId))) return null;
    const sid = sessionIdOf(req);
    const rows = history || await loadHistory(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid, useCaseId);
    if (!I.carriesSharedDefault(table, rows, inspire_database, useCaseId)) return null;
    const holder = await loadResultTableHolder(req, warehouseId, catalog, schema, table);
    return I.resultTableMove(table, holder, { inspireDatabase: inspire_database, sessionId: sid, useCaseId, history: rows });
  }

  async function checkOutput(req, warehouseId, table, useCaseId, options = {}) {
    const { catalog, schema } = dbOf(req, splitInspireDatabase);
    const statement = I.outputAccessStatement(table);
    const asked = q(req, 'model_name');
    if (asked && I.resultTableNameError(asked, 'model_name')) throw I.badRequest(I.resultTableNameError(asked, 'model_name'));
    const modelName = asked || I.defaultModelName(table);
    const elsewhere = !I.sameSchema(modelName, table);
    const sid = sessionIdOf(req);
    const [rows, useCase, modelRows, holder] = await Promise.all([
      sqlRows(req.dbHost, req.dbToken, warehouseId, statement),
      loadUseCase(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid, useCaseId),
      elsewhere ? sqlRows(req.dbHost, req.dbToken, warehouseId, I.outputAccessStatement(modelName)) : null,
      loadResultTableHolder(req, warehouseId, catalog, schema, table),
    ]);
    const access = I.outputAccess(rows, table);
    const model = I.trainsModel(useCase) ? I.modelAccess(elsewhere ? modelRows : rows, modelName) : null;
    const warehouse = await appWarehouseCheck(req, warehouseId, access.identity, options.warehouseName);
    const warnings = [...I.shareWarnings(table, rows, options.principals),
      ...I.shareWarehouseWarnings(warehouse, options.principals, options.viewed, options.warehouseName)];
    if (warnings.length) access.grant = { ...access.grant, warn: warnings.join(' ') };
    access.app = I.appAccessCheck(access.app, warehouse);
    let safety = { ok: true, detail: access.exists ? `${access.table} holds only this use case's rows` : `${access.table} is new; the first run creates it` };
    const held = I.resultTableHolderProblem(table, holder, sid, useCaseId);
    if (held) safety = { ok: false, detail: held };
    else if (access.exists && access.write.ok) {
      const columns = await sqlRows(req.dbHost, req.dbToken, warehouseId, I.columnsStatement(table));
      let problem = I.resultTableProblem(access.table, columns, 0);
      if (!problem && columns.length) {
        const counted = await sqlRows(req.dbHost, req.dbToken, warehouseId, I.otherUseCaseRowsStatement(table, useCaseId));
        problem = I.resultTableProblem(access.table, columns, counted[0] && counted[0].others);
      }
      if (problem) safety = { ok: false, detail: problem };
      else if (!columns.length) {
        safety = { ok: true, detail: `${access.table} exists but its columns could not be read, so Inspire could not check whose rows it holds` };
      }
    }
    return { ...access, safety, ...(model ? { model } : {}), ok: access.write.ok && safety.ok && (!model || model.ok) };
  }

  async function countApps(req, limit) {
    let count = 0;
    let pageToken = '';
    for (let page = 0; page < 10 && count <= limit; page += 1) {
      const got = await jsonOf(dbFetch, req.dbHost, req.dbToken,
        `/api/2.0/apps?page_size=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''}`);
      if (!got.ok) return null;
      count += (got.data.apps || []).length;
      pageToken = String(got.data.next_page_token || '');
      if (!pageToken) break;
    }
    return count;
  }

  /**
   * Route 1: set generate_genie_code_instruction = 'Yes' for selected UC ids, then submit
   * notebook job with 15_operation = Generate Use Cases and 14_session_id = session.
   */
  const genieJobGuard = createGenieJobGuard();

  async function genieRunState(host, token, runId) {
    if (!runId) return null;
    const got = await jsonOf(dbFetch, host, token, `/api/2.1/jobs/runs/get?run_id=${encodeURIComponent(runId)}`);
    return got.ok ? got.data?.state?.life_cycle_state || null : null;
  }

  async function handleInspireGenerateGenie(req, res) {
    try {
      const {
        inspire_database,
        warehouse_id,
        session_id,
        use_case_ids: useCaseIdsRaw,
        cluster_id,
        notebook_path,
      } = req.body || {};

      if (!inspire_database || !warehouse_id) {
        return res.status(400).json({ error: 'inspire_database and warehouse_id are required.' });
      }
      const sidStr = String(session_id ?? '').trim();
      if (!/^\d+$/.test(sidStr)) {
        return res.status(400).json({ error: 'session_id must be a numeric Inspire session id.' });
      }

      const use_case_ids = Array.isArray(useCaseIdsRaw)
        ? useCaseIdsRaw.map((x) => String(x).trim()).filter(Boolean)
        : [];
      if (use_case_ids.length === 0) {
        return res.status(400).json({ error: 'use_case_ids must be a non-empty array of use case id strings.' });
      }
      if (use_case_ids.length > 50) {
        return res.status(400).json({ error: 'At most 50 use cases per Generate request.' });
      }

      const safeIds = use_case_ids.filter((id) => /^[a-zA-Z0-9_.\-]+$/.test(id));
      if (safeIds.length !== use_case_ids.length) {
        return res.status(400).json({
          error: 'Each use_case_id must match /^[a-zA-Z0-9_.\\-]+$/ (Inspire tracking table id / No).',
        });
      }

      const parsedDb = splitInspireDatabase(inspire_database);
      if (!parsedDb) {
        return res.status(400).json({ error: 'inspire_database must be exactly catalog.schema (one dot).' });
      }
      const { catalog, schema } = parsedDb;

      const session = await fetchInspireSessionWidgetRow(
        req.dbHost,
        req.dbToken,
        warehouse_id,
        catalog,
        schema,
        sidStr,
      );
      if (!session) {
        return res.status(404).json({ error: `No __inspire_session row for session_id=${sidStr}.` });
      }

      const params = notebookParamsFromSessionForGenerateRun(session, sidStr);
      if (!params['02_inspire_database']) {
        params['02_inspire_database'] = inspire_database.trim();
      }
      if (!params['01_uc_metadata']) {
        return res.status(400).json({
          error:
            'This session has no UC metadata (catalogs/schemas/tables or docs-only JSON path) stored on __inspire_session. Run Discover from this app first, or set metadata manually.',
        });
      }

      const lastRun = await latestGenieNotebookRun(fetchJsonFor(req), sidStr);
      if (lastRun?.state === 'running') {
        return res.status(409).json({
          error: 'A Genie Code notebook for this session is already being written. Wait for that run to finish, then try again.',
          run_id: lastRun.run_id,
          job_run_url: lastRun.url || databricksJobRunUrl(req.dbHost, lastRun.job_id, lastRun.run_id),
        });
      }
      const claim = await genieJobGuard.claim(sidStr, (runId) => genieRunState(req.dbHost, req.dbToken, runId));
      if (!claim.ok) {
        return res.status(409).json({
          error: 'Genie instructions for this session are already being generated. Wait for that run to finish, then try again.',
          run_id: claim.entry?.run_id || null,
          job_run_url: claim.entry?.job_run_url || null,
        });
      }
      let out;
      try {
        await runRoute1GenieFlagUpdates(
          req.dbHost,
          req.dbToken,
          warehouse_id,
          catalog,
          schema,
          sidStr,
          safeIds,
        );

        out = await triggerInspireNotebookJob(req.dbHost, req.dbToken, {
          params,
          notebook_path,
          cluster_id,
          jobType: 'genie_regen',
          jobName: genieNotebookJobName(sidStr),
          useCaseIds: safeIds,
        });
      } catch (launchErr) {
        genieJobGuard.failed(sidStr);
        throw launchErr;
      }
      genieJobGuard.launched(sidStr, out);

      console.log(`   🧞 Generate Genie: session=${sidStr}, flagged=${safeIds.length}, run_id=${out.run_id}`);
      res.json({
        ...out,
        session_id: sidStr,
        flagged_use_case_ids: safeIds,
      });
    } catch (err) {
      const code = err.statusCode && Number.isFinite(err.statusCode) ? err.statusCode : 500;
      res.status(code).json({ error: err.message });
    }
  }

  app.post('/api/inspire/generate-genie', requireToken, handleInspireGenerateGenie);
  app.post('/api/inspire/generate_genie', requireToken, handleInspireGenerateGenie);

  app.get('/api/inspire/implement/context', requireToken, async (req, res) => {
    try {
      const sid = sessionIdOf(req);
      const warehouseId = warehouseOf(req);
      const { catalog, schema } = dbOf(req, splitInspireDatabase);
      const useCaseId = I.validateUseCaseId(q(req, 'use_case_id'));
      const [session, useCase, history, me, features] = await Promise.all([
        loadSession(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid),
        loadUseCase(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid, useCaseId),
        loadHistory(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid, useCaseId),
        loadMe(req),
        loadFeatures(req),
      ]);
      if (!useCase) return res.status(404).json({ error: `No use case ${useCaseId} in this session.` });
      const latest = history[0] || null;
      const missing = await missingTables(req, warehouseId, I.checkedSourceTables(latest && latest.spec_json, I.useCaseTables(useCase)));
      const widgets = I.implementWidgets(history, useCase.genie_instruction || useCase.generate_genie_code_instruction || '');
      const assets = I.carriedAssets(history);
      const goneAssets = await goneMergeAssets(req, assets);
      const family = I.executionFamily(useCase.code_structure_mandate);
      res.json({
        session_id: sid,
        use_case: useCase,
        discovery_type: session.discovery_type || 'Standard',
        business_name: session.business_name || '',
        generation_path: session.generation_path || '',
        me: { username: requesterOf(req, me) },
        history,
        latest,
        assets,
        gone_assets: goneAssets,
        family,
        trains_model: I.trainsModel(useCase),
        evidence: I.parseEvidence(useCase.data_evidence),
        features,
        widgets: widgets.widgets,
        widget_source: widgets.source,
        widget_groups: I.groupWidgets(widgets.widgets),
        inspire_database: `${catalog}.${schema}`,
        missing_tables: missing,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/inspire/implement/history', requireToken, async (req, res) => {
    try {
      const sid = sessionIdOf(req);
      const warehouseId = warehouseOf(req);
      const { catalog, schema } = dbOf(req, splitInspireDatabase);
      const useCaseId = q(req, 'use_case_id');
      const history = await loadHistory(
        req.dbHost, req.dbToken, warehouseId, catalog, schema, sid, useCaseId ? I.validateUseCaseId(useCaseId) : null,
      );
      const latestByUc = {};
      for (const row of history) {
        if (!latestByUc[row.use_case_id]) latestByUc[row.use_case_id] = row;
      }
      const latest = Object.values(latestByUc);
      const [notebook] = await Promise.all([
        latestGenieNotebookRun(fetchJsonFor(req), sid).then((run) => ({ run, error: '' }), (err) => ({ run: null, error: err.message })),
        ...latest.map(async (row) => { row.stalled = await stalledOf(req, row); }),
      ]);
      res.json({ history, latest, notebook_run: notebook.run, notebook_run_error: notebook.error });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/inspire/implement/app-look', requireToken, (_req, res) => {
    const catalog = appShellCatalog();
    if (!catalog.ok) return res.status(503).json({ error: catalog.error });
    return res.json(catalog);
  });

  app.get('/api/inspire/implement/lakebase', requireToken, async (req, res) => {
    const catalog = appShellCatalog();
    if (!catalog.ok) return res.status(503).json({ error: catalog.error });
    let got;
    try {
      got = await fetchJsonFor(req)(C.LAKEBASE_PROBE_PATH);
    } catch (err) {
      got = { ok: false, status: 0, data: { message: err.message } };
    }
    return res.json(C.lakebaseOffer(got, catalog.backends));
  });

  app.get('/api/inspire/implement/merge-targets', requireToken, async (req, res) => {
    try {
      const sid = sessionIdOf(req);
      const warehouseId = warehouseOf(req);
      const { catalog, schema } = dbOf(req, splitInspireDatabase);
      const useCaseId = I.validateUseCaseId(q(req, 'use_case_id'));
      const targets = await loadMergeTargets(req, warehouseId, catalog, schema, sid, useCaseId);
      const sessions = I.scopeSessions(targets.app);
      const scope = sessions.length
        ? await sqlRows(req.dbHost, req.dbToken, warehouseId, I.useCaseScopeStatement(catalog, schema, sessions))
          .catch((err) => { if (isMissingTableError(err) || I.isMissingColumnError(err)) return []; throw err; })
        : [];
      res.json({ targets: { ...targets, app: I.withUseCaseScope(targets.app, scope) }, cap: I.IMPLEMENT_MERGE_TARGET_CAP });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/inspire/implement/columns', requireToken, async (req, res) => {
    try {
      const warehouseId = warehouseOf(req);
      const table = q(req, 'table');
      const rows = await sqlRows(req.dbHost, req.dbToken, warehouseId, I.columnsStatement(table));
      res.json({ table, columns: rows });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/inspire/implement/swaps', requireToken, async (req, res) => {
    try {
      const warehouseId = warehouseOf(req);
      const table = q(req, 'table');
      const required = Array.isArray(req.body?.required_columns) ? req.body.required_columns : [];
      const statement = I.tableSwapStatement(table, required);
      const rows = await sqlRows(req.dbHost, req.dbToken, warehouseId, statement);
      const catalog = statement.catalog;
      res.json({
        table,
        swaps: rows.map((r) => ({
          table: `${catalog}.${r.table_schema}.${r.table_name}`,
          matched: Number(r.matched) || 0,
          total: Number(r.total) || 0,
        })),
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/inspire/implement/values', requireToken, async (req, res) => {
    try {
      const warehouseId = warehouseOf(req);
      const statement = I.columnValuesStatement(q(req, 'table'), q(req, 'column'), q(req, 'limit') || 200);
      const rows = await sqlRows(req.dbHost, req.dbToken, warehouseId, statement);
      res.json({ values: rows.map((r) => r.value).filter((v) => v != null && v !== '') });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/inspire/implement/readiness', requireToken, async (req, res) => {
    try {
      const warehouseId = warehouseOf(req);
      const discovery = String(req.body?.discovery_type || '').trim() || 'Standard';
      if (discovery === 'Standard') {
        return res.json({ skipped: true, reason: 'metadata only, readiness checked at preview run', row_count: null, null_share: {} });
      }
      const statement = I.readinessStatement(q(req, 'table'), {
        columns: req.body?.columns || [],
        filters: req.body?.filters || [],
        window: req.body?.window || {},
      });
      const rows = await sqlRows(req.dbHost, req.dbToken, warehouseId, statement);
      res.json({ skipped: false, ...I.readinessFromRow(rows[0] || {}, statement.columns) });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/inspire/implement/serving-endpoints', requireToken, async (req, res) => {
    try {
      const got = await jsonOf(dbFetch, req.dbHost, req.dbToken, '/api/2.0/serving-endpoints');
      if (!got.ok) return res.status(got.status).json({ error: got.data.message || got.data.error || 'serving endpoints are not available' });
      const endpoints = (got.data.endpoints || []).map((e) => ({ name: e.name, state: e.state?.ready || e.state, task: e.task }));
      res.json({ endpoints });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/inspire/implement/principals', requireToken, async (req, res) => {
    try {
      const filter = q(req, 'q').slice(0, 80);
      if (filter.length < 2) return res.json({ principals: [] });
      const encoded = encodeURIComponent(`userName co "${filter}" or displayName co "${filter}"`);
      const groupEncoded = encodeURIComponent(`displayName co "${filter}"`);
      const [users, groups] = await Promise.all([
        jsonOf(dbFetch, req.dbHost, req.dbToken, `/api/2.0/preview/scim/v2/Users?filter=${encoded}&count=20`),
        jsonOf(dbFetch, req.dbHost, req.dbToken, `/api/2.0/preview/scim/v2/Groups?filter=${groupEncoded}&count=20`),
      ]);
      const principals = [];
      for (const u of users.data.Resources || []) {
        principals.push({ type: 'user', name: u.userName || u.displayName, display: u.displayName || u.userName });
      }
      for (const g of groups.data.Resources || []) {
        principals.push({ type: 'group', name: g.displayName, display: g.displayName });
      }
      res.json({ principals });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/inspire/implement/output-check', requireToken, async (req, res) => {
    try {
      const warehouseId = warehouseOf(req);
      const useCaseId = I.validateUseCaseId(q(req, 'use_case_id'));
      const moved = await movedResultTable(req, warehouseId, useCaseId, q(req, 'table'));
      const output = await checkOutput(req, warehouseId, moved ? moved.to : q(req, 'table'), useCaseId);
      res.json(moved ? { ...output, result_table_moved: moved } : output);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/inspire/implement/preflight', requireToken, async (req, res) => {
    try {
      const sid = sessionIdOf(req);
      const warehouseId = warehouseOf(req);
      const { catalog, schema } = dbOf(req, splitInspireDatabase);
      const useCaseId = I.validateUseCaseId(q(req, 'use_case_id'));
      const resultTable = q(req, 'result_table');
      const appName = q(req, 'app_name');
      const mergeApp = q(req, 'merge_app');
      const wantsAlert = q(req, 'alert') === '1';
      const wantsGenie = q(req, 'genie') === '1';
      const wantsDashboard = q(req, 'dashboard') !== '0';
      const shares = q(req, 'share') === '1';
      const principals = principalsOf(req);
      if (I.resultTableNameError(resultTable)) throw I.badRequest(I.resultTableNameError(resultTable));
      const [me, features, warehouses, existingApp] = await Promise.all([
        loadMe(req),
        loadFeatures(req),
        jsonOf(dbFetch, req.dbHost, req.dbToken, `/api/2.0/sql/warehouses/${encodeURIComponent(warehouseId)}`),
        appName ? jsonOf(dbFetch, req.dbHost, req.dbToken, `/api/2.0/apps/${encodeURIComponent(appName)}`) : null,
      ]);
      const warehouseName = warehouses.ok ? (warehouses.data.name || warehouseId) : warehouseId;
      let output = null;
      let outputError = '';
      let moved = null;
      try {
        const viewed = [wantsDashboard && 'the dashboard', wantsGenie && 'the Genie Agent'];
        moved = await movedResultTable(req, warehouseId, useCaseId, resultTable);
        output = await checkOutput(req, warehouseId, moved ? moved.to : resultTable, useCaseId, { principals, warehouseName, viewed });
      } catch (err) {
        outputError = err.message || String(err);
      }
      const outputDetail = output && (output.write.ok ? `${output.write.detail}; ${output.safety.detail}` : output.write.detail);
      const checks = {
        warehouse: output
          ? { ok: true, detail: `${warehouseName} ran the access check for you` }
          : { ok: false, detail: `${warehouseName} could not run a statement for you: ${outputError}` },
        output: output
          ? { ok: output.write.ok && output.safety.ok, detail: moved ? `${moved.detail}; ${outputDetail}` : outputDetail }
          : { ok: false, detail: 'not checked, because the warehouse could not run the access check' },
      };
      if (output && output.model) checks.model = output.model;
      if (shares) checks.result_grant = output ? output.grant : { ok: false, detail: 'not checked' };
      if (appName) {
        const name = I.appNameCheck(appName, existingApp && existingApp.ok ? existingApp.data : null, { useCaseId, sessionId: sid });
        checks.app_name = name;
        if (name.creates) checks.app_access = output ? output.app : { ok: false, detail: 'not checked, because the warehouse could not run the access check' };
        if (!features.apps) checks.apps = { ok: false, detail: 'this workspace cannot create Databricks Apps' };
        else {
          const limit = I.appsLimit(req.dbHost);
          const count = name.creates ? await countApps(req, limit) : 0;
          checks.apps = count == null
            ? { ok: false, detail: 'the Apps list is not available to you, so the App quota cannot be checked' }
            : I.appsQuotaCheck(count, limit, name.creates);
        }
      } else if (mergeApp) {
        checks.app_access = output ? output.app : { ok: false, detail: 'not checked, because the warehouse could not run the access check' };
      }
      if (wantsGenie) {
        checks.genie_spaces = { ok: features.genie_spaces, detail: features.genie_spaces ? 'you can create Genie Agents' : 'you cannot create Genie Agents in this workspace' };
      }
      if (wantsAlert) {
        checks.alerts = { ok: features.alerts, detail: features.alerts ? 'you can create SQL alerts' : 'you cannot create SQL alerts in this workspace' };
      }
      res.json({
        ok: Object.values(checks).every((c) => c.ok),
        identity: (output && output.identity) || identityOf(req, me),
        checks,
        features,
        ...(moved ? { result_table_moved: moved } : {}),
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/inspire/implement/destinations', requireToken, async (req, res) => {
    try {
      const destinations = [];
      let pageToken = '';
      for (let page = 0; page < 10; page += 1) {
        const got = await jsonOf(dbFetch, req.dbHost, req.dbToken,
          `/api/2.0/notification-destinations?page_size=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''}`);
        if (!got.ok) {
          return res.status(got.status).json({ error: got.data.message || got.data.error || 'notification destinations are not available' });
        }
        destinations.push(...I.destinationsFromList(got.data));
        pageToken = String(got.data.next_page_token || '');
        if (!pageToken) break;
      }
      res.json({ destinations });
    } catch (err) {
      sendError(res, err);
    }
  });

  async function goneMergeAssets(req, assets) {
    const names = I.IMPLEMENT_MERGE_OUTPUTS.filter((name) => assets[name]);
    const got = await Promise.all(names.map((name) => jsonOf(dbFetch, req.dbHost, req.dbToken, I.mergeTargetPath(name, assets[name])).catch(() => null)));
    return names.filter((_name, i) => got[i] && got[i].status === 404);
  }

  async function missingTables(req, warehouseId, tables) {
    const probes = await Promise.all(tables.map((table) => sqlRows(req.dbHost, req.dbToken, warehouseId, I.tableProbeStatement(table))
      .then(() => null)
      .catch((err) => {
        const reason = I.tableAccessReason(table, err && err.message);
        return reason ? { table, reason, error: String(err.message || '').slice(0, 300) } : null;
      })));
    return probes.filter(Boolean);
  }

  async function refuseMissingSources(req, warehouseId, spec, useCase) {
    const missing = await missingTables(req, warehouseId, I.sourceTables(spec, I.useCaseTables(useCase)));
    if (!missing.length) return;
    const err = I.badRequest(I.missingTablesMessage(missing), 409);
    err.details = { missing_tables: missing };
    throw err;
  }

  async function stalledOf(req, row) {
    if (!row || !I.IMPLEMENT_ACTIVE_STATUSES.includes(row.status)) return null;
    const runId = String(row.implement_run_id ?? '');
    const got = /^\d{1,19}$/.test(runId)
      ? await jsonOf(dbFetch, req.dbHost, req.dbToken, `/api/2.1/jobs/runs/get?run_id=${runId}`).catch(() => null)
      : null;
    return I.implementStalled(row, got && got.ok ? got.data : null);
  }

  async function prepareSubmission(req) {
    const sid = sessionIdOf(req);
    const warehouseId = warehouseOf(req);
    const { inspire_database, catalog, schema } = dbOf(req, splitInspireDatabase);
    const raw = req.body?.spec || req.body;
    const draft = I.validateImplementSpec(raw);
    const draftId = draft.spec.use_case_id;
    const history = draftId && I.IMPLEMENT_USE_CASE_ID_RE.test(draftId)
      ? await loadHistory(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid, draftId) : [];
    const legacyAccess = I.legacyAppAccess(history);
    const { spec: asked, errors } = legacyAccess ? I.validateImplementSpec(raw, { legacyAccess }) : draft;
    if (errors.length) throw I.badRequest(errors.join('; '));
    const rolled = I.rollbackSpec(history, asked);
    const useCaseId = I.validateUseCaseId(rolled.use_case_id);
    const moved = await movedResultTable(req, warehouseId, useCaseId, rolled.config.result_table, history);
    const spec = moved ? I.withResultTable(rolled, moved.to) : rolled;
    const [session, useCase] = await Promise.all([
      loadSession(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid),
      loadUseCase(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid, useCaseId),
    ]);
    if (!useCase) throw I.badRequest(`No use case ${useCaseId} in this session.`, 404);
    const problems = I.removedTableProblems(spec, I.useCaseTables(useCase), I.primaryTableOf(useCase));
    if (problems.length) throw I.badRequest(problems.join('; '));
    const widgets = I.implementWidgets(history, useCase.genie_instruction || useCase.generate_genie_code_instruction || '');
    const widgetIssues = I.widgetProblems(widgets.widgets, spec.config.widgets);
    if (widgetIssues.length) throw I.badRequest(`widget values are out of range: ${widgetIssues.join('; ')}`);
    if (I.IMPLEMENT_MERGE_OUTPUTS.some((name) => spec.outputs.merge[name])) {
      const targets = await loadMergeTargets(req, warehouseId, catalog, schema, sid, useCaseId, spec.outputs.merge);
      const mergeIssues = I.mergeProblems(spec, targets, I.carriedAssets(history));
      if (mergeIssues.length) throw I.badRequest(mergeIssues.join('; '));
    }
    const stalled = await stalledOf(req, history[0]);
    const plan = I.planSubmission(history, spec, stalled);
    if (moved) plan.summary.result_table_moved = moved;
    if (plan.summary.refill) await refuseMissingSources(req, warehouseId, spec, useCase);
    return { sid, warehouseId, inspire_database, catalog, schema, spec, useCaseId, session, history, plan };
  }

  app.post('/api/inspire/implement/plan', requireToken, async (req, res) => {
    try {
      const { useCaseId, plan } = await prepareSubmission(req);
      res.json({ use_case_id: useCaseId, spec_version: plan.nextVersion, based_on_version: plan.built ? plan.built.spec_version : null,
        summary: plan.summary, unchanged: plan.unchanged });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/inspire/implement/submit', requireToken, async (req, res) => {
    try {
      const { sid, warehouseId, inspire_database, catalog, schema, spec, useCaseId, session, plan } = await prepareSubmission(req);
      I.refuseUnchanged(plan);
      if (spec.config.result_table) {
        const output = await checkOutput(req, warehouseId, spec.config.result_table, useCaseId);
        if (!output.ok) throw I.badRequest(output.write.ok ? output.safety.detail : output.write.detail, 403);
      }
      const params = I.implementJobParams(notebookParamsFromSessionForGenerateRun(session, sid), useCaseId, plan.nextVersion);
      if (!params['02_inspire_database']) params['02_inspire_database'] = inspire_database;
      if (!params['01_uc_metadata']) {
        const err = new Error('This session has no UC metadata stored on __inspire_session. Run Discover from this app first.');
        err.statusCode = 400;
        throw err;
      }
      const me = await loadMe(req);
      const createdBy = requesterOf(req, me);
      const table = I.implementTableName(catalog, schema);
      await ensureImplementTable(req.dbHost, req.dbToken, warehouseId, table);
      const insert = I.implementInsertStatement(table, {
        sessionId: sid,
        useCaseId,
        specVersion: plan.nextVersion,
        basedOnVersion: spec.based_on_version == null ? (plan.built ? plan.built.spec_version : null) : spec.based_on_version,
        spec,
        createdBy,
        statusMessage: 'queued',
        changeClasses: plan.summary.classes,
      });
      await executeSqlWithDeltaRetry(req.dbHost, req.dbToken, warehouseId, insert.sql, { parameters: insert.parameters });

      const version = { sessionId: sid, useCaseId, specVersion: plan.nextVersion };
      let out;
      try {
        out = await triggerInspireNotebookJob(req.dbHost, req.dbToken, {
          params,
          notebook_path: req.body?.notebook_path,
          cluster_id: req.body?.cluster_id,
          jobType: 'implement',
          useCaseIds: [useCaseId],
        });
      } catch (err) {
        const failed = I.implementStartFailedStatement(table, { ...version, message: `the MVP run could not start: ${err.message}` });
        try {
          await executeSqlWithDeltaRetry(req.dbHost, req.dbToken, warehouseId, failed.sql, { parameters: failed.parameters });
        } catch (e) {
          console.warn(`implement start-failure write failed: ${e.message}`);
        }
        throw err;
      }
      const started = I.implementRunStartedStatement(table, { ...version, runId: out.run_id, message: out.job_run_url || `run ${out.run_id}` });
      try {
        await executeSqlWithDeltaRetry(req.dbHost, req.dbToken, warehouseId, started.sql, { parameters: started.parameters });
      } catch (e) {
        console.warn(`implement run id write failed: ${e.message}`);
      }
      res.json({
        session_id: sid,
        use_case_id: useCaseId,
        spec_version: plan.nextVersion,
        summary: plan.summary,
        ...out,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/inspire/implement/status', requireToken, async (req, res) => {
    try {
      const sid = sessionIdOf(req);
      const warehouseId = warehouseOf(req);
      const { catalog, schema } = dbOf(req, splitInspireDatabase);
      const useCaseId = I.validateUseCaseId(q(req, 'use_case_id'));
      const history = await loadHistory(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid, useCaseId);
      const stepTable = `\`${catalog}\`.\`${schema}\`.\`__inspire_step\``;
      const stepStmt = stepsStatement(stepTable, sid, q(req, 'since') || (history[0] && history[0].created_at) || '');
      let steps = [];
      try {
        steps = I.filterImplementSteps(await sqlRows(req.dbHost, req.dbToken, warehouseId, stepStmt), useCaseId);
      } catch (err) {
        if (!isMissingTableError(err)) throw err;
      }
      const session = await loadSession(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid).catch(() => null);
      const runLog = I.liveLogPath(`${catalog}.${schema}`, session?.business_name, sid, history[0] && history[0].implement_run_id);
      const sessionLog = I.liveLogPath(`${catalog}.${schema}`, session?.business_name, sid);
      let logPath = runLog;
      let feed = [];
      const readLog = (path) => jsonOf(dbFetch, req.dbHost, req.dbToken, `/api/2.0/fs/files${path}`).catch((err) => {
        console.warn(`[implement] live log read ended early, the feed keeps its last messages: ${path}: ${err.message}`);
        return { ok: false, status: 0, data: {} };
      });
      if (runLog) {
        let got = await readLog(runLog);
        if (!got.ok && got.status === 404 && runLog !== sessionLog) {
          logPath = sessionLog;
          got = await readLog(sessionLog);
        }
        if (got.ok) {
          const text = typeof got.data === 'string' ? got.data : (got.data.raw || '');
          feed = I.genieFeed(text, useCaseId, history[0] && history[0].created_at);
        }
      }
      const appName = I.carriedAssets(history).app;
      const jobId = (history.find((r) => r.job_id) || {}).job_id;
      const [appInfo, runInfo, stalled] = await Promise.all([
        appName ? jsonOf(dbFetch, req.dbHost, req.dbToken, `/api/2.0/apps/${encodeURIComponent(appName)}`) : null,
        jobId ? jsonOf(dbFetch, req.dbHost, req.dbToken, `/api/2.1/jobs/runs/list?job_id=${Number(jobId)}&limit=10`) : null,
        stalledOf(req, history[0]),
      ]);
      const listedNone = runInfo && runInfo.ok && !(Array.isArray(runInfo.data && runInfo.data.runs) && runInfo.data.runs.length);
      const jobInfo = listedNone ? await jsonOf(dbFetch, req.dbHost, req.dbToken, `/api/2.1/jobs/get?job_id=${Number(jobId)}`) : null;
      res.json({
        latest: history[0] || null,
        stalled,
        history,
        steps,
        log_path: logPath,
        feed,
        rerun_widgets: I.rerunWidgets(history),
        app_status: I.appStatusFrom(appInfo, { useCaseId, sessionId: sid }),
        runs: I.jobRunsFrom(runInfo, jobInfo),
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  async function optionalRows(req, warehouseId, statement) {
    try {
      return await sqlRows(req.dbHost, req.dbToken, warehouseId, statement);
    } catch (err) {
      if (isMissingTableError(err)) return [];
      throw err;
    }
  }

  app.get('/api/inspire/implement/money', requireToken, async (req, res) => {
    try {
      const sid = sessionIdOf(req);
      const warehouseId = warehouseOf(req);
      const { catalog, schema } = dbOf(req, splitInspireDatabase);
      const useCaseId = I.validateUseCaseId(q(req, 'use_case_id'));
      const history = await loadHistory(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid, useCaseId);
      const table = String(history[0]?.spec_json?.config?.result_table || '').trim();
      if (!table) return res.json({ run: null, model: null, history: [], result_table: '' });
      const statements = moneyStatements(table, useCaseId);
      const summary = (await optionalRows(req, warehouseId, statements.summary))[0] || null;
      const edits = summary && summary.value_assumptions ? await optionalRows(req, warehouseId, statements.edits) : [];
      return res.json({ ...moneyView(summary, edits), result_table: table });
    } catch (err) {
      return sendError(res, err);
    }
  });

  async function controlContext(req) {
    const sid = sessionIdOf(req);
    const warehouseId = warehouseOf(req);
    const { catalog, schema } = dbOf(req, splitInspireDatabase);
    const useCaseId = I.validateUseCaseId(q(req, 'use_case_id'));
    const history = await loadHistory(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid, useCaseId);
    return {
      sid, warehouseId, catalog, schema, useCaseId, history,
      targets: C.controlTargets(history),
      key: `${req.dbHost}|${catalog}.${schema}|${sid}|${useCaseId}`,
      logTable: C.controlLogTableName(catalog, schema),
    };
  }

  app.get('/api/inspire/implement/live', requireToken, async (req, res) => {
    try {
      const ctx = await controlContext(req);
      const live = await liveCache.get(ctx.key, async () => {
        const paths = C.livePaths(ctx.targets);
        const names = Object.keys(paths);
        const got = await Promise.all(names.map((name) => jsonOf(dbFetch, req.dbHost, req.dbToken, paths[name])));
        let actions = [];
        try {
          actions = await sqlRows(req.dbHost, req.dbToken, ctx.warehouseId,
            C.controlLogSelect(ctx.logTable, { sessionId: ctx.sid, useCaseId: ctx.useCaseId }));
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
        return {
          targets: ctx.targets,
          assets: C.liveStatus(ctx.targets, Object.fromEntries(names.map((name, i) => [name, got[i]])),
            { useCaseId: ctx.useCaseId, sessionId: ctx.sid }),
          actions,
          checked_at: new Date().toISOString(),
        };
      });
      res.json(live);
    } catch (err) {
      sendError(res, err);
    }
  });

  const ownedControlLogs = new Set();

  async function alignControlLogOwner(req, ctx) {
    if (ownedControlLogs.has(ctx.logTable)) return '';
    try {
      const rows = await sqlRows(req.dbHost, req.dbToken, ctx.warehouseId, C.controlLogOwnerSql(ctx.catalog, ctx.schema));
      const fix = C.controlLogOwnerFix(rows, ctx.logTable);
      if (fix) await executeSql(req.dbHost, req.dbToken, ctx.warehouseId, fix);
      ownedControlLogs.add(ctx.logTable);
      return '';
    } catch (e) {
      console.warn(`implement control log owner change failed: ${e.message}`);
      return `${C.CONTROL_LOG_TABLE} keeps the App as its owner, so only the App can read it: ${e.message}`;
    }
  }

  app.post('/api/inspire/implement/control', requireToken, async (req, res) => {
    try {
      const asset = q(req, 'asset');
      const action = q(req, 'action');
      const label = C.controlAction(asset, action);
      const ctx = await controlContext(req);
      const id = C.controlTarget(asset, ctx.targets);
      const latest = ctx.history[0] || {};
      if (asset !== 'build' && I.IMPLEMENT_ACTIVE_STATUSES.includes(latest.status)) {
        throw I.badRequest(`spec v${latest.spec_version} is still ${latest.status}; ${C.controlPhrase(label)} after it finishes, or stop the build first`, 409);
      }
      const owner = await jsonOf(dbFetch, req.dbHost, req.dbToken, C.ownerCheckPath(asset, id));
      const problem = C.ownerProblem(asset, owner, { useCaseId: ctx.useCaseId, sessionId: ctx.sid });
      if (problem) throw I.badRequest(`Inspire did not ${C.controlPhrase(label)}: ${problem}`, 409);
      const spec = latest.spec_json ? I.validateImplementSpec(latest.spec_json).spec : null;
      const request = C.controlRequest(asset, action, id, { warehouseId: spec && spec.config.warehouse_id });
      await executeSql(req.dbHost, req.dbToken, ctx.warehouseId, C.controlLogCreateSql(ctx.logTable));
      const ownerError = await alignControlLogOwner(req, ctx);
      const got = await jsonOf(dbFetch, req.dbHost, req.dbToken, request.path,
        { method: request.method, ...(request.body ? { body: JSON.stringify(request.body) } : {}) });
      const failure = got.ok ? '' : String((got.data && (got.data.message || got.data.error || got.data.raw)) || `HTTP ${got.status}`);
      const message = got.ok ? `${label}: done` : `${label} failed: ${failure}`;
      const me = await loadMe(req);
      const insert = C.controlLogInsert(ctx.logTable, {
        sessionId: ctx.sid, useCaseId: ctx.useCaseId, asset, assetId: id, action, result: got.ok ? 'done' : 'failed', message, actedBy: requesterOf(req, me),
      });
      let auditError = '';
      try {
        await executeSqlWithDeltaRetry(req.dbHost, req.dbToken, ctx.warehouseId, insert.sql, { parameters: insert.parameters });
      } catch (e) {
        auditError = `the action was not recorded in ${C.CONTROL_LOG_TABLE}: ${e.message}`;
        console.warn(`implement control audit write failed: ${e.message}`);
      }
      if (ownerError) auditError = [auditError, ownerError].filter(Boolean).join('; ');
      liveCache.forget(ctx.key);
      if (!got.ok) throw I.badRequest(message, got.status >= 400 && got.status < 500 ? got.status : 502);
      res.json({ ok: true, asset, action, asset_id: id, message, audit_error: auditError });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/inspire/implement/rerun', requireToken, async (req, res) => {
    try {
      const sid = sessionIdOf(req);
      const warehouseId = warehouseOf(req);
      const { catalog, schema } = dbOf(req, splitInspireDatabase);
      const useCaseId = I.validateUseCaseId(q(req, 'use_case_id'));
      const history = await loadHistory(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid, useCaseId);
      const latest = history[0];
      if (!latest || !latest.job_id) {
        const err = new Error('this use case has no Implement job to re-run yet');
        err.statusCode = 400;
        throw err;
      }
      const widgets = I.rerunWidgets(history);
      const overrides = I.rerunOverrides(req.body?.overrides);
      const notebookParams = I.rerunParams(widgets.map((w) => w.name), overrides);
      const overrideIssues = I.widgetProblems(widgets, overrides);
      if (overrideIssues.length) throw I.badRequest(`widget values are out of range: ${overrideIssues.join('; ')}`);
      const useCase = await loadUseCase(req.dbHost, req.dbToken, warehouseId, catalog, schema, sid, useCaseId);
      await refuseMissingSources(req, warehouseId, latest.spec_json, useCase);
      const resp = await dbFetch(req.dbHost, req.dbToken, '/api/2.1/jobs/run-now', {
        method: 'POST',
        body: JSON.stringify({ job_id: Number(latest.job_id), notebook_params: notebookParams, only: [I.IMPLEMENT_NOTEBOOK_TASK_KEY] }),
      });
      const text = await resp.text();
      let data = {};
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!resp.ok) {
        const err = new Error(data.message || data.error || text);
        err.statusCode = resp.status;
        throw err;
      }
      res.json({
        run_id: data.run_id,
        job_id: latest.job_id,
        job_run_url: databricksJobRunUrl(req.dbHost, latest.job_id, data.run_id),
        notebook_params: notebookParams,
      });
    } catch (err) {
      sendError(res, err);
    }
  });
}

module.exports = { jsonOf, registerImplementRoutes };
