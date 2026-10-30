const { SHOWCASE_VERSION, showcaseKey, showcaseMvpPath, showcaseProblem } = require('./showcase');

const DEMO_HOST = 'https://workspace.example.com';
const DEMO_UUID = '00000000-0000-4000-8000-';
const PRIVATE_RE = new RegExp([
  /(https?:\/\/[A-Za-z0-9.-]+\.(?:cloud\.databricks\.com|azuredatabricks\.net|gcp\.databricks\.com|databricks\.com|databricksapps\.com))/,
  /((?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24})/,
  /((?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f]))/,
  /((?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f]))/,
  /((?<!\d)\d{12,}(?!\d))/,
  /(\bapp-(?=[a-z]*\d)[a-z0-9]{6}\b)/,
].map((re) => re.source).join('|'), 'gi');
const TIME_KEY_RE = /(?:time|date|_at|_ms|_ts|timestamp|created|updated|modified|started|ended)$/i;
const TIME_VALUE_RE = /^[\d\s:.+TZ-]+$/;
const HOSTED_URLS = ['app_url', 'dashboard_url', 'genie_space_url'];

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isTime = (key, v) => TIME_KEY_RE.test(key) && TIME_VALUE_RE.test(String(v));

function makeSanitizer({ replace = {}, sessionId = '', mvpUrls = {}, hostedPaths = {} } = {}) {
  const pairs = Object.entries(replace).filter(([from]) => from).sort(([a], [b]) => b.length - a.length);
  const fakes = new Map();
  const counts = {};
  const fake = (kind, raw, make) => {
    const k = `${kind}:${raw.toLowerCase()}`;
    if (!fakes.has(k)) {
      counts[kind] = (counts[kind] || 0) + 1;
      fakes.set(k, make(counts[kind]));
    }
    return fakes.get(k);
  };
  const number = (raw) => fake('n', raw, (n) => String(1000 + n));
  if (sessionId) number(String(sessionId));
  const origins = Object.entries(mvpUrls)
    .map(([id, url]) => [new URL(url).origin, hostedPaths[id]])
    .filter(([, to]) => to);

  const text = (input) => {
    let s = String(input);
    for (const [origin, to] of origins) s = s.split(`${origin}/`).join(to).split(origin).join(to);
    for (const [from, to] of pairs) s = s.split(from).join(to);
    return s.replace(PRIVATE_RE, (m, host, email, uuid, hex, long) => {
      if (host) return DEMO_HOST;
      if (email) return email.toLowerCase().endsWith('@example.com') ? email : fake('e', email, (n) => `person${n}@example.com`);
      if (uuid) return uuid.toLowerCase().startsWith(DEMO_UUID) ? uuid : fake('u', uuid, (n) => `${DEMO_UUID}aaaa${String(n).padStart(8, '0')}`);
      if (hex) return fake('h', hex, (n) => `demo${'x'.repeat(20)}${String(n).padStart(8, '0')}`);
      if (long) return number(long);
      return 'app-demo00';
    });
  };

  const value = (v, key = '') => {
    if (typeof v === 'string') {
      if (isTime(key, v)) return v;
      const s = text(v);
      return /^https?:\/\//i.test(v.trim()) && s.trim().startsWith(DEMO_HOST) ? '' : s;
    }
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v) || Math.abs(v) < 1e11 || isTime(key, v)) return v;
      return Number(number(String(v)));
    }
    if (Array.isArray(v)) return v.map((x) => value(x, key));
    if (!isObject(v)) return v;
    const out = {};
    for (const [k, x] of Object.entries(v)) out[text(k)] = value(x, k);
    const hosted = typeof v.use_case_id === 'string' ? hostedPaths[v.use_case_id] : '';
    if (hosted) for (const k of HOSTED_URLS) if (typeof v[k] === 'string' && v[k].trim()) out[k] = hosted;
    return out;
  };

  return { text, value };
}

function onlySession(body, sessionId) {
  if (!isObject(body) || !Array.isArray(body.sessions)) return body;
  return { ...body, sessions: body.sessions.filter((s) => isObject(s) && String(s.session_id) === String(sessionId)) };
}

function parsedBody(postData) {
  if (postData === undefined || postData === null || postData === '') return undefined;
  if (typeof postData !== 'string') return postData;
  try {
    return JSON.parse(postData);
  } catch {
    return postData;
  }
}

