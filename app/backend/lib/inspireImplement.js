const { appShellCatalog } = require('./appShell');
const { IMPLEMENT_RUN_ID_PARAM } = require('./inspireJobParams');

const IMPLEMENT_OPERATION = 'Implement Use Cases';
const IMPLEMENT_TABLE = '__inspire_implement';
const IMPLEMENT_UNINSTALLED = 'uninstalled';
const IMPLEMENT_STATUSES = ['queued', 'filling', 'previewing', 'building_outputs', 'checking', 'ready', 'ready_with_warnings', 'failed',
  IMPLEMENT_UNINSTALLED];
const IMPLEMENT_ACTIVE_STATUSES = ['queued', 'filling', 'previewing', 'building_outputs', 'checking'];
const IMPLEMENT_DONE_STATUSES = ['ready', 'ready_with_warnings'];
const IMPLEMENT_OUTPUTS = ['dashboard', 'genie_space', 'app', 'alert'];
const IMPLEMENT_OUTPUT_LABELS = { dashboard: 'Dashboard', genie_space: 'Genie Agent', app: 'App', alert: 'Alert' };
const IMPLEMENT_NOTEBOOK = 'notebook';
const IMPLEMENT_CONTRACT_OUTPUTS = ['genie_space', 'dashboard', 'app', 'alert'];
const IMPLEMENT_RETRY_TARGETS = [IMPLEMENT_NOTEBOOK, ...IMPLEMENT_CONTRACT_OUTPUTS];
const IMPLEMENT_OUTPUT_ID_COLUMNS = { dashboard: 'dashboard_id', genie_space: 'genie_space_id', app: 'app_name', alert: 'alert_id' };
const IMPLEMENT_STOPPED_STATES = ['deleted', 'released'];
const IMPLEMENT_RUN_ENDED_STATES = ['TERMINATED', 'SKIPPED', 'INTERNAL_ERROR'];
const IMPLEMENT_STALE_AFTER_MS = 4 * 3600 * 1000;
const IMPLEMENT_CHANGE_CLASSES = ['initial', 'data', 'config', 'schedule', 'holdout', 'outputs', 'deselect', 'sharing', 'retry', 'rollback',
  'vibe', 'remove_kept', 'uninstall'];
