const FEEDBACK_STATUSES = ['accepted', 'rejected', 'planned', 'implemented'];
const FEEDBACK_NOT_AVAILABLE =
  'Feedback not available: the __inspire_feedback table is created by the Inspire agent on its first v1.3.0 run.';
const MAX_KEY_CHARS = 300;
const MAX_REASON_CHARS = 2000;

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function isMissingTableError(err) {
  const msg = String((err && err.message) || err || '');
  return msg.includes('TABLE_OR_VIEW_NOT_FOUND') || msg.includes('does not exist');
}

function validateFeedbackBody(body) {
  const input = body || {};
  const sessionId = String(input.session_id ?? '').trim();
  if (!/^\d+$/.test(sessionId)) throw badRequest('session_id must be numeric.');
  const status = String(input.status || '').trim().toLowerCase();
  if (!FEEDBACK_STATUSES.includes(status)) throw badRequest(`status must be one of: ${FEEDBACK_STATUSES.join(', ')}.`);
  const useCaseKey = String(input.use_case_key || '').trim();
  if (!useCaseKey || useCaseKey.length > MAX_KEY_CHARS) {
    throw badRequest(`use_case_key is required (at most ${MAX_KEY_CHARS} characters).`);
  }
  const reason = String(input.reason || '').trim();
  if (reason.length > MAX_REASON_CHARS) throw badRequest(`reason is at most ${MAX_REASON_CHARS} characters.`);
  return {
    sessionId,
    status,
    useCaseKey,
    reason,
    useCaseId: String(input.use_case_id || '').trim().slice(0, 64),
    useCaseTitle: String(input.use_case_title || '').trim().slice(0, 500),
  };
}

function feedbackInsertStatement(table, values, businessName, updatedBy) {
  return {
    sql:
      `INSERT INTO ${table} (session_id, business_name, use_case_id, use_case_key, use_case_title, status, reason, ` +
      'updated_by, updated_at) VALUES (:session_id, :business_name, :use_case_id, :use_case_key, :use_case_title, ' +
      ':status, :reason, :updated_by, current_timestamp())',
    parameters: [
      { name: 'session_id', value: values.sessionId, type: 'BIGINT' },
      { name: 'business_name', value: String(businessName || ''), type: 'STRING' },
      { name: 'use_case_id', value: values.useCaseId, type: 'STRING' },
      { name: 'use_case_key', value: values.useCaseKey, type: 'STRING' },
      { name: 'use_case_title', value: values.useCaseTitle, type: 'STRING' },
      { name: 'status', value: values.status, type: 'STRING' },
      { name: 'reason', value: values.reason, type: 'STRING' },
      { name: 'updated_by', value: String(updatedBy || '').slice(0, 320), type: 'STRING' },
    ],
  };
}

function sessionBusinessStatement(sessionTable, sessionId) {
  return {
    sql: `SELECT business_name FROM ${sessionTable} WHERE session_id = :sid LIMIT 1`,
    parameters: [{ name: 'sid', value: String(sessionId), type: 'BIGINT' }],
  };
}

function feedbackHistoryStatement(table, businessName) {
  return {
    sql:
      `SELECT session_id, use_case_id, use_case_key, use_case_title, status, reason, updated_by, updated_at FROM ${table} ` +
      'WHERE lower(business_name) = lower(:business) ORDER BY updated_at DESC LIMIT 5000',
    parameters: [{ name: 'business', value: String(businessName || '').trim(), type: 'STRING' }],
  };
}

function latestFeedbackByKey(history) {
  const latest = new Map();
  for (const row of history || []) {
    if (row && row.use_case_key && !latest.has(row.use_case_key)) latest.set(row.use_case_key, row);
  }
  return [...latest.values()];
}

module.exports = {
  FEEDBACK_STATUSES,
  FEEDBACK_NOT_AVAILABLE,
  isMissingTableError,
  validateFeedbackBody,
  feedbackInsertStatement,
  sessionBusinessStatement,
  feedbackHistoryStatement,
  latestFeedbackByKey,
};
