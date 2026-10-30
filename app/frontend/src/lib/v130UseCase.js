import { fieldOf, isBlankField } from './useCaseFields.js';

export const STRATEGY_NOT_ALIGNED = 'Not aligned';
export const STRATEGY_BUILTIN_NO_MATCH = 'General Improvement';
export const STRATEGY_PATH_SEPARATOR = ' > ';
export const NOT_ALIGNED_FILTER = '__not_aligned__';
export const FEEDBACK_STATUSES = ['accepted', 'planned', 'implemented', 'rejected'];
export const FEEDBACK_LABELS = { accepted: 'Accepted', planned: 'Planned', implemented: 'Implemented', rejected: 'Rejected' };

export const V130_TRACKING_FIELDS = [
  'strategy_alignment', 'strategy_path', 'kpis', 'expected_key_results', 'measures_of_success',
  'financial_benefits', 'non_financial_benefits', 'data_evidence', 'foundation_ids', 'use_case_key',
  'best_of_best', 'best_of_best_rank', 'best_of_best_score', 'best_of_best_reason',
];

const KPI_UP = /\b(increase|increasing|up|higher|maximi[sz]e|raise|grow|growth)\b/i;
const KPI_DOWN = /\b(decrease|decreasing|down|lower|minimi[sz]e|reduce|reduction|cut|decline)\b/i;

export function parseJson(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || (text[0] !== '[' && text[0] !== '{')) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function textList(value) {
  const parsed = parseJson(value);
  if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? '').trim()).filter(Boolean);
  if (typeof parsed === 'string') return parsed.split('\n').map((item) => item.trim()).filter(Boolean);
  return [];
}

