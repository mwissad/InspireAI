const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'ucPermissionErrors.js')).href;

test('the permission checklist asks for the Inspire schema volume privileges the run log needs', async () => {
  const { interpretUcPermissionError } = await import(libUrl);
  const out = interpretUcPermissionError(
    'PERMISSION_DENIED: User does not have WRITE VOLUME on Volume main._inspire.vol_root',
    { inspireDatabase: 'main._inspire', context: 'launch' },
  );
  assert.equal(out.isPermissionIssue, true);
  const schemaGrant = out.adminBullets.find((b) => b.includes('ON SCHEMA `main`.`_inspire`') && b.includes('CREATE TABLE'));
  assert.ok(schemaGrant, out.adminBullets.join('\n'));
  assert.match(schemaGrant, /CREATE TABLE, MODIFY, SELECT, CREATE VOLUME, READ VOLUME, WRITE VOLUME ON SCHEMA/);
  assert.match(out.adminEmailText, /WRITE VOLUME ON SCHEMA `main`\.`_inspire`/);
});