const IMPLEMENT_VIBE_PREVIOUS = ['keep', 'remove'];
const IMPLEMENT_HOLDOUT_SHARE = 0.1;
const IMPLEMENT_HOLDOUT_MAX_SHARE = 0.5;
const IMPLEMENT_RUN_PROFILES = ['preview', 'full'];
const IMPLEMENT_FILTER_OPS = ['=', '!=', '>', '>=', '<', '<=', 'in', 'not in', 'between'];
const IMPLEMENT_COLUMN_ROLES = ['entity_id', 'event_date', 'measure', 'label', 'segment'];
const IMPLEMENT_VIBES_MAX = 2000;
const IMPLEMENT_NOTEBOOK_PARTS = { ai_reasoning: 'AI reasoning', value_formula: 'money at stake formula' };
const IMPLEMENT_PART_RE = /^(app:page|dashboard):([A-Za-z0-9_-]{1,64})$/;
const IMPLEMENT_PART_STATES = ['ready', 'ready_with_warnings', 'failed'];
const IMPLEMENT_OUTPUT_OPTIONS = {
  dashboard: ['dashboard_name', 'dashboard_filters', 'dashboard_vibes'],
  genie_space: ['genie_space_name', 'genie_questions', 'genie_space_vibes'],
  app: ['app_purpose', 'app_access', 'app_look', 'app_options', 'app_backend', 'app_vibes', 'app_owners', 'app_charts', 'app_pages'],
  alert: ['alert_name', 'alert_tiers', 'alert_operator', 'alert_threshold', 'alert_threshold_basis', 'alert_condition_text',
    'alert_recipients', 'alert_destinations', 'alert_vibes'],
};
const IMPLEMENT_APP_LOOK_DEFAULT = { style: 'a', layout: 'sidebar', palette: 'default', theme: 'light' };
const IMPLEMENT_APP_LOOK_LISTS = { style: 'styles', layout: 'layouts', palette: 'palettes', theme: 'themes' };
const IMPLEMENT_APP_OPTION_KEYS = ['modify', 'replace_edits', 'decisions', 'alerts'];
const IMPLEMENT_PER_USER_OFF = ['decisions', 'alerts'];
const IMPLEMENT_APP_CHARTS_MIN = 3;
const IMPLEMENT_MERGE_OUTPUTS = ['dashboard', 'genie_space', 'app'];
const IMPLEMENT_MERGE_NOUNS = { app: 'an App', dashboard: 'a dashboard', genie_space: 'a Genie Agent' };
const IMPLEMENT_MERGE_LABELS = { app: 'App', dashboard: 'dashboard', genie_space: 'Genie Agent' };
const IMPLEMENT_APP_ACCESS_CHOICE = "choose who the App reads its data as: 'user' (each person sees only the rows and columns their Unity Catalog grants allow) or 'sp' (everyone sees the same data through the App's service principal)";
const IMPLEMENT_APP_BACKEND_CHOICE = "choose where the App reads its data: 'lakebase' (its pages load instantly) or 'delta' (Delta tables, its pages take a few seconds to load)";
const IMPLEMENT_APP_PLACEMENTS = ['domain', 'use_case', 'business'];
const IMPLEMENT_APP_PLACEMENT_CHOICE = "choose how Inspire organizes Apps: 'domain' (one App per business domain), 'use_case' (one App per use case) or 'business' (one App for all use cases)";
const IMPLEMENT_MERGE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const IMPLEMENT_MERGE_TARGET_CAP = 40;
const IMPLEMENT_SCOPE_SESSION_CAP = 100;
const IMPLEMENT_ALERT_TIER_SETS = { act_now: ['Act now'], act_now_review: ['Act now', 'Review'] };
const IMPLEMENT_ALERT_OPERATORS = ['>=', '>', '=', '!=', '<', '<='];
const IMPLEMENT_ALERT_THRESHOLD_BASES = ['fixed', 'baseline'];
const IMPLEMENT_ALERT_BASELINE_DIRECTIONS = { '>=': '+', '>': '+', '<=': '-', '<': '-' };
const IMPLEMENT_ALERT_MAX_SUBSCRIBERS = 100;
const IMPLEMENT_APP_OWNERS_MAX = 50;
const IMPLEMENT_EMAIL_MAX_CHARS = 254;
const IMPLEMENT_NOTEBOOK_TASK_KEY = 'inspire_task';
const IMPLEMENT_PRINCIPAL_TYPES = ['user', 'group', 'service_principal'];
const IMPLEMENT_USE_CASE_PARAM = 'inspire_implement_use_case';
const IMPLEMENT_SPEC_VERSION_PARAM = 'inspire_implement_spec_version';
const IMPLEMENT_RUN_ID_REFERENCE = '{{job.run_id}}';
const IMPLEMENT_APP_NAME_RE = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/;
const IMPLEMENT_WIDGET_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const IMPLEMENT_TABLE_NAME_RE = /^[A-Za-z0-9_`-]+\.[A-Za-z0-9_`-]+\.[A-Za-z0-9_`-]+$/;
const IMPLEMENT_USE_CASE_ID_RE = /^[a-zA-Z0-9_.-]+$/;
const IMPLEMENT_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const IMPLEMENT_DESTINATION_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const DECIMAL_RE = /^\s*[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?\s*$/;
const IMPLEMENT_ROLE_REF_RE = /^[^.\s`]+(\.[^.\s`]+){3}$/;
const IMPLEMENT_DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const IMPLEMENT_COLUMNS = [
  ['session_id', 'BIGINT'], ['use_case_id', 'STRING'], ['spec_version', 'INT'], ['based_on_version', 'INT'],
  ['spec_json', 'VARIANT'], ['status', 'STRING'], ['status_message', 'STRING'], ['change_classes', 'STRING'],
  ['notebook_path', 'STRING'], ['job_id', 'BIGINT'], ['last_preview_run_id', 'BIGINT'], ['result_rows', 'BIGINT'],
  ['dashboard_id', 'STRING'], ['dashboard_url', 'STRING'], ['genie_space_id', 'STRING'], ['genie_space_url', 'STRING'],
  ['app_name', 'STRING'], ['app_url', 'STRING'], ['genie_widgets', 'VARIANT'], ['data_profiles', 'VARIANT'],
  ['suggested_schedule', 'VARIANT'], ['asset_status', 'VARIANT'], ['created_by', 'STRING'], ['created_at', 'TIMESTAMP'],
  ['updated_at', 'TIMESTAMP'], ['alert_id', 'STRING'], ['alert_url', 'STRING'], ['implement_run_id', 'BIGINT'],
  ['asset_snapshots', 'STRING'],
];
const IMPLEMENT_UNREAD_COLUMNS = ['asset_snapshots'];
const IMPLEMENT_VARIANT_COLUMNS = IMPLEMENT_COLUMNS.filter(([, t]) => t === 'VARIANT').map(([n]) => n);
const IMPLEMENT_NOT_AVAILABLE =
  'Start Use Case MVP with Genie needs the Inspire Database: set it in Settings, then try again.';

function badRequest(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function str(value) {
  return value == null ? '' : String(value);
}

function shownValue(value) {
  return typeof value === 'string' ? `'${value}'` : sortedJson(value);
}

function textValue(value) {
  if (value == null) return '';
  return typeof value === 'string' ? value.trim() : null;
}

function textField(value, field, errors) {
  const text = textValue(value);
  if (text === null) {
    errors.push(`${field} must be text, not ${shownValue(value)}`);
    return '';
  }
  return text;
}

function textsField(values, field, errors) {
  return listField(values, field, errors).map((item) => textField(item, `each item of ${field}`, errors)).filter(Boolean);
}

function tableText(value) {
  const text = textValue(value);
  return text === null ? null : plainTable(text);
}

function flagField(value, field, errors, fallback = false) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  errors.push(`${field} must be true or false, not ${shownValue(value)}`);
  return fallback;
}

function valueText(value) {
  if (typeof value === 'string') return value;
  const whole = typeof value === 'number' ? wholeNumber(value) : null;
  return whole == null ? null : String(whole);
}

function clip(text, size) {
  const chars = [...text];
  return chars.length > size ? chars.slice(0, size).join('') : text;
}

function ownKey(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function plainTable(name) {
  return str(name).split('.').map((part) => part.trim().replace(/^`+|`+$/g, '')).join('.');
}

function resultTableNameError(name, field = 'result_table') {
  const table = tableText(name);
  return table !== null && IMPLEMENT_TABLE_NAME_RE.test(table) ? '' : `${field} ${shownValue(name)} must be catalog.schema.table`;
}

const CRON_FIELDS = [
  ['second', 0, 59, []], ['minute', 0, 59, []], ['hour', 0, 23, []], ['day of month', 1, 31, []],
  ['month', 1, 12, ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']],
  ['day of week', 1, 7, ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']], ['year', 1970, 2099, []],
];

function cronValueProblem(part, label, low, high, names) {
  if (names.includes(part) || (/^[0-9]+$/.test(part) && Number(part) >= low && Number(part) <= high)) return '';
  return `the ${label} value '${part}' is not ${low} to ${high}` + (names.length ? ` or ${names[0]} to ${names[names.length - 1]}` : '');
}

function cronProblem(cron) {
  const fields = str(cron).toUpperCase().trim().split(/\s+/).filter(Boolean);
  if (fields.length !== 6 && fields.length !== 7) {
    return `it has ${fields.length} fields; a Quartz cron has 6 or 7: second, minute, hour, day of month, month, day of week and an optional year`;
  }
  for (let i = 0; i < fields.length; i += 1) {
    const text = fields[i];
    const [label, low, high, names] = CRON_FIELDS[i];
    if (text === '?' && (label === 'day of month' || label === 'day of week')) continue;
    const last = label === 'day of month' ? /^(?:L(?:-([0-9]+))?|LW|([0-9]+)W)$/.exec(text) : null;
    if (last) {
      if (last[1] !== undefined && !(Number(last[1]) >= 1 && Number(last[1]) <= 30)) return `the day of month offset '${last[1]}' is not 1 to 30`;
      const problem = last[2] !== undefined ? cronValueProblem(last[2], label, low, high, names) : '';
      if (problem) return problem;
      continue;
    }
    const nth = label === 'day of week' ? /^(?:L|([0-9]+|[A-Z]+)(?:L|#([0-9]+)))$/.exec(text) : null;
    if (nth) {
      const problem = nth[1] ? cronValueProblem(nth[1], label, low, high, names) : '';
      if (problem) return problem;
      if (nth[2] !== undefined && !(Number(nth[2]) >= 1 && Number(nth[2]) <= 5)) return `the day of week occurrence '${nth[2]}' is not 1 to 5`;
      continue;
    }
    for (const item of text.split(',')) {
      const slashAt = item.indexOf('/');
      const base = slashAt < 0 ? item : item.slice(0, slashAt);
      const step = slashAt < 0 ? '' : item.slice(slashAt + 1);
      const top = label === 'year' ? 129 : high;
      if (slashAt >= 0 && !(/^[0-9]+$/.test(step) && Number(step) >= 1 && Number(step) <= top)) return `the ${label} step '${step}' is not 1 to ${top}`;
      if (base === '*') continue;
      const dashAt = base.indexOf('-');
      for (const part of dashAt < 0 ? [base] : [base.slice(0, dashAt), base.slice(dashAt + 1)]) {
        const problem = cronValueProblem(part, label, low, high, names);
        if (problem) return problem;
      }
    }
  }
  if ((fields[3] === '?') === (fields[5] === '?')) return "exactly one of day of month and day of week must be '?'";
  return '';
}

function wholeNumber(value) {
  let number = null;
  if (typeof value === 'number') number = Number.isInteger(value) ? value : null;
  else if (typeof value === 'string' && /^\s*[-+]?\d+\s*$/.test(value)) number = Number.parseInt(value, 10);
  return number != null && Number.isSafeInteger(number) ? number : null;
}

function decimalNumber(value) {
  const number = typeof value === 'number' ? value : (typeof value === 'string' && DECIMAL_RE.test(value) ? Number(value) : Number.NaN);
  return Number.isFinite(number) ? number : null;
}

function listField(value, field, errors) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  errors.push(`${field} must be a list`);
  return [];
}

function objectField(value, field, errors) {
  if (value == null || value === '') return {};
  if (isPlainObject(value)) return value;
  errors.push(`${field} must be an object`);
  return {};
}

function legacyAppAccess(history) {
  const built = [...(history || [])].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0))
    .find((row) => IMPLEMENT_DONE_STATUSES.includes(row.status));
  const outputs = built && isPlainObject(built.spec_json) && isPlainObject(built.spec_json.outputs) ? built.spec_json.outputs : null;
  return outputs && outputs.app && !Object.prototype.hasOwnProperty.call(outputs, 'app_access') ? 'sp' : '';
}

function validateImplementSpec(input, { shell = null, legacyAccess = '' } = {}) {
  const errors = [];
  let spec = input;
  if (typeof spec === 'string') {
    try {
      spec = JSON.parse(spec);
    } catch (e) {
      return { spec: {}, errors: [`the spec is not valid JSON: ${e.message}`] };
    }
  }
  if (!isPlainObject(spec)) return { spec: {}, errors: ['the spec must be a JSON object'] };
  const out = {
    use_case_id: textField(spec.use_case_id, 'use_case_id', errors),
    use_case_name: textField(spec.use_case_name, 'use_case_name', errors),
    confirm_notebook_overwrite: flagField(spec.confirm_notebook_overwrite, 'confirm_notebook_overwrite', errors),
  };
  if (textValue(spec.use_case_id) === '') errors.push('use_case_id is required');
  if (spec.based_on_version != null && spec.based_on_version !== '') {
    const based = wholeNumber(spec.based_on_version);
    if (based == null) errors.push(`based_on_version ${shownValue(spec.based_on_version)} must be an integer`);
    else out.based_on_version = based;
  }

  const framing = objectField(spec.use_case, 'use_case', errors);
  const measures = textsField(framing.success_measures, 'use_case.success_measures', errors);
  if (measures.length > 3) errors.push('at most 3 success measures are allowed');
  out.use_case = {
    goal: clip(textField(framing.goal, 'use_case.goal', errors), 500),
    decision_owner: clip(textField(framing.decision_owner, 'use_case.decision_owner', errors), 200),
    success_measures: measures.slice(0, 3),
  };

  const data = objectField(spec.data, 'data', errors);
  const tables = {};
  for (const [original, chosen] of Object.entries(objectField(data.tables, 'data.tables', errors))) {
    const o = tableText(original);
    const c = tableText(chosen);
    if (o === null || c === null || !IMPLEMENT_TABLE_NAME_RE.test(o) || !IMPLEMENT_TABLE_NAME_RE.test(c)) {
      errors.push(`table swap ${shownValue(original)} -> ${shownValue(chosen)} must name two catalog.schema.table tables`);
      continue;
    }
    if (o.toLowerCase() !== c.toLowerCase()) tables[o] = c;
  }
  const filters = [];
  for (const item of listField(data.filters, 'data.filters', errors)) {
    if (!isPlainObject(item)) {
      errors.push('each data filter must be an object');
      continue;
    }
    const table = tableText(item.table);
    const column = textValue(item.column);
    const opText = textValue(item.op);
    const op = opText === null ? null : opText.toLowerCase();
    const rawValues = Array.isArray(item.values) ? item.values : (item.values == null || item.values === '' ? [] : [item.values]);
    const values = rawValues.map(valueText);
    const bad = rawValues.filter((raw, i) => values[i] === null);
    const single = ['=', '!=', '>', '>=', '<', '<='];
    if (table === null || column === null || !IMPLEMENT_TABLE_NAME_RE.test(table) || !IMPLEMENT_WIDGET_NAME_RE.test(column.replace(/-/g, '_'))) {
      errors.push(`filter on ${shownValue(item.table)}.${shownValue(item.column)} must name a catalog.schema.table table and a column`);
    } else if (!IMPLEMENT_FILTER_OPS.includes(op)) {
      errors.push(`filter operator ${shownValue(item.op)} is not one of ${IMPLEMENT_FILTER_OPS.join(', ')}`);
    } else if (bad.length) {
      errors.push(`filter ${table}.${column} value ${shownValue(bad[0])} must be text or a whole number`);
    } else if (!values.length || (op === 'between' && values.length !== 2) || (single.includes(op) && values.length !== 1)) {
      const need = op === 'between' ? 'two values' : (!['in', 'not in'].includes(op) ? 'one value' : 'at least one value');
      errors.push(`filter ${table}.${column} ${op} needs ${need}`);
    } else {
      filters.push({ table, column, op, values });
    }
  }
  const profileText = textValue(data.run_profile);
  const profile = profileText === null ? '' : (profileText || 'preview').toLowerCase();
  if (!IMPLEMENT_RUN_PROFILES.includes(profile)) errors.push(`run_profile must be one of ${IMPLEMENT_RUN_PROFILES.join(', ')}`);
  const roles = {};
  for (const [role, refRaw] of Object.entries(objectField(data.column_roles, 'data.column_roles', errors))) {
    const refText = textValue(refRaw);
    const ref = refText === null ? null : refText.replace(/^`+|`+$/g, '');
    if (!IMPLEMENT_COLUMN_ROLES.includes(role)) {
      errors.push(`column role ${shownValue(role)} is not one of ${IMPLEMENT_COLUMN_ROLES.join(', ')}`);
    } else if (ref === null || (ref && !IMPLEMENT_ROLE_REF_RE.test(ref))) {
      errors.push(`column role ${role} must name catalog.schema.table.column, not ${shownValue(ref === null ? refRaw : ref)}`);
    } else if (ref) {
      roles[role] = ref;
    }
  }
  const removedTables = [];
  for (const raw of listField(data.removed_tables, 'data.removed_tables', errors)) {
    const table = tableText(raw);
    if (table === null || !IMPLEMENT_TABLE_NAME_RE.test(table)) {
      errors.push(`removed table ${shownValue(raw)} must be catalog.schema.table`);
    } else if (Object.keys(tables).some((o) => o.toLowerCase() === table.toLowerCase())) {
      errors.push(`${table} cannot be swapped and removed at once`);
    } else if (!removedTables.some((r) => r.toLowerCase() === table.toLowerCase())) {
      removedTables.push(table);
    }
  }
  const gone = new Set(removedTables.map((r) => r.toLowerCase()));
  for (const [role, ref] of Object.entries(roles).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (gone.has(ref.split('.').slice(0, 3).join('.').toLowerCase())) {
      errors.push(`the ${role.replace(/_/g, ' ')} column ${ref} is in a table you removed`);
    }
  }
  for (const item of filters) {
    if (gone.has(item.table.toLowerCase())) errors.push(`the filter on ${item.table}.${item.column} reads a table you removed`);
  }
  const window = objectField(data.window, 'data.window', errors);
  const dates = {};
  for (const label of ['start', 'end']) {
    const raw = window[label];
    const value = textValue(raw);
    if (value === null || (value && !IMPLEMENT_DATE_RE.test(value))) {
      errors.push(`the data window ${label} ${shownValue(value === null ? raw : value)} must be a YYYY-MM-DD date`);
    }
    dates[label] = value || '';
  }
  const { start, end } = dates;
  if (start && end && IMPLEMENT_DATE_RE.test(start) && IMPLEMENT_DATE_RE.test(end) && start > end) {
    errors.push(`the data window starts (${start}) after it ends (${end})`);
  }
  out.data = {
    tables, removed_tables: removedTables, filters, run_profile: profile, column_roles: roles, window: { start, end },
    notes: vibesText(data.notes, 'data.notes', 'notebook', errors),
  };

  const config = objectField(spec.config, 'config', errors);
  const widgets = {};
  for (const [name, value] of Object.entries(objectField(config.widgets, 'config.widgets', errors))) {
    const text = value == null ? '' : valueText(value);
    if (!IMPLEMENT_WIDGET_NAME_RE.test(name)) errors.push(`widget name ${shownValue(name)} is not a valid widget name`);
    else if (text === null) errors.push(`widget ${name} must be text or a whole number, not ${shownValue(value)}`);
    else widgets[name] = text;
  }
  const resultTable = tableText(config.result_table);
  if (resultTable === null || (resultTable && resultTableNameError(config.result_table))) errors.push(resultTableNameError(config.result_table));
  const profilesIn = objectField(config.profiles, 'config.profiles', errors);
  const profiles = {};
  for (const [name, fields] of [['training', ['window_days', 'sample_entities']], ['full_load', ['window_days']],
    ['preview', ['entity_cap']], ['retrain', ['every_runs']]]) {
    const section = objectField(profilesIn[name], `config.profiles.${name}`, errors);
    const clean = {};
    for (const field of fields) {
      const value = section[field];
      if (value == null || value === '') continue;
      const number = wholeNumber(value);
      if (number == null) errors.push(`${name} ${field} ${shownValue(value)} must be a whole number`);
      else if (number < 1) errors.push(`${name} ${field} must be at least 1`);
      else clean[field] = number;
    }
    if (name === 'training') {
      const stratify = textField(section.stratify_by, 'config.profiles.training.stratify_by', errors);
      if (stratify) clean.stratify_by = stratify;
    }
    if (name === 'retrain' && section.drift_threshold != null && section.drift_threshold !== '') {
      const drift = decimalNumber(section.drift_threshold);
      if (drift == null || drift <= 0 || drift > 1) {
        errors.push(`retrain drift_threshold ${shownValue(section.drift_threshold)} must be a number above 0 and at most 1`);
      } else clean.drift_threshold = drift;
    }
    profiles[name] = clean;
  }
  out.config = {
    widgets,
    result_table: resultTable || '',
    ai_endpoint: textField(config.ai_endpoint, 'config.ai_endpoint', errors),
    warehouse_id: textField(config.warehouse_id, 'config.warehouse_id', errors),
    profiles,
  };

  const schedule = objectField(spec.schedule, 'schedule', errors);
  const cron = textField(schedule.cron, 'schedule.cron', errors);
  const enabled = flagField(schedule.enabled, 'schedule.enabled', errors);
  const cronIssue = cron ? cronProblem(cron) : '';
  if (cronIssue) errors.push(`schedule cron ${shownValue(cron)} is not a valid Quartz cron: ${cronIssue}`);
  if (enabled && !cron && textValue(schedule.cron) !== null) errors.push('an enabled schedule needs a cron expression');
  const emails = [];
  for (const raw of listField(schedule.failure_emails, 'schedule.failure_emails', errors)) {
    const email = textValue(raw);
    if (email === null || !IMPLEMENT_EMAIL_RE.test(email)) errors.push(`failure email ${shownValue(email === null ? raw : email)} is not an email address`);
    else if (!emails.some((e) => e.toLowerCase() === email.toLowerCase())) emails.push(email);
  }
  out.schedule = { enabled, cron, timezone: textField(schedule.timezone, 'schedule.timezone', errors) || 'UTC', failure_emails: emails };
  if (spec.holdout != null) out.holdout = holdoutSetting(spec.holdout, errors);

  const outputs = objectField(spec.outputs, 'outputs', errors);
  const chosen = {};
  for (const name of IMPLEMENT_OUTPUTS) chosen[name] = flagField(outputs[name], `outputs.${name}`, errors);
  if (!ownKey(spec, 'outputs')) chosen.dashboard = true;
  if (chosen.app) chosen.genie_space = true;
  const app = appSettings(outputs, chosen.app, shell, errors, legacyAccess);
  const merge = mergeChoices(outputs, chosen, errors);
  const appName = merge.app || (textValue(outputs.app_name) || '').toLowerCase();
  if (chosen.app && !IMPLEMENT_APP_NAME_RE.test(appName)) {
    errors.push(`app_name ${shownValue(outputs.app_name)} must be 3-30 characters: lowercase letters, digits and dashes, starting with a letter`);
  }
  if (Object.values(chosen).some(Boolean) && !out.config.warehouse_id && textValue(config.warehouse_id) !== null) {
    errors.push('a SQL warehouse is required to build a dashboard, a Genie Agent, an App or an alert');
  }
  const alert = alertOptions(outputs, chosen.alert);
  errors.push(...alert.errors);
  const removed = {};
  for (const [name, action] of Object.entries(objectField(spec.removed_outputs, 'removed_outputs', errors))) {
    const a = textValue(action);
    if (IMPLEMENT_OUTPUTS.includes(name) && a !== null && ['keep', 'delete'].includes(a.toLowerCase())) removed[name] = a.toLowerCase();
  }
  const questions = textsField(outputs.genie_questions, 'outputs.genie_questions', errors).map((q) => clip(q, 300));
  if (questions.length > 5) errors.push('at most 5 Genie Agent sample questions are allowed');
  const dashFilters = textsField(outputs.dashboard_filters, 'outputs.dashboard_filters', errors);
  const badFilters = dashFilters.filter((w) => !IMPLEMENT_WIDGET_NAME_RE.test(w));
  if (badFilters.length) errors.push(`dashboard filters must be widget names: ${badFilters.join(', ')}`);
  out.outputs = {
    ...chosen,
    app_name: chosen.app ? appName : '',
    dashboard_name: chosen.dashboard ? clip(textField(outputs.dashboard_name, 'outputs.dashboard_name', errors), 200) : '',
    dashboard_filters: chosen.dashboard ? dashFilters : [],
    genie_space_name: chosen.genie_space ? clip(textField(outputs.genie_space_name, 'outputs.genie_space_name', errors), 200) : '',
    genie_questions: chosen.genie_space ? questions.slice(0, 5) : [],
    app_purpose: chosen.app ? clip(textField(outputs.app_purpose, 'outputs.app_purpose', errors), 1500) : '',
    app_access: app.access,
    app_look: app.look,
    app_options: app.options,
    app_backend: app.backend,
    app_placement: app.placement,
    ...(app.charts ? { app_charts: app.charts } : {}),
    ...(app.pages ? { app_pages: app.pages } : {}),
    app_owners: appOwners(outputs, chosen.app, errors),
    merge,
    ...alert.options,
    ...outputVibes(outputs, chosen, errors),
  };
  out.removed_outputs = removed;
  const retry = [];
  for (const raw of listField(spec.retry_outputs, 'retry_outputs', errors)) {
    const name = textValue(raw);
    const part = implementPart(name);
    if (part) {
      if (part.output !== IMPLEMENT_NOTEBOOK && !chosen[part.output]) {
        errors.push(`the ${part.label} cannot be rebuilt: the ${IMPLEMENT_OUTPUT_LABELS[part.output]} is not selected`);
      } else if (!retry.includes(name)) retry.push(name);
    } else if (!IMPLEMENT_RETRY_TARGETS.includes(name)) {
      errors.push(`retry output ${shownValue(name === null ? raw : name)} is not one of ${IMPLEMENT_RETRY_TARGETS.join(', ')}`);
    } else if (name !== IMPLEMENT_NOTEBOOK && !chosen[name]) errors.push(`the ${IMPLEMENT_OUTPUT_LABELS[name]} cannot be retried: it is not selected`);
    else if (!retry.includes(name)) retry.push(name);
  }
  out.retry_outputs = retry;
  const retryAsks = {};
  for (const [id, list] of Object.entries(objectField(spec.retry_asks, 'retry_asks', errors))) {
    const shapeErrors = errors.length;
    const asks = textsField(list, `retry_asks.${id}`, errors);
    const label = (implementPart(id) || {}).label || IMPLEMENT_OUTPUT_LABELS[id] || id;
    if (!retry.includes(id)) errors.push(`retry_asks names ${shownValue(id)}, which this version does not rebuild; list it in retry_outputs too`);
    else if (errors.length > shapeErrors) continue;
    else if (!asks.length) errors.push(`retry_asks.${id} must list at least one ask to try again`);
    else if (asks.some((ask) => vibesLength(ask) > IMPLEMENT_VIBES_MAX)) errors.push(`each ask to try again on the ${label} must be at most ${IMPLEMENT_VIBES_MAX} characters`);
    else retryAsks[id] = asks;
  }
  if (Object.keys(retryAsks).length) out.retry_asks = retryAsks;
  const rollback = {};
  for (const [name, value] of Object.entries(objectField(spec.rollback_outputs, 'rollback_outputs', errors))) {
    const version = wholeNumber(value);
    if (!IMPLEMENT_OUTPUTS.includes(name)) errors.push(`rollback output ${shownValue(name)} is not one of ${IMPLEMENT_CONTRACT_OUTPUTS.join(', ')}`);
    else if (!chosen[name]) errors.push(`the ${IMPLEMENT_OUTPUT_LABELS[name]} cannot be rolled back: it is not selected`);
    else if (version == null || version < 1) errors.push(`rollback_outputs.${name} ${shownValue(value)} must be a version number, 1 or more`);
    else if (retry.some((id) => (implementPart(id) || { output: id }).output === name)) {
      errors.push(`the ${IMPLEMENT_OUTPUT_LABELS[name]} cannot be retried and rolled back in the same version`);
    }
    else rollback[name] = version;
  }
  out.rollback_outputs = rollback;
  const vibe = vibesText(spec.vibes, 'vibes', 'MVP', errors);
  const previousChoice = (textValue(spec.vibe_previous) || '').toLowerCase();
  if (vibe && !IMPLEMENT_VIBE_PREVIOUS.includes(previousChoice)) {
    errors.push(`vibe_previous ${shownValue(spec.vibe_previous)} must be keep or remove: it says what happens to the version before this vibe`);
  } else if (vibe) {
    out.vibes = vibe;
    out.vibe_previous = previousChoice;
    if (Object.keys(rollback).length) errors.push('a vibe and a roll back cannot run in the same version');
  } else if (previousChoice) errors.push('vibe_previous needs vibes: it says what happens to the version before a vibe');
  const keptVersions = [];
  for (const raw of listField(spec.remove_kept, 'remove_kept', errors)) {
    const version = wholeNumber(raw);
    if (version == null || version < 1) errors.push(`remove_kept ${shownValue(raw)} must be a version number, 1 or more`);
    else if (!keptVersions.includes(version)) keptVersions.push(version);
  }
  if (keptVersions.length) out.remove_kept = keptVersions;
  if (flagField(spec.uninstall, 'uninstall', errors)) {
    out.uninstall = true;
    if (out.vibes || retry.length || Object.keys(rollback).length || keptVersions.length) {
      errors.push('Uninstall All removes everything this use case built, so it cannot also rebuild, vibe, roll back or remove a kept version '
        + 'in the same version');
    }
  }

  const sharing = objectField(spec.sharing, 'sharing', errors);
  const principals = [];
  const seen = new Set();
  for (const item of listField(sharing.principals, 'sharing.principals', errors)) {
    const entry = isPlainObject(item) ? item : {};
    const kindText = textValue(entry.type);
    const kind = kindText === null ? null : kindText.toLowerCase();
    const name = textValue(entry.name);
    if (!IMPLEMENT_PRINCIPAL_TYPES.includes(kind) || !name || name.includes('`')) {
      errors.push(`principal ${shownValue(item)} must have a type (${IMPLEMENT_PRINCIPAL_TYPES.join(', ')}) and a name without backticks`);
    } else if (!seen.has(`${kind}:${name.toLowerCase()}`)) {
      seen.add(`${kind}:${name.toLowerCase()}`);
      principals.push({ type: kind, name });
    }
  }
  out.sharing = { principals };
  return { spec: out, errors };
}