function objectList(value) {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

function bestOfBestOf(u) {
  if (String(u.best_of_best ?? '').trim().toUpperCase() !== 'Y') return null;
  const rank = Number.parseInt(String(u.best_of_best_rank ?? ''), 10);
  const score = Number.parseFloat(String(u.best_of_best_score ?? ''));
  return {
    rank: Number.isFinite(rank) ? rank : null,
    score: Number.isFinite(score) ? score : null,
    reason: String(u.best_of_best_reason ?? '').trim(),
  };
}

export function compareBestOfBestFirst(a, b) {
  const rank = (view) => (view?.bestOfBest ? view.bestOfBest.rank ?? Number.MAX_SAFE_INTEGER : null);
  const ra = rank(a);
  const rb = rank(b);
  if (ra === null && rb === null) return 0;
  if (ra === null) return 1;
  if (rb === null) return -1;
  return ra - rb;
}

export function bestOfBestLabel(star) {
  if (!star) return '';
  const rank = star.rank ? ` #${star.rank}` : '';
  const score = star.score != null ? ` \u00b7 elite score ${star.score.toFixed(1)}/10` : '';
  return `Best of Best${rank}${score}`;
}

export function copyV130TrackingFields(uc, row) {
  if (!uc || !row) return uc;
  for (const field of V130_TRACKING_FIELDS) {
    if (!isBlankField(row[field]) && isBlankField(uc[field])) uc[field] = row[field];
  }
  return uc;
}

const DATA_SIGNAL_LABELS = {
  passed: { tone: 'passed', label: 'Data check passed', prefix: '' },
  no_signal: { tone: 'warning', label: 'The data shows no signal', prefix: 'The data shows no signal: ' },
  failed: { tone: 'warning', label: 'The data shows no signal', prefix: 'The data shows no signal: ' },
  not_checked: { tone: 'neutral', label: 'Data not checked', prefix: 'Not checked: ' },
};

function dataSignalOf(evidence) {
  const signal = evidence && evidence.signal;
  if (!signal || typeof signal !== 'object' || Array.isArray(signal)) return null;
  const status = String(signal.status ?? '').trim();
  if (!DATA_SIGNAL_LABELS[status]) return null;
  return {
    status,
    check: String(signal.check ?? '').trim(),
    table: String(signal.table ?? '').trim(),
    columns: signal.columns && typeof signal.columns === 'object' && !Array.isArray(signal.columns) ? signal.columns : {},
    reason: String(signal.reason ?? '').trim(),
  };
}

export function dataSignalLine(signal) {
  const kind = signal && DATA_SIGNAL_LABELS[signal.status];
  if (!kind) return null;
  let text = signal.reason || '';
  if (kind.prefix && text.toLowerCase().startsWith(kind.prefix.toLowerCase())) text = text.slice(kind.prefix.length);
  return { tone: kind.tone, label: kind.label, text: text.trim() };
}

export function v130View(uc) {
  const u = uc && typeof uc === 'object' ? uc : {};
  const alignments = objectList(fieldOf(u, 'Strategy Alignment', 'strategy_alignment'))
    .map((a) => ({ id: String(a.id ?? '').trim(), path: String(a.path ?? '').trim(), evidence: String(a.evidence ?? '').trim() }))
    .filter((a) => a.path);
  const pathText = String(fieldOf(u, 'Strategy Path', 'strategy_path') ?? '').trim();
  let paths = alignments.map((a) => a.path);
  if (!paths.length && pathText && pathText !== STRATEGY_NOT_ALIGNED) {
    paths = pathText.split('; ').map((p) => p.trim()).filter(Boolean);
  }
  const hasStrategyData =
    alignments.length > 0 || !!pathText ||
    Array.isArray(parseJson(u['Strategy Alignment'])) || Array.isArray(parseJson(u.strategy_alignment));
  const storedKpis = objectList(fieldOf(u, 'KPIs', 'kpis')).filter((k) => String(k.name ?? '').trim());
  const stale = staleBaselineNotes(storedKpis);
  const clear = (text) => stale.reduce((out, note) => out.split(note).join(KPI_BASELINE_PENDING), text);
  const kpis = storedKpis.map((k) => ({ ...k, baseline: kpiBaselineShown(k.baseline) }));
  const keyResults = objectList(fieldOf(u, 'Expected Key Results', 'expected_key_results'))
    .map((kr) => ({ ...kr, statement: clear(String(kr.statement ?? '').trim()), source: kr.source === 'strategy' ? 'strategy' : 'proposed' }))
    .filter((kr) => kr.statement);
  const measures = textList(fieldOf(u, 'Measures of Success', 'measures_of_success')).map(clear);
  const financial = textList(fieldOf(u, 'Financial Benefits', 'financial_benefits')).map(clear);
  const nonFinancial = textList(fieldOf(u, 'Non-Financial Benefits', 'non_financial_benefits')).map(clear);
  const evidence = parseJson(fieldOf(u, 'Data Evidence', 'data_evidence'));
  const evidenceTables = evidence && typeof evidence === 'object' && !Array.isArray(evidence) && evidence.tables && typeof evidence.tables === 'object'
    ? evidence.tables : {};
  const evidenceJoins = evidence && Array.isArray(evidence.joins) ? evidence.joins : [];
  const evidenceSignal = dataSignalOf(evidence);
  return {
    alignments,
    paths,
    hasStrategyData,
    notAligned: hasStrategyData && paths.length === 0,
    priorityText: String(u['Business Priority Alignment'] ?? '').trim(),
    kpis,
    keyResults,
    measures,
    financial,
    nonFinancial,
    dataEvidence: Object.keys(evidenceTables).length || evidenceJoins.length || evidenceSignal
      ? { tables: evidenceTables, joins: evidenceJoins, signal: evidenceSignal } : null,
    foundations: textList(fieldOf(u, 'Foundations', 'foundation_ids')),
    useCaseKey: String(u.use_case_key ?? '').trim(),
    feedbackStatus: String(u['Feedback Status'] ?? '').trim().toLowerCase(),
    bestOfBest: bestOfBestOf(u),
    notStarredReason: String(u.best_of_best ?? '').trim().toUpperCase() === 'N' ? String(u.best_of_best_reason ?? '').trim() : '',
    hasValue: kpis.length + keyResults.length + measures.length + financial.length + nonFinancial.length > 0,
  };
}

export function strategyPathPrefixes(path) {
  const parts = String(path || '').split(STRATEGY_PATH_SEPARATOR).map((p) => p.trim()).filter(Boolean);
  return parts.map((_, i) => parts.slice(0, i + 1).join(STRATEGY_PATH_SEPARATOR));
}

export function matchesStrategyFilter(info, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === NOT_ALIGNED_FILTER) return !!info?.notAligned;
  return (info?.paths || []).some((p) => p === filter || p.startsWith(filter + STRATEGY_PATH_SEPARATOR));
}

