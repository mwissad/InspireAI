// ═══════════════════════════════════════════════════
//  Inspire AI — MCP Server
//  Exposes customer-facing APIs as MCP tools so that
//  AI agents can launch, monitor, and retrieve results
//  from Inspire AI programmatically.
// ═══════════════════════════════════════════════════

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');

const BASE_URL = `http://localhost:${process.env.PORT || 8080}`;

// ── Internal API caller ────────────────────────────

async function api(method, path, { token, host, body, query } = {}) {
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-db-pat-token'] = token;
  if (host) headers['x-databricks-host'] = host;

  const resp = await fetch(url.toString(), {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || `API returned ${resp.status}`);
  return data;
}

// ── Reusable Zod schemas ───────────────────────────

const AuthParams = {
  token: z.string().optional().describe('Databricks PAT or OAuth2 token. Falls back to server-configured token if omitted.'),
  host: z.string().optional().describe('Databricks workspace URL (e.g. https://adb-123.azuredatabricks.net). Falls back to server-configured host if omitted.'),
};

const InspireDbParams = {
  ...AuthParams,
  inspire_database: z.string().describe('Inspire database in catalog.schema format (e.g. workspace._inspire)'),
  warehouse_id: z.string().describe('SQL Warehouse ID for executing queries'),
};

// ── Helper to format tool responses ────────────────

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(err) {
  return { content: [{ type: 'text', text: `Error: ${err.message || err}` }], isError: true };
}

// ── Factory: creates a fresh McpServer per connection ──

function createInspireMcpServer() {
  const server = new McpServer({
    name: 'inspire-ai',
    version: '1.0.0',
    description: 'Launch Inspire AI analyses, monitor progress in real time, and retrieve discovered use cases.',
  });

  // ════════════════════════════════════════════════
  //  Tool: inspire_launch
  // ════════════════════════════════════════════════

  server.tool(
    'inspire_launch',
    `Launch an Inspire AI data strategy analysis on a Databricks lakehouse.
Scans Unity Catalog tables, discovers business use cases, scores them, and optionally generates Genie spaces and PDF reports.
Returns a run_id — use inspire_get_run_status and inspire_get_session to monitor progress.`,
    {
      ...AuthParams,
      business_name: z.string().describe('Name of the business being analyzed'),
      inspire_database: z.string().describe('Target database for session tracking (catalog.schema, e.g. workspace._inspire)'),
      warehouse_id: z.string().describe('SQL Warehouse ID for query execution'),
      operation_mode: z.enum(['full', 'quick', 'custom']).default('full').describe('Analysis depth'),
      catalogs: z.string().optional().describe('Comma-separated Unity Catalog names to scan'),
      schemas: z.string().optional().describe('Comma-separated schema names to scan'),
      tables: z.string().optional().describe('Comma-separated table names to analyze'),
      business_domains: z.string().optional().describe('Comma-separated business domains to focus on'),
      strategic_goals: z.string().optional().describe('Business strategic goals to guide analysis'),
      business_priorities: z.string().optional().describe('Business priorities to weight use case scoring'),
      generate_choices: z.string().optional().describe('Comma-separated output artifacts (e.g. genie,pdf)'),
      generation_path: z.string().optional().describe('Workspace path for generated output artifacts'),
      output_language: z.string().default('en').describe('ISO language code for output'),
      cluster_id: z.string().optional().describe('Compute cluster ID (uses serverless if omitted)'),
      notebook_path: z.string().optional().describe('Notebook path override (auto-published if omitted)'),
    },
    async (args) => {
      try {
        const { token, host, cluster_id, notebook_path, ...rest } = args;
        // Map flat args to the params object the API expects
        const params = {
          business: rest.business_name,
          inspire_database: rest.inspire_database,
          warehouse_id: rest.warehouse_id,
          operation_mode: rest.operation_mode || 'Discover Usecases',
          catalogs: rest.catalogs,
          schemas: rest.schemas,
          tables: rest.tables,
          business_domains: rest.business_domains,
          generation_instructions: rest.strategic_goals || '',
          business_priorities: rest.business_priorities,
          generate: rest.generate_choices,
          generation_path: rest.generation_path,
          output_language: rest.output_language,
          json_file_path: '',
          session_id: String(Date.now()) + String(Math.floor(Math.random() * 1e6)),
        };
        // Strip undefined values
        for (const k of Object.keys(params)) {
          if (params[k] === undefined) delete params[k];
        }
        const data = await api('POST', '/api/run', {
          token, host,
          body: { params, ...(cluster_id ? { cluster_id } : {}), ...(notebook_path ? { notebook_path } : {}) },
        });
        return ok({ ...data, next_steps: 'Use inspire_get_run_status with the run_id to monitor the notebook execution, and inspire_get_session to track analysis progress.' });
      } catch (err) { return fail(err); }
    }
  );

  // ════════════════════════════════════════════════
  //  Tool: inspire_get_run_status
  // ════════════════════════════════════════════════

  server.tool(
    'inspire_get_run_status',
    `Check the Databricks notebook run lifecycle state. Poll every 10-30s.
When life_cycle_state is TERMINATED, check result_state: SUCCESS means the analysis completed, FAILED/TIMEDOUT means it errored.`,
    {
      ...AuthParams,
      run_id: z.number().int().describe('Run ID returned by inspire_launch'),
    },
    async ({ token, host, run_id }) => {
      try {
        return ok(await api('GET', `/api/run/${run_id}`, { token, host }));
      } catch (err) { return fail(err); }
    }
  );

  // ════════════════════════════════════════════════
  //  Tool: inspire_cancel_run
  // ════════════════════════════════════════════════

  server.tool(
    'inspire_cancel_run',
    'Cancel an in-progress Inspire AI run.',
    {
      ...AuthParams,
      run_id: z.number().int().describe('Run ID to cancel'),
    },
    async ({ token, host, run_id }) => {
      try {
        return ok(await api('POST', `/api/run/${run_id}/cancel`, { token, host }));
      } catch (err) { return fail(err); }
    }
  );

  // ════════════════════════════════════════════════
  //  Tool: inspire_get_session
  // ════════════════════════════════════════════════

  server.tool(
    'inspire_get_session',
    `Poll Inspire AI session progress. Returns completion percentage, processing status, and widget values.
A null session means the notebook is still initializing — keep polling every 3-5 seconds.
When completed_on is non-null, the analysis is done.`,
    {
      ...InspireDbParams,
      session_id: z.number().int().optional().describe('Specific session ID (defaults to latest)'),
    },
    async ({ token, host, inspire_database, warehouse_id, session_id }) => {
      try {
        return ok(await api('GET', '/api/inspire/session', {
          token, host,
          query: { inspire_database, warehouse_id, session_id },
        }));
      } catch (err) { return fail(err); }
    }
  );

  // ════════════════════════════════════════════════
  //  Tool: inspire_get_steps
  // ════════════════════════════════════════════════

  server.tool(
    'inspire_get_steps',
    `Get individual processing steps for real-time progress tracking. Each step represents a pipeline stage (table scanning, use case generation, scoring, SQL generation, etc.).
Use the "since" parameter for incremental polling — only fetches new steps since your last poll.`,
    {
      ...InspireDbParams,
      session_id: z.number().int().optional().describe('Session ID'),
      since: z.string().optional().describe('ISO timestamp — only return steps updated after this time'),
    },
    async ({ token, host, inspire_database, warehouse_id, session_id, since }) => {
      try {
        return ok(await api('GET', '/api/inspire/steps', {
          token, host,
          query: { inspire_database, warehouse_id, session_id, since },
        }));
      } catch (err) { return fail(err); }
    }
  );

  // ════════════════════════════════════════════════
  //  Tool: inspire_get_step_results
  // ════════════════════════════════════════════════

  server.tool(
    'inspire_get_step_results',
    `Get real-time progressive results assembled from completed steps. Returns discovered use cases grouped by business domain, with scoring when available.
Available WHILE the analysis is still running — no need to wait for completion. The _progressive flag indicates these are incremental.`,
    {
      ...InspireDbParams,
      session_id: z.number().int().describe('Session ID'),
    },
    async ({ token, host, inspire_database, warehouse_id, session_id }) => {
      try {
        return ok(await api('GET', '/api/inspire/step-results', {
          token, host,
          query: { inspire_database, warehouse_id, session_id },
        }));
      } catch (err) { return fail(err); }
    }
  );

  // ════════════════════════════════════════════════
  //  Tool: inspire_get_results
  // ════════════════════════════════════════════════

  server.tool(
    'inspire_get_results',
    `Get the final, complete analysis results from a finished session. This is the authoritative output — use after the session has completed.
If no session_id is provided, returns the latest completed session.`,
    {
      ...InspireDbParams,
      session_id: z.number().int().optional().describe('Session ID (defaults to latest completed)'),
    },
    async ({ token, host, inspire_database, warehouse_id, session_id }) => {
      try {
        return ok(await api('GET', '/api/inspire/results', {
          token, host,
          query: { inspire_database, warehouse_id, session_id },
        }));
      } catch (err) { return fail(err); }
    }
  );

  // ════════════════════════════════════════════════
  //  Tool: inspire_get_usecases
  // ════════════════════════════════════════════════

  server.tool(
    'inspire_get_usecases',
    `Get the polished, scored use cases from a completed analysis. Returns cleaned use case rows with priority, quality, value, feasibility, domain, and optional SQL.
These are the final presentation-ready use cases.`,
    {
      ...InspireDbParams,
      session_id: z.number().int().describe('Session ID'),
    },
    async ({ token, host, inspire_database, warehouse_id, session_id }) => {
      try {
        return ok(await api('GET', '/api/inspire/usecases', {
          token, host,
          query: { inspire_database, warehouse_id, session_id },
        }));
      } catch (err) { return fail(err); }
    }
  );

  // ════════════════════════════════════════════════
  //  Tool: inspire_list_sessions
  // ════════════════════════════════════════════════

  server.tool(
    'inspire_list_sessions',
    'List the 20 most recent Inspire AI sessions. Use this to find past analyses or pick a session to retrieve results from.',
    {
      ...InspireDbParams,
    },
    async ({ token, host, inspire_database, warehouse_id }) => {
      try {
        return ok(await api('GET', '/api/inspire/sessions', {
          token, host,
          query: { inspire_database, warehouse_id },
        }));
      } catch (err) { return fail(err); }
    }
  );

  // ════════════════════════════════════════════════
  //  Tool: inspire_acknowledge
  // ════════════════════════════════════════════════

  server.tool(
    'inspire_acknowledge',
    'Acknowledge a completed session. Call this after you have retrieved and processed the results to mark the session as done.',
    {
      ...InspireDbParams,
      session_id: z.number().int().describe('Session ID to acknowledge'),
    },
    async ({ token, host, inspire_database, warehouse_id, session_id }) => {
      try {
        return ok(await api('POST', '/api/inspire/ack', {
          token, host,
          body: { inspire_database, warehouse_id, session_id },
        }));
      } catch (err) { return fail(err); }
    }
  );

  return server;
}

module.exports = { createInspireMcpServer };
