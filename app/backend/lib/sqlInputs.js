
const UNSAFE_IDENTIFIER_RE = /[`\u0000-\u001f\u007f]/;
const SINCE_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:?\d{2})?$/;

function splitInspireDatabase(inspire_database) {
  if (!inspire_database || typeof inspire_database !== 'string') return null;
  const parts = inspire_database.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (parts.some((part) => UNSAFE_IDENTIFIER_RE.test(part))) return null;
  return { catalog: parts[0], schema: parts[1] };
}

function isTimestampText(value) {
  return typeof value === 'string' && SINCE_RE.test(value.trim());
}

const STEP_COLUMNS =
  'step_id, session_id, last_updated, stage_name, step_name, sub_step_name, progress_increment, message, status, result_json';

function stepsStatement(table, sessionId, since) {
  if (sessionId && since) {
    return {
      sql: `SELECT ${STEP_COLUMNS} FROM ${table} WHERE session_id = ${sessionId} AND last_updated > CAST(:since AS TIMESTAMP) ORDER BY last_updated, step_id`,
      parameters: [{ name: 'since', value: String(since).trim(), type: 'STRING' }],
    };
  }
  if (sessionId) {
    return { sql: `SELECT ${STEP_COLUMNS} FROM ${table} WHERE session_id = ${sessionId} ORDER BY last_updated, step_id`, parameters: null };
  }
  return { sql: `SELECT ${STEP_COLUMNS} FROM ${table} ORDER BY last_updated DESC, step_id DESC LIMIT 100`, parameters: null };
}

module.exports = { splitInspireDatabase, isTimestampText, stepsStatement };
