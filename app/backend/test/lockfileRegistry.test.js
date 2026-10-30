const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.resolve(__dirname, '..', '..');
const LOCKFILES = ['package-lock.json', 'backend/package-lock.json', 'frontend/package-lock.json'];

test('every lockfile resolves its packages from the public npm registry', () => {
  for (const file of LOCKFILES) {
    const packages = JSON.parse(fs.readFileSync(path.join(APP, file), 'utf8')).packages || {};
    const off = Object.entries(packages)
      .filter(([, entry]) => entry.resolved && !entry.resolved.startsWith('https://registry.npmjs.org/'))
      .map(([name]) => name);
    assert.deepEqual(off, [], `${file} resolves packages from another registry`);
  }
});
