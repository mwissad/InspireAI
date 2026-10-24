const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..', '..', 'frontend');

test('dark styles follow the App theme toggle, never the operating system', () => {
  const css = fs.readFileSync(path.join(frontend, 'src', 'index.css'), 'utf8');
  assert.match(css, /@custom-variant dark \(&:where\(\.dark, \.dark \*\)\);/);
  const assets = path.join(frontend, 'dist', 'assets');
  const built = fs.readdirSync(assets).filter((name) => name.endsWith('.css'));
  assert.ok(built.length > 0, 'the frontend is built');
  for (const name of built) {
    const text = fs.readFileSync(path.join(assets, name), 'utf8');
    assert.doesNotMatch(text, /prefers-color-scheme:\s*dark/, `${name} still follows the operating system`);
  }
});
