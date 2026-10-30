const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { listen } = require('./support/implementApp');
const S = require('../lib/showcase');
const R = require('../lib/showcaseRecord');

const joined = (...parts) => parts.join('');
const SID = joined('2026', '0000', '1111', '2222', '333');
const HOST = `https://${['dbc-1a2b3c4d-5e6f', 'cloud', 'databricks', 'com'].join('.')}`;
const MVP_URL = `https://inspire-n01-u01-${joined('4455', '6677', '8899', '0011')}.${['aws', 'databricksapps', 'com'].join('.')}`;
const JANE = ['jane.doe', 'corp.io'].join('@');
const BOB = ['bob', 'corp.io'].join('@');
const SP_ID = ['5d1e7c3a', '9b2f', '4e6a', '8c4d', '1f2e3a4b5c6d'].join('-');
const SP_NAME = 'app-q7k2m9';
const ASSET = joined('01f0aabbccddeeff', '00112233445566');
const LONG = joined('9876543', '210123');
const JOB_ID = Number(joined('4321', '0987', '6543', '2109'));

function recorder(extra = {}) {
  return R.makeRecorder({
    id: 'taxi',
    title: 'NYC Taxi Operations',
    business: 'NYC Taxi Operations',
    sessionId: SID,
    replace: { acme_catalog: 'demo_catalog', 'Jane Analyst': 'Demo User' },
    mvps: [{ id: 'N01-U01', title: 'Fare desk', url: MVP_URL }],
    ...extra,
  });
}

test('the sanitizer replaces workspace hosts, emails, ids and service principal names, and keeps times and ordinary words', () => {
  const clean = R.makeSanitizer({ replace: { acme_catalog: 'demo_catalog', acme: 'demo' }, sessionId: SID });
  assert.equal(clean.text(`${HOST}/#job/1/run/2`), `${R.DEMO_HOST}/#job/1/run/2`);
  assert.equal(clean.text(`${JANE} and ${JANE}, ${BOB}`), 'person1@example.com and person1@example.com, person2@example.com');
  assert.equal(clean.text('kept@example.com'), 'kept@example.com');
  assert.equal(clean.text(`/Workspace/Shared/x/session_${SID}/v3`), '/Workspace/Shared/x/session_1001/v3');
  assert.equal(clean.text(`${SID}|${LONG}`), '1001|1002');
  assert.equal(clean.text(SP_ID), '00000000-0000-4000-8000-aaaa00000001');
  assert.equal(clean.text(`${ASSET}77`), 'demoxxxxxxxxxxxxxxxxxxxx00000001');
  assert.equal(clean.text(`runs as ${SP_NAME} inspire-ai-implement`), 'runs as app-demo00 inspire-ai-implement');
  assert.equal(clean.text('app-access and app-config stay'), 'app-access and app-config stay');
  assert.equal(clean.text('acme_catalog.acme.trips'), 'demo_catalog.demo.trips');
  assert.equal(clean.text('12345678901 stays'), '12345678901 stays');
  assert.deepEqual(clean.value({ start_time: 1761764657000, created_at: '1761764657000', job_id: JOB_ID, n: 42 }),
    { start_time: 1761764657000, created_at: '1761764657000', job_id: 1003, n: 42 });
  assert.deepEqual(clean.value({ created_at: JANE }), { created_at: 'person1@example.com' });
});

test('the sanitizer never rewrites its own fakes, so the same id stays the same everywhere', () => {
  const clean = R.makeSanitizer({ sessionId: SID });
  const once = clean.text(`${SP_ID} ${ASSET}77 ${SID} ${JANE}`);
  assert.equal(once, '00000000-0000-4000-8000-aaaa00000001 demoxxxxxxxxxxxxxxxxxxxx00000001 1001 person1@example.com');
  assert.equal(clean.text(once), once);
  assert.deepEqual(R.showcaseLeaks({ once }), []);
});

