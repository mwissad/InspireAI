import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Loader2,
  AlertCircle,
  Search,
  ChevronRight,
  FileText,
  BarChart3,
  Target,
  Filter,
  Download,
  Database,
  Server,
  RefreshCw,
  Heart,
  Calendar,
  Building2,
  Layers,
  CheckCircle2,
  Copy,
  Check,
  FolderOpen,
  Eye,
  EyeOff,
  ExternalLink,
  Users,
  Crown,
  Wrench,
  LayoutGrid,
  Sparkles,
  XCircle,
} from 'lucide-react';
import AnimatedCounter from '../components/AnimatedCounter';
import GenieMarkdownPreview from '../components/GenieMarkdownPreview';
import GlassCard from '../components/GlassCard';
import DomainSunburst from '../components/DomainSunburst';
import PriorityHeatmap from '../components/PriorityHeatmap';
import Celebration from '../components/Celebration';
import DatabricksLogo from '../components/DatabricksLogo';
import { SkeletonCard, SkeletonStats } from '../components/SkeletonLoader';

/* ── Priority sort order ── */
const PRIORITY_ORDER = [
  'Ultra High',
  'Very High',
  'High',
  'Medium',
  'Low',
  'Very Low',
  'Ultra Low',
];

/** True when Priority field is a raw number (not a tier label). */
function isNumericPriorityString(str) {
  if (str == null) return false;
  const x = String(str).trim();
  return x !== '' && /^\d+(\.\d+)?$/.test(x);
}

/** Parse "4.5/5" or "4.2" style strings from scored_use_cases merge. */
function parseLooseScore(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  const m = s.match(/(\d+\.?\d*)/);
  if (!m) return null;
  const x = Number(m[1]);
  return Number.isFinite(x) ? x : null;
}

