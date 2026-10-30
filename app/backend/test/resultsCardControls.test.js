const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..', '..', 'frontend', 'src');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');

test('the Results page and its card keep none of the old Genie card controls and each render the one card action row', () => {
  const files = ['pages/ResultsPage.jsx', 'components/UseCaseCard.jsx', 'components/UseCaseDetailBody.jsx', 'components/UseCaseDrawer.jsx'];
  for (const rel of files) {
    const src = read(rel);
    for (const gone of ['Open Studio', 'Has Genie instruction', 'Genie (partial)', 'Mark Ready for Genie Code Generation', 'Mark to regenerate',
      'Open Notebook', 'Implement with Genie', 'UseCaseStudio', 'genieCardActions']) {
      assert.equal(src.includes(gone), false, `${rel}: ${gone}`);
    }
  }
  assert.equal((read('pages/ResultsPage.jsx').match(/<ImplementCardActions /g) || []).length, 0, 'the Results list renders cards, and the card holds the action row');
  assert.equal((read('components/UseCaseCard.jsx').match(/<ImplementCardActions /g) || []).length, 1, 'the card');
  assert.equal((read('components/UseCaseDetailBody.jsx').match(/<ImplementCardActions /g) || []).length, 0);
});

test('nothing in the App still opens the Use Case Studio', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(jsx?|mjs)$/.test(entry.name)) files.push(full);
    }
  };
  walk(frontend);
  const hits = files.filter((f) => /UseCaseStudio|Use Case Studio|data-studio-overlay/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits.map((f) => path.relative(frontend, f)), []);
});
