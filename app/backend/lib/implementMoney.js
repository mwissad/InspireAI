const { quoteTable, resultTableNameError, badRequest } = require('./inspireImplement');

const PLACEHOLDER_RE = /\{([^{}:]*)(?::([^{}]*))?\}/g;
const KINDS = ['money', 'number', 'percent'];
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const HISTORY_ROWS = 50;

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function moneyStatements(resultTable, useCaseId) {
  if (resultTableNameError(resultTable)) throw badRequest(resultTableNameError(resultTable));
  const parameters = [{ name: 'uc', value: String(useCaseId), type: 'STRING' }];
  return {
    summary: { sql: `SELECT * FROM ${quoteTable(`${resultTable}_summary`)} WHERE use_case_id = :uc ORDER BY updated_at DESC NULLS LAST LIMIT 1`, parameters },
    edits: {
      sql: `SELECT name, value, changed_by, changed_at, note FROM ${quoteTable(`${resultTable}_assumptions`)} WHERE use_case_id = :uc `
        + `ORDER BY changed_at DESC LIMIT ${HISTORY_ROWS}`,
      parameters,
    },
  };
}

function assumptionList(raw) {
  let listed = raw;
  if (typeof raw === 'string') {
    try { listed = JSON.parse(raw); } catch { listed = []; }
  }
  const out = [];
  for (const item of Array.isArray(listed) ? listed : []) {
    const name = String(item?.name ?? '');
    const value = numberOrNull(item?.value);
    if (NAME_RE.test(name) && value != null && !out.some((a) => a.name === name)) {
      out.push({ name, kind: KINDS.includes(item.kind) ? item.kind : 'number', run_value: value });
    }
  }
  return out;
}

function formulaParts(template, assumptions) {
  const names = new Set(assumptions.map((a) => a.name));
  const parts = [];
  let at = 0;
  for (const m of template.matchAll(PLACEHOLDER_RE)) {
    if (m.index > at) parts.push({ text: template.slice(at, m.index) });
    const name = m[1].trim();
    const kind = KINDS.includes((m[2] || 'number').trim()) ? (m[2] || 'number').trim() : 'number';
    parts.push(names.has(name) ? { assumption: name, kind } : { column: name, kind });
    at = m.index + m[0].length;
  }
  if (at < template.length) parts.push({ text: template.slice(at) });
  return parts;
}

function truthy(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

function moneyView(summary, edits = []) {
  if (!summary) return { run: null, model: null, history: [] };
  const assumptions = assumptionList(summary.value_assumptions);
  const latest = new Map();
  const history = [];
  for (const edit of edits || []) {
    const value = numberOrNull(edit.value);
    const name = String(edit.name ?? '');
    const known = assumptions.find((a) => a.name === name);
    if (value == null || !known) continue;
    if (!latest.has(name)) latest.set(name, edit);
    history.push({ name, kind: known.kind, value, changed_by: String(edit.changed_by ?? ''), changed_at: edit.changed_at ?? null, note: String(edit.note ?? '') });
  }
  for (const a of assumptions) {
    const edit = latest.get(a.name);
    Object.assign(a, { value: edit ? numberOrNull(edit.value) : a.run_value, changed_by: String(edit?.changed_by ?? ''), changed_at: edit?.changed_at ?? null });
  }
  const template = String(summary.value_formula ?? '').split(/\s+/).filter(Boolean).join(' ');
  const run = {
    run_id: summary.run_id == null ? null : String(summary.run_id), updated_at: summary.updated_at ?? null,
    basis: String(summary.decision_basis ?? ''), currency: String(summary.currency ?? ''),
    act_now_amount: numberOrNull(summary.act_now_amount), review_amount: numberOrNull(summary.review_amount),
    act_now_records: numberOrNull(summary.act_now_records), review_records: numberOrNull(summary.review_records), records: numberOrNull(summary.records),
    value_at_stake: numberOrNull(summary.value_at_stake), nothing_to_act: String(summary.nothing_to_act ?? '').trim(), accepted: truthy(summary.accepted),
  };
  const model = template || assumptions.length ? {
    template, parts: formulaParts(template, assumptions), assumptions, currency: run.currency,
    expression: String(summary.value_expression ?? '').trim() || null, changed: assumptions.some((a) => a.value !== a.run_value),
  } : null;
  return { run, model, history };
}

module.exports = { moneyStatements, moneyView };