function vibesLength(text) {
  return [...str(text)].length;
}

function vibesText(raw, field, label, errors) {
  const text = textField(raw, field, errors);
  const length = vibesLength(text);
  if (length > IMPLEMENT_VIBES_MAX) errors.push(`the ${label} vibes are ${length} characters; at most ${IMPLEMENT_VIBES_MAX} are allowed`);
  return text;
}

function outputVibes(outputs, chosen, errors) {
  const vibes = {};
  for (const name of IMPLEMENT_OUTPUTS) {
    const key = `${name}_vibes`;
    vibes[key] = chosen[name] ? vibesText(outputs[key], `outputs.${key}`, IMPLEMENT_OUTPUT_LABELS[name], errors) : '';
  }
  for (const [id, raw] of Object.entries(partVibes(outputs))) {
    const part = implementPart(id);
    if (part.output !== IMPLEMENT_NOTEBOOK && !chosen[part.output]) continue;
    if (vibesText(raw, `outputs.${id}_vibes`, part.label, errors)) vibes[`${id}_vibes`] = raw;
  }
  return vibes;
}

function implementPart(id) {
  const text = str(id);
  if (ownKey(IMPLEMENT_NOTEBOOK_PARTS, text)) return { output: IMPLEMENT_NOTEBOOK, label: IMPLEMENT_NOTEBOOK_PARTS[text] };
  const match = IMPLEMENT_PART_RE.exec(text);
  if (!match) return null;
  return match[1] === 'app:page' ? { output: 'app', label: `App page ${match[2]}` } : { output: 'dashboard', label: `dashboard chart ${match[2]}` };
}

function partVibes(outputs) {
  const found = {};
  for (const [key, value] of Object.entries(isPlainObject(outputs) ? outputs : {})) {
    const id = key.endsWith('_vibes') ? key.slice(0, -'_vibes'.length) : '';
    if (implementPart(id)) found[id] = value;
  }
  return found;
}

function partProblems(built, spec) {
  const assets = built && isPlainObject(built.asset_status) ? built.asset_status : {};
  const before = partVibes(built && isPlainObject(built.spec_json) ? built.spec_json.outputs : null);
  const after = partVibes(spec.outputs);
  const ticked = spec.outputs || {};
  const rolling = Object.keys(spec.rollback_outputs || {});
  const retry = (spec.retry_outputs || []).filter((id) => implementPart(id));
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((id) => {
    const { output } = implementPart(id);
    return (output === IMPLEMENT_NOTEBOOK || ticked[output]) && !rolling.includes(output) && str(before[id]).trim() !== str(after[id]).trim();
  });
  const problems = [];
  for (const id of [...new Set([...retry, ...changed])]) {
    const { label } = implementPart(id);
    const entry = assets[id];
    if (!isPlainObject(entry) || !IMPLEMENT_PART_STATES.includes(entry.state)) {
      problems.push(`Inspire has not built the ${label} on this MVP, so it cannot rebuild it with your vibes; pick an asset the Control tower lists`);
    } else if (!retry.includes(id)) {
      problems.push(`the vibes for the ${label} changed, so list ${id} in retry_outputs to rebuild it with them`);
    }
  }
  return problems;
}

function choiceField(outputs, key, fallback, choices, separator, errors, lower = false) {
  const raw = outputs[key];
  let text = textValue(raw);
  if (text !== null) text = (lower ? text.toLowerCase() : text) || fallback;
  if (text === null || !choices.includes(text)) {
    errors.push(`${key} ${shownValue(raw)} must be one of ${choices.join(separator)}`);
    return fallback;
  }
  return text;
}

function alertOptions(given, on) {
  const errors = [];
  const outputs = on ? given : {};
  const tiers = choiceField(outputs, 'alert_tiers', 'act_now', Object.keys(IMPLEMENT_ALERT_TIER_SETS), ', ', errors, true);
  const operator = choiceField(outputs, 'alert_operator', '>=', IMPLEMENT_ALERT_OPERATORS, ' ', errors);
  const raw = outputs.alert_threshold;
  let threshold = raw == null || raw === '' ? 1 : decimalNumber(raw);
  if (threshold == null || threshold < 0) {
    errors.push(`alert_threshold ${shownValue(raw)} must be a number of rows, 0 or more`);
    threshold = 1;
  }
  const basis = choiceField(outputs, 'alert_threshold_basis', 'fixed', IMPLEMENT_ALERT_THRESHOLD_BASES, ', ', errors, true);
  if (basis === 'baseline' && !ownKey(IMPLEMENT_ALERT_BASELINE_DIRECTIONS, operator)) {
    errors.push('a baseline threshold fires on a rise or a fall against earlier runs, so alert_operator must be one of '
      + `${Object.keys(IMPLEMENT_ALERT_BASELINE_DIRECTIONS).join(' ')}, not ${shownValue(operator)}`);
  }
  const recipients = [];
  for (const rawEmail of listField(outputs.alert_recipients, 'outputs.alert_recipients', errors)) {
    const email = textValue(rawEmail);
    if (email === null || !IMPLEMENT_EMAIL_RE.test(email)) errors.push(`alert recipient ${shownValue(email === null ? rawEmail : email)} is not an email address`);
    else if (!recipients.some((e) => e.toLowerCase() === email.toLowerCase())) recipients.push(email);
  }
  const destinations = [];
  for (const rawItem of listField(outputs.alert_destinations, 'outputs.alert_destinations', errors)) {
    const item = isPlainObject(rawItem) ? rawItem : { id: rawItem };
    const id = textValue(item.id);
    if (id === null || !IMPLEMENT_DESTINATION_ID_RE.test(id)) {
      errors.push(`alert destination ${shownValue(rawItem)} needs the id of a workspace notification destination`);
    } else if (!destinations.some((d) => d.id === id)) {
      destinations.push({ id, name: clip(textField(item.name, 'the name of each alert destination', errors), 200) });
    }
  }
  if (on && !recipients.length && !destinations.length) {
    errors.push('an alert needs at least one recipient email or notification destination');
  }
  if (recipients.length + destinations.length > IMPLEMENT_ALERT_MAX_SUBSCRIBERS) {
    errors.push(`an alert can notify at most ${IMPLEMENT_ALERT_MAX_SUBSCRIBERS} recipients and destinations`);
  }
  return {
    options: {
      alert_name: on ? clip(textField(outputs.alert_name, 'outputs.alert_name', errors), 200) : '',
      alert_tiers: tiers,
      alert_operator: operator,
      alert_threshold: threshold,
      alert_threshold_basis: basis,
      alert_condition_text: on ? clip(textField(outputs.alert_condition_text, 'outputs.alert_condition_text', errors), 500) : '',
      alert_recipients: recipients,
      alert_destinations: destinations,
    },
    errors,
  };
}

function holdoutSetting(raw, errors) {
  const holdout = objectField(raw, 'holdout', errors);
  const given = holdout.share;
  let share = given == null || given === '' ? IMPLEMENT_HOLDOUT_SHARE : decimalNumber(given);
  if (share == null || share <= 0 || share > IMPLEMENT_HOLDOUT_MAX_SHARE) {
    errors.push(`holdout share ${shownValue(given)} must be a share above 0 and at most ${IMPLEMENT_HOLDOUT_MAX_SHARE}, such as `
      + `${IMPLEMENT_HOLDOUT_SHARE} for ${Math.round(IMPLEMENT_HOLDOUT_SHARE * 100)}% of the records`);
    share = IMPLEMENT_HOLDOUT_SHARE;
  }
  return { enabled: flagField(holdout.enabled, 'holdout.enabled', errors), share };
}

function implementHoldoutShare(holdout) {
  return isPlainObject(holdout) && holdout.enabled === true ? Number(holdout.share) || 0 : 0;
}

function appOwners(outputs, on, errors) {
  if (!on) return [];
  const owners = [];
  for (const raw of listField(outputs.app_owners, 'outputs.app_owners', errors)) {
    const email = textValue(raw);
    if (email === null || email.length > IMPLEMENT_EMAIL_MAX_CHARS || !IMPLEMENT_EMAIL_RE.test(email)) {
      errors.push(`App owner ${shownValue(email === null ? raw : email)} is not an email address`);
    } else if (!owners.some((o) => o.toLowerCase() === email.toLowerCase())) owners.push(email);
  }
  if (owners.length > IMPLEMENT_APP_OWNERS_MAX) {
    errors.push(`an App can name at most ${IMPLEMENT_APP_OWNERS_MAX} owners, the people who may change its money at stake assumptions`);
  }
  return owners;
}

function appSettings(outputs, on, shell, errors, legacyAccess = '') {
  const look = { ...IMPLEMENT_APP_LOOK_DEFAULT };
  const options = Object.fromEntries(IMPLEMENT_APP_OPTION_KEYS.map((key) => [key, false]));
  if (!on) return { access: '', look: {}, options: {}, backend: '', charts: [], pages: {}, placement: '' };
  const catalog = shell || appShellCatalog();
  if (!catalog.ok) {
    errors.push(`the App cannot be built: ${catalog.error}`);
    return { access: '', look, options, backend: '', placement: '' };
  }
  const charts = appChartKinds(outputs.app_charts, catalog.chart_kinds, errors);
  const pages = appScreens(outputs.app_pages, catalog.screens, errors);
  const rawAccess = outputs.app_access;
  const text = textValue(rawAccess);
  const access = text === null ? null : (text.toLowerCase() || (rawAccess == null ? str(legacyAccess) : ''));
  if (!catalog.auths.includes(access)) {
    errors.push(access === '' ? IMPLEMENT_APP_ACCESS_CHOICE : `${IMPLEMENT_APP_ACCESS_CHOICE}, not ${shownValue(rawAccess)}`);
  }
  for (const [key, value] of Object.entries(objectField(outputs.app_look, 'outputs.app_look', errors))) {
    if (!ownKey(IMPLEMENT_APP_LOOK_LISTS, key)) {
      errors.push(`the App look has no setting ${shownValue(key)}; it sets only ${Object.keys(IMPLEMENT_APP_LOOK_LISTS).join(', ')}`);
      continue;
    }
    const list = catalog[IMPLEMENT_APP_LOOK_LISTS[key]];
    const chosenText = textValue(value);
    const picked = chosenText === null ? null : chosenText.toLowerCase();
    if (picked === '') continue;
    if (picked !== null && list.includes(picked)) look[key] = picked;
    else errors.push(`the App ${key} ${shownValue(value)} is not one Inspire offers; pick one of ${list.join(', ')}`);
  }
  for (const [key, value] of Object.entries(objectField(outputs.app_options, 'outputs.app_options', errors))) {
    if (!IMPLEMENT_APP_OPTION_KEYS.includes(key)) {
      errors.push(`the App has no option ${shownValue(key)}; its options are ${IMPLEMENT_APP_OPTION_KEYS.join(', ')}`);
    } else if (value != null && typeof value !== 'boolean') {
      errors.push(`the App option ${key} must be true or false, not ${shownValue(value)}`);
    } else {
      options[key] = value === true;
    }
  }
  if (access === 'user') for (const key of IMPLEMENT_PER_USER_OFF) options[key] = false;
  if (!options.modify) options.replace_edits = false;
  const fallback = catalog.backends[catalog.backends.length - 1];
  const backendText = textValue(outputs.app_backend);
  const backend = backendText === '' ? fallback : backendText === null ? null : backendText.toLowerCase();
  if (!catalog.backends.includes(backend)) errors.push(`${IMPLEMENT_APP_BACKEND_CHOICE}, not ${shownValue(outputs.app_backend)}`);
  const placementText = textValue(outputs.app_placement);
  const placement = placementText === null ? null : placementText.toLowerCase();
  if (placement === null || (placement && !IMPLEMENT_APP_PLACEMENTS.includes(placement))) {
    errors.push(`${IMPLEMENT_APP_PLACEMENT_CHOICE}, not ${shownValue(outputs.app_placement)}`);
  }
  return { access: catalog.auths.includes(access) ? access : '', look, options, backend: catalog.backends.includes(backend) ? backend : fallback,
    ...(charts ? { charts } : {}), ...(pages ? { pages } : {}), placement: IMPLEMENT_APP_PLACEMENTS.includes(placement) ? placement : '' };
}

function appChartKinds(raw, kinds, errors) {
  if (!kinds) {
    if (raw != null && !(Array.isArray(raw) && !raw.length)) errors.push("this Inspire agent notebook draws the charts Genie picks, so it cannot take the kinds of chart you picked; update Inspire to pick them");
    return null;
  }
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    errors.push(`the App charts must be a list of the kinds of chart the App draws, from ${kinds.join(', ')}`);
    return [];
  }
  const picked = [];
  for (const value of raw) {
    const kind = (textValue(value) || '').toLowerCase();
    if (!kinds.includes(kind)) errors.push(`the App has no kind of chart ${shownValue(value)}; its kinds are ${kinds.join(', ')}`);
    else if (!picked.includes(kind)) picked.push(kind);
  }
  if (picked.length && picked.length < IMPLEMENT_APP_CHARTS_MIN) {
    errors.push(`pick at least ${IMPLEMENT_APP_CHARTS_MIN} kinds of chart for the App, not ${picked.length}`);
  }
  return kinds.filter((k) => picked.includes(k));
}

function appScreens(raw, screens, errors) {
  if (!screens) {
    if (isPlainObject(raw) && Object.values(raw).some((v) => v === false)) errors.push('this Inspire agent notebook shows every App page, so it cannot turn one off; update Inspire to turn pages off');
    return null;
  }
  const pages = Object.fromEntries(screens.map((key) => [key, true]));
  for (const [key, value] of Object.entries(objectField(raw, 'outputs.app_pages', errors))) {
    if (!screens.includes(key)) {
      errors.push(`the App has no page ${shownValue(key)} to turn on or off; Things to fix and Ask Genie are always on, and only ${screens.join(', ')} can be turned off`);
    } else if (value != null && typeof value !== 'boolean') {
      errors.push(`the App page ${key} must be true or false, not ${shownValue(value)}`);
    } else if (value != null) pages[key] = value;
  }
  return pages;
}

function mergeChoices(outputs, chosen, errors) {
  const out = Object.fromEntries(IMPLEMENT_MERGE_OUTPUTS.map((name) => [name, '']));
  for (const [name, value] of Object.entries(objectField(outputs.merge, 'outputs.merge', errors))) {
    if (!IMPLEMENT_MERGE_OUTPUTS.includes(name)) {
      errors.push(`outputs.merge.${name} is not one of ${IMPLEMENT_MERGE_OUTPUTS.join(', ')}`);
      continue;
    }
    if (value != null && typeof value !== 'string') {
      errors.push(`outputs.merge.${name} must be text: the ${IMPLEMENT_MERGE_LABELS[name]} to add to, or "" for a new one`);
      continue;
    }
    const id = textValue(value);
    if (!id || !chosen[name]) continue;
    const target = name === 'app' ? id.toLowerCase() : id;
    if ((name === 'app' ? IMPLEMENT_APP_NAME_RE : IMPLEMENT_MERGE_ID_RE).test(target)) out[name] = target;
    else errors.push(`outputs.merge.${name} ${shownValue(value)} must name an existing Inspire ${IMPLEMENT_MERGE_LABELS[name]}`);
  }
  return out;
}

