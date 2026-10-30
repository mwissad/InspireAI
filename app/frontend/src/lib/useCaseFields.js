import { normalizeDatabricksFsPath } from './workspaceLinks.js';

export const PRIORITY_ORDER = [
  'Ultra High',
  'Very High',
  'High',
  'Medium',
  'Low',
  'Very Low',
  'Ultra Low',
];

export function isNumericPriorityString(str) {
  if (str == null) return false;
  const x = String(str).trim();
  return x !== '' && /^\d+(\.\d+)?$/.test(x);
}

function parseLooseScore(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  const m = s.match(/(\d+\.?\d*)/);
  if (!m) return null;
  const x = Number(m[1]);
  return Number.isFinite(x) ? x : null;
}

export function inspireScoreFromUc(uc) {
  if (!uc || typeof uc !== 'object') return null;
  const num = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  let s = num(uc.priority_score ?? uc.Priority_Score ?? uc.priorityScore);
  const vs = num(uc.value_score ?? uc.Value_Score);
  const fs = num(uc.feasibility_score ?? uc.Feasibility_Score);
  if (s == null && vs != null && fs != null) s = (vs + fs) / 2;
  else if (s == null && vs != null) s = vs;
  else if (s == null && fs != null) s = fs;
  const pr = String(uc.Priority ?? uc.priority ?? '').trim();
  if (s == null && isNumericPriorityString(pr)) s = num(pr);
  if (s == null) {
    const pv = parseLooseScore(uc._value);
    const pf = parseLooseScore(uc._feasibility);
    if (pv != null && pf != null) s = (pv + pf) / 2;
    else if (pv != null) s = pv;
    else if (pf != null) s = pf;
  }
  if (s == null) {
    const sa = num(uc.strategic_alignment);
    if (sa != null) s = sa;
  }
  return s;
}

export function scoreOf(uc, ...fields) {
  for (const field of fields) {
    const raw = uc?.[field];
    if (raw == null || raw === '') continue;
    const x = Number(raw);
    if (Number.isFinite(x)) return x;
  }
  return null;
}

const HIGH_TIER_IDX = PRIORITY_ORDER.indexOf('High');

export function expandWorkspaceListCandidates(p) {
  const n = normalizeDatabricksFsPath(p);
  const out = [];
  const push = (x) => {
    const y = normalizeDatabricksFsPath(x);
    if (y && !out.includes(y)) out.push(y);
  };
  push(n);
  if (!n.startsWith('/')) return out;
  if (n.startsWith('/Volumes/')) return out;
  if (!n.startsWith('/Workspace')) push(`/Workspace${n}`);
  if (n.startsWith('/Workspace/')) {
    const stripped = n.slice('/Workspace'.length) || '/';
    push(stripped);
  }
  return out;
}

export function hasShippedGenieCode(uc) {
  if (!uc || typeof uc !== 'object') return false;
  if (uc.has_genie_code_flag === true) return true;
  const h = String(uc.has_genie_code ?? uc['Has Genie Code'] ?? '').trim().toUpperCase();
  if (h === 'Y' || h === 'YES') return true;
  const gi = String(uc.genie_instruction ?? '').trim();
  return gi.length > 120;
}

export function hasGenieInstruction(uc) {
  if (!uc || typeof uc !== 'object') return false;
  if (hasShippedGenieCode(uc)) return true;
  return String(uc.genie_instruction ?? uc.Genie_Instruction ?? '').trim().length > 0;
}

