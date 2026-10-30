const fs = require('fs');
const path = require('path');
const { appShellPayload, bundledNotebookText } = require('./appShell');

const SHOWCASE_VERSION = 1;
const SHOWCASE_HEADER = 'x-inspire-showcase';
const SHOWCASE_DIR = path.resolve(__dirname, '..', 'showcase');
const SHOWCASE_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SHOWCASE_IGNORED = new Set(['inspire_database', 'warehouse_id']);
const SHOWCASE_READ_ONLY = 'This is the demo, so nothing in it changes. Choose Get Started to find use cases and build MVPs on your own data.';
const SHOWCASE_MISSING = 'The demo has no saved answer for this view. Choose Get Started to see it on your own data.';
const SHOWCASE_UNKNOWN = 'This demo is not in this Inspire App.';
const SHOWCASE_GENIE = 'In the demo, Genie answers the questions it suggests. Ask your own questions in an MVP built on your data.';
const SHOWCASE_GENIE_ASK = 'POST /api/genie/ask';
const SHOWCASE_READS = new Set([
  'POST /api/page', 'POST /api/records', 'POST /api/overview', 'POST /api/genie/explain', 'POST /api/alerts/preview',
  'POST /api/inspire/implement/readiness', 'POST /api/inspire/implement/plan', 'POST /api/inspire/implement/swaps',
]);
const SHELL_FILES = {
  '': 'static/index.html',
  'assets/app.js': 'static/assets/app.js',
  'assets/index.css': 'static/assets/index.css',
};
const SHELL_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function showcaseKey(method, pathname, query, body) {
  const params = Object.entries(query || {})
    .filter(([k, v]) => !SHOWCASE_IGNORED.has(k) && v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)])
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1));
  const search = new URLSearchParams(params).toString();
  const sent = isObject(body)
    ? Object.fromEntries(Object.entries(body).filter(([k]) => !SHOWCASE_IGNORED.has(k)))
    : body;
  const shown = sent === undefined || sent === null || (isObject(sent) && !Object.keys(sent).length) ? '' : ` ${canonicalJson(sent)}`;
  return `${String(method || 'GET').toUpperCase()} ${pathname}${search ? `?${search}` : ''}${shown}`;
}

function answersProblem(answers, where) {
  if (!isObject(answers)) return `${where} is not an object`;
  for (const [key, answer] of Object.entries(answers)) {
    if (!/^[A-Z]+ \/api\//.test(key)) return `${where} has the key ${JSON.stringify(key.slice(0, 80))}, which is not METHOD /api/...`;
    if (!isObject(answer) || !Number.isInteger(answer.status) || !('body' in answer)) return `${where} ${key.slice(0, 80)} has no status and body`;
  }
  return '';
}

function showcaseProblem(bundle, file) {
  if (!isObject(bundle)) return `${file} is not a JSON object`;
  if (bundle.version !== SHOWCASE_VERSION) return `${file} is not version ${SHOWCASE_VERSION}`;
  if (!SHOWCASE_ID_RE.test(String(bundle.id || ''))) return `${file} has no valid id`;
  if (`${bundle.id}.json` !== path.basename(file)) return `${file} must be named ${bundle.id}.json`;
  for (const field of ['title', 'business', 'session_id']) {
    if (typeof bundle[field] !== 'string' || !bundle[field].trim()) return `${file} has no ${field}`;
  }
  const inspire = answersProblem(bundle.inspire, `${file} inspire`);
  if (inspire) return inspire;
  if (!isObject(bundle.mvps)) return `${file} has no mvps`;
  for (const [id, mvp] of Object.entries(bundle.mvps)) {
    if (!/^[A-Za-z0-9-]{1,20}$/.test(id)) return `${file} has the MVP id ${JSON.stringify(id)}`;
    if (!isObject(mvp) || typeof mvp.title !== 'string') return `${file} MVP ${id} has no title`;
    const api = answersProblem(mvp.api, `${file} MVP ${id} api`);
    if (api) return api;
    if (!mvp.api[showcaseKey('GET', '/api/app')]) return `${file} MVP ${id} has no answer for GET /api/app`;
  }
  return '';
}

function loadShowcases(dir = SHOWCASE_DIR) {
  const found = {};
  if (!fs.existsSync(dir)) return found;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const file = path.join(dir, name);
    let bundle;
    try {
      bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`the demo ${name} is not valid JSON: ${e.message}`);
    }
    const problem = showcaseProblem(bundle, file);
    if (problem) throw new Error(`the demo ${problem}`);
    found[bundle.id] = bundle;
  }
  return found;
}

