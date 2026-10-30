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
  Compass,
  Flag,
  Star,
  ChevronDown,
} from 'lucide-react';
import GenieMarkdownPreview from '../components/GenieMarkdownPreview';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { NativeSelect } from '../components/ui/native-select';
import { Separator } from '../components/ui/separator';
import { KpiRow, StatTile } from '../components/results/StatTile';
import { ScoreChip } from '../components/results/ScoreChip';
import { ExecutiveSummary } from '../components/results/ExecutiveSummary';
import { FilterChip, FilterToolbar, SegmentButton, ToggleChip, ToolbarGroup } from '../components/results/FilterToolbar';
import { SidebarItem, SidebarSection } from '../components/results/SidebarSection';
import DomainSunburst from '../components/DomainSunburst';
import PriorityHeatmap from '../components/PriorityHeatmap';
import Celebration from '../components/Celebration';
import DatabricksLogo from '../components/DatabricksLogo';
import { SkeletonCard, SkeletonStats } from '../components/SkeletonLoader';
import { DataAccessBadge, FeedbackPanel, FoundationsPanel, SidebarFilterPanel, StrategyCoveragePanel } from '../components/ResultsInsights';
import { BestOfBestDetail, FeedbackChip, FeedbackControls, StrategyChip, UseCaseStrategyDetail } from '../components/UseCaseStrategyDetail';
import {
  NOT_ALIGNED_FILTER,
  bestOfBestLabel,
  compareBestOfBestFirst,
  copyV130TrackingFields,
  genieCardActions,
  knownPriorities,
  latestFeedbackMap,
  matchesStrategyFilter,
  priorityMatches,
  strategyFilterOptions,
  v130View,
} from '../lib/v130UseCase';
import { visibleArtifactFiles } from '../lib/artifactFiles';
import ImplementWizard from './ImplementWizard';
import UseCaseStudio from './UseCaseStudio';
import { caseIdOf } from '../lib/implementWizard';
import { makeApiFetch, makeApiPostJson } from '../lib/apiClient';

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

