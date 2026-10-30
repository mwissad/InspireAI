const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '../../frontend/src');
const CSS = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');

function blocks(selector) {
  const out = {};
  const re = new RegExp(`(^|\\n)${selector.replace('.', '\\.')} \\{([^}]*)\\}`, 'g');
  for (const m of CSS.matchAll(re)) {
    for (const d of m[2].matchAll(/--([\w-]+):\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

function themeVars() {
  const root = blocks(':root');
  return { light: root, dark: { ...root, ...blocks('.dark') }, theme: blocks('@theme') };
}

function rgba(value) {
  const v = String(value).trim();
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const fn = v.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const p = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  throw new Error(`not a color: ${v}`);
}

const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);

function luminance([r, g, b]) {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

function surfaces(t) {
  const base = rgba(t['t-bg']);
  return {
    surface: rgba(t['t-surface']), bg: base, 'bg-subtle': rgba(t['t-bg-subtle']), panel: rgba(t['t-panel']),
    glass: over(rgba(t['t-glass-bg']), base),
  };
}

const TEXT = ['t-text-primary', 't-text-secondary', 't-text-tertiary'];
const STATUS = { 't-success-fg': 't-success-bg', 't-warning-fg': 't-warning-bg', 't-error-fg': 't-error-bg', 't-info-fg': 't-info-bg' };

test('every text color reads at 4.5:1 or better on every surface and on its own status tint, in light and dark', () => {
  const { light, dark, theme } = themeVars();
  const failures = [];
  for (const [mode, t] of Object.entries({ light, dark })) {
    const surf = surfaces(t);
    const tints = { ...Object.fromEntries(Object.entries(STATUS).map(([fg, bg]) => [fg, rgba(t[bg])])), 't-db-red-fg': rgba(theme['color-db-red-50']) };
    for (const name of [...TEXT, ...Object.keys(tints)]) {
      assert.ok(t[name], `${mode} theme defines --${name}`);
      const fg = rgba(t[name]);
      for (const [sname, s] of Object.entries(surf)) {
        const plain = contrast(fg, s);
        if (plain < 4.5) failures.push(`${mode} --${name} on ${sname}: ${plain.toFixed(2)}`);
        if (tints[name]) {
          const tinted = contrast(fg, over(tints[name], s));
          if (tinted < 4.5) failures.push(`${mode} --${name} on its tint over ${sname}: ${tinted.toFixed(2)}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('primary, secondary and tertiary text stay in that order of strength in both themes', () => {
  const { light, dark } = themeVars();
  for (const [mode, t] of Object.entries({ light, dark })) {
    const s = rgba(t['t-surface']);
    const [p, sec, ter] = TEXT.map((n) => contrast(rgba(t[n]), s));
    assert.ok(p > sec && sec > ter, `${mode}: ${p.toFixed(2)} > ${sec.toFixed(2)} > ${ter.toFixed(2)}`);
  }
});

test('the status text colors switch with the theme through their own tokens', () => {
  const { theme } = themeVars();
  for (const name of ['success-fg', 'warning-fg', 'error-fg', 'info-fg', 'db-red-fg']) assert.equal(theme[`color-${name}`], `var(--t-${name})`);
});

function sourceLines(match) {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(e.name)) {
        fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          if (match(line)) hits.push(`${path.relative(SRC, p)}:${i + 1}`);
        });
      }
    }
  };
  walk(SRC);
  return hits;
}

function liveModules(entry = path.join(SRC, 'main.jsx')) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const base = path.resolve(path.dirname(file), m[1] || m[2]);
      const found = [base, `${base}.jsx`, `${base}.js`, path.join(base, 'index.jsx'), path.join(base, 'index.js')]
        .find((p) => /\.(js|jsx)$/.test(p) && fs.existsSync(p) && fs.statSync(p).isFile());
      if (found) visit(found);
    }
  };
  visit(entry);
  return seen;
}

const PALETTE = 'amber|rose|emerald|green|red|yellow|orange|blue|sky|indigo|violet|purple|pink|fuchsia|slate|gray|zinc|neutral|stone|teal|cyan|lime';
const FIXED_COLOR = new RegExp(`\\b(text|bg|border|ring|from|via|to|fill|stroke|outline|divide|placeholder|decoration|accent|caret)-(${PALETTE})-\\d{2,3}\\b|\\b(text|bg|border|ring|from|via|to)-\\[(#|rgb)`);

const WHITE = [255, 255, 255, 1];
const BRIGHT_FILL = /\b(bg|from|via|to)-(db-red|db-red-hover|error|success|warning|info)(?![-\w/])|#FF3621|#E02E1B|\b(bg|from|via|to)-db-red-(dark|light)\b/i;

test('white button text reads at 4.5:1 or better on the solid fills and on their hover', () => {
  const { theme } = themeVars();
  const solid = contrast(WHITE, rgba(theme['color-db-red-solid']));
  const hover = contrast(WHITE, rgba(theme['color-db-red-solid-hover']));
  const danger = contrast(WHITE, rgba(theme['color-error-solid']));
  assert.ok(solid >= 4.5, `white on --color-db-red-solid: ${solid.toFixed(2)}`);
  assert.ok(hover >= solid, `hover ${hover.toFixed(2)} is at least as strong as rest ${solid.toFixed(2)}`);
  assert.ok(danger >= 4.5, `white on --color-error-solid: ${danger.toFixed(2)}`);
  for (const bright of ['color-db-red', 'color-error']) assert.ok(contrast(WHITE, rgba(theme[bright])) < 4.5, `--${bright} stays for fills, borders and tints only`);
});

test('white text never sits on a bright fill; filled buttons use a solid token', () => {
  assert.ok(BRIGHT_FILL.test('px-3 text-white bg-db-red disabled:opacity-50'));
  assert.ok(BRIGHT_FILL.test('from-[#FF3621] to-[#E02E1B] text-white'));
  assert.ok(BRIGHT_FILL.test('bg-gradient-to-r from-db-red to-db-red-hover text-white'));
  assert.ok(BRIGHT_FILL.test('font-semibold text-white bg-error disabled:opacity-50'));
  assert.ok(!BRIGHT_FILL.test('text-white bg-db-red-solid hover:bg-db-red-solid-hover shadow-db-red/20'));
  assert.ok(!BRIGHT_FILL.test('text-white bg-error-solid'));
  assert.ok(!BRIGHT_FILL.test('bg-db-red/15 text-white border-db-red/40 bg-error-bg'));
  assert.deepEqual(sourceLines((line) => /\btext-white\b/.test(line) && BRIGHT_FILL.test(line)), []);
  const solidWithoutWhite = sourceLines((line) => /\bbg-(db-red|error)-solid\b/.test(line) && !/\btext-white\b/.test(line));
  assert.deepEqual(solidWithoutWhite, []);
});

test('brand-red text and icons use the theme-aware shade, never the bright fill, its hover or an undefined shade', () => {
  const RED_TEXT = /\btext-db-red(\/\d+)?(?![-\w/])|\btext-db-red-(hover|light|dark)\b/;
  assert.ok(RED_TEXT.test('hover:text-db-red transition'));
  assert.ok(RED_TEXT.test('text-db-red/80 uppercase'));
  assert.ok(RED_TEXT.test('className="hover:text-db-red-hover"'));
  assert.ok(RED_TEXT.test("'bg-db-red/15 text-db-red-light'"));
  assert.ok(!RED_TEXT.test('text-db-red-fg bg-db-red-50 border-db-red/20'));
  assert.deepEqual(sourceLines((line) => RED_TEXT.test(line)), []);
});

test('text never takes a border shade, which reads about 1.3:1', () => {
  const BORDER_TEXT = /\btext-border(-subtle|-strong)?(?![-\w])/;
  assert.ok(BORDER_TEXT.test('<span className="text-border">·</span>'));
  assert.ok(BORDER_TEXT.test('hover:text-border-strong'));
  assert.ok(BORDER_TEXT.test("'text-border/60 text-xs'"));
  assert.ok(!BORDER_TEXT.test('border border-border text-text-tertiary border-border-strong'));
  assert.deepEqual(sourceLines((line) => BORDER_TEXT.test(line)), []);
});

test('the rendered app follows the theme: no fixed palette or hex colors on any reachable module', () => {
  assert.ok(FIXED_COLOR.test('border-amber-300 bg-amber-50'));
  assert.ok(FIXED_COLOR.test("text: 'text-[#27AE60]'"));
  assert.ok(FIXED_COLOR.test('text-amber-600 dark:text-amber-400'));
  assert.ok(!FIXED_COLOR.test('border-warning/30 bg-warning-bg text-warning-fg text-[10px] bg-db-red-50'));
  const live = liveModules();
  assert.ok(live.has(path.join(SRC, 'pages/ResultsPage.jsx')) && live.has(path.join(SRC, 'components/UseCaseStrategyDetail.jsx')));
  assert.ok(!live.has(path.join(SRC, 'components/ConfigForm.jsx')), 'ConfigForm is imported by nothing');
  const hits = [];
  for (const file of live) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (FIXED_COLOR.test(line)) hits.push(`${path.relative(SRC, file)}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('status text uses the theme-aware shades everywhere, never the bright fill colors', () => {
  const bare = sourceLines((line) => /\btext-(success|warning|error|info)\b(?!-)/.test(line));
  assert.deepEqual(bare, []);
  assert.doesNotMatch(fs.readFileSync(path.join(SRC, 'components/ImplementStatusBadge.jsx'), 'utf8'), /\btext-db-red\b(?!-)/);
});

test('text never fades through opacity or a color alpha; only inactive or decorative elements may', () => {
  const FADE = /(?<![\w:/-])opacity-[1-9]\d?(?![\w-])|(?<![\w:/-])text-(?!\[)[a-z][\w-]*\/\d+/;
  assert.ok(FADE.test('<span className="tabular-nums opacity-80">{stage.elapsed}</span>'));
  assert.ok(FADE.test('<span className="text-[10px] text-success-fg/70 font-mono">'));
  assert.ok(FADE.test('<ol className="text-xs opacity-90 list-decimal">'));
  assert.ok(!FADE.test('opacity-0 group-hover:opacity-100 disabled:opacity-50 hover:text-db-red-fg bg-db-red/10 border-error/20 text-[11px]'));
  const ALLOWED = [
    ['pages/ImplementWizard.jsx', "removed ? 'opacity-60'"],
    ['components/Header.jsx', ": 'opacity-50'"],
    ['pages/LandingPage.jsx', 'animate-ping'],
    ['pages/ResultsPage.jsx', 'text-db-red-fg opacity-80 group-hover:opacity-100'],
  ];
  const used = new Set();
  const hits = [];
  for (const file of liveModules()) {
    const rel = path.relative(SRC, file);
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (!FADE.test(line)) return;
      const allowed = ALLOWED.find(([f, snippet]) => f === rel && line.includes(snippet));
      if (allowed) used.add(allowed);
      else hits.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
  assert.deepEqual(ALLOWED.filter((a) => !used.has(a)), [], 'every allowed fade still exists');
});