function showcaseSummary(bundle) {
  return {
    id: bundle.id,
    title: bundle.title,
    business: bundle.business,
    summary: typeof bundle.summary === 'string' ? bundle.summary : '',
    session_id: bundle.session_id,
    mvps: Object.entries(bundle.mvps).map(([id, mvp]) => ({ id, title: mvp.title, url: showcaseMvpPath(bundle.id, id) })),
  };
}

function showcaseMvpPath(id, mvpId) {
  return `/showcase/${encodeURIComponent(id)}/mvp/${encodeURIComponent(mvpId)}/`;
}

function showcaseCanRead(method, pathname) {
  const route = `${String(method).toUpperCase()} ${pathname}`;
  return route.startsWith('GET ') || route === SHOWCASE_GENIE_ASK || SHOWCASE_READS.has(route);
}

function showcaseMiss(method, pathname) {
  if (`${String(method).toUpperCase()} ${pathname}` === SHOWCASE_GENIE_ASK) return { status: 404, error: SHOWCASE_GENIE };
  if (showcaseCanRead(method, pathname)) return { status: 404, error: SHOWCASE_MISSING };
  return { status: 403, error: SHOWCASE_READ_ONLY };
}

function replay(res, answers, method, pathname, query, body) {
  const answer = answers[showcaseKey(method, pathname, query, body)];
  res.set('Cache-Control', 'no-store');
  if (answer) return res.status(answer.status).json(answer.body);
  const miss = showcaseMiss(method, pathname);
  return res.status(miss.status).json({ error: miss.error, showcase: true });
}

function restPath(rest) {
  return Array.isArray(rest) ? rest.join('/') : String(rest || '');
}

function registerShowcaseRoutes(app, { dir = SHOWCASE_DIR, shellFiles, log = console } = {}) {
  let showcases = {};
  let loadError = '';
  try {
    showcases = loadShowcases(dir);
  } catch (e) {
    loadError = e.message || String(e);
    log.error(`The demo is off: ${loadError}`);
  }
  let shell = shellFiles || null;
  const shellFile = (name) => {
    if (!shell) shell = appShellPayload(bundledNotebookText()).files;
    return shell[name];
  };
  const sentBody = (req) => (req.method === 'GET' ? undefined : req.body);

  app.get('/api/showcase', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      showcases: Object.values(showcases).map(showcaseSummary),
      ...(loadError ? { error: loadError } : {}),
    });
  });

  app.use('/api', (req, res, next) => {
    const id = req.get(SHOWCASE_HEADER);
    if (!id) return next();
    const bundle = showcases[id];
    if (!bundle) return res.status(404).json({ error: SHOWCASE_UNKNOWN, showcase: true });
    return replay(res, bundle.inspire, req.method, `/api${req.path}`, req.query, sentBody(req));
  });

  const mvpOf = (req, res) => {
    const bundle = showcases[req.params.id];
    const mvp = bundle && bundle.mvps[req.params.mvp];
    if (!mvp) {
      res.status(404).type('text/plain').send(SHOWCASE_UNKNOWN);
      return null;
    }
    return mvp;
  };

  app.all('/showcase/:id/mvp/:mvp/api/*rest', (req, res) => {
    const mvp = mvpOf(req, res);
    if (!mvp) return undefined;
    return replay(res, mvp.api, req.method, `/api/${restPath(req.params.rest)}`, req.query, sentBody(req));
  });

  const sendShell = (req, res, rel) => {
    if (!mvpOf(req, res)) return;
    if (!rel && !req.originalUrl.split('?')[0].endsWith('/')) {
      res.redirect(302, showcaseMvpPath(req.params.id, req.params.mvp));
      return;
    }
    const name = SHELL_FILES[rel];
    const body = name && shellFile(name);
    if (typeof body !== 'string') {
      res.status(404).type('text/plain').send(SHOWCASE_MISSING);
      return;
    }
    res.set('Content-Type', SHELL_TYPES[path.extname(name)]).set('Cache-Control', rel ? 'public, max-age=300' : 'no-cache').send(body);
  };

  app.get('/showcase/:id/mvp/:mvp', (req, res) => sendShell(req, res, ''));
  app.get('/showcase/:id/mvp/:mvp/*rest', (req, res) => sendShell(req, res, restPath(req.params.rest)));
}

module.exports = {
  SHOWCASE_VERSION,
  SHOWCASE_HEADER,
  SHOWCASE_DIR,
  SHOWCASE_READ_ONLY,
  SHOWCASE_MISSING,
  SHOWCASE_UNKNOWN,
  SHOWCASE_GENIE,
  showcaseKey,
  showcaseCanRead,
  showcaseMiss,
  showcaseProblem,
  loadShowcases,
  showcaseSummary,
  showcaseMvpPath,
  registerShowcaseRoutes,
};