export function strategyFilterOptions(infos, coverageEntries) {
  const counts = new Map();
  let notAligned = 0;
  let withData = 0;
  for (const info of infos || []) {
    if (!info?.hasStrategyData) continue;
    withData += 1;
    if (info.notAligned) {
      notAligned += 1;
      continue;
    }
    for (const prefix of new Set(info.paths.flatMap(strategyPathPrefixes))) counts.set(prefix, (counts.get(prefix) || 0) + 1);
  }
  const order = [];
  const seen = new Set();
  for (const entry of coverageEntries || []) {
    const path = String(entry?.path ?? '').trim();
    if (path && counts.has(path) && !seen.has(path)) {
      seen.add(path);
      order.push(path);
    }
  }
  for (const path of [...counts.keys()].sort((a, b) => a.localeCompare(b))) {
    if (!seen.has(path)) {
      seen.add(path);
      order.push(path);
    }
  }
  const options = order.map((path) => {
    const parts = path.split(STRATEGY_PATH_SEPARATOR);
    return { value: path, label: parts[parts.length - 1], title: path, depth: parts.length - 1, count: counts.get(path) };
  });
  return { options, notAligned, withData };
}

export function knownPriorities(results) {
  const fromCoverage = (results?.strategy_coverage?.priorities || [])
    .map((p) => String(p?.priority ?? '').trim()).filter(Boolean);
  if (fromCoverage.length) return fromCoverage;
  return (results?.strategic_context?.priorities || []).map((p) => String(p ?? '').trim()).filter(Boolean);
}

export function priorityMatches(text, known) {
  const value = String(text || '').trim();
  if (!value || value === STRATEGY_BUILTIN_NO_MATCH || !known?.length) return [];
  const padded = `, ${value}, `;
  return known.filter((p) => padded.includes(`, ${p}, `));
}

export function kpiDirectionArrow(direction) {
  const text = String(direction ?? '').trim();
  if (!text) return '';
  const up = KPI_UP.test(text);
  const down = KPI_DOWN.test(text);
  if (up && !down) return '↑';
  if (down && !up) return '↓';
  return text;
}

const WHOLE_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0, roundingMode: 'halfEven' });
const DECIMAL_FORMAT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, roundingMode: 'halfEven' });

export function formatBaseline(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '';
  return Number.isInteger(v) || Math.abs(v) >= 1000 ? WHOLE_FORMAT.format(v) : DECIMAL_FORMAT.format(v);
}

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const v = Number(value);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

export const KPI_WINDOW_ANCHOR = 'newest data';
export const KPI_BASELINE_PENDING = '[BASELINE: measured by the KPI query]';

export function kpiBaselineShown(baseline) {
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline) || !Object.keys(baseline).length) return null;
  if (finiteNumber(baseline.value) === 0 && baseline.window_days && baseline.window_anchor !== KPI_WINDOW_ANCHOR) return null;
  return baseline;
}

export function trackedKpiValue(entry) {
  const baseline = kpiBaselineShown(entry?.baseline);
  const change = baseline ? finiteNumber(entry.change) : null;
  return { baseline, change };
}

