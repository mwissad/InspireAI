const INSPIRE_AGENT_VERSION = 'v1.3.0';

/** Notebook widget keys for dbx_inspire_ai_agent job base_parameters (v1.3.0). */
const INSPIRE_NOTEBOOK_WIDGET_KEYS = [
  '15_operation',
  '00_business_name',
  '01_uc_metadata',
  '02_inspire_database',
  '03_discovery_type',
  '04_table_election',
  '05_use_cases_quality',
  '06_business_domains',
  '07_business_priorities',
  '08_generation_instructions',
  '09_generation_options',
  '10_strategic_context',
  '11_generation_path',
  '12_documents_languages',
  '13_generate_genie_code_for',
  '14_session_id',
  '16_best_of_best_count',
];

const USE_CASES_QUALITY_VALID = ['Good', 'High', 'Ultra High'];
const USE_CASES_QUALITY_DEFAULT = 'Good';

const DISCOVERY_TYPE_VALID = ['Deep', 'Standard'];
const DISCOVERY_TYPE_DEFAULT = 'Deep';

const STRATEGIC_CONTEXT_MAX_BYTES = 900000;

const BEST_OF_BEST_MAX_COUNT = 100;
const BEST_OF_BEST_DEFAULT_COUNT = 20;

/** Legacy widget labels → v1.2.0 canonical modes (matches notebook USE_CASES_QUALITY_ALIASES). */
const USE_CASES_QUALITY_ALIASES = {
  'Coverage Mode (All)': 'Good',
  Balanced: 'Good',
  'Good Quality': 'Good',
  'High Quality': 'Good',
  'Strict Quality': 'High',
  'Very High Quality': 'High',
  Good: 'Good',
  High: 'High',
  'Ultra High': 'Ultra High',
};

function paramError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function normalizeUseCasesQualityParams(params) {
  const uq = String(params['05_use_cases_quality'] || '').trim();
  if (!uq) {
    params['05_use_cases_quality'] = USE_CASES_QUALITY_DEFAULT;
    return params;
  }
  const folded = uq.toLowerCase();
  for (const mode of USE_CASES_QUALITY_VALID) {
    if (mode.toLowerCase() === folded) {
      params['05_use_cases_quality'] = mode;
      return params;
    }
  }
  for (const [legacy, mode] of Object.entries(USE_CASES_QUALITY_ALIASES)) {
    if (legacy.toLowerCase() === folded) {
      params['05_use_cases_quality'] = mode;
      return params;
    }
  }
  params['05_use_cases_quality'] = USE_CASES_QUALITY_DEFAULT;
  return params;
}

function normalizeDiscoveryTypeParams(params) {
  const raw = String(params['03_discovery_type'] ?? '').trim();
  if (!raw) {
    params['03_discovery_type'] = DISCOVERY_TYPE_DEFAULT;
    return params;
  }
  const mode = DISCOVERY_TYPE_VALID.find((m) => m.toLowerCase() === raw.toLowerCase());
  if (!mode) {
    throw paramError(`Discovery Type "${raw}" is not supported. Valid options: ${DISCOVERY_TYPE_VALID.join(', ')}.`);
  }
  params['03_discovery_type'] = mode;
  return params;
}

function validateStrategicContextParams(params) {
  const text = String(params['10_strategic_context'] ?? '').trim();
  const size = Buffer.byteLength(text, 'utf8');
  if (size > STRATEGIC_CONTEXT_MAX_BYTES) {
    throw paramError(
      `Strategic Context is ${size} bytes; the limit is ${STRATEGIC_CONTEXT_MAX_BYTES}. ` +
        'Store a larger strategy in a Workspace or Volumes file and pass its path instead.',
    );
  }
  params['10_strategic_context'] = text;
  return params;
}

function validateBestOfBestCountParams(params) {
  const text = String(params['16_best_of_best_count'] ?? '').trim();
  if (text && (!/^\d{1,3}$/.test(text) || Number(text) > BEST_OF_BEST_MAX_COUNT)) {
    throw paramError(
      `Best of Best Count "${text}" is not supported. Use a whole number from 0 to ${BEST_OF_BEST_MAX_COUNT}, ` +
        `or leave it empty for ${BEST_OF_BEST_DEFAULT_COUNT}.`,
    );
  }
  params['16_best_of_best_count'] = text;
  return params;
}

function normalizeGenerationOptionsParams(params) {
  const allowed = new Set(['PDF Catalog', 'Presentation']);
  const normalized = String(params['09_generation_options'] || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => allowed.has(value));
  params['09_generation_options'] = [...new Set(normalized)].join(',') || 'PDF Catalog';
  return params;
}