export function collectUseCaseNotebookFilenamePrefixes(uc) {
  if (!uc || typeof uc !== 'object') return [];
  const raw = [uc.id, uc.No, uc['No'], uc.catalog_no, uc.use_case_id, uc.use_caseId];
  const seen = new Set();
  const out = [];
  for (const v of raw) {
    const s = String(v ?? '').trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function notebookBaseMatches(base, id) {
  const prefix = String(id).toLowerCase();
  return base === prefix || base.startsWith(`${prefix}-`) || base.startsWith(`${prefix}_`) || base.startsWith(`${prefix}.`);
}

export function findUcForNotebookFilename(fname, useCases) {
  if (!fname || !String(fname).toLowerCase().endsWith('.ipynb') || !useCases?.length) return null;
  const nameNorm = String(fname).trim().toLowerCase();
  const base = nameNorm.replace(/\.ipynb$/i, '');
  for (const uc of useCases) {
    const nb = String(uc.notebook_path || '').trim();
    if (nb) {
      const tail = (nb.split('/').pop() || '').trim().toLowerCase();
      if (tail && tail === nameNorm) return uc;
    }
    if (collectUseCaseNotebookFilenamePrefixes(uc).some((id) => notebookBaseMatches(base, id))) return uc;
  }
  return null;
}

export function notebookPathOf(uc, files) {
  const stored = String(uc?.notebook_path ?? '').trim();
  if (stored) return stored;
  if (!files?.length) return '';
  const prefixes = collectUseCaseNotebookFilenamePrefixes(uc);
  if (!prefixes.length) return '';
  return files.find((p) => {
    const name = (String(p).split('/').pop() || '').trim().toLowerCase();
    if (!name.endsWith('.ipynb')) return false;
    const base = name.replace(/\.ipynb$/i, '');
    return prefixes.some((prefix) => notebookBaseMatches(base, prefix));
  }) || '';
}

export function trackingIdOf(uc) {
  if (!uc || typeof uc !== 'object') return '';
  return String(uc.id ?? uc.No ?? uc['No'] ?? '').trim();
}

function isHighTierLabel(uc) {
  if (!uc || typeof uc !== 'object') return false;
  for (const fld of [uc.Priority, uc.priority, uc.Quality, uc.quality]) {
    const i = PRIORITY_ORDER.indexOf(String(fld || '').trim());
    if (i !== -1 && HIGH_TIER_IDX !== -1 && i <= HIGH_TIER_IDX) return true;
  }
  const lab = `${uc.Priority || ''} ${uc.Quality || ''}`.toLowerCase();
  if (/\b(ultra high|very high)\b/.test(lab)) return true;
  if (/\bhigh\b/.test(lab) && !/\b(low|medium)\b/.test(lab)) return true;
  return false;
}

export function belowBarLabelFromUseCase(uc) {
  if (!uc || typeof uc !== 'object') return '';
  let flags = uc.selection_flags ?? uc.selectionFlags;
  if (typeof flags === 'string') {
    try { flags = JSON.parse(flags); } catch { flags = null; }
  }
  if (flags && typeof flags === 'object') {
    for (const key of ['elite_fallback_pick', 'elite_fallback_near_miss', 'elite_coverage_pick', 'label', 'reason']) {
      const v = flags[key];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    for (const v of Object.values(flags)) {
      if (typeof v === 'string' && /below the /i.test(v)) return v.trim();
    }
  }
  const reason = uc.selection_drop_reason || uc.selectionDropReason;
  if (reason && /below the /i.test(String(reason))) return String(reason).trim();
  return '';
}

export function computeHighPriorityCount(list) {
  if (!Array.isArray(list) || list.length === 0) return 0;
  const tier = list.filter(isHighTierLabel).length;
  const abs = list.filter((u) => {
    const s = inspireScoreFromUc(u);
    return s != null && s >= 3;
  }).length;
  const scores = list.map(inspireScoreFromUc).filter((s) => s != null && Number.isFinite(s));
  if (scores.length === 0) return Math.max(tier, abs);
  const sorted = [...scores].sort((a, b) => a - b);
  const cutIdx = Math.max(0, Math.floor((sorted.length - 1) * (2 / 3)));
  const cutoff = sorted[cutIdx];
  const topThird = list.filter((u) => {
    const s = inspireScoreFromUc(u);
    return s != null && s >= cutoff;
  }).length;
  return Math.max(tier, abs, topThird);
}

export function displayCleanText(s) {
  if (s == null) return '';
  let t = String(s).replace(/<[^>]*>/g, ' ');
  try {
    t = t.replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}/gu, '');
  } catch {
    t = t.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
  }
  return t.replace(/\uFE0F/g, '').replace(/\u200D/g, '').replace(/\u20E3/g, '').replace(/\s{2,}/g, ' ').trim();
}

export function isBlankField(value) {
  return value == null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
}

export function fieldOf(uc, displayKey, trackingKey) {
  if (!uc || typeof uc !== 'object') return undefined;
  return isBlankField(uc[displayKey]) ? uc[trackingKey] : uc[displayKey];
}

export function beneficiaryFromUc(uc) {
  return String(fieldOf(uc, 'Beneficiary', 'beneficiary') ?? '').trim();
}

export function sponsorFromUc(uc) {
  return String(fieldOf(uc, 'Sponsor', 'sponsor') ?? '').trim();
}

export const FAVORITES_STORAGE_KEY = 'inspire_favorites_fp';

function normalizeFavoritePart(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function hashFavoriteFingerprint(segments) {
  const str = segments.join('\u0000');
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function favoriteKeyOf(uc) {
  if (!uc || typeof uc !== 'object') return '';
  const domain = normalizeFavoritePart(uc._domain || uc['Business Domain'] || '');
  const sub = normalizeFavoritePart(uc.Subdomain || '');
  const name = normalizeFavoritePart(uc.Name || uc.use_case || uc.short_name || uc.name || '');
  const stmt = normalizeFavoritePart((uc.Statement || uc.description || '').slice(0, 220));
  const sql = normalizeFavoritePart((uc.SQL || uc.sql || uc.sql_query || '').slice(0, 120));
  const sig = name || stmt || sql;
  if (!sig) return '';
  const h = hashFavoriteFingerprint([domain, sub, name, stmt, sql]);
  return `fp:${h}`;
}

export function favoriteCount(map) {
  return Object.keys(map || {}).filter((k) => map[k]).length;
}

export function loadFavoritesMap(storage = globalThis.localStorage) {
  try {
    const rawFp = storage.getItem(FAVORITES_STORAGE_KEY);
    if (rawFp) {
      const o = JSON.parse(rawFp);
      return o && typeof o === 'object' ? o : {};
    }
    const rawLegacy = JSON.parse(storage.getItem('inspire_favorites') || '{}');
    const migrated = {};
    if (rawLegacy && typeof rawLegacy === 'object') {
      for (const [k, v] of Object.entries(rawLegacy)) {
        if (v && String(k).startsWith('fp:')) migrated[k] = true;
      }
    }
    return migrated;
  } catch {
    return {};
  }
}

export function priorityPillClass(priority) {
  const p = String(priority || '').toLowerCase();
  if (p.includes('ultra high') || p.includes('very high')) return 'text-db-red-fg bg-db-red-50 border-db-red/20';
  if (p.includes('high')) return 'text-error-fg bg-error-bg border-error/20';
  if (p.includes('medium')) return 'text-warning-fg bg-warning-bg border-warning/20';
  return 'text-text-secondary bg-bg border-border';
}

export function subtitleOfUseCase(uc, titlePlain) {
  const u = uc && typeof uc === 'object' ? uc : {};
  const plain = (v) => displayCleanText(String(v ?? '').replace(/<[^>]*>/g, ' '));
  const title = plain(titlePlain).toLowerCase();
  return [u.description, u.Description, u.usecase, u.use_case, u.short_name, u.shortName]
    .map(plain)
    .find((t) => t && t.toLowerCase() !== title) || '';
}

export function nameOfUseCase(uc) {
  const u = uc && typeof uc === 'object' ? uc : {};
  return displayCleanText([u.Name, u.use_case_name, u.name, u.title].map((v) => (v == null ? '' : String(v))).find(Boolean) || '');
}

export function cardTitlesOfUseCase(uc, index = 0) {
  const title = nameOfUseCase(uc) || `Use Case ${index + 1}`;
  return { title, subtitle: subtitleOfUseCase(uc, title) };
}
