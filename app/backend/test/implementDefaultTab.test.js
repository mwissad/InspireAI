const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const lib = (name) => import(pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', name)).href);

async function load() {
  const control = await lib('implementControl.js');
  const { versionActive } = await lib('implementWizard.js');
  const follow = (statuses, start = null) => statuses.reduce((view, status) => control.implementDefaultTab(view, versionActive(status && { status })), start);
  return { ...control, versionActive, follow };
}

test('the first look opens Progress while a build runs and the Control Tower otherwise, a failed or stopped build included', async () => {
  const { implementDefaultTab, versionActive, PROGRESS_TAB, CONTROL_TAB } = await load();
  assert.deepEqual([PROGRESS_TAB, CONTROL_TAB], ['Progress', 'Control Tower']);
  for (const status of ['queued', 'filling', 'previewing', 'building_outputs']) {
    assert.deepEqual(implementDefaultTab(null, versionActive({ status })), { tab: 'Progress', active: true }, status);
  }
  for (const status of ['ready', 'ready_with_warnings', 'failed']) {
    assert.deepEqual(implementDefaultTab(null, versionActive({ status })), { tab: 'Control Tower', active: false }, status);
  }
  assert.deepEqual(implementDefaultTab(null, versionActive({ status: 'filling' }, { reason: 'the run ended' })), { tab: 'Control Tower', active: false },
    'a run that stopped while filling is not building');
  assert.deepEqual(implementDefaultTab(null, versionActive(null)), { tab: 'Control Tower', active: false }, 'a use case with no MVP');
  assert.deepEqual(implementDefaultTab(undefined, undefined), { tab: 'Control Tower', active: false });
});

test('a build that starts opens Progress and a build that ends opens the Control Tower', async () => {
  const { follow } = await load();
  assert.equal(follow(['ready', 'queued']).tab, 'Progress', 'the user submits a change');
  assert.equal(follow(['queued', 'filling', 'ready']).tab, 'Control Tower', 'the build finished');
  assert.equal(follow(['filling', 'failed']).tab, 'Control Tower', 'the build failed');
  assert.equal(follow([null, 'queued']).tab, 'Progress', 'the first MVP of a use case starts');
  assert.equal(follow(['ready', 'queued', 'ready', 'queued']).tab, 'Progress');
});

test('between transitions the tab the user clicked stays, and a status flapping between two active states never switches it', async () => {
  const { implementDefaultTab, follow } = await load();
  const building = follow(['filling']);
  const clicked = implementDefaultTab(building, true, 'Control Tower');
  assert.deepEqual(clicked, { tab: 'Control Tower', active: true });
  assert.equal(follow(['previewing', 'building_outputs', 'filling'], clicked).tab, 'Control Tower', 'the build moves on without a switch');
  assert.equal(follow(['building_outputs', 'ready'], clicked).tab, 'Control Tower', 'the build ends while the user is on the Control Tower');

  const done = follow(['ready']);
  const looked = implementDefaultTab(done, false, 'Progress');
  assert.deepEqual(looked, { tab: 'Progress', active: false });
  assert.equal(follow(['ready_with_warnings', 'ready'], looked).tab, 'Progress', 'a finished status that changes is no transition');
  assert.equal(follow(['queued'], looked).tab, 'Progress', 'a new build starts while the user reads Progress');

  const flapping = follow(['filling', 'previewing', 'filling', 'previewing']);
  assert.equal(flapping.tab, 'Progress');
  assert.equal(implementDefaultTab(flapping, true), flapping, 'the same view comes back while nothing changes');
});

test('a click on a tab that does not exist changes nothing', async () => {
  const { implementDefaultTab, follow } = await load();
  const done = follow(['ready']);
  assert.equal(implementDefaultTab(done, false, 'Edit'), done);
  assert.equal(implementDefaultTab(done, false, 'Dashboard'), done);
  assert.deepEqual(implementDefaultTab(null, true, 'History'), { tab: 'Progress', active: true });
  assert.deepEqual(implementDefaultTab(done, true, 'Edit'), { tab: 'Progress', active: true }, 'an unknown click never hides a transition');
});
