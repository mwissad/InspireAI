const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { splitInspireDatabase, isTimestampText, stepsStatement } = require('../lib/sqlInputs');

test('inspire_database splits into two safe identifier parts', () => {
  assert.deepEqual(splitInspireDatabase('main.inspire'), { catalog: 'main', schema: 'inspire' });
  assert.deepEqual(splitInspireDatabase('  uki-customer-demos._inspire '), { catalog: 'uki-customer-demos', schema: '_inspire' });
  assert.deepEqual(splitInspireDatabase('caf\u00e9.sch\u00e9ma'), { catalog: 'caf\u00e9', schema: 'sch\u00e9ma' });
});

test('a backtick or control character in either part is refused, so quoting cannot be broken', () => {
  for (const value of [
    'main`.x',
    'main.x` ; DROP TABLE t; --',
    'a`; SELECT 1; --.b',
    'a\n.b',
    'a.b\u0000',
    'a.b\u007f',
    'a.b.c',
    '.b',
    'a.',
    '',
    null,
    42,
  ]) {
    assert.equal(splitInspireDatabase(value), null, JSON.stringify(value));
  }
});

test('since accepts the timestamps the API returns and nothing else', () => {
  for (const value of ['2026-10-21T13:55:34.123Z', '2026-10-21 13:55:34', '2026-10-21T13:55:34.123456+04:00', '2026-10-21T13:55:34-0500']) {
    assert.equal(isTimestampText(value), true, value);
  }
  for (const value of ["x' OR 1=1 --", "2026-10-21T13:55:34Z' OR '1'='1", '2026-10-21', '', null, 5, '2026-10-21T13:55:34.1234567890Z']) {
    assert.equal(isTimestampText(value), false, JSON.stringify(value));
  }
});

test('the step-delta query binds since and never writes it into the SQL text', () => {
  const since = '2026-10-21T13:55:34.123Z';
  const withSince = stepsStatement('`c`.`s`.`__inspire_step`', '123', since);
  assert.equal(withSince.sql.includes(since), false);
  assert.match(withSince.sql, /last_updated > CAST\(:since AS TIMESTAMP\)/);
  assert.deepEqual(withSince.parameters, [{ name: 'since', value: since, type: 'STRING' }]);
  const sessionOnly = stepsStatement('`c`.`s`.`__inspire_step`', '123', '');
  assert.equal(sessionOnly.parameters, null);
  assert.match(sessionOnly.sql, /WHERE session_id = 123 ORDER BY last_updated, step_id$/);
  assert.match(stepsStatement('`c`.`s`.`__inspire_step`', '', '').sql, /ORDER BY last_updated DESC, step_id DESC LIMIT 100$/);
});

test('server.js quotes string values only through escapeSqlStringLiteral and keeps no second splitter', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const quoted = server.match(/'\$\{[^}]*\}'/g) || [];
  assert.ok(quoted.length > 0);
  for (const site of quoted) assert.match(site, /^'\$\{escapeSqlStringLiteral\(/, site);
  assert.equal(/function splitInspireDatabase\(/.test(server), false);
  assert.match(server, /require\('\.\/lib\/sqlInputs'\)/);
});
