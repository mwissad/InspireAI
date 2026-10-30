const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FEEDBACK_STATUSES,
  isMissingTableError,
  validateFeedbackBody,
  feedbackInsertStatement,
  sessionBusinessStatement,
  feedbackHistoryStatement,
  latestFeedbackByKey,
} = require('../lib/inspireFeedback');

const body = {
  session_id: '3333333333333333333',
  use_case_id: 'N01-U03',
  use_case_key: 'forecast weekly demand|main.s.orders',
  use_case_title: 'Forecast weekly demand',
  status: 'Rejected',
  reason: "It's covered by another team",
};

test('only the four agent statuses are accepted', () => {
  assert.deepEqual(FEEDBACK_STATUSES, ['accepted', 'rejected', 'planned', 'implemented']);
  assert.equal(validateFeedbackBody(body).status, 'rejected');
  for (const bad of ['deleted', '', 'reject']) {
    assert.throws(() => validateFeedbackBody({ ...body, status: bad }), (err) => err.statusCode === 400, bad);
  }
});

test('the session id must be numeric', () => {
  for (const bad of ['', '12; DROP TABLE x', '1 OR 1=1', 'abc', '-5']) {
    assert.throws(() => validateFeedbackBody({ ...body, session_id: bad }), (err) => err.statusCode === 400, bad);
  }
  assert.equal(validateFeedbackBody({ ...body, session_id: 42 }).sessionId, '42');
});

test('the use case key is required and bounded, and the reason is bounded', () => {
  assert.throws(() => validateFeedbackBody({ ...body, use_case_key: '  ' }), (err) => err.statusCode === 400);
  assert.throws(() => validateFeedbackBody({ ...body, use_case_key: 'k'.repeat(301) }), (err) => err.statusCode === 400);
  assert.throws(() => validateFeedbackBody({ ...body, reason: 'r'.repeat(2001) }), (err) => err.statusCode === 400);
});

test('every user value is a bound parameter, never part of the SQL text', () => {
  const hostile = "'); DROP TABLE main.s.__inspire_usecases; --";
  const values = validateFeedbackBody({ ...body, reason: hostile, use_case_title: hostile });
  const insert = feedbackInsertStatement('`main`.`s`.`__inspire_feedback`', values, "O'Brien Retail", 'amr@example.com');
  assert.ok(!insert.sql.includes('DROP TABLE') && !insert.sql.includes("O'Brien"));
  assert.match(insert.sql, /VALUES \(:session_id, :business_name, :use_case_id, :use_case_key, :use_case_title, :status, :reason, :updated_by, current_timestamp\(\)\)/);
  const byName = Object.fromEntries(insert.parameters.map((p) => [p.name, p]));
  assert.equal(byName.reason.value, hostile, 'the reason is stored as text');
  assert.equal(byName.business_name.value, "O'Brien Retail");
  assert.equal(byName.session_id.type, 'BIGINT');
  assert.equal(byName.status.value, 'rejected');
  const lookup = sessionBusinessStatement('`main`.`s`.`__inspire_session`', values.sessionId);
  assert.match(lookup.sql, /WHERE session_id = :sid/);
  const history = feedbackHistoryStatement('`main`.`s`.`__inspire_feedback`', "O'Brien Retail");
  assert.ok(!history.sql.includes("O'Brien") && history.parameters[0].value === "O'Brien Retail");
});

test('the latest row per use case key wins', () => {
  const rows = [
    { use_case_key: 'a|t', status: 'implemented', updated_at: '2026-10-21' },
    { use_case_key: 'b|t', status: 'rejected', updated_at: '2026-10-20' },
    { use_case_key: 'a|t', status: 'accepted', updated_at: '2026-10-19' },
    { use_case_key: null, status: 'accepted' },
  ];
  assert.deepEqual(latestFeedbackByKey(rows).map((r) => `${r.use_case_key}:${r.status}`), ['a|t:implemented', 'b|t:rejected']);
});

test('a missing feedback table is recognized, other errors are not', () => {
  assert.ok(isMissingTableError(new Error('[TABLE_OR_VIEW_NOT_FOUND] The table `main`.`s`.`__inspire_feedback` cannot be found')));
  assert.ok(isMissingTableError('Table main.s.__inspire_feedback does not exist'));
  assert.ok(!isMissingTableError(new Error('PERMISSION_DENIED: User does not have INSERT')));
});
