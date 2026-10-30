const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'artifactFiles.js')).href;

test('the artifact browser hides JSON files and keeps folders and documents', async () => {
  const { visibleArtifactFiles } = await import(libUrl);
  const files = [
    { name: 'Acme-dbx_inspire.json', path: '/w/docs/Acme-dbx_inspire.json', is_directory: false },
    { name: 'ailogs.jsonl', path: '/w/.inspire_logs/ailogs.jsonl', is_directory: false },
    { name: 'REPORT.JSON', path: '/w/docs/REPORT.JSON', is_directory: false },
    { name: 'Acme-dbx_inspire_en.pdf', path: '/w/docs/Acme-dbx_inspire_en.pdf', is_directory: false },
    { name: 'log.log', path: '/w/.inspire_logs/log.log', is_directory: false },
    { name: 'exports.json', path: '/w/exports.json', is_directory: true },
    null,
  ];
  assert.deepEqual(visibleArtifactFiles(files).map((f) => f.name), ['Acme-dbx_inspire_en.pdf', 'log.log', 'exports.json']);
  assert.deepEqual(visibleArtifactFiles(undefined), []);
});

test('Quick access lists PDF, Excel and CSV files, and leaves CSV out when an Excel file is there', async () => {
  const { quickAccessFiles, fileExtension } = await import(libUrl);
  const f = (name, extra) => ({ name, path: `/w/docs/${name}`, is_directory: false, ...extra });
  const withExcel = [f('Acme-dbx_inspire.pdf'), f('Acme-dbx_inspire.CSV'), f('Acme-dbx_inspire.xlsx'), f('notes.md'), f('data', { is_directory: true }), null];
  assert.deepEqual(quickAccessFiles(withExcel).map((x) => x.name), ['Acme-dbx_inspire.pdf', 'Acme-dbx_inspire.xlsx']);
  assert.deepEqual(quickAccessFiles([f('a.pdf'), f('a.csv')]).map((x) => x.name), ['a.pdf', 'a.csv'], 'with no Excel file the CSV stays');
  assert.deepEqual(quickAccessFiles([f('old.xls'), f('a.csv')]).map((x) => x.name), ['old.xls'], 'an .xls file counts as Excel');
  assert.deepEqual(quickAccessFiles(undefined), []);
  assert.equal(fileExtension({ name: 'README' }), '');
  assert.equal(fileExtension({ name: 'Report.Final.PDF' }), 'pdf');
});

test('the Results page builds Quick access from quickAccessFiles and keeps no extension list of its own', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'pages', 'ResultsPage.jsx'), 'utf8');
  assert.match(src, /const previewableFiles = quickAccessFiles\(artifactFiles\);/);
  assert.doesNotMatch(src, /\['pdf', 'csv', 'xlsx', 'xls'\]\.includes/);
});