function sortedJson(value) {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${sortedJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function section(spec, key) {
  const value = (spec || {})[key];
  return sortedJson(value == null ? {} : value);
}

function optionChanges(before, after) {
  return IMPLEMENT_OUTPUTS.filter((name) => before[name] && after[name]
    && IMPLEMENT_OUTPUT_OPTIONS[name].some((o) => sortedJson(before[o]) !== sortedJson(after[o])));
}

function mergeMoved(before, after, name) {
  return IMPLEMENT_MERGE_OUTPUTS.includes(name) && str((before.merge || {})[name]) !== str((after.merge || {})[name]);
}

function classifyImplementChange(previous, current) {
  if (!previous) return ['initial'];
  const classes = new Set();
  if (section(previous, 'data') !== section(current, 'data')) classes.add('data');
  if (section(previous, 'config') !== section(current, 'config') || section(previous, 'use_case') !== section(current, 'use_case')) {
    classes.add('config');
  }
  if (section(previous, 'schedule') !== section(current, 'schedule')) classes.add('schedule');
  const before = previous.outputs || {};
  const after = current.outputs || {};
  if (IMPLEMENT_OUTPUTS.some((n) => after[n] && !before[n])
    || (after.app && before.app && after.app_name !== before.app_name)
    || IMPLEMENT_OUTPUTS.some((n) => after[n] && before[n] && mergeMoved(before, after, n))
    || optionChanges(before, after).length) {
    classes.add('outputs');
  }
  if (IMPLEMENT_OUTPUTS.some((n) => before[n] && !after[n])) classes.add('deselect');
  if (section(previous, 'sharing') !== section(current, 'sharing')) classes.add('sharing');
  if ((current.retry_outputs || []).length) classes.add('retry');
  if (Object.keys(current.rollback_outputs || {}).length) classes.add('rollback');
  if (implementHoldoutShare(previous.holdout) !== implementHoldoutShare(current.holdout)) classes.add('holdout');
  for (const [name, key] of [['vibe', 'vibes'], ['remove_kept', 'remove_kept'], ['uninstall', 'uninstall']]) {
    const value = current[key];
    if (Array.isArray(value) ? value.length : value) classes.add(name);
  }
  return IMPLEMENT_CHANGE_CLASSES.filter((c) => classes.has(c));
}

function implementChangeSummary(previous, current, assets = {}) {
  const classes = classifyImplementChange(previous, current);
  const retry = (current.retry_outputs || []).map((id) => (implementPart(id) || { output: id }).output);
  const refill = classes.some((c) => ['initial', 'data', 'config'].includes(c)) || retry.includes(IMPLEMENT_NOTEBOOK);
  const before = (previous && previous.outputs) || {};
  const after = current.outputs || {};
  const changedOptions = previous ? optionChanges(before, after) : [];
  const rollingBack = Object.keys(current.rollback_outputs || {});
  const build = [];
  const refresh = [];
  const rollback = [];
  for (const name of IMPLEMENT_OUTPUTS) {
    if (!after[name]) continue;
    const renamed = (name === 'app' && before.app && before.app_name !== after.app_name) || (before[name] && mergeMoved(before, after, name));
    if (!assets[name] || !before[name] || renamed) build.push(name);
    else if (rollingBack.includes(name)) rollback.push(name);
    else if (refill || changedOptions.includes(name) || retry.includes(name)
      || (name === 'alert' && classes.includes('schedule'))) refresh.push(name);
  }
  const deselected = IMPLEMENT_OUTPUTS.filter((n) => before[n] && !after[n]);
  const removed = current.removed_outputs || {};
  const undecided = deselected.filter((n) => assets[n] && !removed[n]);
  return {
    classes,
    refill,
    build,
    refresh,
    rollback,
    delete: deselected.filter((n) => removed[n] === 'delete' && assets[n]),
    keep_unmanaged: deselected.filter((n) => removed[n] !== 'delete' && assets[n]),
    undecided,
    schedule: classes.includes('initial') || classes.includes('schedule') || refill,
    nothing_to_do: previous != null && classes.length === 0,
  };
}

function implementTableName(catalog, schema) {
  return `\`${catalog}\`.\`${schema}\`.\`${IMPLEMENT_TABLE}\``;
}

function implementTableCreateSql(table) {
  const columns = IMPLEMENT_COLUMNS.map(([name, kind]) => `\`${name}\` ${kind}`).join(', ');
  return `CREATE TABLE IF NOT EXISTS ${table} (${columns}) USING DELTA CLUSTER BY (\`session_id\`, \`use_case_id\`) `
    + "COMMENT 'Start Use Case MVP with Genie: one row per wizard spec version. The Inspire App inserts the spec and the id of the run "
    + "that builds it; the Inspire agent writes every other column.'";
}

function implementSelectColumns(existing = null, names = null) {
  return IMPLEMENT_COLUMNS.filter(([name]) => (names ? names.includes(name) : !IMPLEMENT_UNREAD_COLUMNS.includes(name))).map(([name, kind]) => {
    if (existing && !existing.has(name.toLowerCase())) return `NULL AS \`${name}\``;
    return kind === 'VARIANT' ? `to_json(\`${name}\`) AS \`${name}\`` : `\`${name}\``;
  }).join(', ');
}

const IMPLEMENT_REGISTRY_COLUMNS = ['session_id', 'use_case_id', 'spec_version', 'spec_json', 'status', 'dashboard_id', 'genie_space_id',
  'app_name', 'asset_status', 'updated_at'];

function implementRegistryStatement(table, existing = null) {
  const held = ['app_name', 'dashboard_id', 'genie_space_id', 'asset_status'].filter((name) => !existing || existing.has(name));
  return {
    sql: `SELECT ${implementSelectColumns(existing, IMPLEMENT_REGISTRY_COLUMNS)} FROM ${table} `
      + `WHERE ${held.length ? held.map((name) => `\`${name}\` IS NOT NULL`).join(' OR ') : 'FALSE'} `
      + 'ORDER BY session_id, use_case_id, spec_version DESC LIMIT 5000',
    parameters: null,
  };
}

function mergeRegistry(rows, { sessionId, useCaseId, only = null } = {}) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = `${str(row.session_id)}|${str(row.use_case_id)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const found = Object.fromEntries(IMPLEMENT_MERGE_OUTPUTS.map((name) => [name, new Map()]));
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0));
    const first = sorted[0];
    const own = str(first.session_id) === str(sessionId) && str(first.use_case_id) === str(useCaseId);
    const built = sorted.find((r) => IMPLEMENT_DONE_STATUSES.includes(r.status)) || first;
    const outputs = (isPlainObject(built.spec_json) && isPlainObject(built.spec_json.outputs)) ? built.spec_json.outputs : {};
    const holder = {
      session_id: str(first.session_id),
      use_case_id: str(first.use_case_id),
      use_case_name: str(isPlainObject(built.spec_json) ? built.spec_json.use_case_name : '').trim() || str(first.use_case_id),
      app_access: outputs.app_access === 'user' ? 'user' : 'sp',
      app_look: isPlainObject(outputs.app_look) ? outputs.app_look : null,
      app_placement: IMPLEMENT_APP_PLACEMENTS.includes(outputs.app_placement) ? outputs.app_placement : '',
      updated_at: str(first.updated_at),
    };
    const assets = carriedAssets(sorted);
    for (const name of IMPLEMENT_MERGE_OUTPUTS) {
      const id = str(assets[name]);
      if (!id) continue;
      if (!found[name].has(id)) found[name].set(id, { id, holders: [], own: false });
      const entry = found[name].get(id);
      if (own) entry.own = true;
      else entry.holders.push(holder);
    }
  }
  const recent = (entry) => entry.holders.reduce((at, h) => (h.updated_at > at ? h.updated_at : at), '');
  return Object.fromEntries(IMPLEMENT_MERGE_OUTPUTS.map((name) => [name, [...found[name].values()]
    .filter((entry) => !entry.own && entry.holders.length && (!only || str(only[name]) === entry.id))
    .sort((a, b) => (recent(b) > recent(a) ? 1 : recent(b) < recent(a) ? -1 : 0))
    .slice(0, IMPLEMENT_MERGE_TARGET_CAP)]));
}

function mergeTargetPath(name, id) {
  const enc = encodeURIComponent(id);
  return { app: `/api/2.0/apps/${enc}`, dashboard: `/api/2.0/lakeview/dashboards/${enc}`, genie_space: `/api/2.0/genie/spaces/${enc}` }[name];
}

function appMergeBlock(target, access) {
  return access === 'user' && target && target.access === 'sp'
    ? `${target.name} signs everyone in with its own service principal, so a per-user (sensitive) use case cannot join it: `
      + 'create a new App, or choose Internal data'
    : '';
}

function mergeTarget(name, entry, got, host = '') {
  if (!got || !got.ok) return null;
  const d = isPlainObject(got.data) ? got.data : {};
  const useCases = entry.holders.map((h) => ({ session_id: h.session_id, use_case_id: h.use_case_id, name: h.use_case_name }));
  if (name === 'app') {
    const owner = entry.holders.find((h) => str(d.description).startsWith(appOwnerTag(h.use_case_id, h.session_id)));
    if (!owner) return null;
    const target = {
      id: entry.id, name: str(d.name) || entry.id, url: str(d.url),
      use_cases: useCases.map((u, i) => ({ ...u, placement: entry.holders[i].app_placement, updated_at: entry.holders[i].updated_at })),
      access: entry.holders.some((h) => h.app_access === 'user') ? 'user' : 'sp',
      look: owner.app_look,
    };
    return { ...target, per_user_block: appMergeBlock(target, 'user') };
  }
  if (name === 'dashboard') {
    if (str(d.lifecycle_state) === 'TRASHED') return null;
    return { id: entry.id, name: str(d.display_name) || entry.id, url: host ? `${str(host).replace(/\/+$/, '')}/dashboardsv3/${entry.id}/published` : '',
      use_cases: useCases };
  }
  return { id: entry.id, name: str(d.title) || entry.id, url: host ? `${str(host).replace(/\/+$/, '')}/genie/rooms/${entry.id}` : '', use_cases: useCases };
}

function scopeSessions(targets) {
  const sessions = [];
  for (const target of targets || []) {
    for (const u of target.use_cases || []) {
      if (/^\d+$/.test(str(u.session_id)) && !sessions.includes(str(u.session_id))) sessions.push(str(u.session_id));
    }
  }
  return sessions.slice(0, IMPLEMENT_SCOPE_SESSION_CAP);
}

function useCaseScopeStatement(catalog, schema, sessions) {
  const at = (name) => `\`${catalog}\`.\`${schema}\`.\`${name}\``;
  return {
    sql: 'SELECT CAST(u.session_id AS STRING) AS session_id, u.id AS use_case_id, u.business_domain AS domain, s.business_name AS business '
      + `FROM ${at('__inspire_usecases')} u LEFT JOIN (SELECT session_id, max(business_name) AS business_name FROM ${at('__inspire_session')} `
      + `GROUP BY session_id) s ON s.session_id = u.session_id WHERE u.session_id IN (${sessions.map((_, i) => `:s${i}`).join(', ')})`,
    parameters: sessions.map((sid, i) => ({ name: `s${i}`, value: sid, type: 'BIGINT' })),
  };
}

function withUseCaseScope(targets, rows) {
  const scope = new Map((rows || []).map((r) => [`${str(r.session_id)}|${str(r.use_case_id)}`, r]));
  return (targets || []).map((target) => ({
    ...target,
    use_cases: (target.use_cases || []).map((u) => {
      const row = scope.get(`${str(u.session_id)}|${str(u.use_case_id)}`);
      return { ...u, business: row ? str(row.business).trim() : null, domain: row ? str(row.domain).trim() : null };
    }),
  }));
}

function mergeProblems(spec, targets, held = {}) {
  const outputs = (spec && spec.outputs) || {};
  const merge = outputs.merge || {};
  const problems = [];
  for (const name of IMPLEMENT_MERGE_OUTPUTS) {
    const id = str(merge[name]);
    if (!id || !outputs[name] || str(held[name]) === id) continue;
    const target = ((targets && targets[name]) || []).find((t) => t.id === id);
    if (!target) {
      problems.push(`${id} is not ${IMPLEMENT_MERGE_NOUNS[name]} Inspire built that you can open: pick one Inspire lists, or create a new one`);
    } else if (name === 'app' && appMergeBlock(target, outputs.app_access)) {
      problems.push(appMergeBlock(target, outputs.app_access));
    }
  }
  return problems;
}

function implementHistoryStatement(table, sessionId, useCaseId, existing = null) {
  const where = useCaseId ? 'session_id = :sid AND use_case_id = :uc' : 'session_id = :sid';
  const parameters = [{ name: 'sid', value: String(sessionId), type: 'BIGINT' }];
  if (useCaseId) parameters.push({ name: 'uc', value: String(useCaseId), type: 'STRING' });
  return {
    sql: `SELECT ${implementSelectColumns(existing)} FROM ${table} WHERE ${where} ORDER BY use_case_id, spec_version DESC LIMIT 2000`,
    parameters,
  };
}

function describedColumnNames(rows) {
  const names = new Set();
  for (const row of rows || []) {
    const name = str(row && row.col_name).trim();
    if (!name || name.startsWith('#')) break;
    names.add(name.toLowerCase());
  }
  return names;
}

function implementMissingColumns(existing) {
  return IMPLEMENT_COLUMNS.filter(([name]) => !existing.has(name.toLowerCase()));
}

function isMissingColumnError(err) {
  return /UNRESOLVED_COLUMN|42703|FIELD_NOT_FOUND|cannot be resolved|cannot resolve/i.test(str(err && err.message ? err.message : err));
}

function implementInsertStatement(table, { sessionId, useCaseId, specVersion, basedOnVersion, spec, createdBy, statusMessage, changeClasses }) {
  const classes = Array.isArray(changeClasses) ? changeClasses.join(',') : str(changeClasses);
  return {
    sql:
      `INSERT INTO ${table} (session_id, use_case_id, spec_version, based_on_version, spec_json, status, status_message, `
      + 'change_classes, created_by, created_at, updated_at) VALUES (:sid, :uc, :v, :based, parse_json(:spec), \'queued\', :message, '
      + ':classes, :by, current_timestamp(), current_timestamp())',
    parameters: [
      { name: 'sid', value: String(sessionId), type: 'BIGINT' },
      { name: 'uc', value: String(useCaseId), type: 'STRING' },
      { name: 'v', value: String(specVersion), type: 'INT' },
      basedOnVersion == null ? { name: 'based', type: 'INT' } : { name: 'based', value: String(basedOnVersion), type: 'INT' },
      { name: 'spec', value: JSON.stringify(spec), type: 'STRING' },
      { name: 'message', value: str(statusMessage).slice(0, 2000), type: 'STRING' },
      { name: 'classes', value: classes.slice(0, 500), type: 'STRING' },
      { name: 'by', value: str(createdBy).slice(0, 320), type: 'STRING' },
    ],
  };
}

function implementVersionParameters({ sessionId, useCaseId, specVersion }) {
  return [
    { name: 'sid', value: String(sessionId), type: 'BIGINT' },
    { name: 'uc', value: String(useCaseId), type: 'STRING' },
    { name: 'v', value: String(specVersion), type: 'INT' },
  ];
}

