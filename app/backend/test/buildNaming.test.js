const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', '..', 'frontend', 'src');
const BACKEND = path.resolve(__dirname, '..');

function files(dir, keep) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'test', 'dist'].includes(entry.name)) out.push(...files(full, keep));
    } else if (keep.test(entry.name)) out.push(full);
  }
  return out;
}

const ANY_POC = /PoC|(?<![A-Z])POC(?![A-Z])|Poc(?![a-z])|\bpocs?\b|\bpoc[A-Z_]/;
const OLD_PAGE = /Implement page|Open in Implement|label: 'Implement'|>Implement</;

function hits(list, re) {
  const found = [];
  for (const file of list) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|import |\*)/.test(line)) return;
      if (re.test(line)) found.push(`${path.relative(path.dirname(SRC), file)}:${i + 1}`);
    });
  }
  return found;
}

test('the PoC pattern catches the old wording and code names, and passes the MVP ones', () => {
  for (const bad of ["label: 'PoC/MVP ready'", "label: 'PoC ready'", 'No PoC yet.', '`Inspire saves this PoC/MVP under ', "'Start PoC'", 'PocProgress', 'pocStages',
    'data-poc-progress', "mode === 'poc'", 'summary.pocs', 'START_POC_LABEL', 'hasPoc']) assert.ok(ANY_POC.test(bad), bad);
  for (const good of ["label: 'MVP ready'", 'MvpProgress', 'mvpStages', 'data-mvp-progress', 'MVP views', "mode === 'mvp'", 'START_MVP_LABEL', 'hasMvp', 'epoch',
    'Apocalypse', 'EPOCH_MS', 'Pocket']) assert.equal(ANY_POC.test(good), false, good);
  assert.ok(OLD_PAGE.test('Follow it on the Implement page.'));
  assert.equal(OLD_PAGE.test("{ id: 'implement', label: 'Build', step: 4 }"), false);
});

test('no PoC is left in the App or its API, in words or in code names, and the Implement page reads Build', () => {
  const app = files(SRC, /\.(js|jsx)$/);
  const api = files(BACKEND, /\.js$/).filter((file) => path.basename(file) !== 'notebook_bundle.js');
  assert.deepEqual(hits([...app, ...api], ANY_POC), []);
  assert.deepEqual(hits([...app, ...api], OLD_PAGE), []);
  assert.match(fs.readFileSync(path.join(SRC, 'components', 'Header.jsx'), 'utf8'), /\{ id: 'implement', label: 'Build', step: 4 \}/);
  assert.match(fs.readFileSync(path.join(SRC, 'pages', 'ImplementPage.jsx'), 'utf8'), /<h1 [^>]*>Build<\/h1>/);
});

test('the start button label is written once and every place that shows it uses the shared label', () => {
  const app = files(SRC, /\.(js|jsx)$/);
  const literal = app.filter((f) => fs.readFileSync(f, 'utf8').includes('Start Use Case MVP with Genie'));
  assert.deepEqual(literal.map((f) => path.relative(SRC, f)), [path.join('lib', 'implementWizard.js')]);
  for (const rel of ['components/ImplementCardActions.jsx', 'components/UseCaseDetailBody.jsx', 'pages/ImplementPage.jsx', 'pages/ImplementWizard.jsx']) {
    assert.match(fs.readFileSync(path.join(SRC, rel), 'utf8'), /\{START_MVP_LABEL\}|START_MVP_LABEL\b/, rel);
  }
});