test('the sanitizer stays fast on long runs of letters and digits', () => {
  const clean = R.makeSanitizer({ sessionId: SID });
  const blob = 'QUJDRA0K'.repeat(250000);
  const times = [];
  for (let i = 0; i < 3; i += 1) {
    const started = process.hrtime.bigint();
    assert.equal(clean.text(blob), blob);
    times.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  assert.ok(Math.min(...times) < 2000, `sanitizing 2MB took ${times.map((t) => t.toFixed(0)).join(', ')} ms`);
  assert.deepEqual(R.showcaseLeaks({ blob }), [], 'the leak check reads the same blob as clean');
});

test('an email with a local part longer than 64 characters is replaced whole, and the leak check still finds it', () => {
  const local = 'q'.repeat(70);
  const email = `${local}@${['corp', 'example', 'org'].join('.')}`;
  const clean = R.makeSanitizer({ sessionId: SID });
  assert.equal(clean.text(`owner ${email} wrote`), 'owner person1@example.com wrote');
  assert.equal(clean.text(`x/${email}`), 'x/person1@example.com', 'the same address keeps the same fake');
  assert.equal(R.showcaseLeaks({ owner: email }).length, 1, 'a raw over-long address is a leak');
  assert.deepEqual(R.showcaseLeaks({ owner: clean.text(email) }), []);
  assert.equal(clean.text(`${local}x`), `${local}x`, 'letters with no @ stay as they are');
});

test('the sanitizer drops workspace links and points a use case MVP at the App Inspire hosts', () => {
  const hosted = S.showcaseMvpPath('taxi', 'N01-U01');
  const clean = R.makeSanitizer({ sessionId: SID, mvpUrls: { 'N01-U01': MVP_URL }, hostedPaths: { 'N01-U01': hosted } });
  assert.deepEqual(clean.value({
    use_case_id: 'N01-U01',
    app_url: `${MVP_URL}/`,
    dashboard_url: `${HOST}/dashboardsv3/${ASSET}77/published`,
    genie_space_url: `${HOST}/genie/rooms/${ASSET}78`,
    alert_url: `${HOST}/sql/alerts-v2/9`,
    job_url: `${HOST}/#job/77`,
    message: `See ${HOST}/#job/77 for details`,
  }), {
    use_case_id: 'N01-U01',
    app_url: hosted,
    dashboard_url: hosted,
    genie_space_url: hosted,
    alert_url: '',
    job_url: '',
    message: `See ${R.DEMO_HOST}/#job/77 for details`,
  });
  assert.deepEqual(clean.value({ use_case_id: 'N01-U01', app_url: MVP_URL, dashboard_url: '' }), { use_case_id: 'N01-U01', app_url: hosted, dashboard_url: '' });
  assert.deepEqual(clean.value({ use_case_id: 'N09-U09', app_url: 'https://other-1.aws.databricksapps.com' }), { use_case_id: 'N09-U09', app_url: '' });
  assert.equal(clean.text(`${MVP_URL}/#/records`), `${hosted}#/records`);
});

test('a recorded answer is keyed the way the demo frontend asks for it', () => {
  const rec = recorder();
  const key = rec.addInspire({
    method: 'GET',
    url: `https://inspire.example/api/inspire/implement/status?session_id=${SID}&use_case_id=N01-U01&inspire_database=acme_catalog._inspire&warehouse_id=0ece`,
    status: 200,
    body: { latest: { use_case_id: 'N01-U01', app_url: MVP_URL, notebook_path: `/Workspace/Users/${JANE}/session_${SID}/nb` } },
  });
  assert.equal(key, S.showcaseKey('GET', '/api/inspire/implement/status', { session_id: '1001', use_case_id: 'N01-U01', inspire_database: 'showcase', warehouse_id: 'showcase' }));
  const post = rec.addInspire({
    method: 'POST', url: '/api/inspire/implement/readiness', status: 200,
    postData: JSON.stringify({ session_id: SID, use_case_id: 'N01-U01', inspire_database: 'acme_catalog._inspire', warehouse_id: '0ece' }),
    body: { ok: true },
  });
  assert.equal(post, S.showcaseKey('POST', '/api/inspire/implement/readiness', {}, { session_id: '1001', use_case_id: 'N01-U01' }));
  rec.addMvp('N01-U01', { method: 'GET', url: `${MVP_URL}/api/app`, status: 200, body: { title: 'Fare desk' } });
  const bundle = rec.bundle();
  assert.equal(bundle.session_id, '1001');
  assert.deepEqual(bundle.inspire[key].body.latest, {
    use_case_id: 'N01-U01', app_url: '/showcase/taxi/mvp/N01-U01/', notebook_path: '/Workspace/Users/person1@example.com/session_1001/nb',
  });
});

test('the recording keeps only the demo session, skips server errors and pages, and keeps the last answer per request', () => {
  const rec = recorder();
  rec.addInspire({
    method: 'GET', url: '/api/inspire/sessions?inspire_database=x.y&warehouse_id=w', status: 200,
    body: { sessions: [{ session_id: SID, business_name: 'NYC Taxi Operations' }, { session_id: joined('7000', '1111', '2222', '3333', '444'), business_name: 'Other Corp' }] },
  });
  assert.equal(rec.addInspire({ method: 'GET', url: '/api/inspire/feedback', status: 502, body: { error: 'down' } }), '');
  assert.equal(rec.addInspire({ method: 'GET', url: '/index.html', status: 200, body: '<html>' }), '');
  rec.addInspire({ method: 'GET', url: '/api/inspire/implement/live?use_case_id=N01-U01', status: 200, body: { state: 'RUNNING' } });
  rec.addInspire({ method: 'GET', url: '/api/inspire/implement/live?use_case_id=N01-U01', status: 200, body: { state: 'SUCCESS' } });
  rec.addMvp('N01-U01', { method: 'GET', url: `${MVP_URL}/api/app`, status: 200, body: { title: 'Fare desk', owner: 'Jane Analyst' } });
  assert.throws(() => rec.addMvp('N09-U09', { method: 'GET', url: '/api/app', status: 200, body: {} }), /N09-U09 is not in this recording/);
  const bundle = rec.bundle();
  assert.deepEqual(bundle.inspire['GET /api/inspire/sessions'].body.sessions, [{ session_id: '1001', business_name: 'NYC Taxi Operations' }]);
  assert.equal(JSON.stringify(bundle).includes('Other Corp'), false);
  assert.equal(Object.keys(bundle.inspire).some((k) => k.includes('feedback') || k.includes('index')), false);
  assert.deepEqual(bundle.inspire['GET /api/inspire/implement/live?use_case_id=N01-U01'].body, { state: 'SUCCESS' });
  assert.deepEqual(bundle.mvps['N01-U01'], { title: 'Fare desk', api: { 'GET /api/app': { status: 200, body: { title: 'Fare desk', owner: 'Demo User' } } } });
  assert.deepEqual(R.showcaseLeaks(bundle, ['Jane Analyst', 'acme_catalog']), []);
});

test('a bundle without the MVP App home answer is refused, and a recording needs the session id', () => {
  assert.throws(() => recorder().bundle(), /MVP N01-U01 has no answer for GET \/api\/app/);
  assert.throws(() => recorder({ sessionId: '' }), /needs the session id/);
});

test('the leak check finds every kind of leak and passes a clean bundle', () => {
  const leaks = R.showcaseLeaks({
    a: `${HOST}/x`,
    b: JANE,
    c: `run ${SID}`,
    d: SP_ID,
    e: `${SP_NAME} inspire`,
    f: 'acme_catalog.s.t',
    [`k_${SID}`]: 1,
    start_time: 1761764657000,
    created_at: '2026-10-29T19:04:17.000Z',
  }, ['acme_catalog']);
  const kinds = leaks.map((l) => l.replace(/ in \.\.\..*/, ''));
  assert.deepEqual(kinds, [
    'bundle.a: a workspace host',
    'bundle.b: an email outside example.com',
    'bundle.c: a number of 12 or more digits',
    'bundle.d: an id that is not a demo id',
    'bundle.e: an App service principal name',
    'bundle.f: the text "acme_catalog"',
    'bundle key: a number of 12 or more digits',
  ]);
  assert.deepEqual(R.showcaseLeaks({ a: R.DEMO_HOST, b: 'person1@example.com', d: '00000000-0000-4000-8000-aaaa00000001', e: 'app-demo00 x', g: 'app-access' }), []);
});

test('a recorded bundle replays through the demo routes', async () => {
  const rec = recorder();
  rec.addInspire({ method: 'GET', url: `/api/inspire/results?session_id=${SID}&inspire_database=acme_catalog._inspire`, status: 200, body: { results: { title: 'Taxi' } } });
  rec.addMvp('N01-U01', { method: 'GET', url: `${MVP_URL}/api/app`, status: 200, body: { title: 'Fare desk' } });
  rec.addMvp('N01-U01', { method: 'POST', url: `${MVP_URL}/api/page`, postData: JSON.stringify({ page: 'home', filters: {} }), status: 200, body: { kpis: [3] } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-rec-'));
  fs.writeFileSync(path.join(dir, 'taxi.json'), JSON.stringify(rec.bundle()));
  const app = express();
  app.use(express.json());
  S.registerShowcaseRoutes(app, { dir, shellFiles: { 'static/index.html': '<html>' }, log: { error: () => {} } });
  const srv = await listen(app);
  try {
    const list = await (await fetch(`${srv.url}/api/showcase`)).json();
    assert.equal(list.showcases[0].session_id, '1001');
    const results = await fetch(`${srv.url}/api/inspire/results?session_id=1001&inspire_database=showcase&warehouse_id=showcase`, { headers: { 'X-Inspire-Showcase': 'taxi' } });
    assert.equal(results.status, 200);
    assert.deepEqual(await results.json(), { results: { title: 'Taxi' } });
    const page = await fetch(`${srv.url}/showcase/taxi/mvp/N01-U01/api/page`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters: {}, page: 'home' }),
    });
    assert.deepEqual(await page.json(), { kpis: [3] });
  } finally {
    await srv.close();
  }
});