function implementRunStartedStatement(table, { sessionId, useCaseId, specVersion, runId, message }) {
  const run = /^\d{1,19}$/.test(str(runId)) ? { name: 'run', value: str(runId), type: 'BIGINT' } : { name: 'run', type: 'BIGINT' };
  return {
    sql: `UPDATE ${table} SET implement_run_id = :run, `
      + "status_message = CASE WHEN status = 'queued' THEN :message ELSE status_message END "
      + 'WHERE session_id = :sid AND use_case_id = :uc AND spec_version = :v',
    parameters: [
      run,
      { name: 'message', value: str(message).slice(0, 2000), type: 'STRING' },
      ...implementVersionParameters({ sessionId, useCaseId, specVersion }),
    ],
  };
}

function implementStartFailedStatement(table, { sessionId, useCaseId, specVersion, message }) {
  return {
    sql: `UPDATE ${table} SET status = 'failed', status_message = :message, updated_at = current_timestamp() `
      + "WHERE session_id = :sid AND use_case_id = :uc AND spec_version = :v AND status = 'queued'",
    parameters: [
      { name: 'message', value: str(message).slice(0, 2000), type: 'STRING' },
      ...implementVersionParameters({ sessionId, useCaseId, specVersion }),
    ],
  };
}

function implementStalled(row, run, now = Date.now()) {
  if (!row || !IMPLEMENT_ACTIVE_STATUSES.includes(row.status)) return null;
  const version = `v${row.spec_version}`;
  const doing = String(row.status).replace(/_/g, ' ');
  const runId = /^\d{1,19}$/.test(str(row.implement_run_id)) ? str(row.implement_run_id) : null;
  if (run) {
    const state = isPlainObject(run.state) ? run.state : {};
    const status = isPlainObject(run.status) ? run.status : {};
    const lifeCycle = str(state.life_cycle_state || status.state).toUpperCase();
    if (!IMPLEMENT_RUN_ENDED_STATES.includes(lifeCycle)) return null;
    const details = isPlainObject(status.termination_details) ? status.termination_details : {};
    const how = [str(state.result_state || details.code || lifeCycle), str(state.state_message || details.message).trim()]
      .filter(Boolean).join(': ');
    return {
      run_id: runId,
      run_url: str(run.run_page_url) || null,
      reason: `the run building ${version} ended (${how}) while ${version} was still ${doing}`,
    };
  }
  const last = Date.parse(str(row.updated_at || row.created_at));
  if (!Number.isFinite(last) || now - last <= IMPLEMENT_STALE_AFTER_MS) return null;
  return {
    run_id: runId,
    run_url: null,
    reason: `${version} has been ${doing} with no progress since ${new Date(last).toISOString()}, longer than an Implement run `
      + `may take (${IMPLEMENT_STALE_AFTER_MS / 3600000} hours)`,
  };
}

function parseImplementRow(row) {
  const out = { ...row };
  for (const name of IMPLEMENT_VARIANT_COLUMNS) {
    if (typeof out[name] === 'string' && out[name]) {
      try {
        out[name] = JSON.parse(out[name]);
      } catch {
        out[name] = null;
      }
    } else if (out[name] === '' || out[name] === undefined) {
      out[name] = null;
    }
  }
  for (const name of ['spec_version', 'based_on_version']) {
    out[name] = out[name] == null || out[name] === '' ? null : Number.parseInt(out[name], 10);
  }
  out.spec_json = withOfferedAppOptions(out.spec_json);
  return out;
}

function withOfferedAppOptions(spec) {
  const outputs = isPlainObject(spec) && isPlainObject(spec.outputs) ? spec.outputs : null;
  if (!outputs || !isPlainObject(outputs.app_options)) return spec;
  const options = Object.fromEntries(Object.entries(outputs.app_options).filter(([key]) => IMPLEMENT_APP_OPTION_KEYS.includes(key)));
  return { ...spec, outputs: { ...outputs, app_options: options } };
}

function carriedAssets(history) {
  const carried = {};
  const stopped = new Set();
  for (const row of [...(history || [])].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0))) {
    const status = isPlainObject(row.asset_status) ? row.asset_status : {};
    for (const [name, entry] of Object.entries(status)) if (entry && IMPLEMENT_STOPPED_STATES.includes(entry.state)) stopped.add(name);
    for (const [output, column] of Object.entries(IMPLEMENT_OUTPUT_ID_COLUMNS)) {
      if (carried[output] || stopped.has(output) || row[column] == null || row[column] === '') continue;
      carried[output] = row[column];
    }
  }
  return carried;
}

function keptAssets(history) {
  const rows = [...(history || [])].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0));
  const holder = rows.find((r) => isPlainObject(r.asset_status) && isPlainObject(r.asset_status.kept));
  const listed = holder ? holder.asset_status.kept.assets : null;
  return (Array.isArray(listed) ? listed : []).filter((a) => isPlainObject(a) && IMPLEMENT_OUTPUTS.includes(a.output) && a.id);
}

function mvpActionProblems(history, spec) {
  const rows = [...(history || [])].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0));
  const built = Object.keys(carriedAssets(rows)).length > 0;
  const kept = keptAssets(rows);
  const problems = [];
  if (spec.vibes && !built) {
    problems.push('Inspire has built no dashboard, Genie Agent, App or alert on this MVP yet, so a vibe has nothing to change; build one first');
  }
  if (spec.uninstall && rows[0] && rows[0].status === IMPLEMENT_UNINSTALLED) {
    problems.push(`this MVP was uninstalled in v${rows[0].spec_version}, so there is nothing left to remove`);
  } else if (spec.uninstall && !built && !kept.length && !rows.some((r) => r.notebook_path || r.job_id)) {
    problems.push('Inspire has built nothing for this use case yet, so there is nothing to uninstall');
  }
  for (const version of spec.remove_kept || []) {
    if (!kept.some((a) => Number(a.version) === version)) problems.push(`v${version} has nothing kept live, so there is nothing of it to remove`);
  }
  return problems;
}

function rollbackSpec(history, spec) {
  const asked = Object.entries((spec && spec.rollback_outputs) || {});
  if (!asked.length) return spec;
  const rows = [...(history || [])].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0));
  const next = rows.length ? (rows[0].spec_version || 0) + 1 : 1;
  const outputs = { ...spec.outputs };
  const problems = [];
  for (const [name, version] of asked) {
    const row = version < next ? rows.find((r) => r.spec_version === version) : null;
    const entry = row && isPlainObject(row.asset_status) ? row.asset_status[name] : null;
    if (!isPlainObject(entry) || entry.snapshot !== true) {
      problems.push(`v${version} has no saved ${IMPLEMENT_OUTPUT_LABELS[name]} to roll back to`);
      continue;
    }
    const savedOutputs = isPlainObject(row.spec_json) && isPlainObject(row.spec_json.outputs) ? row.spec_json.outputs : {};
    const saved = savedOutputs[`${name}_vibes`];
    outputs[`${name}_vibes`] = typeof saved === 'string' ? saved.trim() : '';
    for (const id of Object.keys(partVibes(outputs))) if (implementPart(id).output === name) delete outputs[`${id}_vibes`];
    for (const [id, value] of Object.entries(partVibes(savedOutputs))) {
      if (implementPart(id).output === name && typeof value === 'string' && value.trim()) outputs[`${id}_vibes`] = value;
    }
  }
  if (problems.length) throw badRequest(problems.join('; '));
  return { ...spec, outputs };
}

function planSubmission(history, spec, stalled = null) {
  const rows = [...(history || [])].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0));
  const latest = rows[0] || null;
  if (latest && IMPLEMENT_ACTIVE_STATUSES.includes(latest.status) && !stalled) {
    throw badRequest(`spec v${latest.spec_version} is still ${latest.status}; your edit applies after the current run`, 409);
  }
  const built = rows.find((r) => IMPLEMENT_DONE_STATUSES.includes(r.status)) || null;
  if (built && spec.based_on_version != null && built.spec_version > spec.based_on_version) {
    throw badRequest(`v${built.spec_version} was built after the version you edited (v${spec.based_on_version}); `
      + 'reopen Edit to see it and submit again', 409);
  }
  const parts = [...partProblems(built, spec), ...mvpActionProblems(rows, spec)];
  if (parts.length) throw badRequest(parts.join('; '));
  const fresh = Boolean(latest && latest.status === IMPLEMENT_UNINSTALLED);
  const previous = built && !fresh ? validateImplementSpec(built.spec_json, { legacyAccess: legacyAppAccess(rows) }).spec : null;
  const summary = implementChangeSummary(previous, spec, carriedAssets(rows));
  if (summary.undecided.length) {
    throw badRequest(`choose whether to delete or keep ${summary.undecided.map((n) => IMPLEMENT_OUTPUT_LABELS[n]).join(' and ')}, `
      + 'which you unticked; Inspire never deletes an output without asking');
  }
  const unchanged = Boolean(summary.nothing_to_do && latest && IMPLEMENT_DONE_STATUSES.includes(latest.status));
  return { nextVersion: latest ? latest.spec_version + 1 : 1, latest, built, summary, unchanged };
}

function refuseUnchanged(plan) {
  if (plan.unchanged) {
    throw badRequest(`nothing changed since version ${plan.latest.spec_version}, the last built version, so there is nothing new to build; `
      + 'change a choice, or use the Build page to rebuild an output or preview a re-run');
  }
}

function implementJobParams(baseParams, useCaseId, specVersion) {
  return {
    ...baseParams,
    '15_operation': IMPLEMENT_OPERATION,
    [IMPLEMENT_USE_CASE_PARAM]: String(useCaseId),
    [IMPLEMENT_SPEC_VERSION_PARAM]: String(specVersion),
    [IMPLEMENT_RUN_ID_PARAM]: IMPLEMENT_RUN_ID_REFERENCE,
  };
}

const PARAMETERS_SECTION_RE = /^## (?:\d+\. )?Parameters[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m;
const WIDGET_ROW_RE = /^\|\s*`?([A-Za-z][A-Za-z0-9_]{0,40})`?\s*\|\s*(text|dropdown)\s*\|\s*(.*?)\s*\|(?:\s*(.*?)\s*\|)?\s*(.*?)\s*\|\s*$/;
const ALLOWED_NUMBER = '(-?[0-9]+(?:\\.[0-9]+)?)';
const ALLOWED_RE = new RegExp(`^(?:(whole number)(?:, |$))?(?:${ALLOWED_NUMBER} to ${ALLOWED_NUMBER}|(at least|above|greater than|more than) ${ALLOWED_NUMBER}(?: and (at most|below|less than) ${ALLOWED_NUMBER})?|(at most|below|less than) ${ALLOWED_NUMBER})?$`);
const ALLOWED_OPEN_WORDS = ['above', 'greater than', 'more than', 'below', 'less than'];
const WIDGET_NUMBER_RE = /^-?[0-9]+(?:\.[0-9]+)?$/;

function allowedRule(text) {
  const value = str(text).trim();
  const match = ALLOWED_RE.exec(value.toLowerCase() === 'any' ? '' : value);
  if (!match) return null;
  const [, whole, from, to, lowWord, lowValue, highWord, highValue, onlyHighWord, onlyHighValue] = match;
  const low = from ?? lowValue;
  const high = to ?? highValue ?? onlyHighValue;
  return {
    low: low !== undefined ? Number(low) : null,
    high: high !== undefined ? Number(high) : null,
    whole: Boolean(whole),
    lowOpen: ALLOWED_OPEN_WORDS.includes(lowWord),
    highOpen: ALLOWED_OPEN_WORDS.includes(highWord ?? onlyHighWord),
  };
}

function numberText(value) {
  return Number(value).toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
}

function allowedText(rule) {
  const { low = null, high = null, whole = false, lowOpen = false, highOpen = false } = rule || {};
  const bounds = low !== null && high !== null && !lowOpen && !highOpen
    ? `${numberText(low)} to ${numberText(high)}`
    : [
      low !== null ? `${lowOpen ? 'above' : 'at least'} ${numberText(low)}` : '',
      high !== null ? `${highOpen ? 'below' : 'at most'} ${numberText(high)}` : '',
    ].filter(Boolean).join(' and ');
  if (!whole) return bounds;
  return bounds ? `whole number, ${bounds}` : 'whole number';
}

function widgetValueProblem(name, value, allowed) {
  const rule = allowedRule(allowed);
  if (!rule || (rule.low === null && rule.high === null && !rule.whole)) return '';
  const text = str(value).trim();
  const number = WIDGET_NUMBER_RE.test(text) && !(rule.whole && text.includes('.')) ? Number(text) : null;
  const belowLow = rule.low !== null && (rule.lowOpen ? number <= rule.low : number < rule.low);
  const aboveHigh = rule.high !== null && (rule.highOpen ? number >= rule.high : number > rule.high);
  if (number === null || belowLow || aboveHigh) {
    return `${name} is '${text}'; allowed: ${allowedText(rule)}`;
  }
  return '';
}

function widgetSetProblems(values) {
  const number = (name) => {
    const text = str(values[name]).trim();
    return WIDGET_NUMBER_RE.test(text) ? Number(text) : null;
  };
  const problems = [];
  const act = number('act_now_share');
  const review = number('review_share');
  if (act !== null && review !== null && act + review > 1 + 1e-9) {
    problems.push(`act_now_share + review_share is ${numberText(act + review)}; allowed: at most 1`);
  }
  const actAmount = number('act_now_amount');
  const reviewAmount = number('review_amount');
  if (actAmount !== null && reviewAmount !== null && reviewAmount > actAmount) {
    problems.push(`review_amount is ${numberText(reviewAmount)}, above act_now_amount ${numberText(actAmount)}; `
      + 'a record needs at least as much at stake to act on now as to review');
  }
  for (const lowName of Object.keys(values).sort()) {
    const highName = `max_${lowName.slice(4)}`;
    if (!lowName.startsWith('min_') || !Object.prototype.hasOwnProperty.call(values, highName)) continue;
    const low = number(lowName);
    const high = number(highName);
    if (low !== null && high !== null && low > high) problems.push(`${lowName} is ${numberText(low)}, above ${highName} ${numberText(high)}`);
  }
  return problems;
}

function widgetProblems(widgets, values) {
  const known = (widgets || []).filter((w) => w && typeof w === 'object');
  const allowed = Object.fromEntries(known.map((w) => [str(w.name), w.allowed]));
  const problems = Object.keys(values || {}).sort()
    .map((name) => widgetValueProblem(name, values[name], allowed[name] ?? ''))
    .filter(Boolean);
  const merged = Object.fromEntries(known.map((w) => [str(w.name), w.default]));
  Object.assign(merged, values || {});
  return problems.concat(widgetSetProblems(merged));
}

function widgetsFromInstruction(instruction) {
  const match = PARAMETERS_SECTION_RE.exec(str(instruction));
  const widgets = [];
  for (const line of (match ? match[1] : '').split('\n')) {
    const row = WIDGET_ROW_RE.exec(line.trim());
    if (!row || row[1].toLowerCase() === 'widget' || widgets.some((w) => w.name === row[1])) continue;
    const rule = row[2] === 'dropdown' ? null : allowedRule(row[4]);
    widgets.push({ name: row[1], type: row[2], default: row[3].replace(/^`|`$/g, ''), allowed: rule ? allowedText(rule) : '', label: row[5], choices: [] });
  }
  return widgets;
}

function implementWidgets(history, instruction) {
  const rows = [...(history || [])].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0));
  const built = rows.find((r) => r && Array.isArray(r.genie_widgets) && r.genie_widgets.length);
  const fromGenie = built ? built.genie_widgets : null;
  const parsed = widgetsFromInstruction(instruction);
  if (fromGenie) {
    const ranges = Object.fromEntries(parsed.map((w) => [w.name, w.allowed]));
    return {
      source: 'genie',
      widgets: fromGenie.filter((w) => w && IMPLEMENT_WIDGET_NAME_RE.test(str(w.name)))
        .map((w) => (w.allowed == null && ranges[w.name] ? { ...w, allowed: ranges[w.name] } : w)),
    };
  }
  return { source: 'instruction', widgets: parsed };
}

function tableParts(name) {
  const parts = plainTable(name).split('.');
  if (parts.length !== 3 || parts.some((p) => !p || p.includes('`'))) throw badRequest(`'${str(name)}' must be catalog.schema.table`);
  return { catalog: parts[0], schema: parts[1], table: parts[2] };
}