function mvpUrlsFrom(exchanges, ids) {
  const wanted = new Set(ids);
  const found = {};
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (isObject(v)) {
      const url = typeof v.app_url === 'string' ? v.app_url.trim() : '';
      if (wanted.has(v.use_case_id) && /^https:\/\//.test(url) && !found[v.use_case_id]) found[v.use_case_id] = url;
      Object.values(v).forEach(walk);
    }
  };
  for (const exchange of exchanges) if (exchange.status < 300) walk(exchange.body);
  return found;
}

function makeRecorder({ id, title, business, summary = '', sessionId, replace = {}, mvps = [] }) {
  if (!sessionId) throw new Error('a demo recording needs the session id');
  const hostedPaths = Object.fromEntries(mvps.map((m) => [m.id, showcaseMvpPath(id, m.id)]));
  const mvpUrls = Object.fromEntries(mvps.filter((m) => m.url).map((m) => [m.id, m.url]));
  const clean = makeSanitizer({ replace, sessionId, mvpUrls, hostedPaths });
  const inspire = {};
  const apps = Object.fromEntries(mvps.map((m) => [m.id, {}]));

  const keyOf = ({ method, url, postData }) => {
    const u = new URL(url, 'http://showcase.invalid');
    const query = {};
    for (const [k, v] of u.searchParams) query[k] = clean.text(v);
    return showcaseKey(method, clean.text(u.pathname), query, clean.value(parsedBody(postData)));
  };

  const add = (answers, exchange) => {
    if (!new URL(exchange.url, 'http://showcase.invalid').pathname.startsWith('/api/')) return '';
    if (!Number.isInteger(exchange.status) || exchange.status >= 500) return '';
    const key = keyOf(exchange);
    const body = exchange.body === undefined ? null : exchange.body;
    answers[key] = { status: exchange.status, body: clean.value(exchange.status < 300 ? onlySession(body, sessionId) : body) };
    return key;
  };

  return {
    keyOf,
    addInspire: (exchange) => add(inspire, exchange),
    addMvp: (mvpId, exchange) => {
      if (!apps[mvpId]) throw new Error(`the MVP ${mvpId} is not in this recording`);
      return add(apps[mvpId], exchange);
    },
    bundle: () => {
      const out = {
        version: SHOWCASE_VERSION,
        id,
        title: clean.text(title),
        business: clean.text(business),
        summary: clean.text(summary),
        session_id: clean.text(String(sessionId)),
        inspire,
        mvps: Object.fromEntries(mvps.map((m) => [m.id, { title: clean.text(m.title || m.id), api: apps[m.id] }])),
      };
      const problem = showcaseProblem(out, `${id}.json`);
      if (problem) throw new Error(problem);
      return out;
    },
  };
}

const LEAK_PATTERNS = [
  ['a workspace host', /\.(?:cloud\.databricks\.com|azuredatabricks\.net|gcp\.databricks\.com|databricksapps\.com)/i],
  ['an email outside example.com', /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@(?!example\.com\b)[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}/],
  ['a number of 12 or more digits', /(?<!\d)\d{12,}(?!\d)/],
  ['an id that is not a demo id', new RegExp(`(?<![0-9a-f])(?!${DEMO_UUID})[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])`, 'i')],
  ['an App service principal name', /\bapp-(?!demo00\b)(?=[a-z]*\d)[a-z0-9]{6}\b/],
];

const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function showcaseLeaks(bundle, banned = []) {
  const patterns = [...LEAK_PATTERNS, ...banned.filter(Boolean).map((s) => [`the text ${JSON.stringify(s)}`, new RegExp(escaped(s), 'i')])];
  const found = [];
  const check = (where, s) => {
    for (const [what, re] of patterns) {
      const m = s.match(re);
      if (m) found.push(`${where}: ${what} in ...${s.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)}...`);
    }
  };
  const walk = (v, key, where) => {
    if (typeof v === 'string' || typeof v === 'number') {
      if (!isTime(key, v)) check(where, String(v));
      return;
    }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, key, `${where}[${i}]`));
    else if (isObject(v)) {
      for (const [k, x] of Object.entries(v)) {
        check(`${where} key`, k);
        walk(x, k, `${where}.${k.slice(0, 60)}`);
      }
    }
  };
  walk(bundle, '', 'bundle');
  return found;
}

module.exports = { DEMO_HOST, makeSanitizer, makeRecorder, mvpUrlsFrom, showcaseLeaks };
