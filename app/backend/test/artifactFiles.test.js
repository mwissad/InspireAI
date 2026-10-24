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