function columnsStatement(name) {
  const t = tableParts(name);
  return {
    sql: `SELECT column_name, data_type, ordinal_position FROM \`${t.catalog}\`.information_schema.columns `
      + 'WHERE table_schema = lower(:s) AND table_name = lower(:t) ORDER BY ordinal_position',
    parameters: [{ name: 's', value: t.schema, type: 'STRING' }, { name: 't', value: t.table, type: 'STRING' }],
  };
}

function tableSwapStatement(name, requiredColumns = []) {
  const t = tableParts(name);
  const required = requiredColumns.map((c) => str(c).trim().toLowerCase()).filter(Boolean);
  if (required.some((c) => !/^[a-z0-9_]{1,128}$/.test(c))) throw badRequest('required columns must be plain column names');
  const requiredParams = required.map((c, i) => ({ name: `r${i}`, value: c, type: 'STRING' }));
  const requiredClause = required.length
    ? ` AND SUM(CASE WHEN o.c IN (${required.map((_, i) => `:r${i}`).join(', ')}) THEN 1 ELSE 0 END) = ${required.length}`
    : '';
  const cols = `\`${t.catalog}\`.information_schema.columns`;
  return {
    sql: `WITH o AS (SELECT lower(column_name) AS c, upper(data_type) AS ty FROM ${cols} WHERE table_schema = lower(:s) AND table_name = lower(:t)), `
      + `n AS (SELECT COUNT(*) AS total FROM o), `
      + `k AS (SELECT table_schema, table_name, lower(column_name) AS c, upper(data_type) AS ty FROM ${cols} `
      + "WHERE table_schema <> 'information_schema' AND NOT (table_schema = lower(:s) AND table_name = lower(:t))) "
      + `SELECT k.table_schema, k.table_name, COUNT(*) AS matched, MAX(n.total) AS total FROM k JOIN o ON k.c = o.c AND k.ty = o.ty `
      + `CROSS JOIN n GROUP BY k.table_schema, k.table_name HAVING COUNT(*) >= GREATEST(2, CEIL(MAX(n.total) * 0.5))${requiredClause} `
      + 'ORDER BY matched DESC, k.table_schema, k.table_name LIMIT 20',
    parameters: [{ name: 's', value: t.schema, type: 'STRING' }, { name: 't', value: t.table, type: 'STRING' }, ...requiredParams],
    catalog: t.catalog,
  };
}

function columnValuesStatement(name, column, limit = 200) {
  const table = quoteTable(name);
  const col = quoteColumn(column);
  const cap = Math.max(1, Math.min(500, Number.parseInt(limit, 10) || 200));
  return {
    sql: `SELECT DISTINCT CAST(${col} AS STRING) AS value FROM ${table} WHERE ${col} IS NOT NULL ORDER BY value LIMIT ${cap}`,
    parameters: null,
  };
}

function filterClause(filter, index) {
  const col = quoteColumn(filter.column);
  const op = str(filter.op).toLowerCase();
  const values = (Array.isArray(filter.values) ? filter.values : []).map((v) => str(v));
  const params = values.map((v, i) => ({ name: `f${index}_${i}`, value: v, type: 'STRING' }));
  const refs = params.map((p) => `:${p.name}`);
  if (!IMPLEMENT_FILTER_OPS.includes(op)) throw badRequest(`filter operator '${op}' is not supported`);
  if (op === 'in' || op === 'not in') {
    if (!refs.length) throw badRequest(`filter ${filter.column} ${op} needs at least one value`);
    return { sql: `CAST(${col} AS STRING) ${op.toUpperCase()} (${refs.join(', ')})`, params };
  }
  if (op === 'between') {
    if (refs.length !== 2) throw badRequest(`filter ${filter.column} between needs two values`);
    return { sql: `CAST(${col} AS STRING) BETWEEN ${refs[0]} AND ${refs[1]}`, params };
  }
  if (refs.length !== 1) throw badRequest(`filter ${filter.column} ${op} needs one value`);
  return { sql: `CAST(${col} AS STRING) ${op} ${refs[0]}`, params };
}

function readinessStatement(name, { columns = [], filters = [], window = {} } = {}) {
  const table = quoteTable(name);
  const wanted = [...new Set(columns.map((c) => str(c).trim()).filter(Boolean))].slice(0, 20);
  const where = [];
  const parameters = [];
  filters.forEach((f, i) => {
    const clause = filterClause(f, i);
    where.push(clause.sql);
    parameters.push(...clause.params);
  });
  if (window && window.column && (window.start || window.end)) {
    const col = quoteColumn(window.column);
    if (window.start) {
      where.push(`${col} >= CAST(:wstart AS DATE)`);
      parameters.push({ name: 'wstart', value: str(window.start), type: 'STRING' });
    }
    if (window.end) {
      where.push(`${col} <= CAST(:wend AS DATE)`);
      parameters.push({ name: 'wend', value: str(window.end), type: 'STRING' });
    }
  }
  const nulls = wanted.map((c, i) => `SUM(CASE WHEN ${quoteColumn(c)} IS NULL THEN 1 ELSE 0 END) AS null_${i}`);
  return {
    sql: `SELECT COUNT(*) AS row_count${nulls.length ? `, ${nulls.join(', ')}` : ''} FROM ${table}`
      + `${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`,
    parameters: parameters.length ? parameters : null,
    columns: wanted,
  };
}

function readinessFromRow(row, columns) {
  const rows = Number(row && row.row_count) || 0;
  return {
    row_count: rows,
    null_share: Object.fromEntries(columns.map((c, i) => [c, rows ? (Number(row[`null_${i}`]) || 0) / rows : null])),
  };
}

function destinationsFromList(data) {
  return (Array.isArray(data && data.results) ? data.results : [])
    .filter((d) => d && IMPLEMENT_DESTINATION_ID_RE.test(str(d.id)))
    .map((d) => ({ id: str(d.id), name: str(d.display_name || d.id), type: str(d.destination_type).toLowerCase() }));
}

const IMPLEMENT_SPEC_WIDGETS = ['result_table', 'run_profile'];

function rerunWidgets(history) {
  return implementWidgets(history, '').widgets.filter((w) => !IMPLEMENT_SPEC_WIDGETS.includes(str(w.name).toLowerCase()));
}

function rerunOverrides(raw) {
  const out = {};
  for (const [name, value] of Object.entries(isPlainObject(raw) ? raw : {})) {
    if (str(value).trim() !== '') out[name] = str(value).trim();
  }
  return out;
}

function rerunParams(widgetNames, overrides) {
  const allowed = new Set((widgetNames || []).filter((n) => IMPLEMENT_WIDGET_NAME_RE.test(str(n))));
  const params = {};
  for (const [name, value] of Object.entries(isPlainObject(overrides) ? overrides : {})) {
    if (name === 'run_profile') continue;
    if (name.toLowerCase() === 'result_table') {
      throw badRequest('the result table is part of the spec; change it with Edit, which checks the table before any run writes to it');
    }
    if (!allowed.has(name)) throw badRequest(`'${name}' is not a widget of this notebook`);
    params[name] = str(value);
  }
  params.run_profile = 'preview';
  return params;
}

function sourcePicks(spec, involved) {
  const data = (spec && spec.data) || {};
  const swaps = Object.fromEntries(Object.entries(isPlainObject(data.tables) ? data.tables : {})
    .map(([original, chosen]) => [plainTable(original).toLowerCase(), plainTable(chosen)]));
  const gone = new Set((Array.isArray(data.removed_tables) ? data.removed_tables : []).map((t) => plainTable(t).toLowerCase()));
  return (involved || []).filter((table) => !gone.has(plainTable(table).toLowerCase()))
    .map((table) => ({ original: plainTable(table), chosen: swaps[plainTable(table).toLowerCase()] || plainTable(table) }));
}

function uniqueTables(names) {
  const out = [];
  for (const name of names) if (!out.some((t) => t.toLowerCase() === name.toLowerCase())) out.push(name);
  return out;
}

function sourceTables(spec, involved) {
  return uniqueTables(sourcePicks(spec, involved).map((p) => p.chosen));
}

function checkedSourceTables(spec, involved) {
  const picks = sourcePicks(spec, involved);
  return uniqueTables([...picks.map((p) => p.chosen), ...picks.filter((p) => p.chosen.toLowerCase() !== p.original.toLowerCase()).map((p) => p.original)]);
}

function tableProbeStatement(name) {
  return { sql: `SELECT * FROM ${quoteTable(name)} LIMIT 0`, parameters: null };
}

const IMPLEMENT_TABLE_GONE_RE = /\b(TABLE_OR_VIEW_NOT_FOUND|SCHEMA_NOT_FOUND|CATALOG_NOT_FOUND|NO_SUCH_CATALOG_EXCEPTION)\b|cannot be found|was not found/i;
const IMPLEMENT_TABLE_DENIED_RE = /\b(INSUFFICIENT_PERMISSIONS|PERMISSION_DENIED)\b|does not have \w+( \w+)? (privilege )?on/i;

function tableAccessReason(table, message) {
  const text = str(message);
  const catalog = plainTable(table).split('.')[0].toLowerCase();
  if (!catalog || !text.replace(/[`'"]/g, '').toLowerCase().includes(catalog)) return '';
  if (IMPLEMENT_TABLE_GONE_RE.test(text)) return 'not found';
  if (IMPLEMENT_TABLE_DENIED_RE.test(text)) return 'no read access';
  return '';
}

function missingTablesMessage(missing) {
  return 'the preview cannot run because these source tables are missing or not readable: '
    + missing.map((m) => `${m.table} (${m.reason})`).join(', ')
    + '. Open Edit, Data step, to swap each for a table with the same role or remove it';
}

function appStatusFrom(got, { useCaseId, sessionId } = {}) {
  if (!got) return null;
  const d = (got.data && typeof got.data === 'object') ? got.data : {};
  if (!got.ok) {
    return { ok: false, error: got.status === 404 ? 'the App no longer exists' : str(d.message || d.error || `HTTP ${got.status}`) };
  }
  if (!str(d.description).startsWith(appOwnerTag(useCaseId, sessionId))) {
    return { ok: false, error: `the App named ${str(d.name)} is no longer this use case's App` };
  }
  const deployment = d.active_deployment || d.pending_deployment || {};
  return {
    ok: true,
    name: str(d.name),
    url: str(d.url),
    app_state: str(d.app_status && d.app_status.state),
    app_message: str(d.app_status && d.app_status.message),
    compute_state: str(d.compute_status && d.compute_status.state),
    deployment_state: str(deployment.status && deployment.status.state),
    deployment_message: str(deployment.status && deployment.status.message),
    deployed_at: str(deployment.update_time || deployment.create_time),
  };
}

function jobRunsFrom(got, job = null) {
  if (!got) return null;
  const d = (got.data && typeof got.data === 'object') ? got.data : {};
  if (!got.ok) return { ok: false, error: str(d.message || d.error || `HTTP ${got.status}`), runs: [] };
  if (job && !job.ok) {
    const j = (job.data && typeof job.data === 'object') ? job.data : {};
    return { ok: false, error: `Inspire cannot see this job, so it cannot list its runs: ${str(j.message || j.error || `HTTP ${job.status}`)}`, runs: [] };
  }
  return {
    ok: true,
    runs: (Array.isArray(d.runs) ? d.runs : []).map((r) => {
      const params = (r.overriding_parameters && r.overriding_parameters.notebook_params) || {};
      const state = r.state || {};
      return {
        run_id: r.run_id,
        started: Number(r.start_time) ? new Date(Number(r.start_time)).toISOString() : '',
        duration_s: Math.round((Number(r.run_duration) || Number(r.execution_duration) || 0) / 1000),
        state: str(state.result_state || state.life_cycle_state || (r.status && r.status.state)),
        message: str(state.state_message),
        trigger: str(r.trigger),
        profile: str(params.run_profile),
        url: str(r.run_page_url),
      };
    }),
  };
}

function liveLogPath(inspireDatabase, businessName, sessionId, runId = '') {
  const parts = str(inspireDatabase).split('.');
  if (parts.length !== 2 || parts.some((p) => !p)) return null;
  const biz = str(businessName).replace(/[^A-Za-z0-9._-]+/g, '_');
  const name = /^\d{1,19}$/.test(str(runId)) ? `log_implement_${str(runId)}.log` : 'log.log';
  return `/Volumes/${parts[0]}/${parts[1]}/vol_root/logs/${biz}/session_${sessionId}/${name}`;
}

function useCaseLogLines(text, useCaseId) {
  const id = str(useCaseId);
  if (!id) return [];
  return str(text).split('\n').filter((line) => line.includes(`[GENIE ${id}]`) || line.includes(`[IMPLEMENT ${id}]`)
    || (line.includes(id) && /\[IMPLEMENT-[A-Z -]+\]/.test(line)));
}

const GENIE_FEED_LIMIT = 300;
const LOG_LINE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) - \S+ - ([A-Z]+) - ([\s\S]*)$/;
const LOG_SOURCE_RE = /\s*\[in [^\]]*:\d+\]\s*$/;
const RUN_STATE_RE = /^(alert check )?\[(\d+)s\] job run (\d+): ([A-Z_]+)(?: \/ ([A-Z_]+))?/;

function jsonStringField(text, name) {
  const match = new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`).exec(text);
  if (!match) return '';
  const body = match[1].replace(/\\(u[0-9a-fA-F]{0,3})?$/, '');
  try {
    return JSON.parse(`"${body}"`);
  } catch {
    return body;
  }
}

function genieMessage(text) {
  const raw = str(text).trim();
  const clean = (value) => str(value).replace(/\s+/g, ' ').trim();
  if (!raw.startsWith('{')) {
    const stop = /^Stopped:\s*([\s\S]*)$/.exec(raw);
    return stop ? { kind: 'stopped', text: clean(stop[1]) || 'Genie gave no reason' } : { kind: 'message', text: clean(raw) };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const field = (name) => clean(parsed && typeof parsed === 'object' ? parsed[name] : jsonStringField(raw, name));
  const status = field('status');
  const reason = field('stop_reason');
  if (status === 'stopped' || (status === 'built' && reason)) return { kind: 'stopped', text: reason || 'Genie gave no reason' };
  return { kind: 'message', text: field('summary') };
}

function baseName(path) {
  return str(path).trim().split('/').filter(Boolean).pop() || '';
}

function genieFeedItem(body, id) {
  const genie = /^\[GENIE ([^\]]+)\] (?:\[([^\]]+)\] )?([\s\S]*)$/.exec(body);
  if (genie) {
    if (genie[1] !== id) return null;
    const phase = genie[2] || '';
    const rest = genie[3];
    if (rest.startsWith('Genie: ')) {
      const message = genieMessage(rest.slice(7));
      return message.text ? { phase, ...message } : null;
    }
    if (rest.startsWith('Genie ran: ')) {
      const exit = (/\(exit (-?\d+|None)\)$/.exec(rest) || [])[1];
      return { phase, kind: 'activity', commands: 1, failed: exit && exit !== '0' && exit !== 'None' ? 1 : 0, files: [] };
    }
    if (rest.startsWith('Genie edited: ')) {
      const files = rest.slice(14).split(', ').map(baseName).filter(Boolean);
      return { phase, kind: 'activity', commands: 0, failed: 0, files };
    }
    if (rest.startsWith('Genie error: ')) return { phase, kind: 'error', text: rest.slice(13).replace(/\s+/g, ' ').trim() };
    if (rest.startsWith('Genie turn completed')) return { phase, kind: 'turn_done' };
    return null;
  }
  const implement = /^\[IMPLEMENT ([^\]]+)\]\s+([\s\S]*)$/.exec(body);
  if (implement) {
    if (implement[1] !== id) return null;
    const run = RUN_STATE_RE.exec(implement[2]);
    if (run) {
      return { kind: 'run', check: Boolean(run[1]), seconds: Number(run[2]), run_id: run[3], state: run[4], result: run[5] || '' };
    }
    return { kind: 'note', text: implement[2].trim() };
  }
  const failed = /^\[IMPLEMENT-FAILED\] (\S+) spec \d+: ([\s\S]*)$/.exec(body);
  if (failed) return failed[1] === id ? { kind: 'failed', text: failed[2].trim() } : null;
  const notebook = /^\[IMPLEMENT-NOTEBOOK\] (\S+): wrote (.+)$/.exec(body);
  if (notebook) return notebook[1] === id ? { kind: 'note', text: `Wrote the notebook ${baseName(notebook[2])}` } : null;
  const other = /^\[IMPLEMENT-[A-Z -]+\] ([\s\S]*)$/.exec(body);
  if (!other) return null;
  return { kind: 'note', text: other[1].replace(new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: `), '').trim() };
}