/** Inspire composite / priority_score for sorting and stats (same rules as use case cards). */
function inspireScoreFromUc(uc) {
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

const HIGH_TIER_IDX = PRIORITY_ORDER.indexOf('High');

/** Collapse `/./` and `/../` (e.g. `/Shared/../demos/x` → `/demos/x`). Leaves `/Volumes/` unchanged. */
function normalizeDatabricksFsPath(p) {
  if (p == null || typeof p !== 'string') return '';
  const t = p.trim().replace(/\/+/g, '/');
  if (!t) return '';
  if (t.startsWith('/Volumes/')) return t.replace(/\/+$/, '') || t;
  if (!t.startsWith('/')) return t;
  const segments = t.split('/').filter(Boolean);
  const stack = [];
  for (const seg of segments) {
    if (seg === '.') continue;
    if (seg === '..') {
      if (stack.length) stack.pop();
    } else stack.push(seg);
  }
  return stack.length ? `/${stack.join('/')}` : '/';
}

/**
 * REST + browser hash paths: try normalized path, then `/Workspace` + path for `/Shared`, `/Users`, `/demos`, …
 */
function expandWorkspaceListCandidates(p) {
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

/** `#workspace` deep-link segment — UI expects `/Workspace/...` on current control planes. */
function workspaceWebUiHashPath(fsPath) {
  const n = normalizeDatabricksFsPath(fsPath);
  if (!n || n.startsWith('/Volumes/')) return n;
  if (n.startsWith('/Workspace')) return n;
  return `/Workspace${n}`;
}

/** True when Auto-Genie shipped instructions for this UC (not skeleton-only). */
function useCaseHasShippedGenieCode(uc) {
  if (!uc || typeof uc !== 'object') return false;
  if (uc.has_genie_code_flag === true) return true;
  const h = String(uc.has_genie_code ?? uc['Has Genie Code'] ?? '').trim().toUpperCase();
  if (h === 'Y' || h === 'YES') return true;
  const gi = String(uc.genie_instruction ?? '').trim();
  return gi.length > 120;
}

/** True if the use case has any Genie instruction content (shipped, partial text, or short draft). */
function useCaseHasGenieInstruction(uc) {
  if (!uc || typeof uc !== 'object') return false;
  if (useCaseHasShippedGenieCode(uc)) return true;
  return String(uc.genie_instruction ?? uc.Genie_Instruction ?? '').trim().length > 0;
}

/**
 * Prefixes that appear at the start of generated `.ipynb` filenames under the generation path.
 * After merging `__inspire_usecases`, `No`/`id` become the DB row id; notebooks often still use
 * the catalog use_case_id (e.g. N01-AI01), so we keep that in `catalog_no` when they differ.
 */
function collectUseCaseNotebookFilenamePrefixes(uc) {
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

/** Match artifact `.ipynb` to a use case: `notebook_path` basename, then filename prefixes. */
function findUcForNotebookFilename(fname, useCases) {
  if (!fname || !String(fname).toLowerCase().endsWith('.ipynb') || !useCases?.length) return null;
  const nameNorm = String(fname).trim().toLowerCase();
  const base = nameNorm.replace(/\.ipynb$/i, '');
  for (const uc of useCases) {
    const nb = String(uc.notebook_path || '').trim();
    if (nb) {
      const tail = (nb.split('/').pop() || '').trim().toLowerCase();
      if (tail && tail === nameNorm) return uc;
    }
    for (const id of collectUseCaseNotebookFilenamePrefixes(uc)) {
      const idLower = id.toLowerCase();
      if (
        base === idLower ||
        base.startsWith(`${idLower}-`) ||
        base.startsWith(`${idLower}_`) ||
        base.startsWith(`${idLower}.`)
      ) {
        return uc;
      }
    }
  }
  return null;
}

/** When overlaying Inspire tracking row id onto domain JSON, keep the prior catalog id for notebook filename matching. */
function applyInspireTrackingId(uc, trackId) {
  if (trackId == null || String(trackId).trim() === '') return;
  const tid = String(trackId).trim();
  const prev = String(uc.No ?? uc.id ?? '').trim();
  if (prev && prev !== tid) uc.catalog_no = prev;
  uc.id = tid;
  uc.No = tid;
}

/** Inspire `__inspire_usecases.id` / catalog `No` — tracking id for merges. */
function useCaseTrackingId(uc) {
  if (!uc || typeof uc !== 'object') return '';
  return String(uc.id ?? uc.No ?? uc['No'] ?? '').trim();
}

/** Sorted unique Inspire tracking ids — React-friendly selection state (avoid `Set` in `useState`). */
function sortUniqueGenieIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const seen = new Set();
  const out = [];
  for (const raw of ids) {
    const s = String(raw ?? '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  out.sort();
  return out;
}

/** Same shape as backend `databricksJobRunUrl` when `job_run_url` is omitted. */
function genieJobRunUrlFromHost(databricksHost, jobId, runId) {
  const h = String(databricksHost || '').trim().replace(/\/+$/, '');
  if (!h || jobId == null || runId == null) return '';
  const origin = h.startsWith('http') ? h.replace(/^http:\/\//i, 'https://') : `https://${h}`;
  return `${origin}/#job/${encodeURIComponent(String(jobId))}/run/${encodeURIComponent(String(runId))}`;
}

/**
 * Combine Jobs API run state with Delta flag counts from `/api/inspire/genie-progress`.
 * Returns `key` for styling and stopping poll (`done` | `failed`).
 */
function deriveGenieOverallStatus(p) {
  if (!p || typeof p !== 'object') {
    return { key: 'running', label: 'In progress', detail: 'Waiting for status…' };
  }
  const lc = String(p.run_life_cycle_state || '').toUpperCase();
  const rs = String(p.run_result_state || '').toUpperCase();
  const remaining = Number(p.remaining_yes) || 0;
  const total = Number(p.selected_total) || 0;

  if (rs === 'FAILED' || rs === 'CANCELED' || rs === 'CANCELLED' || rs === 'TIMEDOUT' || rs === 'TIMEOUT') {
    return { key: 'failed', label: 'Failed', detail: rs.replace(/_/g, ' ') };
  }
  if (lc === 'INTERNAL_ERROR') {
    return { key: 'failed', label: 'Failed', detail: 'Internal error' };
  }
  if (lc === 'SKIPPED') {
    return { key: 'failed', label: 'Failed', detail: 'Run skipped' };
  }

  const jobStillLive =
    !lc ||
    lc === 'PENDING' ||
    lc === 'RUNNING' ||
    lc === 'TERMINATING' ||
    lc === 'BLOCKED' ||
    lc === 'WAITING_FOR_RETRY' ||
    lc === 'QUEUED';

  if (jobStillLive) {
    return { key: 'running', label: 'In progress', detail: lc ? `Run: ${lc.replace(/_/g, ' ')}` : undefined };
  }

  if (lc === 'TERMINATED' && (rs === 'SUCCESS' || rs === '')) {
    if (total > 0 && remaining > 0) {
      return {
        key: 'running',
        label: 'In progress',
        detail: 'Job succeeded; waiting for Genie flags to clear on selected use cases…',
      };
    }
    return { key: 'done', label: 'Done', detail: 'Job finished and use case flags updated' };
  }

  if (total > 0 && remaining === 0) {
    return { key: 'done', label: 'Done', detail: 'Genie flags cleared for selected use cases' };
  }

  return { key: 'running', label: 'In progress', detail: lc ? `Run: ${lc.replace(/_/g, ' ')}` : undefined };
}

/** True if Priority or Quality matches Ultra / Very High / High tier labels. */
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

/** Row-level high signal (filters, badges). */
function isHighPriorityUseCase(uc) {
  if (!uc || typeof uc !== 'object') return false;
  if (isHighTierLabel(uc)) return true;
  const s = inspireScoreFromUc(uc);
  if (s != null && s >= 3) return true;
  return false;
}

/**
 * Dashboard count: never stuck at 0 when scores exist — uses tier/quality, absolute score ≥3,
 * and top ~33% by Inspire score among rows with a numeric score.
 */
function computeHighPriorityCount(list) {
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

/** Strip HTML, emoji / pictographs, and collapse whitespace for titles and summary blocks. */
function displayCleanText(s) {
  if (s == null) return '';
  let t = String(s).replace(/<[^>]*>/g, ' ');
  try {
    t = t.replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji}/gu, '');
  } catch {
    t = t.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
  }
  return t.replace(/\uFE0F/g, '').replace(/\u200D/g, '').replace(/\s{2,}/g, ' ').trim();
}

/** Coerce `results_json` summary fields (VARIANT / object / array) to a display string. */
function inspireResultsTextField(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(inspireResultsTextField).filter(Boolean).join('\n');
  if (typeof v === 'object') {
    for (const k of ['markdown', 'text', 'value', 'content', 'html']) {
      if (typeof v[k] === 'string' && v[k].trim()) return v[k];
    }
  }
  return '';
}

/** Merge refetched `results_json` into prior state so Genie runs cannot wipe executive copy if Delta lags. */
function mergeFreshResultsJson(prev, fresh) {
  if (!fresh || typeof fresh !== 'object') return prev;
  if (!prev || typeof prev !== 'object') return fresh;
  const exFresh = inspireResultsTextField(fresh.executive_summary).trim();
  const exPrev = inspireResultsTextField(prev.executive_summary).trim();
  const ex = exFresh || exPrev;
  const dsFresh = inspireResultsTextField(fresh.domains_summary).trim();
  const dsPrev = inspireResultsTextField(prev.domains_summary).trim();
  const ds = dsFresh || dsPrev;
  const titleFresh = typeof fresh.title === 'string' ? fresh.title.trim() : '';
  const titlePrev = typeof prev.title === 'string' ? prev.title.trim() : '';
  return {
    ...prev,
    ...fresh,
    ...(ex ? { executive_summary: ex } : {}),
    ...(ds ? { domains_summary: ds } : {}),
    title: titleFresh || titlePrev || fresh.title || prev.title,
  };
}

function cloneDomainUseCaseForList(uc) {
  try {
    return typeof structuredClone === 'function' ? structuredClone(uc) : { ...uc };
  } catch {
    return { ...uc };
  }
}

/* ── Date formatter for session display ── */
function formatSessionDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.slice(0, 16);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return dateStr.slice(0, 16); }
}

/** localStorage key — content fingerprints, not session-local `No` / row `id`. */
const FAVORITES_STORAGE_KEY = 'inspire_favorites_fp';

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

/** Stable favorite id across Inspire sessions (same logical use case → same key). */
function useCaseFavoriteKey(uc) {
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

/** Primary beneficiary label on a use case (pipeline + translated headers). */
function beneficiaryFromUc(uc) {
  if (!uc || typeof uc !== 'object') return '';
  return String(uc.Beneficiary ?? uc.beneficiary ?? '').trim();
}

/** Executive / sponsor label on a use case. */
function sponsorFromUc(uc) {
  if (!uc || typeof uc !== 'object') return '';
  return String(uc.Sponsor ?? uc.sponsor ?? '').trim();
}

function loadFavoritesMap() {
  try {
    const rawFp = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (rawFp) {
      const o = JSON.parse(rawFp);
      return o && typeof o === 'object' ? o : {};
    }
    const rawLegacy = JSON.parse(localStorage.getItem('inspire_favorites') || '{}');
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

function favoriteCount(map) {
  return Object.keys(map || {}).filter((k) => map[k]).length;
}

/* ── Pipeline stages for execution summary ── */
const PIPELINE_STAGES = [
  'Setup',
  'Business Understanding',
  'Use Case Design',
  'Domain Mapping',
  'Prioritization',
  'Implementation',
  'Executive Readout',
];

export default function ResultsPage({
  settings,
  update,
  sessionId: propSessionId,
  embedded = false,
}) {
  const {
    databricksHost,
    token,
    warehouseId: settingsWarehouseId,
    inspireDatabase: settingsInspireDb,
    notebookPath: settingsNotebookPath,
    serverEnvHasPat,
  } = settings;

  // Track settings — update when they arrive from bootstrap
  const [inspireDb, setInspireDb] = useState(settingsInspireDb || '');
  const [warehouseId, setWarehouseId] = useState(settingsWarehouseId || '');
  useEffect(() => { if (settingsInspireDb && !inspireDb) setInspireDb(settingsInspireDb); }, [settingsInspireDb]);
  useEffect(() => { if (settingsWarehouseId && !warehouseId) setWarehouseId(settingsWarehouseId); }, [settingsWarehouseId]);

  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isProgressive, setIsProgressive] = useState(false);
  const [usecases, setUsecases] = useState(null);

  /** Re-run artifact list when session or resolved generation folder changes (not blocked by empty prior list). */
  const lastArtifactsLoadKeyRef = useRef('');

  // Filters & sort
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDomain, setFilterDomain] = useState('all');
  const [filterSubdomain, setFilterSubdomain] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterTechnique, setFilterTechnique] = useState('all');
  const [filterQuality, setFilterQuality] = useState('all');
  const [filterBeneficiary, setFilterBeneficiary] = useState('all');
  const [filterSponsor, setFilterSponsor] = useState('all');
  /** `all` | `yes` | `no` — filter by presence of Genie instruction on the use case. */
  const [filterHasGenie, setFilterHasGenie] = useState('all');
  const [sortBy, setSortBy] = useState('inspire');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Favorites — browser localStorage, keyed by content fingerprint (works across sessions)
  const [favorites, setFavorites] = useState(loadFavoritesMap);
  const toggleFavorite = (uc) => {
    const id = useCaseFavoriteKey(uc);
    if (!id) return;
    setFavorites((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch { /* quota / private mode */ }
      return next;
    });
  };

  // Subdomain expansion state
  const [expandedDomains, setExpandedDomains] = useState({});
  const [domainPanelOpen, setDomainPanelOpen] = useState(false);
  const [beneficiaryPanelOpen, setBeneficiaryPanelOpen] = useState(false);
  const [sponsorPanelOpen, setSponsorPanelOpen] = useState(false);

  // Artifacts state — tree-based with expandable folders
  const [artifactTree, setArtifactTree] = useState({}); // { [path]: { files: [], loading, error } }
  const [artifactsRootFiles, setArtifactsRootFiles] = useState(null);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifactsExpanded, setArtifactsExpanded] = useState(false);
  /** Quick Access — Genie notebooks list: collapsed by default to save vertical space */
  const [genieQuickAccessExpanded, setGenieQuickAccessExpanded] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState({});
  // All notebook file paths discovered from the artifacts tree (for "Open in Databricks" links)
  const [allNotebookFiles, setAllNotebookFiles] = useState([]);
  // File preview state
  const [previewFile, setPreviewFile] = useState(null); // path of currently previewed file
  const [previewData, setPreviewData] = useState(null); // { type: 'pdf'|'csv', url?, rows?, headers? }
  const [previewLoading, setPreviewLoading] = useState(false);
  const [expandedCells, setExpandedCells] = useState({}); // { "row-col": true }

  // Only one card expanded at a time
  const [expandedUseCase, setExpandedUseCase] = useState(null);

  /** Inspire `__inspire_usecases` Route 1 flags: user selection → debounced POST sync-genie-flags. */
  const [genieRegenSelectedIds, setGenieRegenSelectedIds] = useState(() => []);
  const [genieFlagSyncing, setGenieFlagSyncing] = useState(false);
  /** True after checkbox changes until `sync-genie-flags` succeeds (includes debounce + in-flight request). */
  const [genieDeltaSyncPending, setGenieDeltaSyncPending] = useState(false);
  const [genieFlagSyncError, setGenieFlagSyncError] = useState('');
  const [genieJobRunning, setGenieJobRunning] = useState(false);
  const [genieJobError, setGenieJobError] = useState('');
  const [genieJobLastRun, setGenieJobLastRun] = useState(null);
  /** Latest `/api/inspire/genie-progress` payload while tracking an active Genie job run. */
  const [genieJobProgress, setGenieJobProgress] = useState(null);
  /** Genie instructions card body; auto-collapses when the tracked job reaches success (`done`). */
  const [genieInstructionsPanelExpanded, setGenieInstructionsPanelExpanded] = useState(true);
  const genieSelectionDirtyRef = useRef(false);
  const genieRegenSelectedIdsRef = useRef(genieRegenSelectedIds);
  useEffect(() => {
    genieRegenSelectedIdsRef.current = genieRegenSelectedIds;
  }, [genieRegenSelectedIds]);

  const apiFetch = useCallback(
    async (url) => {
      const headers = {};
      if (token) { headers['Authorization'] = `Bearer ${token}`; headers['X-DB-PAT-Token'] = token; }
      if (databricksHost) headers['X-Databricks-Host'] = databricksHost;
      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        let msg = errText || `${resp.status}`;
        try {
          const j = JSON.parse(errText);
          if (j.error) msg = typeof j.error === 'string' ? j.error : JSON.stringify(j.error);
        } catch { /* plain text */ }
        throw new Error(`${resp.status}: ${msg}`);
      }
      return resp.json();
    },
    [token, databricksHost]
  );

  const apiPostJson = useCallback(
    async (url, body) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        headers['X-DB-PAT-Token'] = token;
      }
      if (databricksHost) headers['X-Databricks-Host'] = databricksHost;
      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        let msg = errText || `${resp.status}`;
        try {
          const j = JSON.parse(errText);
          if (j.error) msg = typeof j.error === 'string' ? j.error : JSON.stringify(j.error);
        } catch {
          /* plain text */
        }
        throw new Error(`${resp.status}: ${msg}`);
      }
      return resp.json();
    },
    [token, databricksHost]
  );

  useEffect(() => {
    genieSelectionDirtyRef.current = false;
    setGenieRegenSelectedIds([]);
    setGenieFlagSyncError('');
    setGenieJobError('');
    setGenieJobLastRun(null);
    setGenieJobProgress(null);
    setGenieDeltaSyncPending(false);
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId || !usecases?.length) return;
    if (genieSelectionDirtyRef.current) return;
    const next = [];
    for (const row of usecases) {
      const id = String(row.No ?? row.id ?? '').trim();
      const ggi = String(row.generate_genie_code_instruction ?? '').trim().toUpperCase();
      if (id && ggi === 'YES') next.push(id);
    }
    setGenieRegenSelectedIds(sortUniqueGenieIds(next));
    setGenieDeltaSyncPending(false);
  }, [selectedSessionId, usecases]);

  const genieSelectedSortedKey = useMemo(
    () => JSON.stringify(sortUniqueGenieIds(genieRegenSelectedIds)),
    [genieRegenSelectedIds]
  );

  useEffect(() => {
    if (!genieSelectionDirtyRef.current) return;
    if (!selectedSessionId || !inspireDb || !warehouseId) return;

    const t = setTimeout(() => {
      let ids = [];
      try {
        const parsed = JSON.parse(genieSelectedSortedKey);
        ids = Array.isArray(parsed) ? parsed.map((x) => String(x).trim()).filter(Boolean) : [];
      } catch {
        ids = [];
      }
      setGenieFlagSyncing(true);
      setGenieFlagSyncError('');
      (async () => {
        try {
          await apiPostJson('/api/inspire/sync-genie-flags', {
            inspire_database: inspireDb,
            warehouse_id: warehouseId,
            session_id: String(selectedSessionId),
            use_case_ids: ids,
          });
          genieSelectionDirtyRef.current = false;
          setGenieDeltaSyncPending(false);
        } catch (e) {
          setGenieFlagSyncError(
            `${e.message || 'Failed to sync Genie flags to Delta.'} Change any checkbox to retry.`,
          );
        } finally {
          setGenieFlagSyncing(false);
        }
      })();
    }, 450);
    return () => clearTimeout(t);
  }, [genieSelectedSortedKey, selectedSessionId, inspireDb, warehouseId, apiPostJson]);

  const toggleGenieRegenForUc = useCallback((tid, checked) => {
    const sid = String(tid ?? '').trim();
    if (!sid) return;
    setGenieRegenSelectedIds((prev) => {
      const cur = sortUniqueGenieIds(Array.isArray(prev) ? prev : []);
      if (checked) {
        if (cur.length >= 50 && !cur.includes(sid)) {
          setGenieFlagSyncError('At most 50 use cases can be flagged for Genie generation per run.');
          return prev;
        }
        setGenieFlagSyncError('');
        if (cur.includes(sid)) return prev;
        genieSelectionDirtyRef.current = true;
        queueMicrotask(() => setGenieDeltaSyncPending(true));
        return sortUniqueGenieIds([...cur, sid]);
      }
      setGenieFlagSyncError('');
      if (!cur.includes(sid)) return prev;
      genieSelectionDirtyRef.current = true;
      queueMicrotask(() => setGenieDeltaSyncPending(true));
      return cur.filter((x) => x !== sid);
    });
  }, []);

  const handleGenerateGenieJob = useCallback(async () => {
    if (!selectedSessionId || !inspireDb || !warehouseId) return;
    const ids = [...genieRegenSelectedIdsRef.current];
    if (ids.length === 0) {
      setGenieJobError('Select at least one use case (checkbox).');
      return;
    }
    if (ids.length > 50) {
      setGenieJobError('At most 50 use cases per Generate job.');
      return;
    }
    setGenieJobRunning(true);
    setGenieJobError('');
    setGenieJobProgress(null);
    setGenieInstructionsPanelExpanded(true);
    try {
      if (genieSelectionDirtyRef.current) {
        await apiPostJson('/api/inspire/sync-genie-flags', {
          inspire_database: inspireDb,
          warehouse_id: warehouseId,
          session_id: String(selectedSessionId),
          use_case_ids: ids.sort(),
        });
        genieSelectionDirtyRef.current = false;
        setGenieDeltaSyncPending(false);
      }
      const out = await apiPostJson('/api/inspire/generate-genie', {
        inspire_database: inspireDb,
        warehouse_id: warehouseId,
        session_id: String(selectedSessionId),
        use_case_ids: ids,
        ...(settingsNotebookPath ? { notebook_path: settingsNotebookPath } : {}),
      });
      setGenieJobLastRun(out);
    } catch (e) {
      setGenieJobError(e.message || 'Generate Genie job failed.');
    } finally {
      setGenieJobRunning(false);
    }
  }, [selectedSessionId, inspireDb, warehouseId, apiPostJson, settingsNotebookPath]);

  /** Re-fetch `__inspire_usecases` rows (e.g. after Genie generation) without reloading results/artifacts. */
  const refreshUsecasesForSession = useCallback(
    async (sid) => {
      if (!sid || !inspireDb || !warehouseId) return;
      const q = new URLSearchParams({
        inspire_database: inspireDb,
        warehouse_id: warehouseId,
        session_id: String(sid),
      });
      try {
        const ucData = await apiFetch(`/api/inspire/usecases?${q}`);
        setUsecases(ucData.usecases?.length > 0 ? ucData.usecases : null);
      } catch {
        /* silent — optional manual refresh still available */
      }
    },
    [apiFetch, inspireDb, warehouseId]
  );

  /** Re-fetch `results_json` after Genie so session copy stays aligned; merge keeps executive text if Delta returns empty. */
  const refreshResultsJsonForSession = useCallback(
    async (sid) => {
      if (!sid || !inspireDb || !warehouseId) return;
      const q = new URLSearchParams({
        inspire_database: inspireDb,
        warehouse_id: warehouseId,
        session_id: String(sid),
      });
      try {
        const data = await apiFetch(`/api/inspire/results?${q}`);
        if (!data?.results || typeof data.results !== 'object') return;
        setResults((prev) => mergeFreshResultsJson(prev, data.results));
      } catch {
        /* ignore */
      }
    },
    [apiFetch, inspireDb, warehouseId]
  );

  const genieJobPollKey = useMemo(() => {
    const run = genieJobLastRun;
    if (!run?.run_id || !Array.isArray(run.flagged_use_case_ids) || run.flagged_use_case_ids.length === 0) {
      return '';
    }
    return `${run.run_id}:${run.flagged_use_case_ids.join(',')}`;
  }, [genieJobLastRun]);

  useEffect(() => {
    if (!genieJobPollKey || !selectedSessionId || !inspireDb || !warehouseId) return;
    const run = genieJobLastRun;
    if (!run?.run_id || !run.flagged_use_case_ids?.length) return;

    let cancelled = false;
    let intervalId = null;

    const tick = async () => {
      if (cancelled) return;
      const q = new URLSearchParams({
        inspire_database: inspireDb,
        warehouse_id: warehouseId,
        session_id: String(selectedSessionId),
        use_case_ids: run.flagged_use_case_ids.join(','),
        run_id: String(run.run_id),
      });
      try {
        const data = await apiFetch(`/api/inspire/genie-progress?${q}`);
        if (cancelled) return;
        setGenieJobProgress(data);
        const { key } = deriveGenieOverallStatus(data);
        if (key === 'done' || key === 'failed') {
          if (intervalId) clearInterval(intervalId);
          intervalId = null;
          if (key === 'done' && !cancelled) {
            void (async () => {
              await refreshResultsJsonForSession(selectedSessionId);
              await refreshUsecasesForSession(selectedSessionId);
            })();
          }
        }
      } catch (e) {
        if (cancelled) return;
        setGenieJobProgress((prev) => ({
          ...(prev && typeof prev === 'object' ? prev : {}),
          poll_error: e.message || 'Progress request failed',
        }));
      }
    };

    void tick();
    intervalId = setInterval(tick, 2800);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [
    genieJobPollKey,
    selectedSessionId,
    inspireDb,
    warehouseId,
    apiFetch,
    refreshUsecasesForSession,
    refreshResultsJsonForSession,
  ]);

  /** Collapse the Genie instructions panel once the job run is fully successful (flags cleared / terminal success). */
  useEffect(() => {
    if (!genieJobLastRun?.run_id) return;
    if (deriveGenieOverallStatus(genieJobProgress).key === 'done') {
      setGenieInstructionsPanelExpanded(false);
    }
  }, [genieJobProgress, genieJobLastRun?.run_id]);

  // ── Auto-load sessions when settings are available ──
  const [autoLoaded, setAutoLoaded] = useState(false);
  useEffect(() => {
    if (autoLoaded || !inspireDb || !warehouseId) return;
    setAutoLoaded(true);
    handleLoadSessions(true);
  }, [inspireDb, warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDomainPanelOpen(false);
    setBeneficiaryPanelOpen(false);
    setSponsorPanelOpen(false);
    setGenieInstructionsPanelExpanded(true);
  }, [selectedSessionId]);

  const handleLoadSessions = async (autoLoad = false) => {
    if (!inspireDb || !warehouseId) return;
    setSessionsLoading(true);
    setSessionsError('');
    try {
      const q = new URLSearchParams({
        inspire_database: inspireDb,
        warehouse_id: warehouseId,
      });
      const data = await apiFetch(`/api/inspire/sessions?${q}`);
      const loadedSessions = data.sessions || [];
      setSessions(loadedSessions);
      setSessionsLoaded(true);

      if (loadedSessions.length === 0) return; // show "no sessions" message

      // Auto-select & auto-load results ONLY on mount auto-load
      if (autoLoad) {
        const completed = loadedSessions.find(
          (s) => s.completed_percent >= 100
        );
        const target = propSessionId
          ? loadedSessions.find((s) => String(s.session_id) === String(propSessionId))
          : completed;
        if (target) {
          setSelectedSessionId(target.session_id);
          // Don't await — let it run and update loading/results independently
          loadResults(target.session_id);
        }
      }
    } catch (err) {
      setSessionsError(err.message || 'Failed to load sessions.');
      console.warn('Failed to load sessions:', err.message);
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadResults = async (sid) => {
    setLoading(true);
    setError('');
    setResults(null);
    setUsecases(null);
    setIsProgressive(false);
    setArtifactsRootFiles(null);
    setArtifactTree({});
    setAllNotebookFiles([]);
    setPreviewFile(null);
    setPreviewData(null);
    setArtifactsExpanded(false);
    lastArtifactsLoadKeyRef.current = '';
    try {
      const q = new URLSearchParams({
        inspire_database: inspireDb,
        warehouse_id: warehouseId,
      });
      if (sid) q.set('session_id', sid);

      // Try final results_json first
      const data = await apiFetch(`/api/inspire/results?${q}`);
      if (data.results) {
        // Await usecases before committing results so the first paint includes notebook_path / genie fields from __inspire_usecases when present.
        let loadedUsecases = null;
        try {
          const ucData = await apiFetch(`/api/inspire/usecases?${q}`);
          if (ucData.usecases?.length > 0) loadedUsecases = ucData.usecases;
        } catch { /* silent */ }
        setResults(data.results);
        setUsecases(loadedUsecases);
        return;
      }

      // No final results — try progressive results from __inspire_step
      const stepData = await apiFetch(`/api/inspire/step-results?${q}`);
      if (stepData.results && stepData.results._use_case_count > 0) {
        let loadedUsecases = null;
        try {
          const ucData = await apiFetch(`/api/inspire/usecases?${q}`);
          if (ucData.usecases?.length > 0) loadedUsecases = ucData.usecases;
        } catch { /* silent */ }
        setResults(stepData.results);
        setUsecases(loadedUsecases);
        setIsProgressive(true);
        return;
      }

      setError('No results found yet. The pipeline may still be starting.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Extract use cases (defensive — guard against non-array shapes) ──
  let allUseCases = [];
  try {
    // Prefer results_json domains (rich structure), then overlay __inspire_usecases tracking fields (notebook_path, genie_instruction).
    if (Array.isArray(results?.domains)) {
      for (const domain of results.domains) {
        const ucs = Array.isArray(domain?.use_cases) ? domain.use_cases : [];
        for (const uc of ucs) {
          const base = cloneDomainUseCaseForList(uc);
          allUseCases.push({ ...base, _domain: domain.domain_name || '' });
        }
      }
    } else if (usecases && usecases.length > 0) {
      allUseCases = usecases.map((uc) => ({
        ...uc,
        _domain: uc['Business Domain'] || uc.domain || uc._domain || '',
        Name: uc.Name || uc.use_case_name || uc.name || '',
        Statement: uc.Statement || uc.description || uc.problem_statement || '',
        Solution: uc.Solution || uc.solution || '',
        Priority: uc.Priority || uc.priority || '',
        SQL: uc.SQL || uc.sql || uc.sql_query || '',
      }));
    } else if (Array.isArray(results?.use_cases)) {
      for (const uc of results.use_cases) {
        allUseCases.push(cloneDomainUseCaseForList(uc));
      }
    } else if (Array.isArray(results)) {
      for (const uc of results) {
        allUseCases.push(cloneDomainUseCaseForList(uc));
      }
    }

    if (usecases && usecases.length > 0 && allUseCases.length > 0) {
      const rowKey = (uc) => String(uc?.No ?? uc?.id ?? uc?.['No'] ?? '').trim();
      const tableById = new Map();
      for (const row of usecases) {
        const k = rowKey(row);
        if (k) tableById.set(k, row);
      }
      for (const uc of allUseCases) {
        const k = rowKey(uc);
        if (!k) continue;
        const row = tableById.get(k);
        if (!row) continue;
        const trackId = row.id ?? row.No ?? row['No'];
        applyInspireTrackingId(uc, trackId);
        const nb = row.notebook_path || row.Notebook_Path || row.NOTEBOOK_PATH || '';
        if (nb && !uc.notebook_path) uc.notebook_path = nb;
        const ggi = row.generate_genie_code_instruction;
        if (ggi != null && String(ggi).trim() !== '') uc.generate_genie_code_instruction = String(ggi).trim();
        const hgc = row.has_genie_code;
        if (hgc != null && String(hgc).trim() !== '') uc.has_genie_code = String(hgc).trim();
        const gi = row.genie_instruction || row.Genie_Instruction || '';
        if (gi && !uc.genie_instruction) uc.genie_instruction = gi;
        const desc = row.description || row.Description;
        if (desc && !uc.description) uc.description = desc;
        const sn = row.short_name || row.shortName;
        if (sn && !uc.short_name) uc.short_name = sn;
        const copyScore = (field) => {
          const v = row[field];
          if (v == null || v === '') return;
          if (uc[field] != null && uc[field] !== '') return;
          uc[field] = v;
        };
        copyScore('priority_score');
        copyScore('value_score');
        copyScore('feasibility_score');
      }
      // When domain JSON `No`/`id` ≠ tracking table `id`, attach scores by Name + Business Domain.
      const normKey = (name, domain) =>
        `${String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')}|${String(domain || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
      const byNameDomain = new Map();
      for (const row of usecases) {
        const nm = String(row.Name || '').trim();
        if (!nm) continue;
        const k = normKey(nm, row._domain || row['Business Domain'] || '');
        byNameDomain.set(k, row);
      }
      for (const uc of allUseCases) {
        const nm = String(uc.Name || '').trim();
        if (!nm) continue;
        const hasScore =
          uc.priority_score != null && uc.priority_score !== '' && Number.isFinite(Number(uc.priority_score));
        if (hasScore) continue;
        const row = byNameDomain.get(normKey(nm, uc._domain || uc['Business Domain'] || ''));
        if (!row) continue;
        const copyScore2 = (field) => {
          const v = row[field];
          if (v == null || v === '') return;
          if (uc[field] != null && uc[field] !== '') return;
          uc[field] = v;
        };
        copyScore2('priority_score');
        copyScore2('value_score');
        copyScore2('feasibility_score');
        if (!uc.Priority && row.Priority) uc.Priority = row.Priority;
        if (!uc.Quality && row.Quality) uc.Quality = row.Quality;
        const trackId = row.id ?? row.No ?? row['No'];
        applyInspireTrackingId(uc, trackId);
        const ggi2 = row.generate_genie_code_instruction;
        if (ggi2 != null && String(ggi2).trim() !== '') uc.generate_genie_code_instruction = String(ggi2).trim();
        const hgc2 = row.has_genie_code;
        if (hgc2 != null && String(hgc2).trim() !== '') uc.has_genie_code = String(hgc2).trim();
        const nb2 = row.notebook_path || row.Notebook_Path || row.NOTEBOOK_PATH || '';
        if (nb2 && !uc.notebook_path) uc.notebook_path = nb2;
        const gi2 = row.genie_instruction || row.Genie_Instruction || '';
        if (gi2 && !uc.genie_instruction) uc.genie_instruction = gi2;
      }
    }
  } catch (err) {
    console.error('Error extracting use cases:', err);
    allUseCases = [];
  }

  // ── Resolve table from registry ──
  const resolveTable = (id) => {
    if (!results?.table_registry || !id) return id;
    return results.table_registry[id] || id;
  };

  // ── Filter & sort ──
  let filteredUseCases = [];
  try {
    filteredUseCases = allUseCases
      .filter((uc) => {
        if (!uc || typeof uc !== 'object') return false;
        if (filterDomain !== 'all' && uc._domain !== filterDomain) return false;
        if (filterSubdomain !== 'all' && String(uc.Subdomain || '') !== filterSubdomain) return false;
        if (filterPriority !== 'all' && uc.Priority !== filterPriority)
          return false;
        if (filterType !== 'all' && uc.type !== filterType) return false;
        if (filterTechnique !== 'all' && String(uc['Analytics Technique'] || '') !== filterTechnique) return false;
        if (filterQuality !== 'all' && String(uc.Quality || '') !== filterQuality) return false;
        if (filterBeneficiary !== 'all' && beneficiaryFromUc(uc) !== filterBeneficiary) return false;
        if (filterSponsor !== 'all' && sponsorFromUc(uc) !== filterSponsor) return false;
        if (filterHasGenie === 'yes' && !useCaseHasGenieInstruction(uc)) return false;
        if (filterHasGenie === 'no' && useCaseHasGenieInstruction(uc)) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            String(uc.Name || '').toLowerCase().includes(q) ||
            String(uc.Statement || '').toLowerCase().includes(q) ||
            String(uc.Solution || '').toLowerCase().includes(q) ||
            beneficiaryFromUc(uc).toLowerCase().includes(q) ||
            sponsorFromUc(uc).toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const sa = inspireScoreFromUc(a);
        const sb = inspireScoreFromUc(b);
        const scoreFirst = () => {
          const va = sa ?? -Infinity;
          const vb = sb ?? -Infinity;
          if (vb !== va) return vb - va;
          return 0;
        };
        if (sortBy === 'inspire') {
          const c = scoreFirst();
          if (c !== 0) return c;
          return String(a.Name || '').localeCompare(String(b.Name || ''));
        }
        if (sortBy === 'domain') {
          const d = String(a._domain || '').localeCompare(String(b._domain || ''));
          if (d !== 0) return d;
          const cDom = scoreFirst();
          if (cDom !== 0) return cDom;
          return String(a.Name || '').localeCompare(String(b.Name || ''));
        }
        if (sortBy === 'name') {
          const n = String(a.Name || '').localeCompare(String(b.Name || ''));
          if (n !== 0) return n;
          const cNm = scoreFirst();
          if (cNm !== 0) return cNm;
          return 0;
        }
        // priority — tier after score so list stays score-ranked when scores exist
        if (sortBy === 'priority') {
          const c = scoreFirst();
          if (c !== 0) return c;
          const ia = PRIORITY_ORDER.indexOf(a.Priority);
          const ib = PRIORITY_ORDER.indexOf(b.Priority);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        }
        return scoreFirst();
      });
  } catch (err) {
    console.error('Error filtering/sorting use cases:', err);
    filteredUseCases = allUseCases;
  }

  // Apply favorites filter
  if (showFavoritesOnly) {
    filteredUseCases = filteredUseCases.filter((uc) => {
      const k = useCaseFavoriteKey(uc);
      return k && favorites[k];
    });
  }

  const domains = [
    ...new Set(allUseCases.map((uc) => uc?._domain).filter(Boolean)),
  ];
  const priorities = [
    ...new Set(allUseCases.map((uc) => uc?.Priority).filter(Boolean)),
  ];
  const types = [
    ...new Set(allUseCases.map((uc) => uc?.type).filter(Boolean)),
  ];
  const techniques = [
    ...new Set(allUseCases.map((uc) => uc?.['Analytics Technique']).filter(Boolean)),
  ];
  const qualities = [
    ...new Set(allUseCases.map((uc) => uc?.Quality).filter(Boolean)),
  ];

  const beneficiaries = [
    ...new Set(allUseCases.map(beneficiaryFromUc).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const sponsors = [
    ...new Set(allUseCases.map(sponsorFromUc).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  const beneficiaryCounts = {};
  for (const uc of allUseCases) {
    const b = beneficiaryFromUc(uc);
    if (b) beneficiaryCounts[b] = (beneficiaryCounts[b] || 0) + 1;
  }
  const sponsorCounts = {};
  for (const uc of allUseCases) {
    const s = sponsorFromUc(uc);
    if (s) sponsorCounts[s] = (sponsorCounts[s] || 0) + 1;
  }

  // Compute subdomain counts by domain
  const subdomainsByDomain = {};
  for (const uc of allUseCases) {
    const d = uc?._domain || 'Unknown';
    const sd = String(uc?.Subdomain || '');
    if (!sd) continue;
    if (!subdomainsByDomain[d]) subdomainsByDomain[d] = {};
    subdomainsByDomain[d][sd] = (subdomainsByDomain[d][sd] || 0) + 1;
  }

  const uniqueSubdomainCount = (() => {
    const seen = new Set();
    for (const uc of allUseCases) {
      const sd = String(uc?.Subdomain || '').trim();
      if (sd) seen.add(sd);
    }
    return seen.size;
  })();

  const techniqueCount = techniques.length;

  let _scoreSum = 0;
  let _scoreN = 0;
  for (const uc of allUseCases) {
    const sc = inspireScoreFromUc(uc);
    if (sc != null && Number.isFinite(sc)) {
      _scoreSum += sc;
      _scoreN += 1;
    }
  }
  const avgInspireScore = _scoreN > 0 ? _scoreSum / _scoreN : null;

  // Compute domain counts for sidebar
  const domainCounts = {};
  for (const uc of allUseCases) {
    const d = uc?._domain || 'Unknown';
    domainCounts[d] = (domainCounts[d] || 0) + 1;
  }

  const hasActiveFilters =
    searchQuery ||
    filterDomain !== 'all' ||
    filterSubdomain !== 'all' ||
    filterPriority !== 'all' ||
    filterType !== 'all' ||
    filterTechnique !== 'all' ||
    filterQuality !== 'all' ||
    filterBeneficiary !== 'all' ||
    filterSponsor !== 'all' ||
    filterHasGenie !== 'all';

  const clearAllFilters = () => {
    setSearchQuery(''); setFilterDomain('all'); setFilterSubdomain('all');
    setFilterPriority('all'); setFilterType('all'); setFilterTechnique('all');
    setFilterQuality('all');
    setFilterBeneficiary('all'); setFilterSponsor('all');
    setFilterHasGenie('all');
  };

  // Load generation artifacts — tries multiple path variations
  const artifactHeaders = useCallback(() => {
    const h = {};
    if (token) { h['Authorization'] = `Bearer ${token}`; h['X-DB-PAT-Token'] = token; }
    if (databricksHost) h['X-Databricks-Host'] = databricksHost;
    return h;
  }, [token, databricksHost]);

  // Recursively scan a folder to discover all file paths (notebooks, PDFs, CSVs, etc.)
  const deepScanFolder = useCallback(async (folderPath) => {
    if (!folderPath) return;
    const headers = artifactHeaders();
    const discovered = [];
    const scan = async (dir) => {
      try {
        const resp = await fetch(`/api/workspace/list?path=${encodeURIComponent(dir)}`, { headers });
        if (!resp.ok) return;
        const data = await resp.json();
        const files = data.files || [];
        setArtifactTree(prev => ({ ...prev, [dir]: { files, loading: false, error: null } }));
        for (const f of files) {
          if (f.is_directory) {
            await scan(f.path);
          } else {
            discovered.push(f.path);
          }
        }
      } catch { /* silent */ }
    };
    await scan(folderPath);
    // Accumulate — don't replace
    setAllNotebookFiles(prev => [...new Set([...prev, ...discovered])]);
  }, [token, artifactHeaders]);

  const loadArtifacts = useCallback(async (genPath) => {
    if (!genPath) return;
    setArtifactsLoading(true);
    setArtifactsRootFiles(null);
    const headers = artifactHeaders();

    const candidates = [...expandWorkspaceListCandidates(genPath)];
    if (!genPath.startsWith('/')) {
      candidates.push(`/Workspace/${genPath.replace(/^\.\//, '')}`);
      candidates.push(`/Shared/${genPath.replace(/^\.\//, '')}`);
    }

    for (const path of candidates) {
      try {
        const resp = await fetch(`/api/workspace/list?path=${encodeURIComponent(path)}`, { headers });
        if (resp.ok) {
          const data = await resp.json();
          if (data.files && data.files.length > 0) {
            setArtifactsRootFiles(data.files);
            setArtifactsExpanded(true);
            setArtifactsLoading(false);
            // Auto-scan ALL subfolders to discover notebook paths and previewable files
            for (const f of data.files) {
              if (f.is_directory) deepScanFolder(f.path);
            }
            return;
          }
        }
      } catch { /* try next */ }
    }
    setArtifactsRootFiles([]);
    setArtifactsLoading(false);
  }, [token, databricksHost, artifactHeaders, deepScanFolder]);

  const loadFolder = useCallback(async (folderPath) => {
    if (!folderPath) return;
    setArtifactTree(prev => ({ ...prev, [folderPath]: { files: [], loading: true, error: null } }));
    const headers = artifactHeaders();
    try {
      const resp = await fetch(`/api/workspace/list?path=${encodeURIComponent(folderPath)}`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        setArtifactTree(prev => ({ ...prev, [folderPath]: { files: data.files || [], loading: false, error: null } }));
      } else {
        setArtifactTree(prev => ({ ...prev, [folderPath]: { files: [], loading: false, error: 'Could not list folder' } }));
      }
    } catch {
      setArtifactTree(prev => ({ ...prev, [folderPath]: { files: [], loading: false, error: 'Network error' } }));
    }
  }, [token, artifactHeaders]);

  const toggleFolder = useCallback((folderPath) => {
    setExpandedFolders(prev => {
      const next = { ...prev, [folderPath]: !prev[folderPath] };
      // Load folder contents if expanding and not yet loaded
      if (next[folderPath] && !artifactTree[folderPath]) {
        loadFolder(folderPath);
      }
      return next;
    });
  }, [artifactTree, loadFolder]);

  const downloadFile = useCallback((filePath, fileName) => {
    const headers = artifactHeaders();
    fetch(`/api/workspace/export?path=${encodeURIComponent(filePath)}`, { headers })
      .then(resp => {
        if (!resp.ok) throw new Error('Download failed');
        return resp.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => { /* silent */ });
  }, [artifactHeaders]);

  // Open a file (PDF/Excel) in a new browser tab
  const openFileInTab = useCallback(async (filePath, fileName) => {
    const headers = artifactHeaders();
    try {
      const resp = await fetch(`/api/workspace/export?path=${encodeURIComponent(filePath)}`, { headers });
      if (!resp.ok) return;
      const blob = await resp.blob();
      const ext = (fileName || '').toLowerCase().split('.').pop();
      const mimeType = ext === 'pdf' ? 'application/pdf' : ext === 'csv' ? 'text/csv' : 'application/octet-stream';
      const typedBlob = new Blob([blob], { type: mimeType });
      const url = URL.createObjectURL(typedBlob);
      window.open(url, '_blank');
    } catch { /* silent */ }
  }, [artifactHeaders]);

  // Toggle inline preview for a file
  const togglePreview = useCallback(async (filePath, fileName) => {
    // Toggle off if same file
    if (previewFile === filePath) {
      if (previewData?.url) URL.revokeObjectURL(previewData.url);
      setPreviewFile(null);
      setPreviewData(null);
      return;
    }
    setPreviewFile(filePath);
    setPreviewData(null);
    setPreviewLoading(true);
    setExpandedCells({});
    const headers = artifactHeaders();
    try {
      const resp = await fetch(`/api/workspace/export?path=${encodeURIComponent(filePath)}`, { headers });
      if (!resp.ok) throw new Error('fetch failed');
      const ext = (fileName || '').toLowerCase().split('.').pop();
      if (ext === 'pdf') {
        const blob = new Blob([await resp.blob()], { type: 'application/pdf' });
        setPreviewData({ type: 'pdf', url: URL.createObjectURL(blob) });
      } else if (ext === 'csv') {
        const text = await resp.text();
        // CSV parser that handles quoted fields with commas and newlines
        const parseCsvLine = (line) => {
          const cells = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
              if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
              else if (ch === '"') inQuotes = false;
              else current += ch;
            } else {
              if (ch === '"') inQuotes = true;
              else if (ch === ',') { cells.push(current.trim()); current = ''; }
              else current += ch;
            }
          }
          cells.push(current.trim());
          return cells;
        };
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const csvHeaders = parseCsvLine(lines[0] || '');
        const rows = lines.slice(1, 51).map(l => parseCsvLine(l));
        setPreviewData({ type: 'csv', headers: csvHeaders, rows, totalRows: lines.length - 1 });
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buf = await resp.arrayBuffer();
        try {
          // Load SheetJS from CDN if not already loaded
          if (!window.XLSX) {
            await new Promise((resolve, reject) => {
              const s = document.createElement('script');
              s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
              s.onload = resolve;
              s.onerror = reject;
              document.head.appendChild(s);
            });
          }
          const wb = window.XLSX.read(buf, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const jsonData = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
          const xlHeaders = (jsonData[0] || []).map(String);
          const rows = jsonData.slice(1, 51).map(r => (r || []).map(c => c == null ? '' : String(c)));
          setPreviewData({ type: 'csv', headers: xlHeaders, rows, totalRows: jsonData.length - 1 });
        } catch {
          setPreviewData({ type: 'error', message: 'Could not parse Excel file — try downloading instead.' });
        }
      }
    } catch {
      setPreviewData({ type: 'error', message: 'Could not load file' });
    }
    setPreviewLoading(false);
  }, [previewFile, previewData, artifactHeaders]);

  // Find generation path from selected session
  const selectedSession = sessions.find(s => String(s.session_id) === String(selectedSessionId));
  const generationRootPath = selectedSession?.generation_path || selectedSession?.widget_values?.generation_path || '';
  // Build experiment-specific path: {generation_path}/{sanitized(business_name)}
  const businessName = selectedSession?.widget_values?.business || selectedSession?.widget_values?.['00_business_name'] || selectedSession?.business_name || '';
  const sanitizedName = businessName ? businessName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || '_' : '';
  // Resolve relative generation_path using the notebook's workspace folder (prefer /Workspace prefix for repo-relative paths)
  const notebookPathRaw = settings?.notebookPath || '';
  const notebookPathForJoin = (() => {
    const n = normalizeDatabricksFsPath(notebookPathRaw);
    if (!n || n.startsWith('/Volumes/')) return n;
    if (n.startsWith('/') && !n.startsWith('/Workspace')) return `/Workspace${n}`;
    return n;
  })();
  const notebookDir = notebookPathForJoin && notebookPathForJoin.includes('/')
    ? notebookPathForJoin.replace(/\/[^/]+$/, '')
    : '';
  const resolvedRoot = (() => {
    const gp = (generationRootPath || '').trim();
    if (!gp) return '';
    if (gp.startsWith('/')) return normalizeDatabricksFsPath(gp);
    if (notebookDir && (gp.startsWith('./') || gp.startsWith('../'))) {
      const rel = gp.replace(/^\.\/+/, '');
      return normalizeDatabricksFsPath(`${notebookDir}/${rel}`);
    }
    if (notebookDir && !gp.startsWith('/')) {
      return normalizeDatabricksFsPath(`${notebookDir}/${gp}`);
    }
    return normalizeDatabricksFsPath(gp);
  })();
  const generationPath = sanitizedName && resolvedRoot
    ? normalizeDatabricksFsPath(`${resolvedRoot.replace(/\/+$/, '')}/${sanitizedName}`)
    : resolvedRoot;

  /** Top bar title when viewing results — same as catalog card (`results.title`) or “{business} Usecases Catalog”. */
  const resultsPageTitle = (() => {
    if (!results) return null;
    if (typeof results.title === 'string' && results.title.trim()) {
      const cleaned = displayCleanText(results.title);
      return cleaned || 'Use Cases Catalog';
    }
    const biz =
      selectedSession?.widget_values?.business ||
      selectedSession?.widget_values?.['00_business_name'] ||
      selectedSession?.business_name ||
      '';
    const b = biz ? displayCleanText(String(biz).trim()) : '';
    if (b) return `${b} Usecases Catalog`;
    return 'Use Cases Catalog';
  })();

  // Auto-load artifacts to discover notebook paths and document previews (server PAT counts as auth)
  useEffect(() => {
    if (!generationPath) return;
    if (!token && !serverEnvHasPat) return;
    const k = `${selectedSessionId}|${generationPath}`;
    if (lastArtifactsLoadKeyRef.current === k) return;
    lastArtifactsLoadKeyRef.current = k;
    setArtifactTree({});
    setAllNotebookFiles([]);
    console.log('[Inspire] Auto-loading artifacts from:', generationPath);
    loadArtifacts(generationPath);
  }, [generationPath, selectedSessionId, token, serverEnvHasPat, loadArtifacts]);

  const highPriorityCount = computeHighPriorityCount(allUseCases);

  return (
    <div
      className={
        embedded
          ? 'px-4 py-4'
          : results
            ? 'max-w-7xl mx-auto px-0 py-2 sm:py-3'
            : 'max-w-7xl mx-auto px-6 py-8'
      }
    >
      {/* Page header — tighter when results are shown so executive summary stays above the fold */}
      {!embedded && (
        <div className={`flex items-center justify-between gap-3 ${results ? 'mb-3' : 'mb-8'}`}>
          <div className={`flex items-center min-w-0 flex-1 ${results ? 'gap-3' : 'gap-4'}`}>
            <div
              className={`flex shrink-0 items-center justify-center rounded-xl border border-border bg-surface shadow-sm ${
                results ? 'h-10 w-10' : 'h-12 w-12'
              }`}
            >
              <BarChart3
                size={results ? 20 : 24}
                className="text-db-red"
                strokeWidth={1.75}
                aria-hidden
              />
            </div>
            <div className="min-w-0">
              <h1
                className={`font-bold tracking-[-0.02em] bg-gradient-to-br from-text-primary via-text-primary to-db-red bg-clip-text text-transparent ${
                  results ? 'text-2xl sm:text-3xl line-clamp-2 break-words' : 'text-3xl sm:text-4xl'
                }`}
                title={results && resultsPageTitle ? resultsPageTitle : undefined}
              >
                {results ? resultsPageTitle : 'Results'}
              </h1>
              {!results && (
                <p className="mt-1 text-sm text-text-secondary sm:text-base">
                  Explore your AI-generated data strategy.
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {results && (
              <button
                onClick={() => {
                  setResults(null);
                  setUsecases(null);
                  setError('');
                  setExpandedUseCase(null);
                  setSelectedSessionId(null);
                  setSessionsLoaded(false);
                  setIsProgressive(false);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-tertiary border border-border rounded-lg hover:bg-bg-subtle transition-smooth"
              >
                <RefreshCw size={12} />
                Change Session
              </button>
            )}
          </div>
        </div>
      )}
      {embedded && filteredUseCases.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={18} className="text-db-red shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="text-sm font-bold text-text-primary">
            {allUseCases.length} Use Cases Generated
          </span>
          <span className="text-xs text-text-tertiary">
            across {domains.length} domain{domains.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* ═══ Loading / Empty state — sessions auto-load from settings ═══ */}
      {!embedded && !results && !loading && (
        <div className="mb-6">
          {/* Loading sessions — animated pipeline illustration */}
          {sessionsLoading && (
            <div className="bg-surface border border-border rounded-xl p-10 text-center">
              <div className="flex items-center justify-center gap-3 mb-6">
                {['Connecting', 'Scanning', 'Loading'].map((step, i) => (
                  <div key={step} className="flex items-center gap-3">
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center animate-pulse"
                        style={{ backgroundColor: 'rgba(255,54,33,0.1)', animationDelay: `${i * 400}ms` }}
                      >
                        {i === 0 && <Database size={18} className="text-db-red" />}
                        {i === 1 && <Search size={18} className="text-db-red" />}
                        {i === 2 && <FileText size={18} className="text-db-red" />}
                      </div>
                      <span className="text-[10px] font-medium text-text-tertiary">{step}</span>
                    </div>
                    {i < 2 && (
                      <div className="w-8 h-px bg-border relative overflow-hidden mb-5">
                        <div className="absolute inset-y-0 left-0 w-1/2 bg-db-red/40 animate-[shimmer_1.5s_ease-in-out_infinite]" style={{ animationDelay: `${i * 500}ms` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-sm font-medium text-text-primary">Fetching your Inspire sessions</p>
              <p className="text-xs text-text-tertiary mt-1.5">Connecting to your workspace...</p>
            </div>
          )}

          {/* Error */}
          {!sessionsLoading && sessionsError && (
            <div className="bg-surface border border-error/20 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center shrink-0">
                  <AlertCircle size={20} className="text-error" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary mb-1">Could not load sessions</p>
                  <p className="text-xs text-text-secondary mb-3">{sessionsError}</p>
                  <button onClick={() => handleLoadSessions(false)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-db-red bg-db-red-50 border border-db-red/20 rounded-lg hover:bg-db-red/10 transition-smooth">
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* No sessions found */}
          {!sessionsLoading && sessionsLoaded && sessions.length === 0 && !sessionsError && (
            <div className="bg-surface border border-border rounded-xl p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-bg-subtle flex items-center justify-center mx-auto mb-4">
                <FileText size={24} className="text-text-tertiary" />
              </div>
              <p className="text-sm font-semibold text-text-primary">No sessions yet</p>
              <p className="text-xs text-text-tertiary mt-1.5 max-w-xs mx-auto">
                Start the Inspire AI pipeline from Get Started to discover use cases from your data.
              </p>
            </div>
          )}

            {/* Session list (button-style) */}
            {sessions.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-[0.18em] block">
                  Sessions ({sessions.length})
                </label>
                {sessions.map((s) => {
                  const selected =
                    String(selectedSessionId) === String(s.session_id);
                  const isDone = s.completed_percent >= 100;
                  return (
                    <button
                      key={s.session_id}
                      onClick={() => {
                        setSelectedSessionId(s.session_id);
                        loadResults(s.session_id);
                      }}
                      className={`
                        w-full text-left p-3.5 rounded-lg border transition-smooth flex items-center justify-between
                        ${
                          selected
                            ? 'bg-db-red-50 border-db-red/20 glow-active'
                            : 'bg-surface border-border hover:border-border-strong glow-hover'
                        }
                      `}
                    >
                      <div>
                        <span className="text-sm font-semibold text-text-primary">
                          {s.widget_values?.business ||
                            s.widget_values?.['00_business_name'] ||
                            'Session'}
                        </span>
                        <div className="text-[10px] text-text-tertiary flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar size={9} />{' '}
                            {formatSessionDate(s.create_at)}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] px-2.5 py-1 rounded-full font-semibold border tabular-nums ${
                          isDone
                            ? 'bg-success-bg text-success border-success/20'
                            : 'bg-warning-bg text-warning border-warning/20'
                        }`}
                      >
                        {isDone
                          ? 'Complete'
                          : `${Math.round(s.completed_percent)}% — Preview`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
        </div>
      )}

      {/* Loading results — skeleton with progress message */}
      {loading && (
        <div className="space-y-6">
          {/* Loading header */}
          <div className="flex items-center gap-3 px-1">
            <div className="w-8 h-8 rounded-lg bg-db-red/10 flex items-center justify-center">
              <Loader2 size={16} className="animate-spin text-db-red" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Analyzing results...</p>
              <p className="text-xs text-text-tertiary">Hydrating use cases, domains, and scores</p>
            </div>
          </div>

          {/* Skeleton KPI cards */}
          <SkeletonStats count={3} />

          {/* Skeleton charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border p-5 space-y-3">
              <div className="skeleton h-3 w-32 rounded" />
              <div className="skeleton rounded-lg h-[220px]" />
            </div>
            <div className="rounded-xl border border-border p-5 space-y-3">
              <div className="skeleton h-3 w-40 rounded" />
              <div className="skeleton rounded-lg h-[220px]" />
            </div>
          </div>

          {/* Skeleton use case cards */}
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-error-bg border border-error/20 rounded-lg mb-6">
          <AlertCircle size={14} className="text-error shrink-0" />
          <span className="text-sm text-error">{error}</span>
        </div>
      )}

      {/* ═══ Results content ═══ */}
      {results && (
        <>
          {/* Progressive results banner */}
          {isProgressive && (
            <div className="flex items-center gap-3 p-3 bg-warning-bg border border-warning/20 rounded-lg mb-3">
              <Loader2 size={14} className="animate-spin text-warning shrink-0" />
              <div className="flex-1">
                <span className="text-sm font-semibold text-warning">Live Preview</span>
                <span className="text-xs text-text-secondary ml-2">
                  Showing {allUseCases.length} use cases from {results._step_count || 0} completed steps.
                  Results will be enriched as the pipeline progresses.
                </span>
              </div>
              <button
                onClick={() => loadResults(selectedSessionId)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-warning border border-warning/30 rounded-md hover:bg-warning/10 transition-smooth"
              >
                <RefreshCw size={11} />
                Refresh
              </button>
            </div>
          )}

          {/* Executive summary — kept compact so it fits in the first viewport */}
          <div
            id="executive-summary"
            className="bg-surface border border-border/70 rounded-xl overflow-hidden mb-4 shadow-elevated scroll-mt-20"
          >
            <div className="flex items-center gap-2 border-b border-border bg-gradient-to-r from-db-red-50/90 to-surface px-4 py-3 sm:px-6">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-db-red/10 ring-1 ring-inset ring-db-red/20">
                <FileText size={12} className="text-db-red" strokeWidth={2} />
              </div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-db-red/80">
                Executive summary
              </h2>
            </div>
            <div className="px-4 py-4 sm:px-6 sm:py-4">
              {(() => {
                const execRaw = inspireResultsTextField(results?.executive_summary);
                if (!execRaw.trim()) return null;
                return (
                  <p className="text-sm leading-relaxed text-text-secondary sm:text-base whitespace-pre-wrap">
                    {displayCleanText(execRaw)}
                  </p>
                );
              })()}
              {(() => {
                const domRaw = inspireResultsTextField(results?.domains_summary);
                if (!domRaw.trim()) return null;
                return (
                  <details className="mt-3 border-t border-border pt-3 group">
                    <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.18em] text-text-tertiary transition-colors hover:text-db-red [&::-webkit-details-marker]:hidden flex items-center gap-1.5">
                      <ChevronRight
                        size={14}
                        className="shrink-0 text-text-tertiary transition-transform duration-200 group-open:rotate-90"
                        aria-hidden
                      />
                      Domain overview
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-text-tertiary">
                      {displayCleanText(domRaw)}
                    </p>
                  </details>
                );
              })()}
            </div>
          </div>

          {/* ═══ Execution Summary Banner ═══ */}
          {!isProgressive && (
            <div className="bg-surface border border-border/70 rounded-xl overflow-hidden mb-4 shadow-elevated">
              <div className="px-4 py-3 sm:px-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 ring-1 ring-inset ring-success/20">
                      <CheckCircle2 size={14} className="text-success" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-text-primary tracking-tight">Execution Complete</h3>
                      <p className="text-[10px] text-text-tertiary">
                        {displayCleanText(
                          typeof results.title === 'string' ? results.title : 'Pipeline finished successfully'
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-text-primary tabular-nums tracking-tight">{allUseCases.length}</div>
                      <div className="text-[9px] text-text-tertiary uppercase tracking-[0.18em] font-semibold">Use Cases</div>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div className="text-center">
                      <div className="text-lg font-bold text-text-primary tabular-nums tracking-tight">{domains.length}</div>
                      <div className="text-[9px] text-text-tertiary uppercase tracking-[0.18em] font-semibold">Domains</div>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div className="text-center">
                      <div className="text-lg font-bold text-db-red tabular-nums tracking-tight">{highPriorityCount}</div>
                      <div className="text-[9px] text-text-tertiary uppercase tracking-[0.18em] font-semibold">High Priority</div>
                    </div>
                  </div>
                </div>
                {/* Pipeline stages row */}
                <div className="flex items-center gap-1 pt-2 border-t border-border overflow-x-auto">
                  {PIPELINE_STAGES.map((stage, i) => (
                    <div key={stage} className="flex items-center shrink-0">
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-success-bg">
                        <CheckCircle2 size={11} className="text-success shrink-0" />
                        <span className="text-[10px] font-medium text-success whitespace-nowrap">{stage}</span>
                      </div>
                      {i < PIPELINE_STAGES.length - 1 && (
                        <span className="text-text-tertiary text-[10px] mx-1 shrink-0">&rarr;</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Artifacts Panel (feature 7) */}
          {!isProgressive && generationPath && (() => {
            // Recursive file tree renderer
            const renderFileTree = (files, depth = 0) => (
              <div className={depth > 0 ? 'ml-4 border-l border-border/50 pl-2' : ''}>
                {files.map((f) => {
                  const isDir = f.is_directory;
                  const isOpen = expandedFolders[f.path];
                  const folderData = artifactTree[f.path];
                  return (
                    <div key={f.path}>
                      <div
                        className={`flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-bg-subtle transition-smooth ${isDir ? 'cursor-pointer' : ''}`}
                        onClick={isDir ? () => toggleFolder(f.path) : undefined}
                      >
                        {isDir ? (
                          <>
                            <ChevronRight size={10} className={`text-text-tertiary transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
                            <FolderOpen size={12} className="text-warning shrink-0" />
                          </>
                        ) : (
                          <>
                            <span className="w-[10px]" />
                            <FileText size={12} className="text-text-tertiary shrink-0" />
                          </>
                        )}
                        <span className="text-xs text-text-primary font-mono truncate flex-1">{f.name}</span>
                        {f.file_size > 0 && (
                          <span className="text-[9px] text-text-tertiary">
                            {f.file_size >= 1024 * 1024
                              ? `${(f.file_size / (1024 * 1024)).toFixed(1)}MB`
                              : `${(f.file_size / 1024).toFixed(0)}KB`}
                          </span>
                        )}
                        {!isDir && (() => {
                          const ext = (f.name || '').toLowerCase().split('.').pop();
                          const isPdf = ext === 'pdf';
                          const isSpreadsheet = ext === 'csv' || ext === 'xlsx' || ext === 'xls';
                          const isPreviewable = isPdf || isSpreadsheet;
                          return (
                            <div className="flex items-center gap-2 shrink-0">
                              {isPreviewable && (
                                <button
                                  type="button"
                                  className="text-[10px] text-info hover:underline font-medium flex items-center gap-0.5"
                                  onClick={(e) => { e.stopPropagation(); togglePreview(f.path, f.name); }}
                                >
                                  {previewFile === f.path ? <><Eye size={10} /> Hide</> : <><Eye size={10} /> Preview</>}
                                </button>
                              )}
                              {(isPdf || isSpreadsheet) && (
                                <button
                                  type="button"
                                  className="text-[10px] text-success hover:underline font-medium flex items-center gap-0.5"
                                  onClick={(e) => { e.stopPropagation(); openFileInTab(f.path, f.name); }}
                                >
                                  <ExternalLink size={10} /> Open
                                </button>
                              )}
                              <button
                                type="button"
                                className="text-[10px] text-db-red hover:underline font-medium flex items-center gap-0.5"
                                onClick={(e) => { e.stopPropagation(); downloadFile(f.path, f.name); }}
                              >
                                <Download size={10} /> Download
                              </button>
                            </div>
                          );
                        })()}
                        {isDir && (
                          <button
                            type="button"
                            className="text-[10px] text-info hover:underline font-medium flex items-center gap-0.5 shrink-0"
                            onClick={(e) => { e.stopPropagation(); downloadFile(f.path, `${f.name}.zip`); }}
                            title="Download folder"
                          >
                            <Download size={10} />
                          </button>
                        )}
                      </div>
                      {/* Inline file preview */}
                      {!isDir && previewFile === f.path && (
                        <div className="ml-6 mr-2 my-2">
                          {previewLoading && (
                            <div className="flex items-center gap-2 py-4 justify-center">
                              <Loader2 size={12} className="animate-spin text-text-tertiary" />
                              <span className="text-[10px] text-text-secondary">Loading preview...</span>
                            </div>
                          )}
                          {previewData?.type === 'pdf' && (
                            <iframe src={previewData.url} className="w-full h-[500px] rounded-lg border border-border" title="PDF Preview" />
                          )}
                          {previewData?.type === 'csv' && (
                            <div className="rounded-xl border border-border overflow-hidden shadow-sm">
                              {/* Table header bar */}
                              <div className="flex items-center justify-between px-4 py-2 bg-bg-subtle border-b border-border">
                                <span className="text-[10px] font-semibold text-text-secondary">{previewData.headers.length} columns · {previewData.totalRows} rows</span>
                                <span className="text-[9px] text-text-tertiary">Showing first {Math.min(50, previewData.totalRows)}</span>
                              </div>
                              <div className="max-h-[400px] overflow-auto">
                                <table className="w-full border-collapse">
                                  <thead className="sticky top-0 z-10">
                                    <tr className="bg-bg-subtle">
                                      <th className="px-3 py-2 text-[9px] text-text-tertiary font-mono text-right border-b border-r border-border w-8">#</th>
                                      {previewData.headers.map((h, i) => (
                                        <th key={i} className="px-3 py-2 text-left text-[10px] text-text-primary font-semibold border-b border-border whitespace-nowrap">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {previewData.rows.map((row, ri) => (
                                      <tr key={ri} className={`${ri % 2 === 0 ? 'bg-surface' : 'bg-bg-subtle/30'} hover:bg-db-red-50/30 transition-colors`}>
                                        <td className="px-3 py-1.5 text-[9px] text-text-tertiary font-mono text-right border-r border-border/50 w-8">{ri + 1}</td>
                                        {row.map((cell, ci) => (
                                          <td
                                            key={ci}
                                            className={`px-3 py-1.5 text-[11px] text-text-primary border-b border-border/30 ${expandedCells[`${ri}-${ci}`] ? 'whitespace-normal break-words' : 'whitespace-nowrap max-w-[250px] truncate'} ${cell.length > 30 ? 'cursor-pointer hover:bg-db-red-50/20' : ''}`}
                                            onClick={cell.length > 30 ? () => setExpandedCells(prev => ({ ...prev, [`${ri}-${ci}`]: !prev[`${ri}-${ci}`] })) : undefined}
                                            title={cell.length > 30 && !expandedCells[`${ri}-${ci}`] ? 'Click to expand' : undefined}
                                          >{cell}</td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {previewData.totalRows > 50 && (
                                <div className="flex items-center justify-center gap-2 py-2.5 bg-bg-subtle border-t border-border text-[10px] text-text-tertiary">
                                  <span>Showing 50 of {previewData.totalRows} rows</span>
                                  <span className="text-text-disabled">·</span>
                                  <span>Download for full data</span>
                                </div>
                              )}
                            </div>
                          )}
                          {previewData?.type === 'error' && (
                            <p className="text-[10px] text-error py-2">{previewData.message}</p>
                          )}
                        </div>
                      )}
                      {isDir && isOpen && (
                        <div>
                          {folderData?.loading && (
                            <div className="flex items-center gap-2 py-2 ml-6">
                              <Loader2 size={10} className="animate-spin text-text-tertiary" />
                              <span className="text-[10px] text-text-secondary">Loading...</span>
                            </div>
                          )}
                          {folderData?.error && (
                            <div className="ml-6 py-1">
                              <span className="text-[10px] text-text-tertiary">{folderData.error}</span>
                              <button type="button" onClick={(e) => { e.stopPropagation(); loadFolder(f.path); }} className="ml-2 text-[10px] text-db-red hover:underline">Retry</button>
                            </div>
                          )}
                          {folderData && !folderData.loading && !folderData.error && folderData.files.length === 0 && (
                            <div className="ml-6 py-1">
                              <span className="text-[10px] text-text-tertiary italic">Empty folder</span>
                            </div>
                          )}
                          {folderData && !folderData.loading && folderData.files.length > 0 && renderFileTree(folderData.files, depth + 1)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );

            return (
              <div className="bg-surface border border-border/70 rounded-xl overflow-hidden mb-6 shadow-elevated">
                <button
                  type="button"
                  onClick={() => {
                    const next = !artifactsExpanded;
                    setArtifactsExpanded(next);
                    if (next && !artifactsRootFiles && !artifactsLoading) loadArtifacts(generationPath);
                  }}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-bg-subtle/50 transition-smooth"
                >
                  <div className="w-7 h-7 rounded-lg bg-info/10 flex items-center justify-center">
                    <FolderOpen size={14} className="text-info" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xs font-bold text-text-primary">Generated Artifacts</h3>
                    <p className="text-[10px] text-text-tertiary font-mono">{generationPath}</p>
                  </div>
                  {artifactsRootFiles && artifactsRootFiles.length > 0 && (
                    <span className="text-[10px] text-info font-semibold bg-info-bg px-2 py-0.5 rounded-full">
                      {artifactsRootFiles.length} item{artifactsRootFiles.length > 1 ? 's' : ''}
                    </span>
                  )}
                  <div className={`transition-transform duration-200 ${artifactsExpanded ? 'rotate-90' : ''}`}>
                    <ChevronRight size={14} className="text-text-tertiary" />
                  </div>
                </button>
                {artifactsExpanded && (
                  <div className="border-t border-border px-5 py-3">
                    {artifactsLoading && (
                      <div className="flex items-center gap-2 py-4 justify-center">
                        <Loader2 size={14} className="animate-spin text-text-tertiary" />
                        <span className="text-xs text-text-secondary">Loading files...</span>
                      </div>
                    )}
                    {!artifactsLoading && artifactsRootFiles && artifactsRootFiles.length === 0 && (
                      <div className="text-center py-4">
                        <p className="text-xs text-text-tertiary">No files found at this path.</p>
                        <p className="text-[10px] text-text-tertiary mt-1 max-w-lg mx-auto leading-relaxed">
                          Resolved folder <span className="font-mono break-all">{generationPath}</span>
                          {settingsNotebookPath ? (
                            <>
                              {' '}
                              (notebook <span className="font-mono break-all">{settingsNotebookPath}</span> in Settings — use{' '}
                              <span className="font-mono">/Workspace/Shared/…</span> if relative <span className="font-mono">./../demos/</span> should sit next to Shared).
                            </>
                          ) : (
                            <> — set the Inspire notebook path in Workspace settings so relative <span className="font-mono">11_generation_path</span> resolves correctly.</>
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            lastArtifactsLoadKeyRef.current = '';
                            loadArtifacts(generationPath);
                          }}
                          className="mt-2 text-[10px] text-db-red hover:underline font-medium"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    {artifactsRootFiles && artifactsRootFiles.length > 0 && (
                      <div className="max-h-80 overflow-y-auto">
                        {renderFileTree(artifactsRootFiles)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Quick Access — always visible, PDF/Excel/CSV files from artifacts */}
          {(() => {
            const previewableFiles = [];
            const collect = (files) => {
              if (!files) return;
              for (const f of files) {
                if (f.is_directory) {
                  const sub = artifactTree[f.path];
                  if (sub?.files) collect(sub.files);
                } else {
                  const ext = (f.name || '').toLowerCase().split('.').pop();
                  if (['pdf', 'csv', 'xlsx', 'xls'].includes(ext)) previewableFiles.push(f);
                }
              }
            };
            collect(artifactsRootFiles);
            if (previewableFiles.length === 0) return null;

            const EXT_STYLES = {
              pdf:  { bg: 'bg-error-bg', text: 'text-error' },
              csv:  { bg: 'bg-success-bg', text: 'text-success' },
              xlsx: { bg: 'bg-info-bg', text: 'text-info' },
              xls:  { bg: 'bg-info-bg', text: 'text-info' },
            };

            return (
              <div className="bg-surface border border-border/70 rounded-xl p-4 mb-6 shadow-elevated">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-db-red/10 ring-1 ring-inset ring-db-red/20">
                    <FileText size={12} className="text-db-red" strokeWidth={2} />
                  </div>
                  <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.18em]">Quick Access — Documents & Data</h3>
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {previewableFiles.map((f) => {
                    const ext = (f.name || '').toLowerCase().split('.').pop();
                    const style = EXT_STYLES[ext] || EXT_STYLES.csv;
                    const isActive = previewFile === f.path;
                    return (
                      <div key={f.path} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] border transition-all shrink-0 ${isActive ? 'border-db-red/30 bg-db-red-50' : 'border-border bg-bg-subtle/50 hover:bg-bg-subtle'}`}>
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>{ext}</span>
                        <span className="text-text-primary font-medium truncate max-w-[200px]">{f.name}</span>
                        <div className="flex items-center gap-1.5 ml-1 border-l border-border pl-2">
                          <button type="button" className="text-[10px] text-info hover:text-info font-medium flex items-center gap-0.5 hover:underline" onClick={() => togglePreview(f.path, f.name)}>
                            {isActive ? <><EyeOff size={9} /> Hide</> : <><Eye size={9} /> Preview</>}
                          </button>
                          <button type="button" className="text-[10px] text-success font-medium flex items-center gap-0.5 hover:underline" onClick={() => openFileInTab(f.path, f.name)}>
                            <ExternalLink size={9} /> Open
                          </button>
                          <button type="button" className="text-[10px] text-db-red font-medium flex items-center gap-0.5 hover:underline" onClick={() => downloadFile(f.path, f.name)}>
                            <Download size={9} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Inline preview */}
                {previewFile && previewableFiles.some(f => f.path === previewFile) && (
                  <div className="mt-4">
                    {previewLoading && (
                      <div className="flex items-center gap-2 py-6 justify-center rounded-xl border border-border bg-bg-subtle/30">
                        <Loader2 size={14} className="animate-spin text-text-tertiary" />
                        <span className="text-xs text-text-secondary">Loading preview...</span>
                      </div>
                    )}
                    {previewData?.type === 'pdf' && (
                      <iframe src={previewData.url} className="w-full h-[600px] rounded-xl border border-border shadow-sm" title="PDF Preview" />
                    )}
                    {previewData?.type === 'csv' && (
                      <div className="rounded-xl border border-border overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between px-4 py-2 bg-bg-subtle border-b border-border">
                          <span className="text-[10px] font-semibold text-text-secondary">{previewData.headers.length} columns · {previewData.totalRows} rows</span>
                          <span className="text-[9px] text-text-tertiary">Showing first {Math.min(50, previewData.totalRows)}</span>
                        </div>
                        <div className="max-h-[400px] overflow-auto">
                          <table className="w-full border-collapse">
                            <thead className="sticky top-0 z-10">
                              <tr className="bg-bg-subtle">
                                <th className="px-3 py-2 text-[9px] text-text-tertiary font-mono text-right border-b border-r border-border w-8">#</th>
                                {previewData.headers.map((h, i) => (
                                  <th key={i} className="px-3 py-2 text-left text-[10px] text-text-primary font-semibold border-b border-border whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewData.rows.map((row, ri) => (
                                <tr key={ri} className={`${ri % 2 === 0 ? 'bg-surface' : 'bg-bg-subtle/30'} hover:bg-db-red-50/30 transition-colors`}>
                                  <td className="px-3 py-1.5 text-[9px] text-text-tertiary font-mono text-right border-r border-border/50 w-8">{ri + 1}</td>
                                  {row.map((cell, ci) => (
                                    <td key={ci} className="px-3 py-1.5 text-[11px] text-text-primary border-b border-border/30 whitespace-normal break-words max-w-[400px]">{cell}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {previewData.totalRows > 50 && (
                          <div className="flex items-center justify-center gap-2 py-2.5 bg-bg-subtle border-t border-border text-[10px] text-text-tertiary">
                            <span>Showing 50 of {previewData.totalRows} rows</span>
                            <span className="text-text-disabled">·</span>
                            <span>Download for full data</span>
                          </div>
                        )}
                      </div>
                    )}
                    {previewData?.type === 'error' && (
                      <p className="text-[10px] text-error py-2">{previewData.message}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Quick Access — .ipynb under artifacts whose use case has shipped Genie (not skeleton-only) */}
          {(() => {
            const notebookFiles = [];
            const collectNb = (files) => {
              if (!files) return;
              for (const f of files) {
                if (f.is_directory) {
                  const sub = artifactTree[f.path];
                  if (sub?.files) collectNb(sub.files);
                } else if ((f.name || '').toLowerCase().endsWith('.ipynb')) {
                  const uc = findUcForNotebookFilename(f.name, allUseCases);
                  if (uc && useCaseHasShippedGenieCode(uc)) notebookFiles.push(f);
                }
              }
            };
            collectNb(artifactsRootFiles);
            if (notebookFiles.length === 0) return null;
            const base = databricksHost
              ? databricksHost.replace(/\/+$/, '').replace(/^http:\/\//i, 'https://')
              : '';
            const origin = base && (base.startsWith('http') ? base : `https://${base}`);
            return (
              <div className="bg-surface border border-border/70 rounded-xl p-4 mb-6 shadow-elevated overflow-hidden">
                <button
                  type="button"
                  onClick={() => setGenieQuickAccessExpanded((o) => !o)}
                  aria-expanded={genieQuickAccessExpanded}
                  aria-controls="genie-quick-access-list"
                  id="genie-quick-access-toggle"
                  className="flex w-full items-center justify-between gap-3 rounded-lg text-left outline-none transition-smooth hover:bg-bg-subtle/80 focus-visible:ring-2 focus-visible:ring-db-red/25 -mx-1 px-1 py-0.5"
                >
                  <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.18em] flex items-center gap-2 min-w-0">
                    <Sparkles size={12} className="text-db-red shrink-0" aria-hidden />
                    <span className="truncate">Quick Access — Genie instructions ready</span>
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono font-semibold text-text-tertiary tabular-nums px-2 py-0.5 rounded-md bg-bg-subtle border border-border">
                      {notebookFiles.length}
                    </span>
                    <ChevronRight
                      size={16}
                      className={`text-text-tertiary transition-transform duration-200 ${genieQuickAccessExpanded ? 'rotate-90' : ''}`}
                      aria-hidden
                    />
                  </div>
                </button>
                {genieQuickAccessExpanded && (
                  <>
                    {!origin && (
                      <p className="text-[10px] text-text-tertiary mt-2 mb-2">
                        Add your Databricks workspace URL in settings to open notebooks in the Workspace UI.
                      </p>
                    )}
                    <div
                      id="genie-quick-access-list"
                      role="region"
                      aria-labelledby="genie-quick-access-toggle"
                      className={`rounded-xl border border-border/80 bg-linear-to-b from-bg-subtle/40 to-surface max-h-[min(42vh,340px)] overflow-y-auto overscroll-y-contain scroll-smooth shadow-inner [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border-strong/80 [&::-webkit-scrollbar-track]:bg-transparent ${origin ? 'mt-2' : ''}`}
                    >
                      <ul className="divide-y divide-border/70">
                        {notebookFiles.map((f) => {
                          const hashPath = workspaceWebUiHashPath(f.path);
                          const pathSeg = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
                          const href = origin ? `${origin}/#workspace${pathSeg}` : '';
                          const rowClass =
                            'flex items-center gap-2.5 px-3 py-2.5 min-h-[2.75rem] text-left text-[11px] text-text-primary font-medium transition-colors hover:bg-db-red-50/40 dark:hover:bg-db-red-950/20';
                          if (href) {
                            return (
                              <li key={f.path} className="min-w-0">
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`${rowClass} group`}
                                  title={f.path}
                                >
                                  <ExternalLink
                                    size={12}
                                    className="shrink-0 text-db-red opacity-80 group-hover:opacity-100"
                                    aria-hidden
                                  />
                                  <span className="truncate min-w-0 leading-snug">{f.name}</span>
                                </a>
                              </li>
                            );
                          }
                          return (
                            <li key={f.path} className={`${rowClass} cursor-default text-text-secondary`} title={f.path}>
                              <FileText size={12} className="shrink-0 text-text-tertiary" aria-hidden />
                              <span className="truncate min-w-0 leading-snug">{f.name}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Celebration on first load */}
          <Celebration trigger={allUseCases.length > 0 && !isProgressive} />

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <StatCard label="Domains" value={results.domains?.length || domains.length} icon={Building2} />
            <StatCard label="Use Cases" value={allUseCases.length} icon={FileText} />
            <StatCard
              label="High Priority"
              value={highPriorityCount}
              icon={Target}
            />
            <StatCard label="Techniques" value={techniqueCount} icon={Wrench} />
            <StatCard label="Subdomains" value={uniqueSubdomainCount} icon={LayoutGrid} />
            <StatCard
              label="Avg Inspire score"
              value={0}
              icon={Sparkles}
              renderValue={avgInspireScore != null ? avgInspireScore.toFixed(1) : '—'}
            />
          </div>


          {/* ═══ Two-Column: sticky sidebar rail; use-case list scrolls independently in the right column ═══ */}
          <div className="flex items-stretch gap-5 min-h-0">
            {/* ── Left Sidebar: stays fixed in viewport while the card list scrolls (sticky + max height) ── */}
            <div
              className={`sticky z-10 flex w-56 shrink-0 flex-col gap-3 self-start overflow-y-auto overscroll-y-contain pr-1 [-webkit-overflow-scrolling:touch] min-h-0 ${
                embedded
                  ? 'top-4 max-h-[min(32rem,72vh)]'
                  : 'top-20 max-h-[calc(100dvh-5rem)]'
              }`}
            >
              <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                <button
                  type="button"
                  onClick={() => setDomainPanelOpen((o) => !o)}
                  className="flex w-full shrink-0 items-start gap-2 border-b border-border bg-gradient-to-b from-db-red-50 to-surface px-3 py-3 text-left transition-smooth hover:from-db-red-50/80"
                >
                  <ChevronRight
                    size={14}
                    className={`mt-0.5 shrink-0 text-text-tertiary transition-transform duration-200 ${domainPanelOpen ? 'rotate-90' : ''}`}
                  />
                  <Layers size={14} className="mt-0.5 shrink-0 text-db-red" />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-text-primary">Domains</span>
                    <p className="text-[10px] text-text-tertiary mt-0.5">
                      {domains.length} domain{domains.length !== 1 ? 's' : ''} &middot; {allUseCases.length} use cases
                    </p>
                    {!domainPanelOpen && (filterDomain !== 'all' || filterSubdomain !== 'all') && (
                      <p
                        className="mt-1 truncate text-[10px] font-medium text-db-red"
                        title={filterSubdomain !== 'all' ? `${filterDomain} › ${filterSubdomain}` : filterDomain}
                      >
                        Filter:{' '}
                        {filterSubdomain !== 'all'
                          ? `${filterDomain} › ${filterSubdomain}`
                          : filterDomain}
                      </p>
                    )}
                  </div>
                </button>

                {/* Domain list — shown when panel expanded */}
                {domainPanelOpen && (
                <div className="p-1.5 space-y-0.5">
                  {/* All domains */}
                  <button
                    onClick={() => setFilterDomain('all')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-smooth ${
                      filterDomain === 'all'
                        ? 'bg-db-red-50 border border-db-red/20'
                        : 'hover:bg-bg-subtle border border-transparent'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      filterDomain === 'all' ? 'bg-db-red/10' : 'bg-bg-subtle'
                    }`}>
                      <Layers size={10} className={filterDomain === 'all' ? 'text-db-red' : 'text-text-tertiary'} />
                    </div>
                    <span className={`text-[11px] font-semibold flex-1 ${
                      filterDomain === 'all' ? 'text-db-red' : 'text-text-primary'
                    }`}>
                      All Domains
                    </span>
                    <span className={`text-[10px] font-mono tabular-nums ${filterDomain === 'all' ? 'text-db-red' : 'text-text-tertiary'}`}>
                      {allUseCases.length}
                    </span>
                  </button>

                  {/* Individual domains with expandable subdomains */}
                  {domains.map((d) => {
                    const count = domainCounts[d] || 0;
                    const active = filterDomain === d;
                    const highPriCount = allUseCases.filter(
                      (uc) => uc._domain === d && ['Ultra High', 'Very High', 'High'].includes(String(uc?.Priority || ''))
                    ).length;
                    const subs = subdomainsByDomain[d] || {};
                    const hasSubs = Object.keys(subs).length > 0;
                    const isExpanded = !!expandedDomains[d];

                    return (
                      <div key={d}>
                        <div className="flex items-center">
                          {hasSubs && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedDomains(prev => ({ ...prev, [d]: !prev[d] })); }}
                              className="p-0.5 mr-0.5 rounded hover:bg-bg-subtle transition-smooth"
                            >
                              <ChevronRight size={10} className={`text-text-tertiary transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>
                          )}
                          <button
                            onClick={() => { setFilterDomain(active ? 'all' : d); setFilterSubdomain('all'); }}
                            className={`flex-1 flex items-start gap-2 px-2 py-2 rounded-lg text-left transition-smooth ${
                              active
                                ? 'bg-db-red-50 border border-db-red/20'
                                : 'hover:bg-bg-subtle border border-transparent'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                              active ? 'bg-db-red/10' : 'bg-bg-subtle'
                            }`}>
                              <Building2 size={10} className={active ? 'text-db-red' : 'text-text-tertiary'} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className={`text-[11px] font-semibold block truncate ${
                                active ? 'text-db-red' : 'text-text-primary'
                              }`}>
                                {d}
                              </span>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] text-text-tertiary font-mono tabular-nums">{count} use case{count !== 1 ? 's' : ''}</span>
                                {highPriCount > 0 && (
                                  <span className="text-[9px] text-db-red font-medium">{highPriCount} high pri</span>
                                )}
                              </div>
                            </div>
                          </button>
                        </div>
                        {/* Subdomain list */}
                        {isExpanded && hasSubs && (
                          <div className="ml-7 mt-0.5 space-y-0.5">
                            {Object.entries(subs).map(([sd, sdCount]) => {
                              const sdActive = filterSubdomain === sd && filterDomain === d;
                              return (
                                <button
                                  key={sd}
                                  onClick={() => {
                                    setFilterDomain(d);
                                    setFilterSubdomain(sdActive ? 'all' : sd);
                                  }}
                                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-smooth ${
                                    sdActive
                                      ? 'bg-db-red-50/70 text-db-red'
                                      : 'text-text-secondary hover:bg-bg-subtle'
                                  }`}
                                >
                                  <span className={`text-[10px] font-medium truncate flex-1 ${sdActive ? 'text-db-red' : ''}`}>{sd}</span>
                                  <span className={`text-[9px] font-mono ${sdActive ? 'text-db-red' : 'text-text-tertiary'}`}>{sdCount}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                )}
              </div>

              {beneficiaries.length > 0 && (
                <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                  <button
                    type="button"
                    onClick={() => setBeneficiaryPanelOpen((o) => !o)}
                    className="flex w-full shrink-0 items-start gap-2 border-b border-border bg-gradient-to-b from-db-red-50 to-surface px-3 py-3 text-left transition-smooth hover:from-db-red-50/80"
                  >
                    <ChevronRight
                      size={14}
                      className={`mt-0.5 shrink-0 text-text-tertiary transition-transform duration-200 ${beneficiaryPanelOpen ? 'rotate-90' : ''}`}
                    />
                    <Users size={14} className="mt-0.5 shrink-0 text-db-red" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-text-primary">Beneficiaries</span>
                      <p className="text-[10px] text-text-tertiary mt-0.5">
                        {beneficiaries.length} role{beneficiaries.length !== 1 ? 's' : ''} &middot; who benefits
                      </p>
                      {!beneficiaryPanelOpen && filterBeneficiary !== 'all' && (
                        <p className="mt-1 truncate text-[10px] font-medium text-db-red" title={filterBeneficiary}>
                          Filter: {filterBeneficiary}
                        </p>
                      )}
                    </div>
                  </button>
                  {beneficiaryPanelOpen && (
                  <div className="p-1.5 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => setFilterBeneficiary('all')}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-smooth ${
                        filterBeneficiary === 'all'
                          ? 'bg-db-red-50 border border-db-red/20'
                          : 'hover:bg-bg-subtle border border-transparent'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        filterBeneficiary === 'all' ? 'bg-db-red/10' : 'bg-bg-subtle'
                      }`}>
                        <Users size={10} className={filterBeneficiary === 'all' ? 'text-db-red' : 'text-text-tertiary'} />
                      </div>
                      <span className={`text-[11px] font-semibold flex-1 truncate ${
                        filterBeneficiary === 'all' ? 'text-db-red' : 'text-text-primary'
                      }`}>
                        All beneficiaries
                      </span>
                      <span className={`text-[10px] font-mono shrink-0 ${filterBeneficiary === 'all' ? 'text-db-red' : 'text-text-tertiary'}`}>
                        {allUseCases.filter((uc) => beneficiaryFromUc(uc)).length}
                      </span>
                    </button>
                    {beneficiaries.map((b) => {
                      const count = beneficiaryCounts[b] || 0;
                      const active = filterBeneficiary === b;
                      return (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setFilterBeneficiary(active ? 'all' : b)}
                          className={`w-full flex items-start gap-2 px-3 py-2 rounded-lg text-left transition-smooth ${
                            active
                              ? 'bg-db-red-50 border border-db-red/20'
                              : 'hover:bg-bg-subtle border border-transparent'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            active ? 'bg-db-red/10' : 'bg-bg-subtle'
                          }`}>
                            <Users size={10} className={active ? 'text-db-red' : 'text-text-tertiary'} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={`text-[11px] font-semibold block truncate ${active ? 'text-db-red' : 'text-text-primary'}`}>
                              {b}
                            </span>
                            <span className="text-[9px] text-text-tertiary font-mono mt-0.5 block">
                              {count} use case{count !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  )}
                </div>
              )}

              {sponsors.length > 0 && (
                <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                  <button
                    type="button"
                    onClick={() => setSponsorPanelOpen((o) => !o)}
                    className="flex w-full shrink-0 items-start gap-2 border-b border-border bg-gradient-to-b from-db-red-50 to-surface px-3 py-3 text-left transition-smooth hover:from-db-red-50/80"
                  >
                    <ChevronRight
                      size={14}
                      className={`mt-0.5 shrink-0 text-text-tertiary transition-transform duration-200 ${sponsorPanelOpen ? 'rotate-90' : ''}`}
                    />
                    <Crown size={14} className="mt-0.5 shrink-0 text-db-red" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-text-primary">Sponsors</span>
                      <p className="text-[10px] text-text-tertiary mt-0.5">
                        {sponsors.length} sponsor{sponsors.length !== 1 ? 's' : ''} &middot; executive / owner
                      </p>
                      {!sponsorPanelOpen && filterSponsor !== 'all' && (
                        <p className="mt-1 truncate text-[10px] font-medium text-db-red" title={filterSponsor}>
                          Filter: {filterSponsor}
                        </p>
                      )}
                    </div>
                  </button>
                  {sponsorPanelOpen && (
                  <div className="p-1.5 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => setFilterSponsor('all')}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-smooth ${
                        filterSponsor === 'all'
                          ? 'bg-db-red-50 border border-db-red/20'
                          : 'hover:bg-bg-subtle border border-transparent'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        filterSponsor === 'all' ? 'bg-db-red/10' : 'bg-bg-subtle'
                      }`}>
                        <Crown size={10} className={filterSponsor === 'all' ? 'text-db-red' : 'text-text-tertiary'} />
                      </div>
                      <span className={`text-[11px] font-semibold flex-1 truncate ${
                        filterSponsor === 'all' ? 'text-db-red' : 'text-text-primary'
                      }`}>
                        All sponsors
                      </span>
                      <span className={`text-[10px] font-mono shrink-0 ${filterSponsor === 'all' ? 'text-db-red' : 'text-text-tertiary'}`}>
                        {allUseCases.filter((uc) => sponsorFromUc(uc)).length}
                      </span>
                    </button>
                    {sponsors.map((sp) => {
                      const count = sponsorCounts[sp] || 0;
                      const active = filterSponsor === sp;
                      return (
                        <button
                          key={sp}
                          type="button"
                          onClick={() => setFilterSponsor(active ? 'all' : sp)}
                          className={`w-full flex items-start gap-2 px-3 py-2 rounded-lg text-left transition-smooth ${
                            active
                              ? 'bg-db-red-50 border border-db-red/20'
                              : 'hover:bg-bg-subtle border border-transparent'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            active ? 'bg-db-red/10' : 'bg-bg-subtle'
                          }`}>
                            <Crown size={10} className={active ? 'text-db-red' : 'text-text-tertiary'} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={`text-[11px] font-semibold block truncate ${active ? 'text-db-red' : 'text-text-primary'}`}>
                              {sp}
                            </span>
                            <span className="text-[9px] text-text-tertiary font-mono mt-0.5 block">
                              {count} use case{count !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Right Panel: filters stay put; use case cards scroll in a bounded pane ── */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
              {/* Filter toolbar */}
              <div className="mb-4 shrink-0 bg-surface border border-border/70 rounded-xl shadow-elevated overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
                  {/* Search */}
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search use cases..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs border border-border rounded-lg bg-bg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-db-red/30 focus:ring-1 focus:ring-db-red/20 transition-smooth"
                    />
                  </div>

                  {/* Favorites toggle */}
                  <button
                    type="button"
                    onClick={() => setShowFavoritesOnly(p => !p)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-smooth ${
                      showFavoritesOnly
                        ? 'bg-rose-50 text-rose-600 border-rose-200'
                        : 'bg-bg text-text-secondary border-border hover:border-border-strong'
                    }`}
                    title={showFavoritesOnly ? 'Show all use cases' : 'Show favorites only'}
                  >
                    <Heart size={13} className={showFavoritesOnly ? 'fill-rose-500 text-rose-600' : ''} />
                    {favoriteCount(favorites) > 0 && (
                      <span className="text-[10px]">{favoriteCount(favorites)}</span>
                    )}
                  </button>

                  {/* Priority pills */}
                  {priorities.length > 0 && (
                    <div className="flex items-center gap-1">
                      {PRIORITY_ORDER.filter((p) => priorities.includes(p)).map((p) => {
                        const active = filterPriority === p;
                        const cnt = allUseCases.filter((uc) => uc.Priority === p).length;
                        return (
                          <button
                            key={p}
                            onClick={() => setFilterPriority(active ? 'all' : p)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-smooth border ${
                              active
                                ? 'border-db-red/30 bg-db-red-50 text-db-red'
                                : 'border-transparent text-text-secondary hover:bg-bg-subtle'
                            }`}
                          >
                            {p.replace('Ultra ', 'U-').replace('Very ', 'V-')}
                            <span className={`font-mono ${active ? 'text-db-red' : 'text-text-tertiary'}`}>{cnt}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Type filter */}
                  {types.length > 0 && (
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="px-2 py-1.5 text-[11px] border border-border rounded-lg bg-bg text-text-primary focus:outline-none focus:border-db-red/30 transition-smooth"
                    >
                      <option value="all">All Types</option>
                      {types.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  )}

                  {/* Technique filter */}
                  {techniques.length > 0 && (
                    <select
                      value={filterTechnique}
                      onChange={(e) => setFilterTechnique(e.target.value)}
                      className="px-2 py-1.5 text-[11px] border border-border rounded-lg bg-bg text-text-primary focus:outline-none focus:border-db-red/30 transition-smooth"
                    >
                      <option value="all">All Techniques</option>
                      {techniques.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  )}

                  {/* Quality filter */}
                  {qualities.length > 0 && (
                    <select
                      value={filterQuality}
                      onChange={(e) => setFilterQuality(e.target.value)}
                      className="px-2 py-1.5 text-[11px] border border-border rounded-lg bg-bg text-text-primary focus:outline-none focus:border-db-red/30 transition-smooth"
                    >
                      <option value="all">All Quality</option>
                      {qualities.map((q) => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                  )}

                  {/* Genie instruction (has / no) */}
                  <select
                    value={filterHasGenie}
                    onChange={(e) => setFilterHasGenie(e.target.value)}
                    title="Filter by whether a Genie instruction exists on the use case"
                    className="px-2 py-1.5 text-[11px] border border-border rounded-lg bg-bg text-text-primary focus:outline-none focus:border-db-red/30 transition-smooth min-w-[10.5rem]"
                  >
                    <option value="all">Genie instruction: Any</option>
                    <option value="yes">Has Genie: Yes</option>
                    <option value="no">Has Genie: No</option>
                  </select>

                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-2 py-1.5 text-[11px] border border-border rounded-lg bg-bg text-text-primary focus:outline-none focus:border-db-red/30 transition-smooth"
                  >
                    <option value="inspire">Sort: Inspire score (high → low)</option>
                    <option value="priority">Sort: Priority tier</option>
                    <option value="domain">Sort: Domain</option>
                    <option value="name">Sort: Name</option>
                  </select>

                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="text-[11px] text-db-red hover:underline font-medium shrink-0"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Active filter chips */}
                {hasActiveFilters && (
                  <div className="px-4 py-2 bg-db-red-50/50 border-t border-border flex items-center gap-2 flex-wrap">
                    <Filter size={12} className="text-db-red shrink-0" />
                    <span className="text-[11px] text-text-secondary">
                      <span className="font-semibold text-text-primary tabular-nums">{filteredUseCases.length}</span> of{' '}
                      <span className="font-semibold text-text-primary tabular-nums">{allUseCases.length}</span> use cases
                    </span>
                    {filterDomain !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        {filterDomain}
                        <button onClick={() => { setFilterDomain('all'); setFilterSubdomain('all'); }} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {filterSubdomain !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        Sub: {filterSubdomain}
                        <button onClick={() => setFilterSubdomain('all')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {filterPriority !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        {filterPriority}
                        <button onClick={() => setFilterPriority('all')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {filterType !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        {filterType}
                        <button onClick={() => setFilterType('all')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {filterTechnique !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        {filterTechnique}
                        <button onClick={() => setFilterTechnique('all')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {filterQuality !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        Q: {filterQuality}
                        <button onClick={() => setFilterQuality('all')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {filterHasGenie !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        Genie: {filterHasGenie === 'yes' ? 'Yes' : 'No'}
                        <button type="button" onClick={() => setFilterHasGenie('all')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {searchQuery && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        "{searchQuery}"
                        <button onClick={() => setSearchQuery('')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Genie instruction regeneration: Delta flags + optional job (below filter toolbar); collapses when job succeeds */}
              {selectedSessionId && inspireDb && warehouseId && allUseCases.length > 0 && (() => {
                const genieInstrCollapsedSummary = (() => {
                  if (genieJobRunning) return 'Job starting… Expand to watch progress.';
                  const n = genieRegenSelectedIds.length;
                  if (genieJobLastRun?.run_id != null) {
                    const { key, label } = deriveGenieOverallStatus(genieJobProgress);
                    if (key === 'done') {
                      return `Last run finished · ${n} selected — expand to change flags or run again.`;
                    }
                    if (key === 'failed') {
                      return `Last run failed (${label}). Expand for details.`;
                    }
                    return `${label} — expand for status and Databricks link.`;
                  }
                  return `${n} selected — expand to sync flags and run the Genie notebook job.`;
                })();
                return (
                  <div className="mb-4 shrink-0 p-4 bg-gradient-to-br from-db-red-50 to-surface dark:from-db-red/10 dark:to-surface border border-db-red/20 rounded-xl shadow-elevated">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <div className="flex flex-col gap-3 min-[480px]:flex-row min-[480px]:items-start min-[480px]:justify-between">
                          <button
                            type="button"
                            onClick={() => setGenieInstructionsPanelExpanded((v) => !v)}
                            aria-expanded={genieInstructionsPanelExpanded}
                            id="genie-instructions-panel-toggle"
                            className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left outline-none transition-smooth hover:bg-white/30 dark:hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-db-red/25 -m-1 p-1"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-db-red/10 p-0.5 ring-1 ring-inset ring-db-red/20">
                              <DatabricksLogo className="h-7 w-7 object-contain" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-text-primary tracking-tight">Genie instructions</p>
                              {!genieInstructionsPanelExpanded && (
                                <p className="text-[11px] text-text-secondary mt-0.5 leading-snug line-clamp-2">
                                  {genieInstrCollapsedSummary}
                                </p>
                              )}
                            </div>
                            <ChevronRight
                              size={18}
                              className={`mt-0.5 shrink-0 text-text-tertiary transition-transform duration-200 min-[480px]:mt-1 ${
                                genieInstructionsPanelExpanded ? 'rotate-90' : ''
                              }`}
                              aria-hidden
                            />
                          </button>
                          {genieInstructionsPanelExpanded && (
                            <button
                              type="button"
                              disabled={
                                genieJobRunning ||
                                genieRegenSelectedIds.length === 0 ||
                                genieDeltaSyncPending ||
                                genieFlagSyncing
                              }
                              title={
                                genieDeltaSyncPending || genieFlagSyncing
                                  ? 'Wait until your checkbox selection is saved to Delta before running the job.'
                                  : undefined
                              }
                              onClick={() => void handleGenerateGenieJob()}
                              className="inline-flex w-full min-[480px]:w-auto shrink-0 items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-db-red hover:bg-db-red-hover shadow-sm shadow-db-red/20 disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none transition-smooth min-[480px]:self-start"
                            >
                              {genieJobRunning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                              Run Genie job
                            </button>
                          )}
                        </div>
                        {genieInstructionsPanelExpanded && (
                          <div className="min-w-0 space-y-2 border-t border-db-red/15 pt-3 sm:pl-0">
                            <p className="text-[11px] text-text-secondary leading-snug">
                              Check use cases to set <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-bg-subtle border border-border-subtle">generate_genie_code_instruction = Yes</span> in{' '}
                              <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-bg-subtle border border-border-subtle">__inspire_usecases</span> for this session (synced shortly after you change the selection). Then run the notebook job for only those rows.
                            </p>
                            <p className="text-[11px] text-text-tertiary flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-db-red/10 text-db-red font-semibold">
                                {genieRegenSelectedIds.length} selected
                              </span>
                              {genieFlagSyncing && (
                                <span className="inline-flex items-center gap-1 text-db-red">
                                  <Loader2 size={11} className="animate-spin" />
                                  Syncing to Delta…
                                </span>
                              )}
                              {genieDeltaSyncPending && !genieFlagSyncing && (
                                <span className="inline-flex items-center gap-1 text-text-secondary">
                                  <Loader2 size={11} className="animate-spin" />
                                  Saving selection…
                                </span>
                              )}
                            </p>
                            {(genieFlagSyncing || genieDeltaSyncPending) && (
                              <p className="text-[11px] text-text-secondary leading-snug max-w-xl">
                                <span className="font-semibold text-text-primary">Run Genie job</span> stays greyed out until this step finishes, so the notebook is launched with the same use-case flags you see here.
                              </p>
                            )}
                            {genieFlagSyncError && (
                              <p className="text-[11px] text-error">{genieFlagSyncError}</p>
                            )}
                            {genieJobError && (
                              <p className="text-[11px] text-error">{genieJobError}</p>
                            )}
                            {genieJobLastRun?.run_id != null && (() => {
                              const runHref =
                                genieJobLastRun.job_run_url ||
                                genieJobRunUrlFromHost(
                                  databricksHost,
                                  genieJobLastRun.job_id,
                                  genieJobLastRun.run_id,
                                );
                              const overall = deriveGenieOverallStatus(genieJobProgress);
                              const pct =
                                genieJobProgress && typeof genieJobProgress.percent === 'number'
                                  ? genieJobProgress.percent
                                  : null;
                              const cleared = genieJobProgress?.cleared;
                              const totalSel = genieJobProgress?.selected_total;
                              const waitingPoll = !genieJobProgress;
                              return (
                                <div className="mt-2 space-y-2 border-t border-db-red/15 pt-2">
                                  {runHref ? (
                                    <a
                                      href={runHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-db-red hover:underline"
                                    >
                                      <ExternalLink size={14} className="shrink-0" />
                                      Open this job run in Databricks
                                    </a>
                                  ) : (
                                    <p className="text-[11px] text-text-tertiary">
                                      Set Databricks host in setup to open the job in the workspace UI.
                                    </p>
                                  )}
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-[0.18em]">
                                      Overall
                                    </span>
                                    {waitingPoll && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-db-red">
                                        <Loader2 size={12} className="animate-spin" />
                                        In progress
                                      </span>
                                    )}
                                    {!waitingPoll && overall.key === 'running' && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-db-red">
                                        <Loader2 size={12} className="animate-spin" />
                                        {overall.label}
                                      </span>
                                    )}
                                    {!waitingPoll && overall.key === 'done' && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                                        <CheckCircle2 size={12} className="shrink-0" />
                                        {overall.label}
                                      </span>
                                    )}
                                    {!waitingPoll && overall.key === 'failed' && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-error">
                                        <XCircle size={12} className="shrink-0" />
                                        {overall.label}
                                      </span>
                                    )}
                                  </div>
                                  {overall.detail && !waitingPoll && (
                                    <p className="text-[10px] text-text-tertiary">{overall.detail}</p>
                                  )}
                                  {genieJobProgress?.poll_error && (
                                    <p className="text-[10px] text-error">{genieJobProgress.poll_error}</p>
                                  )}
                                  {pct != null && totalSel != null && totalSel > 0 && (
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-[10px] text-text-secondary">
                                        <span>
                                          Use cases with flag cleared:{' '}
                                          <span className="font-mono text-text-primary">
                                            {cleared ?? 0} / {totalSel}
                                          </span>
                                        </span>
                                        <span className="font-mono tabular-nums">{pct}%</span>
                                      </div>
                                      <div className="h-1.5 w-full rounded-full bg-db-red/15 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all duration-300 ${
                                            overall.key === 'failed'
                                              ? 'bg-error'
                                              : overall.key === 'done'
                                                ? 'bg-success'
                                                : 'bg-db-red'
                                          }`}
                                          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Use case cards — only this region scrolls; sidebar + filter bar stay visible */}
              <div
                className={`overflow-y-auto overscroll-y-contain scroll-smooth pr-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border-strong/70 [&::-webkit-scrollbar-track]:bg-transparent ${
                  embedded
                    ? 'h-[min(28rem,60vh)]'
                    : 'h-[min(calc(100dvh-12rem),56rem)]'
                }`}
                role="region"
                aria-label="Use case list"
              >
                {filteredUseCases.length > 0 ? (
                  <div className="space-y-3 pb-2">
                    {filteredUseCases.map((uc, idx) => {
                      const favKey = useCaseFavoriteKey(uc);
                      const tid = useCaseTrackingId(uc);
                      return (
                      <UseCaseCard
                        key={tid ? `genie-uc-${tid}` : favKey || String(uc.No ?? idx)}
                        uc={uc}
                        index={idx}
                        expanded={expandedUseCase === (uc.No || idx)}
                        onToggle={() =>
                          setExpandedUseCase(expandedUseCase === (uc.No || idx) ? null : uc.No || idx)
                        }
                        isFavorite={!!(favKey && favorites[favKey])}
                        onToggleFavorite={() => toggleFavorite(uc)}
                        genieRegenSelected={!!tid && genieRegenSelectedIds.includes(tid)}
                        onToggleGenieRegenSelect={
                          selectedSessionId && inspireDb && warehouseId && tid
                            ? (checked) => toggleGenieRegenForUc(tid, checked)
                            : undefined
                        }
                        resolveTable={resolveTable}
                        token={token}
                        databricksHost={databricksHost}
                        generationPath={generationPath}
                        allNotebookFiles={allNotebookFiles}
                      />
                      );
                    })}
                  </div>
                ) : allUseCases.length > 0 ? (
                  <div className="bg-surface border border-border/70 rounded-xl p-10 text-center shadow-elevated">
                    <Search size={20} className="text-text-tertiary mx-auto mb-3" />
                    <p className="text-sm text-text-secondary">No use cases match your filters.</p>
                    <button
                      onClick={clearAllFilters}
                      className="text-xs text-db-red hover:underline mt-2 font-medium"
                    >
                      Clear all filters
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ label, value, icon: Icon, renderValue }) {
  return (
    <GlassCard tilt className="p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-db-red/10 ring-1 ring-inset ring-db-red/15">
          <Icon size={11} className="text-db-red" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text-primary tabular-nums tracking-tight">
        {renderValue != null ? renderValue : <AnimatedCounter value={Number(value) || 0} />}
      </div>
    </GlassCard>
  );
}

/* ── Filter Select (glow style) ── */
function GlowFilterSelect({ value, onChange, options, label, isSort }) {
  return (
    <select
      className="px-2.5 py-2 text-sm border border-border rounded-md bg-surface text-text-primary glow-focus transition-smooth"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {isSort ? (
        options.map((o) => (
          <option key={o} value={o}>
            Sort: {o}
          </option>
        ))
      ) : (
        <>
          <option value="all">{label}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </>
      )}
    </select>
  );
}

/* ── Copy Button ── */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-smooth border ${
        copied
          ? 'bg-success-bg text-success border-success/20'
          : 'bg-bg text-text-tertiary border-border hover:text-text-secondary hover:border-border-strong'
      }`}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/* ── Use Case Card ── */
function UseCaseCard({
  uc,
  index,
  expanded,
  onToggle,
  isFavorite,
  onToggleFavorite,
  genieRegenSelected = false,
  onToggleGenieRegenSelect,
  resolveTable,
  token,
  databricksHost,
  generationPath,
  allNotebookFiles,
}) {
  const [notebookContent, setNotebookContent] = useState(null);
  const [notebookLoading, setNotebookLoading] = useState(false);
  const [notebookError, setNotebookError] = useState('');
  const [showNotebook, setShowNotebook] = useState(false);
  /** Avoid duplicate auto-fetch when expanding a card (Strict Mode / deps). */
  const pathPreviewStartedRef = useRef(false);
  /** Safe object for hooks + render when parent omits uc (keeps hook order valid). */
  const card = uc && typeof uc === 'object' ? uc : null;
  const u = card || {};

  const s = (v) => (v == null ? '' : String(v));      // safe-string helper
  const stripHtml = (v) => (v == null ? '' : String(v).replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim());

  const title =
    s(u.Name) || s(u.use_case_name) || s(u.name) || s(u.title) || `Use Case ${index + 1}`;
  const titlePlain = displayCleanText(stripHtml(title));
  const descCandidate = displayCleanText(
    stripHtml(s(u.description || u.Description || u.usecase || u.use_case || ''))
  );
  const shortCandidate = displayCleanText(stripHtml(s(u.short_name || u.shortName || '')));
  let subtitleText = '';
  if (descCandidate && descCandidate !== titlePlain) subtitleText = descCandidate;
  else if (shortCandidate && shortCandidate !== titlePlain) subtitleText = shortCandidate;

  const statement = stripHtml(u.Statement || u.description || u.problem_statement);
  const domain = s(u._domain || u['Business Domain'] || u.domain);
  const subdomain = s(u.Subdomain);
  const ucType = s(u.type);
  const technique = s(u['Analytics Technique']);
  const priority = s(u.Priority || u.priority);
  const solution = stripHtml(u.Solution || u.solution);
  const businessValue = stripHtml(u['Business Value'] || u.business_impact);
  const beneficiary = s(u.Beneficiary);
  const sponsor = s(u.Sponsor);
  const alignment = s(u['Business Priority Alignment']);
  const rawSql = u.SQL || u.sql || u.sql_query || '';
  const sql = typeof rawSql === 'string' ? rawSql : String(rawSql);
  const resultTable = s(u.result_table);
  const technicalDesign = stripHtml(u['Technical Design']);
  const tablesInvolved = s(u['Tables Involved']);
  const storedNotebookPath = s(u.notebook_path);
  const genieInstruction = s(u.genie_instruction);
  const shippedGenie = useCaseHasShippedGenieCode(u);
  const hasGenieInstructionText = !!genieInstruction.trim();
  const showGenieInstructionBadge = shippedGenie || hasGenieInstructionText;

  // Stored path, or match artifact tree — same for skeleton and shipped Genie (preview is useful for both).
  // Notebook filenames follow: {use_case_id}-{sanitized_name}.ipynb (e.g. "N01-AI05-predict_churn.ipynb"); ids may be DB row ids after merge — see catalog_no.
  const notebookPath =
    storedNotebookPath ||
    (() => {
      if (!allNotebookFiles?.length) return '';
      const prefixes = collectUseCaseNotebookFilenamePrefixes(u);
      if (prefixes.length === 0) return '';
      return (
        allNotebookFiles.find((p) => {
          const name = (p.split('/').pop() || '').trim().toLowerCase();
          if (!name.endsWith('.ipynb')) return false;
          const base = name.replace(/\.ipynb$/i, '');
          return prefixes.some((prefix) => {
            const pl = String(prefix).toLowerCase();
            return (
              base === pl ||
              base.startsWith(`${pl}-`) ||
              base.startsWith(`${pl}_`) ||
              base.startsWith(`${pl}.`)
            );
          });
        }) || ''
      );
    })();

  const hasNotebook = !!(notebookPath || genieInstruction.trim());

  const loadNotebookPreview = useCallback(async () => {
    if (notebookContent) {
      setShowNotebook(true);
      return;
    }
    const gi = genieInstruction.trim();
    if (gi) {
      setNotebookContent(genieInstruction);
      setShowNotebook(true);
      return;
    }
    if (!notebookPath) return;
    setNotebookLoading(true);
    setNotebookError('');
    try {
      const headers = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        headers['X-DB-PAT-Token'] = token;
      }
      if (databricksHost) headers['X-Databricks-Host'] = databricksHost;
      const paths = expandWorkspaceListCandidates(notebookPath);
      let resp = null;
      for (const pth of paths) {
        const r = await fetch(`/api/workspace/export?path=${encodeURIComponent(pth)}`, { headers });
        if (r.ok) {
          resp = r;
          break;
        }
      }
      if (resp && resp.ok) {
        const ct = resp.headers.get('content-type') || '';
        let content = '';
        if (ct.includes('application/json')) {
          const data = await resp.json();
          content = data.content || '';
          if (data.content && data.file_type !== 'text') {
            try {
              content = atob(data.content);
            } catch {
              /* already decoded */
            }
          }
        } else {
          content = await resp.text();
        }
        setNotebookContent(content);
        setShowNotebook(true);
      } else {
        pathPreviewStartedRef.current = false;
        setNotebookError(
          'Could not load notebook (export failed — check workspace path, PAT scope, and that the file exists under /Workspace).',
        );
      }
    } catch (err) {
      pathPreviewStartedRef.current = false;
      setNotebookError(err.message || 'Failed to fetch');
    }
    setNotebookLoading(false);
  }, [notebookContent, genieInstruction, notebookPath, token, databricksHost]);

  useEffect(() => {
    if (!expanded) {
      pathPreviewStartedRef.current = false;
      return;
    }
    if (!hasNotebook) return;
    const gi = genieInstruction.trim();
    if (gi) {
      setNotebookContent(genieInstruction);
      setShowNotebook(true);
      return;
    }
    if (notebookPath && !pathPreviewStartedRef.current && !notebookContent && !notebookLoading) {
      pathPreviewStartedRef.current = true;
      void loadNotebookPreview();
    }
  }, [
    expanded,
    hasNotebook,
    genieInstruction,
    notebookPath,
    notebookContent,
    notebookLoading,
    loadNotebookPreview,
  ]);

  const inspireScoreNum = inspireScoreFromUc(u);
  /** Text priority (e.g. Very High) only — never numeric; never when Inspire score is shown. */
  const showPriorityPill = !!(priority && inspireScoreNum == null && !isNumericPriorityString(priority));

  const priorityLower = priority.toLowerCase();
  const priorityStyle =
    priorityLower.includes('ultra high') || priorityLower.includes('very high')
      ? 'text-db-red bg-db-red-50 border-db-red/20'
      : priorityLower.includes('high')
        ? 'text-error bg-error-bg border-error/20'
        : priorityLower.includes('medium')
          ? 'text-warning bg-warning-bg border-warning/20'
          : 'text-text-secondary bg-bg border-border';

  const workspaceNotebookHref = (() => {
    if (!notebookPath || !databricksHost) return '';
    const base = databricksHost.replace(/\/+$/, '').replace(/^http:\/\//i, 'https://');
    const origin = base.startsWith('http') ? base : `https://${base}`;
    const path = workspaceWebUiHashPath(notebookPath);
    const pathSeg = path.startsWith('/') ? path : `/${path}`;
    return `${origin}/#workspace${pathSeg}`;
  })();

  if (!card) return null;

  return (
    <div className="bg-surface border border-border/70 rounded-xl overflow-hidden shadow-elevated lift-on-hover hover:border-db-red/25">
      {/* Header */}
      <div className="flex items-center gap-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`pl-3 pr-1 py-4 shrink-0 transition-smooth ${isFavorite ? 'text-rose-500' : 'text-border hover:text-rose-400'}`}
          aria-pressed={isFavorite}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart size={16} className={isFavorite ? 'fill-rose-500' : ''} />
        </button>
        {typeof onToggleGenieRegenSelect === 'function' && (
          <label
            className={`flex items-center gap-1.5 pl-1 pr-2 py-4 shrink-0 cursor-pointer transition-smooth ${
              genieRegenSelected ? 'text-db-red' : 'text-text-secondary hover:text-db-red'
            }`}
            title="Flag this use case for Genie instruction generation (writes to Inspire tracking table)"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className="rounded border-border text-db-red focus:ring-db-red/30 size-4 shrink-0 accent-db-red"
              checked={genieRegenSelected}
              onChange={(e) => onToggleGenieRegenSelect(e.target.checked)}
              aria-label="Flag for Genie instruction job"
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] hidden sm:inline">Genie</span>
          </label>
        )}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse use case details' : 'Expand use case details'}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex-1 flex items-center gap-3 px-3 py-4 text-left hover:bg-bg-subtle transition-smooth cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-db-red/25"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="text-lg sm:text-xl font-bold text-text-primary leading-snug">
                  {titlePlain}
                </h3>
                {showGenieInstructionBadge && (
                  <span
                    className={`text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-md border shrink-0 leading-none ${
                      shippedGenie
                        ? 'text-success border-success/35 bg-success-bg'
                        : 'text-text-secondary border-border bg-bg-subtle'
                    }`}
                    title={
                      shippedGenie
                        ? 'Full Genie code instruction (shipped)'
                        : 'Genie instruction text present (partial or skeleton)'
                    }
                  >
                    {shippedGenie ? 'Has Genie instruction' : 'Genie (partial)'}
                  </span>
                )}
              </div>
              {subtitleText && (
                <p className="text-xs sm:text-sm text-text-secondary mt-1.5 leading-snug line-clamp-2">
                  {subtitleText}
                </p>
              )}
            </div>
            {inspireScoreNum != null && (
              <div
                className="shrink-0 flex flex-col items-center justify-center rounded-2xl px-3.5 py-2 min-w-[4.25rem] bg-linear-to-b from-white to-rose-50/90 dark:from-bg-subtle dark:to-rose-950/20 border border-rose-200/70 dark:border-rose-800/40 shadow-sm shadow-rose-900/5"
                title="Inspire composite score"
              >
                <span className="text-[8px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-[0.18em] leading-none">
                  Inspire
                </span>
                <span className="text-2xl font-extrabold text-db-red tabular-nums tracking-tight leading-none mt-1.5">
                  {inspireScoreNum.toFixed(1)}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {showPriorityPill && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${priorityStyle}`}
              >
                {priority}
              </span>
            )}
            {hasNotebook && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium text-db-red bg-db-red/10 inline-flex items-center gap-1.5">
                Notebook
                {workspaceNotebookHref ? (
                  <a
                    href={workspaceNotebookHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open notebook in Databricks workspace"
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold text-db-red hover:underline ml-0.5"
                  >
                    Open
                  </a>
                ) : notebookPath && !databricksHost ? (
                  <span className="text-[9px] font-normal text-text-tertiary normal-case" title="Set Databricks host in setup">
                    (host required)
                  </span>
                ) : !notebookPath && genieInstruction ? (
                  <span className="text-[9px] font-normal text-text-tertiary normal-case">Preview below</span>
                ) : null}
              </span>
            )}
          </div>
          <div className="text-[10px] text-text-tertiary mt-1.5 leading-snug">
            {[domain || 'Unknown', subdomain, technique || ucType || '—'].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-border px-5 py-5 bg-panel space-y-4">
          {/* Statement & Solution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-[10px] font-bold text-db-red uppercase tracking-[0.18em] mb-1">
                Problem Statement
              </h4>
              <p className="text-sm text-text-secondary leading-relaxed">
                {statement || 'N/A'}
              </p>
            </div>
            <div>
              <h4 className="text-[10px] font-bold text-success uppercase tracking-[0.18em] mb-1">
                Proposed Solution
              </h4>
              <p className="text-sm text-text-secondary leading-relaxed">
                {solution || 'N/A'}
              </p>
            </div>
          </div>

          {/* Business Value */}
          {businessValue && (
            <div>
              <h4 className="text-[10px] font-bold text-warning uppercase tracking-[0.18em] mb-1">
                Business Value
              </h4>
              <p className="text-sm text-text-secondary leading-relaxed">
                {businessValue}
              </p>
            </div>
          )}

          {/* Detail chips */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            {[
              { label: 'Beneficiary', val: beneficiary },
              { label: 'Sponsor', val: sponsor },
              { label: 'Quality', val: s(u.Quality) },
              {
                label: 'Priority Alignment',
                val: alignment,
              },
              {
                label: 'Tables',
                val: String(tablesInvolved || '')
                  .split(',')
                  .map((t) => resolveTable(t.trim()))
                  .join(', '),
                mono: true,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-bg rounded-lg p-2.5 border border-border"
              >
                <span className="text-[9px] text-text-tertiary uppercase tracking-[0.18em] font-bold block mb-0.5">
                  {item.label}
                </span>
                <span
                  className={`text-text-secondary ${
                    item.mono ? 'font-mono text-[10px]' : ''
                  }`}
                >
                  {item.val || 'N/A'}
                </span>
              </div>
            ))}
          </div>

          {/* SQL */}
          {sql && !sql.startsWith('--') && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-[10px] font-bold text-info uppercase tracking-[0.18em]">
                  SQL Implementation
                  {resultTable && (
                    <span className="text-text-tertiary font-normal normal-case ml-1">
                      &rarr; {resultTable}
                    </span>
                  )}
                </h4>
                <CopyButton text={sql} />
              </div>
              <div className="relative rounded-lg border border-border overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-info/30 rounded-l-lg" />
                <pre className="text-[11px] text-text-primary bg-bg p-4 pl-5 overflow-x-auto max-h-60 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
                  {sql}
                </pre>
              </div>
            </div>
          )}

          {/* Notebook / Genie preview (skeleton or shipped) */}
          {hasNotebook && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-bold text-db-red uppercase tracking-[0.18em]">
                  {shippedGenie ? 'Genie Code Instruction' : 'Use case notebook'}
                  {notebookPath && (
                    <span className="text-text-tertiary font-normal normal-case ml-1 font-mono text-[9px] truncate max-w-[300px] inline-block align-bottom">
                      {notebookPath.split('/').pop()}
                    </span>
                  )}
                </h4>
                <div className="flex items-center gap-2">
                  {notebookPath && workspaceNotebookHref && (
                    <a
                      href={workspaceNotebookHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-medium text-db-red hover:underline transition-colors"
                      title="Open notebook in Databricks workspace"
                    >
                      Open in workspace
                    </a>
                  )}
                  <button
                    onClick={showNotebook ? () => setShowNotebook(false) : loadNotebookPreview}
                    disabled={notebookLoading}
                    className="text-[10px] font-medium text-text-tertiary hover:text-db-red flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    {notebookLoading ? (
                      <span className="inline-flex items-center gap-1"><Loader2 size={10} className="animate-spin shrink-0" aria-hidden /> Loading…</span>
                    ) : showNotebook ? (
                      'Hide'
                    ) : (
                      'Preview'
                    )}
                  </button>
                  {notebookContent && <CopyButton text={notebookContent} />}
                  {notebookContent && (
                    <div className="relative group">
                      <span className="text-[10px] text-text-tertiary hover:text-db-red cursor-help border border-border rounded px-1.5 py-0.5 transition-colors" tabIndex={0}>Help</span>
                      <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-200 absolute bottom-full right-0 mb-2 z-50 min-w-[280px] bg-surface border border-border rounded-lg shadow-xl p-3 text-[10px] text-text-secondary leading-relaxed whitespace-pre-line">
                        <div className="font-bold text-text-primary mb-1.5">HOW TO USE:</div>
                        <div>1. Open Genie Code in your Databricks workspace (side panel in any notebook)</div>
                        <div>2. Copy the ENTIRE content of the instruction below</div>
                        <div>3. Paste it into Genie Code and let Genie generate the implementation</div>
                        <div>4. Genie will create the complete code — review, iterate, and execute</div>
                        <div className="absolute bottom-[-5px] right-3 w-2.5 h-2.5 bg-surface border-b border-r border-border rotate-45" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {!shippedGenie && notebookPath && (
                <p className="text-[10px] text-text-tertiary mb-2 leading-relaxed">
                  Skeleton or partial Genie text — run <span className="font-mono">Generate Use Cases</span> (or enable Auto-Genie on Discover) for full Genie instructions. Preview shows notebook cells / instruction text when available.
                </p>
              )}

              {notebookError && (
                <p className="text-[11px] text-error">{notebookError}</p>
              )}

              {notebookLoading && !notebookContent && (
                <div className="flex items-center gap-2 py-4 text-[11px] text-text-tertiary">
                  <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />
                  Loading notebook preview…
                </div>
              )}

              {showNotebook && notebookContent && (
                <div className="relative rounded-lg border border-db-red/20 overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-db-red/30 rounded-l-lg" />
                  <div className="bg-bg p-4 pl-5 overflow-x-auto max-h-[500px] overflow-y-auto">
                    <GenieMarkdownPreview content={notebookContent} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
