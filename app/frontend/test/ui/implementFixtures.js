import { defaultSpecFromUseCase } from '../../src/lib/implementWizard.js';

export const HARNESS_SESSION_ID = '42';

export const HARNESS_SETTINGS = { warehouseId: 'wh1', inspireDatabase: 'main.inspire', notebookPath: '' };

export const HARNESS_USE_CASE = {
  id: 'N01-U01',
  Name: 'Predict churn',
  use_case: 'Predict churn',
  statement: 'Cut churn in the top segment',
  sponsor: 'Head of Retention',
  primary_table: 'main.s.orders',
  tables_involved: 'main.s.orders,main.s.returns',
  genie_instruction: '## Parameters\n| top_k | text | 25 | Top K |\n',
};

const uc = (no, name, extra) => ({
  No: no, Name: name, Statement: `${name} for the business`, Solution: `Build ${name.toLowerCase()}`, 'Business Value': `${name} pays back`,
  'Tables Involved': 'main.s.orders', ...extra,
});

export const RESULTS = {
  discovery_type: 'Deep',
  domains: [
    { domain_name: 'Customer', use_cases: [
      uc('N01-U01', 'Predict churn', { Subdomain: 'Retention', Priority: 'Very High', Quality: 'High', 'Analytics Technique': 'Classification',
        priority_score: '4.6', value_score: '4.8', feasibility_score: '4.4', Sponsor: 'Head of Retention', has_genie_code: 'Y',
        best_of_best: 'Y', best_of_best_rank: '1', strategy_alignment: JSON.stringify([{ id: 'S1', path: 'Grow > Keep customers', evidence: 'churn' }]),
        kpis: JSON.stringify([{ name: 'Churn rate', direction: 'decrease' }]), channels: JSON.stringify(['Email', 'SMS']),
        data_evidence: JSON.stringify({ tables: { 'main.s.orders': { rows: 1200, sampled: false } }, signal: { status: 'no_signal', check: 'outcome',
          table: 'main.s.orders', reason: 'The data shows no signal: no signal column separates the outcome. Inspire kept it because the instructions ask for it.' } }) }),
      uc('N01-U02', 'Score upsell', { Subdomain: 'Growth', Priority: 'High', Quality: 'Medium', 'Analytics Technique': 'Regression',
        priority_score: '3.9', Sponsor: 'Head of Sales', strategy_alignment: JSON.stringify([{ id: 'S2', path: 'Grow > Sell more', evidence: 'upsell' }]),
        channels: JSON.stringify(['Email']), data_evidence: JSON.stringify({ signal: { status: 'passed', check: 'outcome', table: 'main.s.orders',
          reason: 'basket_size moves with the outcome, with a correlation of 0.210.' } }) }),
      uc('N01-U03', 'Segment shoppers', { Subdomain: 'Growth', Priority: 'Medium', Quality: 'Medium', 'Analytics Technique': 'Clustering',
        priority_score: '3.1', channels: JSON.stringify(['App']) }),
      uc('N01-U04', 'Price elasticity', { Subdomain: 'Pricing', Priority: 'Low', Quality: 'Low', 'Analytics Technique': 'Regression',
        priority_score: '2.2', strategy_alignment: '[]' }),
    ] },
    { domain_name: 'Supply', use_cases: [
      uc('N02-U01', 'Forecast stock', { Subdomain: 'Inventory', Priority: 'High', Quality: 'High', 'Analytics Technique': 'Forecasting',
        priority_score: '4.1', best_of_best: 'Y', best_of_best_rank: '2', channels: JSON.stringify(['SMS']), 'Tables Involved': 'main.s.stock' }),
      uc('N02-U02', 'Spot late suppliers', { Subdomain: 'Procurement', Priority: 'Medium', Quality: 'High', 'Analytics Technique': 'Anomaly detection',
        priority_score: '3.4' }),
    ] },
  ],
};