function finishedLines(text) {
  const value = str(text);
  return value.endsWith('\n') ? value : value.slice(0, value.lastIndexOf('\n') + 1);
}

function genieFeed(text, useCaseId, since = '') {
  const id = str(useCaseId);
  const sinceMs = Date.parse(str(since));
  const floor = Number.isFinite(sinceMs) ? Math.floor(sinceMs / 1000) * 1000 : 0;
  const items = [];
  for (const line of useCaseLogLines(finishedLines(text), id)) {
    const parts = LOG_LINE_RE.exec(line.replace(/\r$/, ''));
    if (!parts) continue;
    const at = `${parts[1]}T${parts[2]}Z`;
    if (floor && Date.parse(at) < floor) continue;
    const item = genieFeedItem(parts[4].replace(LOG_SOURCE_RE, ''), id);
    if (!item) continue;
    const last = items[items.length - 1];
    if (item.kind === 'activity' && last && last.kind === 'activity' && last.phase === item.phase) {
      last.commands += item.commands;
      last.failed += item.failed;
      last.files = [...new Set([...last.files, ...item.files])];
      last.until = at;
    } else if (item.kind === 'run' && last && last.kind === 'run' && last.run_id === item.run_id) {
      Object.assign(last, item, { until: at });
    } else {
      items.push({ at, ...item });
    }
  }
  return items.slice(-GENIE_FEED_LIMIT);
}

function filterImplementSteps(rows, useCaseId) {
  const id = str(useCaseId);
  return (rows || []).filter((row) => {
    if (str(row.stage_name) !== IMPLEMENT_OPERATION) return false;
    if (!id) return true;
    let payload = row.result_json;
    if (typeof payload === 'string' && payload) {
      try { payload = JSON.parse(payload); } catch { payload = {}; }
    }
    const fromJson = payload && typeof payload === 'object' ? str(payload.use_case_id) : '';
    return fromJson === id || str(row.step_name).includes(id) || str(row.sub_step_name).includes(id);
  });
}

const IMPLEMENT_INSPIRE_WIDGETS = ['result_table', 'as_of_date', 'run_profile'];
const IMPLEMENT_MAX_EXTRA_WIDGETS = 6;

function groupWidgets(widgets) {
  const business = [];
  const model = [];
  const ai = [];
  const extras = [];
  for (const widget of widgets || []) {
    const name = str(widget && widget.name).toLowerCase();
    if (IMPLEMENT_INSPIRE_WIDGETS.includes(name)) continue;
    if (/^(act_now_share|review_share|act_now_amount|review_amount|currency|alert_quantile|fdr_alpha|spot_check_rows|(min|max)_.+|.+_threshold)$/.test(name)) business.push(widget);
    else if (/^(model_name|horizon|season_length)$/.test(name)) model.push(widget);
    else if (name === 'ai_endpoint') ai.push(widget);
    else extras.push(widget);
  }
  return {
    business,
    model,
    ai,
    extras: extras.slice(0, IMPLEMENT_MAX_EXTRA_WIDGETS),
    extras_kept_default: extras.slice(IMPLEMENT_MAX_EXTRA_WIDGETS).map((w) => str(w.name)),
  };
}

const IMPLEMENT_RESULT_KEY_COLUMNS = ['use_case_id', 'run_id', 'as_of_date'];

function outputAccessStatement(name) {
  if (resultTableNameError(name)) throw badRequest(resultTableNameError(name));
  const t = tableParts(name);
  const c = 'catalog_name = lower(:c)';
  const s = 'schema_name = lower(:s)';
  const tbl = 'table_catalog = lower(:c) AND table_schema = lower(:s) AND table_name = lower(:t)';
  const isc = 'system.information_schema';
  return {
    sql: 'SELECT level, privilege, principal, '
      + '(lower(principal) = lower(current_user()) OR is_account_group_member(principal)) AS mine, current_user() AS me FROM ('
      + `SELECT 'catalog' AS level, 'OWNER' AS privilege, catalog_owner AS principal FROM ${isc}.catalogs WHERE ${c} `
      + `UNION ALL SELECT 'schema', 'OWNER', schema_owner FROM ${isc}.schemata WHERE ${c} AND ${s} `
      + `UNION ALL SELECT 'table', 'OWNER', table_owner FROM ${isc}.tables WHERE ${tbl} `
      + `UNION ALL SELECT 'catalog', privilege_type, grantee FROM ${isc}.catalog_privileges WHERE ${c} `
      + `UNION ALL SELECT 'schema', privilege_type, grantee FROM ${isc}.schema_privileges WHERE ${c} AND ${s} `
      + `UNION ALL SELECT 'table', privilege_type, grantee FROM ${isc}.table_privileges WHERE ${tbl}`
      + ') WHERE principal IS NOT NULL',
    parameters: [
      { name: 'c', value: t.catalog, type: 'STRING' },
      { name: 's', value: t.schema, type: 'STRING' },
      { name: 't', value: t.table, type: 'STRING' },
    ],
  };
}

function privilegeOf(value) {
  return str(value).trim().toUpperCase().replace(/_/g, ' ');
}