function sanitizeInspireNotebookJobParams(params) {
  normalizeGenerationOptionsParams(params);
  normalizeUseCasesQualityParams(params);
  normalizeDiscoveryTypeParams(params);
  validateStrategicContextParams(params);
  validateBestOfBestCountParams(params);
  const out = {};
  for (const k of INSPIRE_NOTEBOOK_WIDGET_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
    const v = params[k];
    if (v == null) continue;
    out[k] = String(v);
  }
  if (!out['13_generate_genie_code_for']) out['13_generate_genie_code_for'] = '5';
  delete out.discover_auto_genie_top_n;
  return out;
}

/** Static + task-value parameters for demo pipeline task 2 (Inspire discovery). */
function buildDemoInspireDiscoveryParams({ inspireDatabase, sessionId, generateTaskKey = 'generate_demo_data' }) {
  const tk = generateTaskKey;
  const raw = {
    '15_operation': 'Discover Use Cases',
    '00_business_name': `{{tasks.${tk}.values.display_name}}`,
    '01_uc_metadata': `{{tasks.${tk}.values.uc_metadata}}`,
    '02_inspire_database': inspireDatabase,
    '03_discovery_type': DISCOVERY_TYPE_DEFAULT,
    '04_table_election': 'All Tables',
    '05_use_cases_quality': USE_CASES_QUALITY_DEFAULT,
    '06_business_domains': '',
    '07_business_priorities': 'Increase Revenue',
    '08_generation_instructions': `{{tasks.${tk}.values.user_description}}`,
    '09_generation_options': 'PDF Catalog',
    '10_strategic_context': '',
    '11_generation_path': './../demos/',
    '12_documents_languages': 'English',
    '13_generate_genie_code_for': '5',
    '14_session_id': sessionId,
  };
  return sanitizeInspireNotebookJobParams(raw);
}

function parseMaybeJson(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** True when a use case shipped as a valid below-bar fallback (not an empty result). */
function belowBarLabelFromUseCase(uc) {
  if (!uc || typeof uc !== 'object') return '';
  const flags = parseMaybeJson(uc.selection_flags) || parseMaybeJson(uc.selectionFlags);
  if (flags && typeof flags === 'object') {
    for (const key of ['elite_fallback_pick', 'elite_fallback_near_miss', 'elite_coverage_pick', 'label', 'reason']) {
      const v = flags[key];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    for (const v of Object.values(flags)) {
      if (typeof v === 'string' && /below the /i.test(v)) return v.trim();
    }
  }
  const reason = uc.selection_drop_reason || uc.selectionDropReason;
  if (reason && /below the /i.test(String(reason))) return String(reason).trim();
  return '';
}

const V130_JSON_FIELDS = ['strategy_alignment', 'kpis', 'expected_key_results', 'data_evidence'];
const V130_LINE_FIELDS = ['measures_of_success', 'financial_benefits', 'non_financial_benefits'];

function splitText(value, separator) {
  if (value == null || value === '') return [];
  return String(value)
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeV130UseCaseFields(row) {
  for (const field of V130_JSON_FIELDS) row[field] = parseMaybeJson(row[field]);
  for (const field of V130_LINE_FIELDS) row[field] = splitText(row[field], '\n');
  row.foundation_ids = splitText(row.foundation_ids, ',');
  row.strategy_path = row.strategy_path == null || row.strategy_path === '' ? null : String(row.strategy_path);
  row.use_case_key = row.use_case_key == null || row.use_case_key === '' ? null : String(row.use_case_key);
  const flag = String(row.best_of_best ?? '').trim().toUpperCase();
  row.best_of_best = flag === 'Y' || flag === 'N' ? flag : null;
  const rank = Number.parseInt(String(row.best_of_best_rank ?? ''), 10);
  row.best_of_best_rank = row.best_of_best === 'Y' && Number.isFinite(rank) ? rank : null;
  const score = Number.parseFloat(String(row.best_of_best_score ?? ''));
  row.best_of_best_score = Number.isFinite(score) ? score : null;
  row.best_of_best_reason = row.best_of_best_reason == null || row.best_of_best_reason === '' ? null : String(row.best_of_best_reason);
  return row;
}

module.exports = {
  INSPIRE_AGENT_VERSION,
  INSPIRE_NOTEBOOK_WIDGET_KEYS,
  USE_CASES_QUALITY_VALID,
  USE_CASES_QUALITY_DEFAULT,
  USE_CASES_QUALITY_ALIASES,
  DISCOVERY_TYPE_VALID,
  DISCOVERY_TYPE_DEFAULT,
  STRATEGIC_CONTEXT_MAX_BYTES,
  BEST_OF_BEST_MAX_COUNT,
  BEST_OF_BEST_DEFAULT_COUNT,
  buildDemoInspireDiscoveryParams,
  sanitizeInspireNotebookJobParams,
  normalizeGenerationOptionsParams,
  normalizeUseCasesQualityParams,
  normalizeDiscoveryTypeParams,
  validateStrategicContextParams,
  validateBestOfBestCountParams,
  parseMaybeJson,
  belowBarLabelFromUseCase,
  V130_JSON_FIELDS,
  V130_LINE_FIELDS,
  normalizeV130UseCaseFields,
};