export const OWNER = 'owner@example.com';
export const RESULT_TABLE = 'main.inspire.n01_u01_s42_out';

export const builtSpec = () => {
  const spec = defaultSpecFromUseCase(HARNESS_USE_CASE, { warehouseId: HARNESS_SETTINGS.warehouseId, inspireDatabase: HARNESS_SETTINGS.inspireDatabase, sessionId: HARNESS_SESSION_ID, owner: OWNER });
  const { app_access: _access, app_look: _look, app_options: _options, merge: _merge, ...beforeAppSettings } = spec.outputs;
  return {
    ...spec,
    outputs: { ...beforeAppSettings, genie_space: true, app: true, app_name: 'churn-desk', alert: true, alert_recipients: [OWNER],
      genie_questions: ['Which customers should we call first?'] },
  };
};

export const built = (extra = {}) => ({
  session_id: '42', use_case_id: 'N01-U01', spec_version: 1, status: 'ready', change_classes: 'initial', created_by: OWNER,
  updated_at: '2026-10-25T04:00:00Z', spec_json: JSON.stringify(builtSpec()), job_id: '77', last_preview_run_id: '9001', result_rows: '3',
  dashboard_id: 'd1', dashboard_url: 'https://workspace.example.com/dashboardsv3/d1/published',
  genie_space_id: 'g1', genie_space_url: 'https://workspace.example.com/genie/rooms/g1',
  app_name: 'churn-desk', app_url: 'https://churn-desk-1.aws.databricksapps.com',
  alert_id: 'a1', alert_url: 'https://workspace.example.com/sql/alerts-v2/a1',
  genie_widgets: JSON.stringify([
    { name: 'top_k', type: 'text', default: '25', allowed: 'whole number, at least 1', label: 'Top K' },
    { name: 'result_table', type: 'text', default: RESULT_TABLE },
    { name: 'run_profile', type: 'dropdown', default: 'full', choices: ['preview', 'full'] },
  ]),
  asset_status: JSON.stringify({
    genie_space: {
      state: 'ready', sample_questions: ['Which customers should we call first?', 'How many customers are in Act now?'],
      question_notes: [{ question: 'how many customers are in act now?', note: 'The rows are accounts, so it counts accounts in Act now.' }],
      check_question: 'Which customers should we call first?', check_sql: `SELECT entity_id FROM ${RESULT_TABLE} ORDER BY rank LIMIT 10`,
    },
    app: { state: 'ready', health: 'running', spec_version: 1 },
    alert: { state: 'ready', trigger: 'Act now rows in the latest run >= 1', check_state: 'OK', subscribers: 1 },
  }),
  ...extra,
});

export const STUDIO_STATE = {
  history: [built()],
  appExists: true,
  app: {
    name: 'churn-desk', url: 'https://churn-desk-1.aws.databricksapps.com', description: 'Inspire use case N01-U01 (session 42): Predict churn',
    app_status: { state: 'RUNNING', message: 'App is running' }, compute_status: { state: 'ACTIVE' },
    active_deployment: { status: { state: 'SUCCEEDED', message: 'App started successfully' }, update_time: '2026-10-25T04:10:00Z' },
  },
  runs: { runs: [
    { run_id: 9001, start_time: Date.UTC(2026, 9, 25, 4, 0, 0), run_duration: 95000, trigger: 'ONE_TIME',
      state: { life_cycle_state: 'TERMINATED', result_state: 'SUCCESS', state_message: '' },
      overriding_parameters: { notebook_params: { run_profile: 'preview' } }, run_page_url: 'https://workspace.example.com/#job/77/run/9001' },
    { run_id: 9002, start_time: Date.UTC(2026, 9, 25, 6, 0, 0), run_duration: 30000, trigger: 'PERIODIC',
      state: { life_cycle_state: 'TERMINATED', result_state: 'FAILED', state_message: 'Workload failed' } },
  ] },
};