/** v1.2.0: closest candidates below the quality bar are a valid result, not empty. */
function belowBarLabelFromUseCase(uc) {
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
  const [filterStrategy, setFilterStrategy] = useState('all');
  const [filterBizPriority, setFilterBizPriority] = useState('all');
  const [sortBy, setSortBy] = useState('inspire');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showBestOfBestOnly, setShowBestOfBestOnly] = useState(false);

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
  const [strategyPanelOpen, setStrategyPanelOpen] = useState(false);
  const [bizPriorityPanelOpen, setBizPriorityPanelOpen] = useState(false);
  const [feedbackState, setFeedbackState] = useState({ available: null, latest: [], message: '' });
  const [feedbackRefresh, setFeedbackRefresh] = useState(0);
  const [feedbackBusyKey, setFeedbackBusyKey] = useState('');
  const [feedbackError, setFeedbackError] = useState({ key: '', message: '' });

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
  const [implementUc, setImplementUc] = useState(null);
  const [implementFocus, setImplementFocus] = useState(null);
  const [studioUseCaseId, setStudioUseCaseId] = useState(null);

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

  const apiFetch = useMemo(() => makeApiFetch({ token, databricksHost }), [token, databricksHost]);
  const apiPostJson = useMemo(() => makeApiPostJson({ token, databricksHost }), [token, databricksHost]);

  const resultsDiscoveryType = results?.discovery_type || '';
  const feedbackBusiness = useMemo(() => {
    const session = sessions.find((s) => String(s.session_id) === String(selectedSessionId));
    return session?.widget_values?.business || session?.widget_values?.['00_business_name'] || session?.business_name || '';
  }, [sessions, selectedSessionId]);
  useEffect(() => {
    const business = feedbackBusiness;
    if (!resultsDiscoveryType || !inspireDb || !warehouseId || !business) {
      setFeedbackState({ available: null, latest: [], message: '' });
      return undefined;
    }
    let cancelled = false;
    const q = new URLSearchParams({ inspire_database: inspireDb, warehouse_id: warehouseId, business_name: business });
    apiFetch(`/api/inspire/feedback?${q}`)
      .then((data) => {
        if (!cancelled) setFeedbackState({ available: !!data.available, latest: data.latest || [], message: data.message || '' });
      })
      .catch(() => {
        if (!cancelled) setFeedbackState({ available: null, latest: [], message: '' });
      });
    return () => {
      cancelled = true;
    };
  }, [resultsDiscoveryType, feedbackBusiness, inspireDb, warehouseId, apiFetch, feedbackRefresh]);

  const submitFeedback = useCallback(
    async (uc, info, status, reason) => {
      if (!selectedSessionId || !inspireDb || !warehouseId || !info?.useCaseKey) return;
      setFeedbackBusyKey(info.useCaseKey);
      setFeedbackError({ key: '', message: '' });
      try {
        await apiPostJson('/api/inspire/feedback', {
          inspire_database: inspireDb,
          warehouse_id: warehouseId,
          session_id: String(selectedSessionId),
          use_case_key: info.useCaseKey,
          use_case_id: String(uc?.catalog_no || uc?.No || ''),
          use_case_title: String(uc?.Name || ''),
          status,
          reason,
        });
        setFeedbackRefresh((n) => n + 1);
      } catch (err) {
        const message = String(err?.message || err);
        if (message.startsWith('409')) setFeedbackState((prev) => ({ ...prev, available: false }));
        setFeedbackError({ key: info.useCaseKey, message: message.replace(/^\d{3}:\s*/, '') });
      } finally {
        setFeedbackBusyKey('');
      }
    },
    [selectedSessionId, inspireDb, warehouseId, apiPostJson]
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
          setGenieFlagSyncError('At most 50 use cases can be marked for Genie Code generation per run.');
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
      setGenieJobError(e.message || 'Generating the Genie instructions failed.');
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
    setFilterStrategy('all');
    setFilterBizPriority('all');
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
        for (const field of ['quality', 'quality_mode', 'elite_status', 'elite_score', 'elite_assessment', 'selection_flags', 'selection_drop_reason']) {
          if (row[field] != null && row[field] !== '' && (uc[field] == null || uc[field] === '')) uc[field] = row[field];
        }
        copyV130TrackingFields(uc, row);
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
        copyV130TrackingFields(uc, row);
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
  for (const uc of allUseCases) {
    if (uc && typeof uc === 'object') uc._v130 = v130View(uc);
  }
  const bizPriorities = knownPriorities(results);

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
        if (filterStrategy !== 'all' && !matchesStrategyFilter(uc._v130, filterStrategy)) return false;
        if (filterBizPriority !== 'all' && !priorityMatches(uc._v130?.priorityText, bizPriorities).includes(filterBizPriority)) return false;
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
        const starred = compareBestOfBestFirst(a._v130, b._v130);
        if (starred !== 0) return starred;
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

  if (showBestOfBestOnly) {
    filteredUseCases = filteredUseCases.filter((uc) => uc?._v130?.bestOfBest);
  }
  const starredCount = allUseCases.filter((uc) => uc?._v130?.bestOfBest).length;

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

  const v130Session = !!(results && (results.discovery_type || results.strategy_coverage));
  const strategyFilter = strategyFilterOptions(allUseCases.map((uc) => uc?._v130), results?.strategy_coverage?.entries);
  const strategyOptions = strategyFilter.notAligned > 0
    ? [...strategyFilter.options, { value: NOT_ALIGNED_FILTER, label: 'Not aligned', count: strategyFilter.notAligned, depth: 0 }]
    : strategyFilter.options;
  const bizPriorityCounts = {};
  let bizPriorityUseCases = 0;
  for (const uc of allUseCases) {
    const matched = priorityMatches(uc?._v130?.priorityText, bizPriorities);
    if (matched.length) bizPriorityUseCases += 1;
    for (const bp of matched) bizPriorityCounts[bp] = (bizPriorityCounts[bp] || 0) + 1;
  }
  const bizPriorityOptions = bizPriorities
    .filter((bp) => bizPriorityCounts[bp])
    .map((bp) => ({ value: bp, label: bp, count: bizPriorityCounts[bp] }));
  const foundationsById = new Map(
    (Array.isArray(results?.foundations) ? results.foundations : []).map((f) => [String(f.id), f])
  );
  const useCaseNameById = new Map();
  for (const uc of allUseCases) {
    for (const id of [uc?.catalog_no, uc?.No, uc?.id]) {
      if (id != null && String(id).trim() && !useCaseNameById.has(String(id).trim())) useCaseNameById.set(String(id).trim(), String(uc.Name || id));
    }
  }
  const feedbackLatest = latestFeedbackMap(feedbackState.latest);

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
    filterStrategy !== 'all' ||
    filterBizPriority !== 'all' ||
    filterHasGenie !== 'all' ||
    showBestOfBestOnly;

  const clearAllFilters = () => {
    setSearchQuery(''); setFilterDomain('all'); setFilterSubdomain('all');
    setFilterPriority('all'); setFilterType('all'); setFilterTechnique('all');
    setFilterQuality('all');
    setFilterBeneficiary('all'); setFilterSponsor('all');
    setFilterStrategy('all'); setFilterBizPriority('all');
    setFilterHasGenie('all');
    setShowBestOfBestOnly(false);
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
        const files = visibleArtifactFiles(data.files);
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
            setArtifactsRootFiles(visibleArtifactFiles(data.files));
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
        setArtifactTree(prev => ({ ...prev, [folderPath]: { files: visibleArtifactFiles(data.files), loading: false, error: null } }));
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
            ? 'max-w-[1200px] mx-auto px-6 py-8'
            : 'max-w-7xl mx-auto px-6 py-8'
      }
    >
      {!embedded && (
        <div className={`flex items-start justify-between gap-4 ${results ? 'mb-6' : 'mb-8'}`}>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card">
              <BarChart3 size={18} className="text-muted-foreground" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0">
              <h1
                className={`font-semibold tracking-tight text-foreground ${
                  results ? 'text-3xl line-clamp-2 break-words' : 'text-3xl sm:text-4xl'
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
              <Button
                variant="outline"
                onClick={() => {
                  setResults(null);
                  setUsecases(null);
                  setError('');
                  setExpandedUseCase(null);
                  setSelectedSessionId(null);
                  setSessionsLoaded(false);
                  setIsProgressive(false);
                }}
              >
                <RefreshCw size={14} />
                Change Session
              </Button>
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
        <div className="space-y-6">
          {/* Progressive results banner */}
          {isProgressive && (
            <div className="flex items-center gap-3 p-3 bg-warning-bg border border-warning/20 rounded-lg">
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

          <ExecutiveSummary
            summary={displayCleanText(inspireResultsTextField(results?.executive_summary)).trim()}
            domainOverview={displayCleanText(inspireResultsTextField(results?.domains_summary)).trim()}
            useCaseNames={allUseCases.flatMap((uc) =>
              [uc?.description, uc?.short_name, uc?.Name].map((x) => displayCleanText(String(x || '')).trim()),
            )}
          />

          <KpiRow>
            <StatTile label="Domains" value={results.domains?.length || domains.length} icon={Building2} />
            <StatTile label="Use Cases" value={allUseCases.length} icon={FileText} />
            <StatTile label="High Priority" value={highPriorityCount} icon={Target} />
            <StatTile label="Techniques" value={techniqueCount} icon={Wrench} />
            <StatTile label="Subdomains" value={uniqueSubdomainCount} icon={LayoutGrid} />
            <StatTile
              label="Avg Inspire score"
              value={0}
              icon={Sparkles}
              accent
              renderValue={avgInspireScore != null ? avgInspireScore.toFixed(1) : '—'}
            />
          </KpiRow>

          {!isProgressive && (
            <Card className="p-5 shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">Execution Complete</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {displayCleanText(
                        typeof results.title === 'string' ? results.title : 'Pipeline finished successfully'
                      )}
                    </p>
                    {(results.selection_outcome || results.elite_outcome) && (
                      <p className="mt-1 text-xs text-warning">
                        {displayCleanText(String(results.selection_outcome || results.elite_outcome))}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <ol className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Pipeline stages">
                {PIPELINE_STAGES.map((stage, i) => (
                  <li key={stage} className="flex items-center gap-1">
                    <span className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground">
                      <CheckCircle2 size={12} className="shrink-0 text-success" aria-hidden />
                      {stage}
                    </span>
                    {i < PIPELINE_STAGES.length - 1 && (
                      <ChevronRight size={12} className="shrink-0 text-subtle-foreground" aria-hidden />
                    )}
                  </li>
                ))}
              </ol>
            </Card>
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
                                className="text-[10px] text-text-secondary hover:text-text-primary hover:underline font-medium flex items-center gap-0.5"
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
                                      <tr key={ri} className={`${ri % 2 === 0 ? 'bg-surface' : 'bg-bg-subtle/30'} hover:bg-muted transition-colors`}>
                                        <td className="px-3 py-1.5 text-[9px] text-text-tertiary font-mono text-right border-r border-border/50 w-8">{ri + 1}</td>
                                        {row.map((cell, ci) => (
                                          <td
                                            key={ci}
                                            className={`px-3 py-1.5 text-[11px] text-text-primary border-b border-border/30 ${expandedCells[`${ri}-${ci}`] ? 'whitespace-normal break-words' : 'whitespace-nowrap max-w-[250px] truncate'} ${cell.length > 30 ? 'cursor-pointer hover:bg-muted' : ''}`}
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
                              <button type="button" onClick={(e) => { e.stopPropagation(); loadFolder(f.path); }} className="ml-2 text-[10px] text-text-primary hover:underline">Retry</button>
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
              <Card className="overflow-hidden shadow-none">
                <button
                  type="button"
                  aria-expanded={artifactsExpanded}
                  onClick={() => {
                    const next = !artifactsExpanded;
                    setArtifactsExpanded(next);
                    if (next && !artifactsRootFiles && !artifactsLoading) loadArtifacts(generationPath);
                  }}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted"
                >
                  <FolderOpen size={18} strokeWidth={1.75} className="shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground">Generated Artifacts</h3>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{generationPath}</p>
                  </div>
                  {artifactsRootFiles && artifactsRootFiles.length > 0 && (
                    <Badge variant="outline">
                      {artifactsRootFiles.length} item{artifactsRootFiles.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                  <ChevronRight
                    size={16}
                    className={`shrink-0 text-subtle-foreground transition-transform duration-200 ${artifactsExpanded ? 'rotate-90' : ''}`}
                    aria-hidden
                  />
                </button>
                {artifactsExpanded && (
                  <div className="border-t px-5 py-3">
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
                          className="mt-2 text-xs text-foreground hover:underline font-medium"
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
              </Card>
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
              <Card className="p-5 shadow-none">
                <div className="mb-3 flex items-center gap-2">
                  <FileText size={16} strokeWidth={1.75} className="text-muted-foreground" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">Quick Access — Documents & Data</h3>
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {previewableFiles.map((f) => {
                    const ext = (f.name || '').toLowerCase().split('.').pop();
                    const style = EXT_STYLES[ext] || EXT_STYLES.csv;
                    const isActive = previewFile === f.path;
                    return (
                      <div key={f.path} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] border transition-all shrink-0 ${isActive ? 'border-border-strong bg-muted' : 'bg-card hover:bg-muted'}`}>
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>{ext}</span>
                        <span className="text-text-primary font-medium truncate max-w-[200px]">{f.name}</span>
                        <div className="flex items-center gap-1.5 ml-1 border-l border-border pl-2">
                          <button type="button" className="text-[10px] text-info hover:text-info font-medium flex items-center gap-0.5 hover:underline" onClick={() => togglePreview(f.path, f.name)}>
                            {isActive ? <><EyeOff size={9} /> Hide</> : <><Eye size={9} /> Preview</>}
                          </button>
                          <button type="button" className="text-[10px] text-success font-medium flex items-center gap-0.5 hover:underline" onClick={() => openFileInTab(f.path, f.name)}>
                            <ExternalLink size={9} /> Open
                          </button>
                          <button type="button" className="text-[10px] text-text-secondary font-medium flex items-center gap-0.5 hover:text-text-primary hover:underline" onClick={() => downloadFile(f.path, f.name)} aria-label={`Download ${f.name}`}>
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
                                <tr key={ri} className={`${ri % 2 === 0 ? 'bg-surface' : 'bg-bg-subtle/30'} hover:bg-muted transition-colors`}>
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
              </Card>
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
              <Card className="overflow-hidden p-5 shadow-none">
                <button
                  type="button"
                  onClick={() => setGenieQuickAccessExpanded((o) => !o)}
                  aria-expanded={genieQuickAccessExpanded}
                  aria-controls="genie-quick-access-list"
                  id="genie-quick-access-toggle"
                  className="flex w-full items-center justify-between gap-3 rounded-md text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                    <Sparkles size={16} strokeWidth={1.75} className="shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">Quick Access — Genie instructions ready</span>
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="tabular-nums">
                      {notebookFiles.length}
                    </Badge>
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
                            'flex items-center gap-2.5 px-3 py-2.5 min-h-[2.75rem] text-left text-xs text-foreground font-medium transition-colors hover:bg-muted';
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
                                    className="shrink-0 text-muted-foreground group-hover:text-foreground"
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
              </Card>
            );
          })()}

          {/* Celebration on first load */}
          <Celebration trigger={allUseCases.length > 0 && !isProgressive} />

          {v130Session && (
            <>
              <DataAccessBadge results={results} />
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
                <StrategyCoveragePanel
                  coverage={results.strategy_coverage}
                  onSelectPath={(path) => setFilterStrategy(path)}
                  onSelectNotAligned={() => setFilterStrategy(NOT_ALIGNED_FILTER)}
                />
                <FoundationsPanel foundations={results.foundations} deliveryOrder={results.delivery_order} nameById={useCaseNameById} />
                <FeedbackPanel results={results} feedback={feedbackState} />
              </div>
            </>
          )}

          {/* ═══ Two-Column: sticky sidebar rail + use-case list ═══ */}
          <div className="grid min-h-0 grid-cols-1 items-start gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
            <aside
              aria-label="Use case filters"
              className={`z-10 min-h-0 overflow-y-auto overscroll-y-contain rounded-xl border bg-card md:sticky [-webkit-overflow-scrolling:touch] ${
                embedded
                  ? 'top-4 max-h-[min(32rem,72vh)]'
                  : 'top-20 max-h-[calc(100dvh-6rem)]'
              }`}
            >
              <SidebarSection
                title="Domains"
                icon={Layers}
                count={domains.length}
                subtitle={`${domains.length} domain${domains.length !== 1 ? 's' : ''} \u00b7 ${allUseCases.length} use cases`}
                open={domainPanelOpen}
                onToggle={() => setDomainPanelOpen((o) => !o)}
                activeFilter={
                  filterDomain !== 'all' || filterSubdomain !== 'all'
                    ? filterSubdomain !== 'all'
                      ? `${filterDomain} \u203a ${filterSubdomain}`
                      : filterDomain
                    : ''
                }
              >
                <SidebarItem
                  active={filterDomain === 'all'}
                  onClick={() => setFilterDomain('all')}
                  label="All Domains"
                  count={allUseCases.length}
                />
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
                      <div className="flex items-center gap-0.5">
                        <SidebarItem
                          active={active}
                          onClick={() => { setFilterDomain(active ? 'all' : d); setFilterSubdomain('all'); }}
                          label={d}
                          title={d}
                          meta={`${count} use case${count !== 1 ? 's' : ''}${highPriCount > 0 ? ` \u00b7 ${highPriCount} high pri` : ''}`}
                          className="flex-1"
                        />
                        {hasSubs && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpandedDomains(prev => ({ ...prev, [d]: !prev[d] })); }}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Hide' : 'Show'} subdomains of ${d}`}
                            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <ChevronRight size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                          </button>
                        )}
                      </div>
                      {isExpanded && hasSubs && (
                        <div className="ml-3 mt-0.5 space-y-0.5 border-l pl-2">
                          {Object.entries(subs).map(([sd, sdCount]) => {
                            const sdActive = filterSubdomain === sd && filterDomain === d;
                            return (
                              <SidebarItem
                                key={sd}
                                active={sdActive}
                                onClick={() => {
                                  setFilterDomain(d);
                                  setFilterSubdomain(sdActive ? 'all' : sd);
                                }}
                                label={sd}
                                title={sd}
                                count={sdCount}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </SidebarSection>

              {strategyFilter.withData > 0 && (
                <SidebarFilterPanel
                  title="Strategy"
                  subtitle={`${strategyFilter.withData - strategyFilter.notAligned} aligned \u00b7 ${strategyFilter.notAligned} not aligned`}
                  icon={Compass}
                  open={strategyPanelOpen}
                  onToggle={() => setStrategyPanelOpen((o) => !o)}
                  allLabel="All use cases"
                  allCount={allUseCases.length}
                  options={strategyOptions}
                  value={filterStrategy}
                  onChange={setFilterStrategy}
                />
              )}

              {bizPriorityOptions.length > 0 && (
                <SidebarFilterPanel
                  title="Business priorities"
                  subtitle={`${bizPriorityOptions.length} of ${bizPriorities.length} priorities in use`}
                  icon={Flag}
                  open={bizPriorityPanelOpen}
                  onToggle={() => setBizPriorityPanelOpen((o) => !o)}
                  allLabel="All priorities"
                  allCount={bizPriorityUseCases}
                  options={bizPriorityOptions}
                  value={filterBizPriority}
                  onChange={setFilterBizPriority}
                />
              )}

              {beneficiaries.length > 0 && (
                <SidebarFilterPanel
                  title="Beneficiaries"
                  subtitle={`${beneficiaries.length} role${beneficiaries.length !== 1 ? 's' : ''} \u00b7 who benefits`}
                  icon={Users}
                  open={beneficiaryPanelOpen}
                  onToggle={() => setBeneficiaryPanelOpen((o) => !o)}
                  allLabel="All beneficiaries"
                  allCount={allUseCases.filter((uc) => beneficiaryFromUc(uc)).length}
                  options={beneficiaries.map((b) => ({ value: b, label: b, count: beneficiaryCounts[b] || 0 }))}
                  value={filterBeneficiary}
                  onChange={setFilterBeneficiary}
                />
              )}

              {sponsors.length > 0 && (
                <SidebarFilterPanel
                  title="Sponsors"
                  subtitle={`${sponsors.length} sponsor${sponsors.length !== 1 ? 's' : ''} \u00b7 executive / owner`}
                  icon={Crown}
                  open={sponsorPanelOpen}
                  onToggle={() => setSponsorPanelOpen((o) => !o)}
                  allLabel="All sponsors"
                  allCount={allUseCases.filter((uc) => sponsorFromUc(uc)).length}
                  options={sponsors.map((sp) => ({ value: sp, label: sp, count: sponsorCounts[sp] || 0 }))}
                  value={filterSponsor}
                  onChange={setFilterSponsor}
                />
              )}
            </aside>

            {/* ── Right Panel: sticky filter toolbar, then the use case list ── */}
            <div className="flex min-h-0 min-w-0 flex-col gap-4">
              <FilterToolbar
                sticky={!embedded}
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search use cases..."
                footer={hasActiveFilters && (
                  <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
                    <Filter size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                    <span className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground tabular-nums">{filteredUseCases.length}</span> of{' '}
                      <span className="font-semibold text-foreground tabular-nums">{allUseCases.length}</span> use cases
                    </span>
                    {filterDomain !== 'all' && (
                      <FilterChip onRemove={() => { setFilterDomain('all'); setFilterSubdomain('all'); }}>{filterDomain}</FilterChip>
                    )}
                    {filterSubdomain !== 'all' && (
                      <FilterChip onRemove={() => setFilterSubdomain('all')}>Sub: {filterSubdomain}</FilterChip>
                    )}
                    {filterPriority !== 'all' && (
                      <FilterChip onRemove={() => setFilterPriority('all')}>{filterPriority}</FilterChip>
                    )}
                    {filterType !== 'all' && (
                      <FilterChip onRemove={() => setFilterType('all')}>{filterType}</FilterChip>
                    )}
                    {filterTechnique !== 'all' && (
                      <FilterChip onRemove={() => setFilterTechnique('all')}>{filterTechnique}</FilterChip>
                    )}
                    {filterQuality !== 'all' && (
                      <FilterChip onRemove={() => setFilterQuality('all')}>Q: {filterQuality}</FilterChip>
                    )}
                    {filterHasGenie !== 'all' && (
                      <FilterChip onRemove={() => setFilterHasGenie('all')}>Genie: {filterHasGenie === 'yes' ? 'Yes' : 'No'}</FilterChip>
                    )}
                    {searchQuery && (
                      <FilterChip onRemove={() => setSearchQuery('')}>"{searchQuery}"</FilterChip>
                    )}
                    <Button variant="link" size="sm" onClick={clearAllFilters} className="ml-auto h-6 text-foreground">
                      Clear
                    </Button>
                  </div>
                )}
                actions={
                  <>
                    <ToggleChip
                      pressed={showFavoritesOnly}
                      onClick={() => setShowFavoritesOnly(p => !p)}
                      title={showFavoritesOnly ? 'Show all use cases' : 'Show favorites only'}
                    >
                      <Heart size={14} className={showFavoritesOnly ? 'fill-current' : ''} aria-hidden />
                      <span className="sr-only">Favorites</span>
                      {favoriteCount(favorites) > 0 && (
                        <span className="text-xs tabular-nums">{favoriteCount(favorites)}</span>
                      )}
                    </ToggleChip>

                    {starredCount > 0 && (
                      <ToggleChip
                        pressed={showBestOfBestOnly}
                        onClick={() => setShowBestOfBestOnly(!showBestOfBestOnly)}
                        title={showBestOfBestOnly ? 'Show all use cases' : 'Show Best of Best use cases only'}
                      >
                        <Star size={14} className={showBestOfBestOnly ? 'fill-current' : ''} aria-hidden />
                        Best of Best
                        <span className="text-xs tabular-nums opacity-80">{starredCount}</span>
                      </ToggleChip>
                    )}
                    <NativeSelect value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort">
                      <option value="inspire">Sort: Inspire score (high → low)</option>
                      <option value="priority">Sort: Priority tier</option>
                      <option value="domain">Sort: Domain</option>
                      <option value="name">Sort: Name</option>
                    </NativeSelect>
                  </>
                }
                leading={
                  <>
                    {PRIORITY_ORDER.some((p) => priorities.includes(p)) && (
                      <ToolbarGroup label="Priority">
                        {PRIORITY_ORDER.filter((p) => priorities.includes(p)).map((p) => {
                          const active = filterPriority === p;
                          const cnt = allUseCases.filter((uc) => uc.Priority === p).length;
                          return (
                            <SegmentButton key={p} active={active} onClick={() => setFilterPriority(active ? 'all' : p)}>
                              {p.replace('Ultra ', 'U-').replace('Very ', 'V-')}
                              <span className="tabular-nums opacity-70">{cnt}</span>
                            </SegmentButton>
                          );
                        })}
                      </ToolbarGroup>
                    )}
                  </>
                }
              >

                {types.length > 0 && (
                  <NativeSelect value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="Type">
                    <option value="all">All Types</option>
                    {types.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </NativeSelect>
                )}

                {techniques.length > 0 && (
                  <NativeSelect value={filterTechnique} onChange={(e) => setFilterTechnique(e.target.value)} aria-label="Technique" wrapperClassName="max-w-[12rem]">
                    <option value="all">All Techniques</option>
                    {techniques.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </NativeSelect>
                )}

                {qualities.length > 0 && (
                  <NativeSelect value={filterQuality} onChange={(e) => setFilterQuality(e.target.value)} aria-label="Quality">
                    <option value="all">All Quality</option>
                    {qualities.map((q) => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                  </NativeSelect>
                )}

                <NativeSelect
                  value={filterHasGenie}
                  onChange={(e) => setFilterHasGenie(e.target.value)}
                  title="Filter by whether a Genie instruction exists on the use case"
                  aria-label="Genie instruction"
                >
                  <option value="all">Genie instruction: Any</option>
                  <option value="yes">Has Genie: Yes</option>
                  <option value="no">Has Genie: No</option>
                </NativeSelect>

              </FilterToolbar>

              {/* Genie instruction regeneration: Delta flags + optional job (below filter toolbar); collapses when job succeeds */}
              {selectedSessionId && inspireDb && warehouseId && allUseCases.length > 0 && (() => {
                const genieInstrCollapsedSummary = (() => {
                  if (genieJobRunning) return 'Job starting… Expand to watch progress.';
                  const n = genieRegenSelectedIds.length;
                  if (genieJobLastRun?.run_id != null) {
                    const { key, label } = deriveGenieOverallStatus(genieJobProgress);
                    if (key === 'done') {
                      return `Last run finished · ${n} marked. Expand for details.`;
                    }
                    if (key === 'failed') {
                      return `Last run failed (${label}). Expand for details.`;
                    }
                    return `${label} — expand for status and Databricks link.`;
                  }
                  return `${n} marked for Genie Code generation. Expand for details.`;
                })();
                return (
                  <Card className="shrink-0 p-5 shadow-none">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <div className="flex flex-col gap-3 min-[480px]:flex-row min-[480px]:items-start min-[480px]:justify-between">
                          <button
                            type="button"
                            onClick={() => setGenieInstructionsPanelExpanded((v) => !v)}
                            aria-expanded={genieInstructionsPanelExpanded}
                            id="genie-instructions-panel-toggle"
                            className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30"
                          >
                            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card p-1">
                              <DatabricksLogo className="h-6 w-6 object-contain" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground">Genie instructions</p>
                              {!genieInstructionsPanelExpanded && (
                                <p className="mt-0.5 text-xs leading-5 text-muted-foreground line-clamp-2">
                                  {genieInstrCollapsedSummary}
                                </p>
                              )}
                            </div>
                            <ChevronRight
                              size={16}
                              className={`mt-1 shrink-0 text-subtle-foreground transition-transform duration-200 ${
                                genieInstructionsPanelExpanded ? 'rotate-90' : ''
                              }`}
                              aria-hidden
                            />
                          </button>
                          <Button
                            disabled={
                              genieJobRunning ||
                              genieRegenSelectedIds.length === 0 ||
                              genieDeltaSyncPending ||
                              genieFlagSyncing
                            }
                            title={
                              genieDeltaSyncPending || genieFlagSyncing
                                ? 'Wait until your marks are saved before generating.'
                                : genieRegenSelectedIds.length === 0
                                  ? 'Mark at least one use case with Mark Ready for Genie Code Generation first.'
                                  : undefined
                            }
                            onClick={() => void handleGenerateGenieJob()}
                            className="w-full min-[480px]:w-auto min-[480px]:self-start"
                          >
                            {genieJobRunning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            Generate Genie Instruction for Marked use cases
                            <span className="inline-flex min-w-[1.5rem] justify-center rounded bg-black/15 px-1.5 text-xs tabular-nums">
                              {genieRegenSelectedIds.length}
                            </span>
                          </Button>
                        </div>
                        {genieInstructionsPanelExpanded && (
                          <div className="min-w-0 space-y-2 border-t pt-3">
                            <p className="text-[11px] text-text-secondary leading-snug">
                              Mark use cases with <span className="font-semibold text-text-primary">Mark Ready for Genie Code Generation</span> on their cards, then generate. Inspire writes the Genie instruction and its notebook for the marked use cases only.
                            </p>
                            <p className="text-[11px] text-text-tertiary flex flex-wrap items-center gap-x-2 gap-y-1">
                              <Badge>
                                {genieRegenSelectedIds.length} marked
                              </Badge>
                              {(genieFlagSyncing || genieDeltaSyncPending) && (
                                <span className="inline-flex items-center gap-1 text-text-secondary">
                                  <Loader2 size={11} className="animate-spin" />
                                  Saving marks…
                                </span>
                              )}
                            </p>
                            {(genieFlagSyncing || genieDeltaSyncPending) && (
                              <p className="text-[11px] text-text-secondary leading-snug max-w-xl">
                                <span className="font-semibold text-text-primary">Generate Genie Instruction for Marked use cases</span> stays greyed out until your marks are saved, so it runs on the same use cases you see here.
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
                                <div className="mt-2 space-y-2 border-t pt-2">
                                  {runHref ? (
                                    <a
                                      href={runHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground underline-offset-4 hover:underline"
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
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-primary">
                                        <Loader2 size={12} className="animate-spin" />
                                        In progress
                                      </span>
                                    )}
                                    {!waitingPoll && overall.key === 'running' && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-primary">
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
                                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all duration-300 ${
                                            overall.key === 'failed'
                                              ? 'bg-error'
                                              : overall.key === 'done'
                                                ? 'bg-success'
                                                : 'bg-foreground/70'
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
                  </Card>
                );
              })()}

              {/* Use case cards — only this region scrolls; sidebar + filter bar stay visible */}
              <div
                className={
                  embedded
                    ? 'h-[min(28rem,60vh)] overflow-y-auto overscroll-y-contain [scrollbar-width:thin]'
                    : ''
                }
                role="region"
                aria-label="Use case list"
              >
                {filteredUseCases.length > 0 ? (
                  <div className="space-y-4 pb-2">
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
                        v130={uc._v130}
                        knownPriorities={bizPriorities}
                        foundationsById={foundationsById}
                        feedbackAvailable={feedbackState.available}
                        feedbackCurrent={uc._v130?.useCaseKey ? feedbackLatest[uc._v130.useCaseKey] : undefined}
                        feedbackBusy={!!uc._v130?.useCaseKey && feedbackBusyKey === uc._v130.useCaseKey}
                        feedbackError={uc._v130?.useCaseKey && feedbackError.key === uc._v130.useCaseKey ? feedbackError.message : ''}
                        onFeedback={(status, reason) => submitFeedback(uc, uc._v130, status, reason)}
                        onImplement={() => { setImplementFocus(null); setImplementUc(uc); }}
                        onOpenStudio={() => setStudioUseCaseId(caseIdOf(uc))}
                      />
                      );
                    })}
                  </div>
                ) : allUseCases.length > 0 ? (
                  <Card className="p-10 text-center shadow-none">
                    <Search size={20} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
                    <p className="text-sm text-muted-foreground">No use cases match your filters.</p>
                    <Button variant="link" size="sm" onClick={clearAllFilters} className="mt-2 text-foreground">
                      Clear all filters
                    </Button>
                  </Card>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {implementUc && selectedSessionId && inspireDb && warehouseId && (
        <ImplementWizard
          uc={implementUc}
          sessionId={selectedSessionId}
          settings={{ ...settings, warehouseId, inspireDatabase: inspireDb, notebookPath: settingsNotebookPath }}
          discoveryType={resultsDiscoveryType}
          apiFetch={apiFetch}
          apiPostJson={apiPostJson}
          focus={implementFocus}
          onClose={() => { setImplementUc(null); setImplementFocus(null); }}
          onImplemented={(data) => {
            setImplementUc(null);
            setImplementFocus(null);
            setStudioUseCaseId(data.use_case_id);
          }}
        />
      )}
      {studioUseCaseId && selectedSessionId && inspireDb && warehouseId && (
        <UseCaseStudio
          sessionId={selectedSessionId}
          settings={{ ...settings, warehouseId, inspireDatabase: inspireDb, notebookPath: settingsNotebookPath }}
          useCaseId={studioUseCaseId}
          useCases={allUseCases}
          apiFetch={apiFetch}
          apiPostJson={apiPostJson}
          onClose={() => setStudioUseCaseId(null)}
          onEdit={(id, focus) => {
            const found = allUseCases.find((u) => caseIdOf(u) === id);
            setStudioUseCaseId(null);
            setImplementFocus(focus || null);
            if (found) setImplementUc(found);
          }}
          onOpenUseCase={setStudioUseCaseId}
        />
      )}

    </div>
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
  v130 = null,
  knownPriorities: priorityList = [],
  foundationsById,
  feedbackAvailable = null,
  feedbackCurrent,
  feedbackBusy = false,
  feedbackError = '',
  onFeedback,
  onImplement,
  onOpenStudio,
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
      ? 'text-error bg-error-bg border-error/20'
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
  const genieActions = genieCardActions({
    hasGenieInstruction: shippedGenie,
    canMark: typeof onToggleGenieRegenSelect === 'function',
    notebookHref: workspaceNotebookHref,
  });

  if (!card) return null;

  return (
    <Card className="overflow-hidden shadow-none transition-colors hover:border-border-strong">
      <div className="flex items-start gap-3 p-5 pb-4">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`-ml-1 mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted ${
            isFavorite ? 'text-foreground' : 'text-subtle-foreground hover:text-foreground'
          }`}
          aria-pressed={isFavorite}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart size={16} className={isFavorite ? 'fill-current' : ''} />
        </button>
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
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-4 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-snug text-foreground">{titlePlain}</h3>
            {subtitleText && (
              <p className="mt-1 text-sm leading-6 text-muted-foreground line-clamp-2">{subtitleText}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {v130?.bestOfBest && (
                <Badge variant="warning" title={bestOfBestLabel(v130.bestOfBest)}>
                  <Star className="fill-current" />
                  Best of Best{v130.bestOfBest.rank ? ` #${v130.bestOfBest.rank}` : ''}
                </Badge>
              )}
              {showGenieInstructionBadge && (
                <Badge
                  variant={shippedGenie ? 'success' : 'outline'}
                  title={
                    shippedGenie
                      ? 'Full Genie code instruction (shipped)'
                      : 'Genie instruction text present (partial or skeleton)'
                  }
                >
                  {shippedGenie && <CheckCircle2 />}
                  {shippedGenie ? 'Has Genie instruction' : 'Genie (partial)'}
                </Badge>
              )}
              {belowBarLabelFromUseCase(u) && (
                <Badge variant="warning" title={belowBarLabelFromUseCase(u)}>
                  Below bar
                </Badge>
              )}
              <StrategyChip info={v130} />
              <FeedbackChip status={feedbackCurrent?.status || v130?.feedbackStatus} />
              {showPriorityPill && (
                <Badge variant="outline" className={priorityStyle}>
                  {priority}
                </Badge>
              )}
            </div>
            <p className="mt-2 text-xs text-subtle-foreground">
              {[domain || 'Unknown', subdomain, technique || ucType || '—'].filter(Boolean).join(' · ')}
            </p>
          </div>
          {inspireScoreNum != null && <ScoreChip score={inspireScoreNum} />}
        </div>
      </div>

      <Separator />
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        {typeof onImplement === 'function' && (
          <Button size="sm" onClick={(e) => { e.stopPropagation(); onImplement(); }}>
            <Sparkles size={14} />
            Implement with Genie
          </Button>
        )}
        {genieActions.primary === 'open-notebook' && (
          workspaceNotebookHref ? (
            <Button asChild variant="outline" size="sm">
              <a href={workspaceNotebookHref} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} />
                Open Notebook to implement
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!expanded) onToggle();
              }}
              title={notebookPath && !databricksHost ? 'Set the Databricks host in setup to open the notebook in the workspace' : 'The Genie instruction is shown in the details'}
            >
              <FileText size={14} />
              Open Notebook to implement
            </Button>
          )
        )}
        {genieActions.primary === 'mark' && (
          <Button
            variant="outline"
            size="sm"
            aria-pressed={genieRegenSelected}
            onClick={() => onToggleGenieRegenSelect(!genieRegenSelected)}
            className={genieRegenSelected ? 'border-foreground bg-muted' : ''}
          >
            {genieRegenSelected ? <CheckCircle2 size={14} /> : <Sparkles size={14} />}
            {genieRegenSelected ? 'Marked Ready for Genie Code Generation' : 'Mark Ready for Genie Code Generation'}
          </Button>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:ml-2">
          {typeof onOpenStudio === 'function' && (
            <Button variant="link" size="sm" onClick={(e) => { e.stopPropagation(); onOpenStudio(); }}>
              Open Studio
            </Button>
          )}
          {genieActions.regenerate && (
            <Button
              variant="link"
              size="sm"
              aria-pressed={genieRegenSelected}
              onClick={() => onToggleGenieRegenSelect(!genieRegenSelected)}
              className={genieRegenSelected ? 'text-foreground' : ''}
            >
              {genieRegenSelected ? <CheckCircle2 size={14} /> : <RefreshCw size={14} />}
              {genieRegenSelected ? 'Marked to regenerate' : 'Mark to regenerate'}
            </Button>
          )}
          {genieActions.openCurrentNotebook && (
            <Button asChild variant="link" size="sm">
              <a href={workspaceNotebookHref} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} />
                Open the current notebook
              </a>
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse use case details' : 'Expand use case details'}
        >
          <ChevronDown size={16} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </Button>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="space-y-5 border-t bg-panel px-5 py-5">
          {/* Statement & Solution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="mb-1.5 text-xs font-semibold text-foreground">
                Problem Statement
              </h4>
              <p className="text-sm text-text-secondary leading-relaxed">
                {statement || 'N/A'}
              </p>
            </div>
            <div>
              <h4 className="mb-1.5 text-xs font-semibold text-foreground">
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
              <h4 className="mb-1.5 text-xs font-semibold text-foreground">
                Business Value
              </h4>
              <p className="text-sm text-text-secondary leading-relaxed">
                {businessValue}
              </p>
            </div>
          )}

          <BestOfBestDetail info={v130} />
          <UseCaseStrategyDetail info={v130} knownPriorities={priorityList} foundationsById={foundationsById} />

          {/* Detail chips */}
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
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
                className="rounded-lg border bg-card p-3"
              >
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {item.label}
                </span>
                <span
                  className={`text-foreground break-words ${
                    item.mono ? 'font-mono text-xs' : ''
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
                <h4 className="text-xs font-semibold text-foreground">
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
                <pre className="text-xs text-text-primary bg-card p-4 overflow-x-auto max-h-60 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
                  {sql}
                </pre>
              </div>
            </div>
          )}

          {/* Notebook / Genie preview (skeleton or shipped) */}
          {hasNotebook && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-foreground">
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
                      className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
                      title="Open notebook in Databricks workspace"
                    >
                      Open in workspace
                    </a>
                  )}
                  <button
                    onClick={showNotebook ? () => setShowNotebook(false) : loadNotebookPreview}
                    disabled={notebookLoading}
                    className="text-xs font-medium text-text-secondary hover:text-text-primary flex items-center gap-1 transition-colors disabled:opacity-50"
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
                      <span className="text-xs text-text-secondary hover:text-text-primary cursor-help border border-border rounded px-1.5 py-0.5 transition-colors" tabIndex={0}>Help</span>
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
                <div className="relative rounded-lg border overflow-hidden">
                  <div className="bg-card p-4 overflow-x-auto max-h-[500px] overflow-y-auto">
                    <GenieMarkdownPreview content={notebookContent} />
                  </div>
                </div>
              )}
            </div>
          )}

          {typeof onFeedback === 'function' && (
            <FeedbackControls
              useCaseKey={v130?.useCaseKey}
              available={feedbackAvailable}
              current={feedbackCurrent}
              busy={feedbackBusy}
              error={feedbackError}
              onSubmit={onFeedback}
            />
          )}
        </div>
      )}
    </Card>
  );
}