function joinAnd(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function schemaAccess(rows, t) {
  const list = Array.isArray(rows) ? rows : [];
  const owner = (level) => list.some((r) => r.level === level && privilegeOf(r.privilege) === 'OWNER');
  const mine = list.filter((r) => r.mine === true || str(r.mine).toLowerCase() === 'true');
  const holds = (levels, privilege) => mine.some((r) => levels.includes(r.level)
    && ['OWNER', 'ALL PRIVILEGES', privilege].includes(privilegeOf(r.privilege)));
  const access = { list, owner, mine, holds, identity: str((list[0] || {}).me), needs: [] };
  if (!owner('catalog')) return { ...access, missing: `catalog ${t.catalog} does not exist or you have no access to it` };
  if (!owner('schema')) {
    return { ...access, missing: `schema ${t.catalog}.${t.schema} does not exist or you have no access to it; create it or pick another schema` };
  }
  if (!holds(['catalog'], 'USE CATALOG')) access.needs.push(`USE CATALOG on ${t.catalog}`);
  if (!holds(['catalog', 'schema'], 'USE SCHEMA')) access.needs.push(`USE SCHEMA on ${t.catalog}.${t.schema}`);
  return access;
}

function sameSchema(a, b) {
  const x = tableParts(a);
  const y = tableParts(b);
  return x.catalog.toLowerCase() === y.catalog.toLowerCase() && x.schema.toLowerCase() === y.schema.toLowerCase();
}

function defaultModelName(resultTable) {
  const t = tableParts(resultTable);
  return `${t.catalog}.${t.schema}.${t.table}_model`;
}

function trainsModel(useCase) {
  const family = executionFamily((useCase || {}).code_structure_mandate);
  return family ? IMPLEMENT_MODEL_FAMILIES.includes(family) : null;
}

function modelAccess(rows, modelName) {
  const t = tableParts(modelName);
  const model = `${t.catalog}.${t.schema}.${t.table}`;
  const access = schemaAccess(rows, t);
  if (access.missing) return { ok: false, detail: `${access.missing}, so Inspire cannot register the model ${model} there` };
  const needs = [...access.needs];
  if (!access.holds(['catalog', 'schema'], 'CREATE MODEL')) needs.push(`CREATE MODEL on ${t.catalog}.${t.schema}`);
  return needs.length
    ? { ok: false, detail: `you need ${joinAnd(needs)} to register the model ${model}` }
    : { ok: true, detail: `you can register the model ${model}` };
}

function outputAccess(rows, name) {
  const t = tableParts(name);
  const table = `${t.catalog}.${t.schema}.${t.table}`;
  const { list, owner, mine, holds, identity, missing, needs } = schemaAccess(rows, t);
  const exists = owner('table');
  const verb = exists ? 'write to' : 'create';
  let write;
  if (missing) write = { ok: false, detail: missing };
  else {
    if (exists) {
      if (!holds(['catalog', 'schema', 'table'], 'MODIFY')) needs.push(`MODIFY on ${table}`);
      if (!holds(['catalog', 'schema', 'table'], 'SELECT')) needs.push(`SELECT on ${table}`);
    } else if (!holds(['catalog', 'schema'], 'CREATE TABLE')) needs.push(`CREATE TABLE on ${t.catalog}.${t.schema}`);
    write = needs.length
      ? { ok: false, detail: `you need ${joinAnd(needs)} to ${verb} ${table}` }
      : { ok: true, detail: `you can ${verb} ${table}` };
  }
  const grantable = exists
    ? mine.some((r) => ['catalog', 'schema', 'table'].includes(r.level) && ['OWNER', 'MANAGE'].includes(privilegeOf(r.privilege)))
    : write.ok;
  const grant = grantable
    ? { ok: true, detail: exists ? `you can share ${table}` : `you will own ${table}, so you can share it` }
    : { ok: false, detail: `you cannot share ${table}: you need to own it, its schema or its catalog, or hold MANAGE on one of them` };
  const readable = accessPlan(name, list);
  const app = readable.gaps.length
    ? { ok: false, detail: appAccessMessage(table, readable.gaps, readable.me) }
    : { ok: true, detail: `Inspire can give a new App read access to ${table}` };
  return { table, exists, identity, write, grant, app };
}

const IMPLEMENT_ALL_USERS = 'account users';
const IMPLEMENT_READ_NEEDS = [
  ['USE CATALOG', 'catalog', ['catalog']],
  ['USE SCHEMA', 'schema', ['catalog', 'schema']],
  ['SELECT', 'table', ['catalog', 'schema', 'table']],
];
const IMPLEMENT_TRAVERSE_PRIVILEGES = IMPLEMENT_READ_NEEDS.filter(([, level]) => level !== 'table').map(([privilege]) => privilege);

function grantSql(need, who) {
  return `GRANT ${need.privilege} ON ${need.level.toUpperCase()} ${need.object} TO \`${who}\``;
}

function accessPlan(name, rows, principal = '') {
  const who = str(principal).trim();
  let t;
  try {
    t = tableParts(name);
  } catch {
    return { grants: [], gaps: [], me: '' };
  }
  if (who.includes('`')) return { grants: [], gaps: [], me: '' };
  const objects = {
    catalog: `\`${t.catalog}\``,
    schema: `\`${t.catalog}\`.\`${t.schema}\``,
    table: `\`${t.catalog}\`.\`${t.schema}\`.\`${t.table}\``,
  };
  const need = (privilege, level) => ({ privilege, level, object: objects[level] });
  if (rows == null) return { grants: who ? IMPLEMENT_READ_NEEDS.map(([p, level]) => need(p, level)) : [], gaps: [], me: '' };
  const list = Array.isArray(rows) ? rows : [];
  const facts = list.map((r) => ({
    level: str(r.level).toLowerCase(),
    privilege: privilegeOf(r.privilege),
    principal: str(r.principal).trim(),
    mine: r.mine === true || str(r.mine).toLowerCase() === 'true',
  }));
  const me = str((list.find((r) => str(r.me).trim()) || {}).me).trim();
  const holders = new Set([IMPLEMENT_ALL_USERS, ...(who ? [who.toLowerCase()] : [])]);
  const tableExists = facts.some((f) => f.level === 'table' && f.privilege === 'OWNER');
  const plan = { grants: [], gaps: [], me };
  for (const [privilege, level, levels] of IMPLEMENT_READ_NEEDS) {
    const owns = !!who && facts.some((f) => f.level === level && f.privilege === 'OWNER' && f.principal.toLowerCase() === who.toLowerCase());
    const granted = facts.some((f) => levels.includes(f.level) && [privilege, 'ALL PRIVILEGES'].includes(f.privilege)
      && holders.has(f.principal.toLowerCase()));
    if (owns || granted) continue;
    const manages = facts.some((f) => f.mine && levels.includes(f.level) && ['OWNER', 'MANAGE'].includes(f.privilege));
    if (manages || (level === 'table' && !tableExists)) {
      if (who) plan.grants.push(need(privilege, level));
      continue;
    }
    const owner = (facts.find((f) => f.level === level && f.privilege === 'OWNER') || {}).principal || '';
    plan.gaps.push({ ...need(privilege, level), owner });
  }
  return plan;
}

function gapList(gaps) {
  return joinAnd(gaps.map((g) => `${g.privilege} on ${g.level} ${g.object}${g.owner ? ` (owner ${g.owner})` : ''}`));
}

function accessGapMessage(who, gaps) {
  const it = gaps.length === 1 ? 'it' : 'them';
  const statements = gaps.map((g) => grantSql(g, who)).join('; ');
  return `${who} may not be able to read the result table: Inspire cannot grant ${gapList(gaps)}, because it `
    + `neither owns nor holds MANAGE on ${it}. If ${who} does not have ${it} yet, ask the owner to run: ${statements}`;
}

function appAccessMessage(table, gaps, me = '') {
  const inspire = me ? `\`${me}\`` : 'the identity Inspire runs as';
  const statements = gaps.map((g) => `GRANT MANAGE ON ${g.level.toUpperCase()} ${g.object} TO ${inspire}`).join('; ');
  const one = gaps.length === 1;
  const shared = gaps.length && gaps.every((g) => IMPLEMENT_TRAVERSE_PRIVILEGES.includes(g.privilege))
    ? `, or ${gaps.map((g) => grantSql(g, IMPLEMENT_ALL_USERS)).join('; ')}, which ${one ? 'opens' : 'open'} no data by ${one ? 'itself' : 'themselves'}`
    : '';
  return `a new App could not read ${table}: its service principal needs ${gapList(gaps)}, which not all `
    + `account users have, and Inspire can grant ${one ? 'it' : 'them'} only with MANAGE or ownership. `
    + `Ask the owner to run: ${statements}${shared}; or choose a result table in a catalog and schema Inspire manages`;
}

function principalNames(principals) {
  return (Array.isArray(principals) ? principals : [])
    .map((p) => str(p && typeof p === 'object' ? p.name : p).trim())
    .filter(Boolean);
}

function shareWarnings(name, rows, principals) {
  return principalNames(principals)
    .map((who) => ({ who, gaps: accessPlan(name, rows, who).gaps }))
    .filter((p) => p.gaps.length)
    .map((p) => accessGapMessage(p.who, p.gaps));
}

function shareWarehouseWarnings(warehouse, principals, viewed, warehouseName) {
  const who = principalNames(principals);
  const opens = (Array.isArray(viewed) ? viewed : []).filter(Boolean);
  if (!who.length || !opens.length || !warehouse || warehouse.ok) return [];
  const name = str(warehouseName).trim() || 'the SQL warehouse';
  const one = who.length === 1;
  return [`${joinAnd(who)} ${one ? 'needs' : 'need'} CAN USE on ${name} to open ${joinAnd(opens)}, because they query with their own `
    + `access, and Inspire may not be able to grant it: ask the warehouse owner to give ${one ? 'it' : 'them'} CAN USE on ${name}, `
    + `or to give Inspire CAN MANAGE on it`];
}

function warehouseManageCheck(got, identities, groups, warehouseName) {
  const name = str(warehouseName).trim() || 'the SQL warehouse';
  const cannot = `Inspire cannot manage ${name}, so it cannot give a new App access to it: ask the warehouse owner to grant `
    + 'Inspire CAN MANAGE on it, or re-run the Inspire installer';
  if (!got || !got.ok) {
    const status = got ? Number(got.status) : 0;
    if (status === 401 || status === 403) return { ok: false, detail: cannot };
    const d = got && got.data && typeof got.data === 'object' ? got.data : {};
    return { ok: false, detail: `Inspire could not check its permission on ${name}: ${str(d.message || d.error || (status > 0 ? `HTTP ${status}` : 'no response'))}` };
  }
  const lower = (v) => str(v).trim().toLowerCase();
  const ids = new Set((identities || []).map(lower).filter(Boolean));
  const memberOf = new Set((groups || []).map(lower).filter(Boolean));
  const entries = Array.isArray(got.data && got.data.access_control_list) ? got.data.access_control_list : [];
  const manages = entries.some((e) => (ids.has(lower(e.user_name)) || ids.has(lower(e.service_principal_name)) || memberOf.has(lower(e.group_name)))
    && (Array.isArray(e.all_permissions) ? e.all_permissions : []).some((p) => ['CAN_MANAGE', 'IS_OWNER'].includes(str(p.permission_level).toUpperCase())));
  return manages ? { ok: true, detail: `Inspire can give a new App access to ${name}` } : { ok: false, detail: cannot };
}

function appAccessCheck(table, warehouse) {
  const parts = [table, warehouse].filter(Boolean);
  const failed = parts.filter((c) => !c.ok);
  return failed.length
    ? { ok: false, detail: failed.map((c) => c.detail).join('; ') }
    : { ok: true, detail: parts.map((c) => c.detail).join('; ') };
}

function resultTableProblem(table, columns, otherRows) {
  const names = new Set((columns || []).map((c) => str(c && (c.column_name ?? c.col_name ?? c)).toLowerCase()));
  if (!names.size) return '';
  const missing = IMPLEMENT_RESULT_KEY_COLUMNS.filter((c) => !names.has(c));
  if (missing.length) {
    return `${table} already exists and is not an Inspire result table (it has no ${joinAnd(missing)}); pick a new table name so Inspire never rewrites it`;
  }
  const others = Number(otherRows) || 0;
  if (others > 0) {
    return `${table} already holds ${others} row(s) of other use cases; give each use case its own result table so its outputs show only its rows`;
  }
  return '';
}

function otherUseCaseRowsStatement(table, useCaseId) {
  return {
    sql: `SELECT COUNT_IF(use_case_id IS NULL OR use_case_id <> :uc) AS others FROM ${quoteTable(table)}`,
    parameters: [{ name: 'uc', value: String(useCaseId), type: 'STRING' }],
  };
}

function resultTableHolderStatement(implementTable, table) {
  return {
    sql: 'WITH named AS (SELECT session_id, use_case_id, created_at, '
      + "lower(replace(CAST(spec_json:config.result_table AS STRING), '`', '')) AS t, "
      + `ROW_NUMBER() OVER (PARTITION BY session_id, use_case_id ORDER BY spec_version DESC) AS latest FROM ${implementTable}), `
      + 'held AS (SELECT session_id, use_case_id FROM named WHERE latest = 1 AND t = :t) '
      + 'SELECT CAST(n.session_id AS STRING) AS session_id, n.use_case_id FROM named n '
      + 'JOIN held h ON n.session_id = h.session_id AND n.use_case_id = h.use_case_id WHERE n.t = :t '
      + 'GROUP BY n.session_id, n.use_case_id ORDER BY MIN(n.created_at), n.session_id, n.use_case_id LIMIT 1',
    parameters: [{ name: 't', value: plainTable(table).toLowerCase(), type: 'STRING' }],
  };
}

function resultTableHolderProblem(table, holder, sessionId, useCaseId) {
  if (!holder) return '';
  const sid = str(holder.session_id);
  const uc = str(holder.use_case_id);
  if (!sid || (sid === str(sessionId) && uc === str(useCaseId))) return '';
  return `${plainTable(table)} already holds the results of use case ${uc} of session ${sid}; give each use case its own `
    + 'result table so its outputs show only its rows';
}

function useCaseSlug(useCaseId) {
  return str(useCaseId).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

function defaultResultTable(inspireDatabase, useCaseId, sessionId) {
  const slug = useCaseSlug(useCaseId);
  const sid = /^\d+$/.test(str(sessionId).trim()) ? str(sessionId).trim() : '';
  return inspireDatabase && slug && sid ? `${inspireDatabase}.${slug}_s${sid}_out` : '';
}

function sharedDefaultResultTable(inspireDatabase, useCaseId) {
  const slug = useCaseSlug(useCaseId);
  return inspireDatabase && slug ? `${inspireDatabase}.${slug}_out` : '';
}

function sameTable(a, b) {
  return Boolean(str(a).trim()) && plainTable(a).toLowerCase() === plainTable(b).toLowerCase();
}

function carriesSharedDefault(table, history, inspireDatabase, useCaseId) {
  return sameTable(table, sharedDefaultResultTable(inspireDatabase, useCaseId))
    && (history || []).some((row) => sameTable(row?.spec_json?.config?.result_table, table));
}

function resultTableMove(table, holder, { inspireDatabase, sessionId, useCaseId, history }) {
  if (!resultTableHolderProblem(table, holder, sessionId, useCaseId)) return null;
  if (!carriesSharedDefault(table, history, inspireDatabase, useCaseId)) return null;
  const to = defaultResultTable(inspireDatabase, useCaseId, sessionId);
  if (!to || sameTable(to, table)) return null;
  return {
    from: plainTable(table),
    to,
    detail: `results move to ${to}, because ${plainTable(table)} holds the results of use case ${str(holder.use_case_id)} `
      + `of session ${str(holder.session_id)}; earlier versions of this use case wrote there under the old shared name`,
  };
}

function withResultTable(spec, table) {
  return { ...spec, config: { ...spec.config, result_table: table } };
}

function appOwnerTag(useCaseId, sessionId) {
  return `Inspire use case ${str(useCaseId)} (session ${str(sessionId)})`;
}

function appNameCheck(appName, existing, { useCaseId, sessionId } = {}) {
  if (!appName) return { ok: true, detail: '', creates: false };
  if (!existing) return { ok: true, detail: `'${appName}' is free`, creates: true };
  const ours = str(existing.description).startsWith(appOwnerTag(useCaseId, sessionId));
  return ours
    ? { ok: true, detail: `'${appName}' is this use case's App; Inspire updates it`, creates: false }
    : { ok: false, detail: `'${appName}' is used by another App in this workspace; pick another name`, creates: true };
}

function appsLimit(host) {
  return /\.gcp\.databricks\.com/i.test(str(host)) ? 50 : 100;
}

function appsQuotaCheck(count, limit, creates) {
  if (!creates) return { ok: true, detail: `no new App is needed (${count} of ${limit} Apps used)` };
  return count < limit
    ? { ok: true, detail: `${count} of ${limit} Apps used; one more fits` }
    : { ok: false, detail: `this workspace already has ${count} of its ${limit} Apps; delete one or untick the App` };
}

function executionFamily(mandate) {
  const match = /^Execution pattern: family ([A-H])\b/.exec(str(mandate).trim());
  return match ? match[1] : '';
}

const IMPLEMENT_MODEL_FAMILIES = ['A', 'B', 'C', 'D'];

function parseEvidence(raw) {
  let value = raw;
  if (typeof value === 'string' && value.trim()) {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  if (!isPlainObject(value) || !isPlainObject(value.tables)) return null;
  const tables = {};
  for (const [name, entry] of Object.entries(value.tables)) {
    if (!isPlainObject(entry)) continue;
    const rows = wholeNumber(entry.rows);
    const ranges = {};
    for (const [column, range] of Object.entries(isPlainObject(entry.date_ranges) ? entry.date_ranges : {})) {
      if (isPlainObject(range) && str(range.min) && str(range.max)) ranges[column] = { min: str(range.min), max: str(range.max) };
    }
    tables[name] = { rows: rows == null ? null : rows, date_ranges: ranges, sampled: Boolean(entry.sampled) };
  }
  return { tables };
}

function tableNames(text) {
  const names = [];
  for (const part of str(text).split(/[,\s]+/)) {
    const name = part.replace(/`/g, '').trim().replace(/[.;:)]+$/, '').replace(/^\(+/, '');
    const parts = name.split('.');
    if (parts.length === 3 && parts.every(Boolean) && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

function useCaseTables(useCase) {
  const names = tableNames(useCase && useCase.tables_involved);
  for (const name of tableNames(useCase && useCase.primary_table)) {
    if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

function primaryTableOf(useCase) {
  return tableNames(useCase && useCase.primary_table)[0] || '';
}

function removedTableProblems(spec, involved, primary = '') {
  const removed = ((spec && spec.data && spec.data.removed_tables) || []).map(plainTable);
  if (!removed.length) return [];
  const gone = new Set(removed.map((t) => t.toLowerCase()));
  const known = new Set((involved || []).map((t) => plainTable(t).toLowerCase()));
  const main = plainTable(primary);
  const problems = [];
  if (main && gone.has(main.toLowerCase())) problems.push(`${main} is the primary table of this use case; swap it instead of removing it`);
  const strangers = removed.filter((t) => !known.has(t.toLowerCase()));
  if (strangers.length) {
    problems.push(`${strangers.join(', ')} ${strangers.length === 1 ? 'is' : 'are'} not among the tables of this use case`);
  }
  if (known.size && [...known].every((t) => gone.has(t))) problems.push('every table of this use case was removed; keep at least one');
  return problems;
}

function useCaseRowStatement(table, sessionId, useCaseId) {
  return {
    sql: `SELECT * FROM ${table} WHERE session_id = :sid AND id = :uc LIMIT 1`,
    parameters: [
      { name: 'sid', value: String(sessionId), type: 'BIGINT' },
      { name: 'uc', value: String(useCaseId), type: 'STRING' },
    ],
  };
}

function validateUseCaseId(value) {
  const id = str(value).trim();
  if (!id || !IMPLEMENT_USE_CASE_ID_RE.test(id)) throw badRequest('use_case_id must match /^[a-zA-Z0-9_.-]+$/.');
  return id;
}

function quoteTable(name) {
  const parts = plainTable(name).split('.');
  if (parts.length !== 3 || parts.some((p) => !p || p.includes('`'))) throw badRequest(`'${str(name)}' must be catalog.schema.table`);
  return parts.map((p) => `\`${p}\``).join('.');
}

function quoteColumn(name) {
  const col = str(name).trim();
  if (!col || col.includes('`') || col.length > 255) throw badRequest(`'${col}' is not a column name`);
  return `\`${col}\``;
}

module.exports = {
  IMPLEMENT_OPERATION,
  IMPLEMENT_TABLE,
  IMPLEMENT_STATUSES,
  IMPLEMENT_ACTIVE_STATUSES,
  IMPLEMENT_DONE_STATUSES,
  IMPLEMENT_UNINSTALLED,
  IMPLEMENT_VIBE_PREVIOUS,
  keptAssets,
  mvpActionProblems,
  IMPLEMENT_OUTPUTS,
  IMPLEMENT_OUTPUT_LABELS,
  IMPLEMENT_OUTPUT_ID_COLUMNS,
  IMPLEMENT_STOPPED_STATES,
  IMPLEMENT_RUN_ENDED_STATES,
  IMPLEMENT_STALE_AFTER_MS,
  IMPLEMENT_OUTPUT_OPTIONS,
  IMPLEMENT_CHANGE_CLASSES,
  IMPLEMENT_COLUMN_ROLES,
  IMPLEMENT_FILTER_OPS,
  IMPLEMENT_COLUMNS,
  IMPLEMENT_UNREAD_COLUMNS,
  IMPLEMENT_VIBES_MAX,
  IMPLEMENT_NOTEBOOK,
  IMPLEMENT_RETRY_TARGETS,
  vibesLength,
  implementPart,
  IMPLEMENT_ALERT_TIER_SETS,
  IMPLEMENT_ALERT_OPERATORS,
  IMPLEMENT_ALERT_THRESHOLD_BASES,
  IMPLEMENT_ALERT_BASELINE_DIRECTIONS,
  IMPLEMENT_ALERT_MAX_SUBSCRIBERS,
  IMPLEMENT_APP_OWNERS_MAX,
  IMPLEMENT_EMAIL_MAX_CHARS,
  IMPLEMENT_HOLDOUT_SHARE,
  IMPLEMENT_HOLDOUT_MAX_SHARE,
  implementHoldoutShare,
  IMPLEMENT_CONTRACT_OUTPUTS,
  IMPLEMENT_RUN_PROFILES,
  IMPLEMENT_MERGE_LABELS,
  IMPLEMENT_PRINCIPAL_TYPES,
  IMPLEMENT_WIDGET_NAME_RE,
  IMPLEMENT_TABLE_NAME_RE,
  IMPLEMENT_READ_NEEDS,
  IMPLEMENT_TRAVERSE_PRIVILEGES,
  IMPLEMENT_NOTEBOOK_TASK_KEY,
  IMPLEMENT_USE_CASE_PARAM,
  IMPLEMENT_SPEC_VERSION_PARAM,
  IMPLEMENT_RUN_ID_PARAM,
  IMPLEMENT_RUN_ID_REFERENCE,
  IMPLEMENT_APP_NAME_RE,
  IMPLEMENT_USE_CASE_ID_RE,
  IMPLEMENT_NOT_AVAILABLE,
  IMPLEMENT_APP_LOOK_DEFAULT,
  IMPLEMENT_APP_OPTION_KEYS,
  IMPLEMENT_PER_USER_OFF,
  IMPLEMENT_APP_CHARTS_MIN,
  IMPLEMENT_MERGE_OUTPUTS,
  IMPLEMENT_MERGE_TARGET_CAP,
  IMPLEMENT_APP_PLACEMENTS,
  IMPLEMENT_SCOPE_SESSION_CAP,
  legacyAppAccess,
  implementRegistryStatement,
  mergeRegistry,
  scopeSessions,
  useCaseScopeStatement,
  withUseCaseScope,
  mergeTargetPath,
  mergeTarget,
  mergeProblems,
  appMergeBlock,
  validateImplementSpec,
  classifyImplementChange,
  implementChangeSummary,
  implementTableName,
  implementTableCreateSql,
  implementHistoryStatement,
  describedColumnNames,
  implementMissingColumns,
  isMissingColumnError,
  destinationsFromList,
  implementInsertStatement,
  implementRunStartedStatement,
  implementStartFailedStatement,
  implementStalled,
  parseImplementRow,
  carriedAssets,
  rollbackSpec,
  planSubmission,
  refuseUnchanged,
  implementJobParams,
  widgetsFromInstruction,
  implementWidgets,
  tableParts,
  columnsStatement,
  tableSwapStatement,
  columnValuesStatement,
  readinessStatement,
  readinessFromRow,
  rerunParams,
  rerunWidgets,
  rerunOverrides,
  sourceTables,
  checkedSourceTables,
  tableProbeStatement,
  tableAccessReason,
  missingTablesMessage,
  appStatusFrom,
  jobRunsFrom,
  IMPLEMENT_SPEC_WIDGETS,
  liveLogPath,
  useCaseLogLines,
  genieFeed,
  genieMessage,
  filterImplementSteps,
  groupWidgets,
  IMPLEMENT_INSPIRE_WIDGETS,
  IMPLEMENT_RESULT_KEY_COLUMNS,
  IMPLEMENT_MODEL_FAMILIES,
  allowedRule,
  allowedText,
  widgetValueProblem,
  widgetSetProblems,
  widgetProblems,
  cronProblem,
  resultTableNameError,
  outputAccessStatement,
  outputAccess,
  modelAccess,
  defaultModelName,
  sameSchema,
  trainsModel,
  resultTableProblem,
  otherUseCaseRowsStatement,
  resultTableHolderStatement,
  resultTableHolderProblem,
  defaultResultTable,
  sharedDefaultResultTable,
  sameTable,
  carriesSharedDefault,
  resultTableMove,
  withResultTable,
  appOwnerTag,
  appNameCheck,
  appsLimit,
  appsQuotaCheck,
  IMPLEMENT_ALL_USERS,
  accessPlan,
  grantSql,
  accessGapMessage,
  appAccessMessage,
  shareWarnings,
  shareWarehouseWarnings,
  warehouseManageCheck,
  appAccessCheck,
  executionFamily,
  parseEvidence,
  badRequest,
  useCaseRowStatement,
  useCaseTables,
  primaryTableOf,
  removedTableProblems,
  validateUseCaseId,
  quoteTable,
  quoteColumn,
};