function staleBaselineNotes(kpis) {
  return kpis
    .filter((k) => k.baseline && typeof k.baseline === 'object' && String(k.name ?? '') && k.baseline.measured_on
      && kpiBaselineShown(k.baseline) === null)
    .map((k) => `${formatBaseline(k.baseline.value)} (${k.name}, last ${k.baseline.window_days} days, measured ${k.baseline.measured_on})`);
}

export function kpiText(spec) {
  const name = String(spec?.name ?? '').trim();
  if (!name) return '';
  const details = [kpiDirectionArrow(spec.direction), String(spec.unit ?? '').trim()].filter(Boolean).join(' ');
  const text = details ? `${name} (${details})` : name;
  const baseline = kpiBaselineShown(spec.baseline);
  const value = baseline ? finiteNumber(baseline.value) : null;
  if (value == null) return text;
  const date = String(baseline.measured_on ?? '');
  if (!baseline.window_days) return `${text}: baseline ${formatBaseline(value)}, all data, measured ${date}`;
  const newest = baseline.window_anchor === KPI_WINDOW_ANCHOR ? ' to the newest data' : '';
  return `${text}: baseline ${formatBaseline(value)}, last ${baseline.window_days} days${newest}, measured ${date}`;
}

function kpiPart(part) {
  const aggregation = String(part.aggregation || 'count').toLowerCase();
  const filter = part.filter_column && part.filter_value != null ? ` where ${part.filter_column} = ${part.filter_value}` : '';
  return `${aggregation} of ${part.column || 'rows'}${filter}`;
}

export function kpiSource(spec) {
  if (!spec || typeof spec !== 'object') return '';
  if (spec.metric_view) return `metric view ${spec.metric_view}${spec.measure ? `, measure ${spec.measure}` : ''}`;
  if (spec.denominator && typeof spec.denominator === 'object' && spec.table) {
    return `${kpiPart(spec)} / ${kpiPart(spec.denominator)}, on ${spec.table}`;
  }
  const target = spec.table && spec.column ? `${spec.table}.${spec.column}` : String(spec.table || '');
  if (!target) return '';
  return spec.aggregation ? `${target} (${String(spec.aggregation).toLowerCase()})` : target;
}

export function matchRateText(rate) {
  const v = finiteNumber(rate);
  return v == null ? '' : `${(Math.round(v * 1000) / 10).toFixed(1)}%`;
}

export function feedbackLabel(status) {
  return FEEDBACK_LABELS[String(status || '').toLowerCase()] || '';
}

export function excludedFeedbackText(entry) {
  const title = String(entry?.title || entry?.use_case_key || '').trim();
  const reason = String(entry?.reason || '').trim();
  const proposed = String(entry?.proposed_title || '').trim();
  const text = reason ? `${title}: ${reason}` : title;
  if (entry?.match === 'reworded' && proposed && proposed.toLowerCase() !== title.toLowerCase()) {
    return `${text} (proposed again as “${proposed}”)`;
  }
  return text;
}

export function latestFeedbackMap(latest) {
  const map = {};
  for (const row of latest || []) {
    const key = String(row?.use_case_key ?? '').trim();
    if (key && !map[key]) map[key] = row;
  }
  return map;
}

export function dataAccessSummary(results) {
  const type = String(results?.discovery_type || '').trim();
  if (!type) return null;
  const access = results?.data_access && typeof results.data_access === 'object' ? results.data_access : {};
  const tables = Array.isArray(access.tables_read) ? access.tables_read : [];
  return {
    type,
    deep: type === 'Deep',
    tablesRead: tables,
    tablesReadCount: finiteNumber(access.tables_read_count) ?? tables.length,
    statements: finiteNumber(access.statements) ?? 0,
    piiColumnsExcluded: finiteNumber(access.pii_columns_excluded) ?? 0,
    tablesSkipped: access.tables_skipped && typeof access.tables_skipped === 'object' ? access.tables_skipped : {},
    rowsSentToAi: finiteNumber(access.rows_sent_to_ai) ?? 0,
  };
}
