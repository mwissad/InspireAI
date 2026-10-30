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
  Compass,
  Flag,
  Star,
} from 'lucide-react';
import AnimatedCounter from '../components/AnimatedCounter';
import GenieMarkdownPreview from '../components/GenieMarkdownPreview';
import GlassCard from '../components/GlassCard';
import DomainSunburst from '../components/DomainSunburst';
import PriorityHeatmap from '../components/PriorityHeatmap';
import Celebration from '../components/Celebration';
import { SkeletonCard, SkeletonStats } from '../components/SkeletonLoader';
import { DataAccessBadge, FeedbackPanel, FoundationsPanel, SidebarFilterPanel, StrategyCoveragePanel } from '../components/ResultsInsights';
import UseCaseCard from '../components/UseCaseCard';
import {
  NOT_ALIGNED_FILTER,
  compareBestOfBestFirst,
  knownPriorities,
  latestFeedbackMap,
  matchesStrategyFilter,
  priorityMatches,
  strategyFilterOptions,
} from '../lib/v130UseCase';
import {
  FAVORITES_STORAGE_KEY,
  PRIORITY_ORDER,
  beneficiaryFromUc,
  cardTitlesOfUseCase,
  computeHighPriorityCount,
  displayCleanText,
  expandWorkspaceListCandidates,
  findUcForNotebookFilename,
  inspireScoreFromUc,
  loadFavoritesMap,
  favoriteCount,
  favoriteKeyOf,
  fieldOf,
  hasGenieInstruction,
  hasShippedGenieCode,
  sponsorFromUc,
  trackingIdOf,
} from '../lib/useCaseFields';
import { fileExtension, quickAccessFiles, visibleArtifactFiles } from '../lib/artifactFiles';
import { generationFolder, workspaceNotebookUrl, workspaceWebUiHashPath } from '../lib/workspaceLinks';
import ImplementWizard from './ImplementWizard';
import { MVP_FILTERS, implementState, mvpCounts, mvpFilterMatches, notebookRunEnded, notebookStatus, versionActive } from '../lib/implementWizard';
import { buildUseCaseList } from '../lib/useCaseList';
import { makeApiFetch, makeApiPostJson, requestHeaders } from '../lib/apiClient';

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
  onOpenImplement,
  onSessionChange,
}) {
  const {
    databricksHost,
    token,
    warehouseId: settingsWarehouseId,
    inspireDatabase: settingsInspireDb,
    notebookPath: settingsNotebookPath,
    serverEnvHasPat,
    showcase = '',
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
  const [filterMvp, setFilterMvp] = useState('all');
  const [filterStrategy, setFilterStrategy] = useState('all');
  const [filterBizPriority, setFilterBizPriority] = useState('all');
  const [sortBy, setSortBy] = useState('inspire');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showBestOfBestOnly, setShowBestOfBestOnly] = useState(false);

  // Favorites — browser localStorage, keyed by content fingerprint (works across sessions)
  const [favorites, setFavorites] = useState(loadFavoritesMap);
  const toggleFavorite = useCallback((uc) => {
    const id = favoriteKeyOf(uc);
    if (!id) return;
    setFavorites((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch { /* quota / private mode */ }
      return next;
    });
  }, []);

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

  // Subdomain expansion state
  const [expandedDomains, setExpandedDomains] = useState({});
  const [domainPanelOpen, setDomainPanelOpen] = useState(false);
  const [beneficiaryPanelOpen, setBeneficiaryPanelOpen] = useState(false);
  const [sponsorPanelOpen, setSponsorPanelOpen] = useState(false);
  const [strategyPanelOpen, setStrategyPanelOpen] = useState(false);
  const [bizPriorityPanelOpen, setBizPriorityPanelOpen] = useState(false);
  // Only one card expanded at a time
  const [expandedUseCase, setExpandedUseCase] = useState(null);
  const [implementUc, setImplementUc] = useState(null);
  const [implementFocus, setImplementFocus] = useState(null);
  const [implementView, setImplementView] = useState({ latest: [], notebook_run: null });
  const [implementRefresh, setImplementRefresh] = useState(0);
  const lastNotebookRun = useRef(null);

  const apiFetch = useMemo(() => makeApiFetch({ token, databricksHost, showcase }), [token, databricksHost, showcase]);
  const apiPostJson = useMemo(() => makeApiPostJson({ token, databricksHost, showcase }), [token, databricksHost, showcase]);

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
        if (err?.status === 409) setFeedbackState((prev) => ({ ...prev, available: false }));
        setFeedbackError({ key: info.useCaseKey, message });
      } finally {
        setFeedbackBusyKey('');
      }
    },
    [selectedSessionId, inspireDb, warehouseId, apiPostJson]
  );

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

  const implementRunning = implementView.notebook_run?.state === 'running'
    || implementView.latest.some((row) => versionActive(row, row.stalled));
  useEffect(() => {
    if (!selectedSessionId || !inspireDb || !warehouseId) {
      setImplementView({ latest: [], notebook_run: null });
      return undefined;
    }
    let cancelled = false;
    const q = new URLSearchParams({ inspire_database: inspireDb, warehouse_id: warehouseId, session_id: String(selectedSessionId) });
    const load = () => apiFetch(`/api/inspire/implement/history?${q}`)
      .then((data) => { if (!cancelled) setImplementView({ latest: data.latest || [], notebook_run: data.notebook_run || null }); })
      .catch(() => {});
    load();
    const timer = implementRunning ? setInterval(load, 15000) : null;
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [selectedSessionId, inspireDb, warehouseId, apiFetch, implementRefresh, implementRunning]);

  useEffect(() => {
    const run = implementView.notebook_run;
    const prev = lastNotebookRun.current;
    lastNotebookRun.current = run;
    if (!selectedSessionId || !notebookRunEnded(prev, run)) return;
    void refreshResultsJsonForSession(selectedSessionId).then(() => refreshUsecasesForSession(selectedSessionId));
  }, [implementView.notebook_run, selectedSessionId, refreshResultsJsonForSession, refreshUsecasesForSession]);

  useEffect(() => {
    if (selectedSessionId) onSessionChange?.(String(selectedSessionId));
  }, [selectedSessionId, onSessionChange]);

  const implementLatestById = useMemo(
    () => Object.fromEntries(implementView.latest.map((row) => [String(row.use_case_id), row])),
    [implementView.latest],
  );
  const mvpStateOf = (uc) => {
    const tid = trackingIdOf(uc);
    return tid ? implementState(implementLatestById[tid] || null) : null;
  };

  // ── Auto-load sessions when settings are available ──
  const [autoLoaded, setAutoLoaded] = useState(false);
  useEffect(() => {
    if (autoLoaded || !inspireDb || !warehouseId) return;
    setAutoLoaded(true);
    handleLoadSessions(true);
  }, [inspireDb, warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const allUseCases = useMemo(() => buildUseCaseList(results, usecases), [results, usecases]);
  const bizPriorities = useMemo(() => knownPriorities(results), [results]);

  // ── Resolve table from registry ──
  const tableRegistry = results?.table_registry;
  const resolveTable = useCallback((id) => {
    if (!tableRegistry || !id) return id;
    return tableRegistry[id] || id;
  }, [tableRegistry]);

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
        if (filterTechnique !== 'all' && String(fieldOf(uc, 'Analytics Technique', 'analytics_technique') || '') !== filterTechnique) return false;
        if (filterQuality !== 'all' && String(uc.Quality || '') !== filterQuality) return false;
        if (filterBeneficiary !== 'all' && beneficiaryFromUc(uc) !== filterBeneficiary) return false;
        if (filterSponsor !== 'all' && sponsorFromUc(uc) !== filterSponsor) return false;
        if (filterStrategy !== 'all' && !matchesStrategyFilter(uc._v130, filterStrategy)) return false;
        if (filterBizPriority !== 'all' && !priorityMatches(uc._v130?.priorityText, bizPriorities).includes(filterBizPriority)) return false;
        if (filterHasGenie === 'yes' && !hasGenieInstruction(uc)) return false;
        if (filterHasGenie === 'no' && hasGenieInstruction(uc)) return false;
        if (!mvpFilterMatches(filterMvp, mvpStateOf(uc))) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const shown = cardTitlesOfUseCase(uc);
          return (
            String(uc.Name || '').toLowerCase().includes(q) ||
            shown.title.toLowerCase().includes(q) ||
            shown.subtitle.toLowerCase().includes(q) ||
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
      const k = favoriteKeyOf(uc);
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
    ...new Set(allUseCases.map((uc) => fieldOf(uc, 'Analytics Technique', 'analytics_technique')).filter(Boolean)),
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
  const foundationsList = results?.foundations;
  const foundationsById = useMemo(
    () => new Map((Array.isArray(foundationsList) ? foundationsList : []).map((f) => [String(f.id), f])),
    [foundationsList],
  );
  const useCaseNameById = new Map();
  for (const uc of allUseCases) {
    for (const id of [uc?.catalog_no, uc?.No, uc?.id]) {
      if (id != null && String(id).trim() && !useCaseNameById.has(String(id).trim())) useCaseNameById.set(String(id).trim(), String(uc.Name || id));
    }
  }
  const feedbackLatest = useMemo(() => latestFeedbackMap(feedbackState.latest), [feedbackState.latest]);

  // Compute subdomain counts by domain
  const subdomainsByDomain = {};
  for (const uc of allUseCases) {
    const d = uc?._domain || 'Unknown';
    const sd = String(uc?.Subdomain || '');
    if (!sd) continue;
    if (!subdomainsByDomain[d]) subdomainsByDomain[d] = {};
    subdomainsByDomain[d][sd] = (subdomainsByDomain[d][sd] || 0) + 1;
  }

  const techniqueCount = techniques.length;
  const uniqueSubdomainCount = new Set(allUseCases.map((uc) => String(uc?.Subdomain || '').trim()).filter(Boolean)).size;

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
    filterMvp !== 'all' ||
    showBestOfBestOnly;

  const clearAllFilters = () => {
    setSearchQuery(''); setFilterDomain('all'); setFilterSubdomain('all');
    setFilterPriority('all'); setFilterType('all'); setFilterTechnique('all');
    setFilterQuality('all');
    setFilterBeneficiary('all'); setFilterSponsor('all');
    setFilterStrategy('all'); setFilterBizPriority('all');
    setFilterHasGenie('all');
    setFilterMvp('all');
    setShowBestOfBestOnly(false);
  };

  // Load generation artifacts — tries multiple path variations
  const artifactHeaders = useCallback(() => requestHeaders(token, databricksHost, {}, showcase), [token, databricksHost, showcase]);

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
  const generationPath = generationFolder({
    generationPath: selectedSession?.generation_path || selectedSession?.widget_values?.generation_path || '',
    notebookPath: settings?.notebookPath || '',
    businessName: selectedSession?.widget_values?.business || selectedSession?.widget_values?.['00_business_name'] || selectedSession?.business_name || '',
  });

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
    if (!generationPath || showcase) return;
    if (!token && !serverEnvHasPat) return;
    const k = `${selectedSessionId}|${generationPath}`;
    if (lastArtifactsLoadKeyRef.current === k) return;
    lastArtifactsLoadKeyRef.current = k;
    setArtifactTree({});
    setAllNotebookFiles([]);
    console.log('[Inspire] Auto-loading artifacts from:', generationPath);
    loadArtifacts(generationPath);
  }, [generationPath, selectedSessionId, token, serverEnvHasPat, loadArtifacts, showcase]);

  const highPriorityCount = computeHighPriorityCount(allUseCases);
  const canImplement = !showcase && !!(selectedSessionId && inspireDb && warehouseId);
  const startImplement = (uc) => { setImplementFocus(null); setImplementUc(uc); };
  const feedbackCurrentFor = (uc) => (uc?._v130?.useCaseKey ? feedbackLatest[uc._v130.useCaseKey] : undefined);
  const detailPropsFor = (uc) => {
    const key = uc?._v130?.useCaseKey;
    return {
      resolveTable,
      token,
      databricksHost,
      showcase,
      allNotebookFiles,
      knownPriorities: bizPriorities,
      foundationsById,
      feedbackAvailable: feedbackState.available,
      feedbackBusy: !!key && feedbackBusyKey === key,
      feedbackError: key && feedbackError.key === key ? feedbackError.message : '',
      onFeedback: (status, reason) => submitFeedback(uc, uc._v130, status, reason),
    };
  };

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
                className="text-db-red-fg"
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
          <BarChart3 size={18} className="text-db-red-fg shrink-0" strokeWidth={1.75} aria-hidden />
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
                        {i === 0 && <Database size={18} className="text-db-red-fg" />}
                        {i === 1 && <Search size={18} className="text-db-red-fg" />}
                        {i === 2 && <FileText size={18} className="text-db-red-fg" />}
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
                  <AlertCircle size={20} className="text-error-fg" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary mb-1">Could not load sessions</p>
                  <p className="text-xs text-text-secondary mb-3">{sessionsError}</p>
                  <button onClick={() => handleLoadSessions(false)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-db-red-fg bg-db-red-50 border border-db-red/20 rounded-lg hover:bg-db-red/10 transition-smooth">
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
                            ? 'bg-success-bg text-success-fg border-success/20'
                            : 'bg-warning-bg text-warning-fg border-warning/20'
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
              <Loader2 size={16} className="animate-spin text-db-red-fg" />
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
          <AlertCircle size={14} className="text-error-fg shrink-0" />
          <span className="text-sm text-error-fg">{error}</span>
        </div>
      )}

      {/* ═══ Results content ═══ */}
      {results && (
        <>
          {/* Progressive results banner */}
          {isProgressive && (
            <div className="flex items-center gap-3 p-3 bg-warning-bg border border-warning/20 rounded-lg mb-3">
              <Loader2 size={14} className="animate-spin text-warning-fg shrink-0" />
              <div className="flex-1">
                <span className="text-sm font-semibold text-warning-fg">Live Preview</span>
                <span className="text-xs text-text-secondary ml-2">
                  Showing {allUseCases.length} use cases from {results._step_count || 0} completed steps.
                  Results will be enriched as the pipeline progresses.
                </span>
              </div>
              <button
                onClick={() => loadResults(selectedSessionId)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-warning-fg border border-warning/30 rounded-md hover:bg-warning/10 transition-smooth"
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
                <FileText size={12} className="text-db-red-fg" strokeWidth={2} />
              </div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-db-red-fg">
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
                    <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.18em] text-text-tertiary transition-colors hover:text-db-red-fg [&::-webkit-details-marker]:hidden flex items-center gap-1.5">
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
                      <CheckCircle2 size={14} className="text-success-fg" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-text-primary tracking-tight">Execution Complete</h3>
                      <p className="text-[10px] text-text-tertiary">
                        {displayCleanText(
                          typeof results.title === 'string' ? results.title : 'Pipeline finished successfully'
                        )}
                      </p>
                      {(results.selection_outcome || results.elite_outcome) && (
                        <p className="text-[10px] text-warning-fg mt-0.5">
                          {displayCleanText(String(results.selection_outcome || results.elite_outcome))}
                        </p>
                      )}
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
                      <div className="text-lg font-bold text-db-red-fg tabular-nums tracking-tight">{highPriorityCount}</div>
                      <div className="text-[9px] text-text-tertiary uppercase tracking-[0.18em] font-semibold">High Priority</div>
                    </div>
                  </div>
                </div>
                {/* Pipeline stages row */}
                <div className="flex items-center gap-1 pt-2 border-t border-border overflow-x-auto">
                  {PIPELINE_STAGES.map((stage, i) => (
                    <div key={stage} className="flex items-center shrink-0">
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-success-bg">
                        <CheckCircle2 size={11} className="text-success-fg shrink-0" />
                        <span className="text-[10px] font-medium text-success-fg whitespace-nowrap">{stage}</span>
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
          {!isProgressive && generationPath && !showcase && (() => {
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
                            <FolderOpen size={12} className="text-warning-fg shrink-0" />
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
                                  className="text-[10px] text-info-fg hover:underline font-medium flex items-center gap-0.5"
                                  onClick={(e) => { e.stopPropagation(); togglePreview(f.path, f.name); }}
                                >
                                  {previewFile === f.path ? <><Eye size={10} /> Hide</> : <><Eye size={10} /> Preview</>}
                                </button>
                              )}
                              {(isPdf || isSpreadsheet) && (
                                <button
                                  type="button"
                                  className="text-[10px] text-success-fg hover:underline font-medium flex items-center gap-0.5"
                                  onClick={(e) => { e.stopPropagation(); openFileInTab(f.path, f.name); }}
                                >
                                  <ExternalLink size={10} /> Open
                                </button>
                              )}
                              <button
                                type="button"
                                className="text-[10px] text-db-red-fg hover:underline font-medium flex items-center gap-0.5"
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
                            className="text-[10px] text-info-fg hover:underline font-medium flex items-center gap-0.5 shrink-0"
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
                            <p className="text-[10px] text-error-fg py-2">{previewData.message}</p>
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
                              <button type="button" onClick={(e) => { e.stopPropagation(); loadFolder(f.path); }} className="ml-2 text-[10px] text-db-red-fg hover:underline">Retry</button>
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
                    <FolderOpen size={14} className="text-info-fg" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xs font-bold text-text-primary">Generated Artifacts</h3>
                    <p className="text-[10px] text-text-tertiary font-mono">{generationPath}</p>
                  </div>
                  {artifactsRootFiles && artifactsRootFiles.length > 0 && (
                    <span className="text-[10px] text-info-fg font-semibold bg-info-bg px-2 py-0.5 rounded-full">
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
                          className="mt-2 text-[10px] text-db-red-fg hover:underline font-medium"
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
            const artifactFiles = [];
            const collect = (files) => {
              if (!files) return;
              for (const f of files) {
                if (f.is_directory) {
                  const sub = artifactTree[f.path];
                  if (sub?.files) collect(sub.files);
                } else {
                  artifactFiles.push(f);
                }
              }
            };
            collect(artifactsRootFiles);
            const previewableFiles = quickAccessFiles(artifactFiles);
            if (previewableFiles.length === 0) return null;

            const EXT_STYLES = {
              pdf:  { bg: 'bg-error-bg', text: 'text-error-fg' },
              csv:  { bg: 'bg-success-bg', text: 'text-success-fg' },
              xlsx: { bg: 'bg-info-bg', text: 'text-info-fg' },
              xls:  { bg: 'bg-info-bg', text: 'text-info-fg' },
            };

            return (
              <div className="bg-surface border border-border/70 rounded-xl p-4 mb-6 shadow-elevated">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-db-red/10 ring-1 ring-inset ring-db-red/20">
                    <FileText size={12} className="text-db-red-fg" strokeWidth={2} />
                  </div>
                  <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.18em]">Quick Access — Documents & Data</h3>
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {previewableFiles.map((f) => {
                    const ext = fileExtension(f);
                    const style = EXT_STYLES[ext] || EXT_STYLES.csv;
                    const isActive = previewFile === f.path;
                    return (
                      <div key={f.path} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] border transition-all shrink-0 ${isActive ? 'border-db-red/30 bg-db-red-50' : 'border-border bg-bg-subtle/50 hover:bg-bg-subtle'}`}>
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>{ext}</span>
                        <span className="text-text-primary font-medium truncate max-w-[200px]">{f.name}</span>
                        <div className="flex items-center gap-1.5 ml-1 border-l border-border pl-2">
                          <button type="button" className="text-[10px] text-info-fg hover:text-info-fg font-medium flex items-center gap-0.5 hover:underline" onClick={() => togglePreview(f.path, f.name)}>
                            {isActive ? <><EyeOff size={9} /> Hide</> : <><Eye size={9} /> Preview</>}
                          </button>
                          <button type="button" className="text-[10px] text-success-fg font-medium flex items-center gap-0.5 hover:underline" onClick={() => openFileInTab(f.path, f.name)}>
                            <ExternalLink size={9} /> Open
                          </button>
                          <button type="button" className="text-[10px] text-db-red-fg font-medium flex items-center gap-0.5 hover:underline" onClick={() => downloadFile(f.path, f.name)}>
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
                      <p className="text-[10px] text-error-fg py-2">{previewData.message}</p>
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
                  if (uc && hasShippedGenieCode(uc)) notebookFiles.push(f);
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
                    <Sparkles size={12} className="text-db-red-fg shrink-0" aria-hidden />
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
                                    className="shrink-0 text-db-red-fg opacity-80 group-hover:opacity-100"
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
          {canImplement && (
            <MvpTiles
              counts={mvpCounts(allUseCases.map(mvpStateOf))}
              active={filterMvp}
              onPick={(id) => setFilterMvp(filterMvp === id ? 'all' : id)}
            />
          )}


          {v130Session && (
            <>
              <DataAccessBadge results={results} />
              <div className="grid grid-cols-1 lg:grid-cols-3 items-start gap-3 mb-4">
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
                  <Layers size={14} className="mt-0.5 shrink-0 text-db-red-fg" />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-text-primary">Domains</span>
                    <p className="text-[10px] text-text-tertiary mt-0.5">
                      {domains.length} domain{domains.length !== 1 ? 's' : ''} &middot; {allUseCases.length} use cases
                    </p>
                    {!domainPanelOpen && (filterDomain !== 'all' || filterSubdomain !== 'all') && (
                      <p
                        className="mt-1 truncate text-[10px] font-medium text-db-red-fg"
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
                      <Layers size={10} className={filterDomain === 'all' ? 'text-db-red-fg' : 'text-text-tertiary'} />
                    </div>
                    <span className={`text-[11px] font-semibold flex-1 ${
                      filterDomain === 'all' ? 'text-db-red-fg' : 'text-text-primary'
                    }`}>
                      All Domains
                    </span>
                    <span className={`text-[10px] font-mono tabular-nums ${filterDomain === 'all' ? 'text-db-red-fg' : 'text-text-tertiary'}`}>
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
                              <Building2 size={10} className={active ? 'text-db-red-fg' : 'text-text-tertiary'} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className={`text-[11px] font-semibold block truncate ${
                                active ? 'text-db-red-fg' : 'text-text-primary'
                              }`}>
                                {d}
                              </span>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] text-text-tertiary font-mono tabular-nums">{count} use case{count !== 1 ? 's' : ''}</span>
                                {highPriCount > 0 && (
                                  <span className="text-[9px] text-db-red-fg font-medium">{highPriCount} high pri</span>
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
                                      ? 'bg-db-red-50/70 text-db-red-fg'
                                      : 'text-text-secondary hover:bg-bg-subtle'
                                  }`}
                                >
                                  <span className={`text-[10px] font-medium truncate flex-1 ${sdActive ? 'text-db-red-fg' : ''}`}>{sd}</span>
                                  <span className={`text-[9px] font-mono ${sdActive ? 'text-db-red-fg' : 'text-text-tertiary'}`}>{sdCount}</span>
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
                        ? 'bg-db-red-50 text-db-red-fg border-db-red/20'
                        : 'bg-bg text-text-secondary border-border hover:border-border-strong'
                    }`}
                    title={showFavoritesOnly ? 'Show all use cases' : 'Show favorites only'}
                  >
                    <Heart size={13} className={showFavoritesOnly ? 'fill-current' : ''} />
                    {favoriteCount(favorites) > 0 && (
                      <span className="text-[10px]">{favoriteCount(favorites)}</span>
                    )}
                  </button>

                  {starredCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowBestOfBestOnly(!showBestOfBestOnly)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-smooth ${
                        showBestOfBestOnly
                          ? 'bg-warning-bg text-warning-fg border-warning/35'
                          : 'bg-bg text-text-secondary border-border hover:border-border-strong'
                      }`}
                      title={showBestOfBestOnly ? 'Show all use cases' : 'Show Best of Best use cases only'}
                      aria-pressed={showBestOfBestOnly}
                    >
                      <Star size={13} className={showBestOfBestOnly ? 'fill-current' : ''} />
                      Best of Best
                      <span className="text-[10px]">{starredCount}</span>
                    </button>
                  )}

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
                                ? 'border-db-red/30 bg-db-red-50 text-db-red-fg'
                                : 'border-transparent text-text-secondary hover:bg-bg-subtle'
                            }`}
                          >
                            {p.replace('Ultra ', 'U-').replace('Very ', 'V-')}
                            <span className={`font-mono ${active ? 'text-db-red-fg' : 'text-text-tertiary'}`}>{cnt}</span>
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

                  <select
                    value={filterMvp}
                    onChange={(e) => setFilterMvp(e.target.value)}
                    aria-label="MVP"
                    title="Filter by the use case's MVP"
                    className="px-2 py-1.5 text-[11px] border border-border rounded-lg bg-bg text-text-primary focus:outline-none focus:border-db-red/30 transition-smooth min-w-[9rem]"
                  >
                    {MVP_FILTERS.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
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
                      className="text-[11px] text-db-red-fg hover:underline font-medium shrink-0"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Active filter chips */}
                {hasActiveFilters && (
                  <div className="px-4 py-2 bg-db-red-50/50 border-t border-border flex items-center gap-2 flex-wrap">
                    <Filter size={12} className="text-db-red-fg shrink-0" />
                    <span className="text-[11px] text-text-secondary">
                      <span className="font-semibold text-text-primary tabular-nums">{filteredUseCases.length}</span> of{' '}
                      <span className="font-semibold text-text-primary tabular-nums">{allUseCases.length}</span> use cases
                    </span>
                    {filterDomain !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red-fg text-[10px] font-medium border border-db-red/20">
                        {filterDomain}
                        <button onClick={() => { setFilterDomain('all'); setFilterSubdomain('all'); }} className="hover:text-db-red-fg">&times;</button>
                      </span>
                    )}
                    {filterSubdomain !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red-fg text-[10px] font-medium border border-db-red/20">
                        Sub: {filterSubdomain}
                        <button onClick={() => setFilterSubdomain('all')} className="hover:text-db-red-fg">&times;</button>
                      </span>
                    )}
                    {filterPriority !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red-fg text-[10px] font-medium border border-db-red/20">
                        {filterPriority}
                        <button onClick={() => setFilterPriority('all')} className="hover:text-db-red-fg">&times;</button>
                      </span>
                    )}
                    {filterType !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red-fg text-[10px] font-medium border border-db-red/20">
                        {filterType}
                        <button onClick={() => setFilterType('all')} className="hover:text-db-red-fg">&times;</button>
                      </span>
                    )}
                    {filterTechnique !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red-fg text-[10px] font-medium border border-db-red/20">
                        {filterTechnique}
                        <button onClick={() => setFilterTechnique('all')} className="hover:text-db-red-fg">&times;</button>
                      </span>
                    )}
                    {filterQuality !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red-fg text-[10px] font-medium border border-db-red/20">
                        Q: {filterQuality}
                        <button onClick={() => setFilterQuality('all')} className="hover:text-db-red-fg">&times;</button>
                      </span>
                    )}
                    {filterHasGenie !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red-fg text-[10px] font-medium border border-db-red/20">
                        Genie: {filterHasGenie === 'yes' ? 'Yes' : 'No'}
                        <button type="button" onClick={() => setFilterHasGenie('all')} className="hover:text-db-red-fg">&times;</button>
                      </span>
                    )}
                    {filterMvp !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red-fg text-[10px] font-medium border border-db-red/20">
                        {MVP_FILTERS.find((f) => f.id === filterMvp)?.label}
                        <button type="button" aria-label="Clear the MVP filter" onClick={() => setFilterMvp('all')} className="hover:text-db-red-fg">&times;</button>
                      </span>
                    )}
                    {searchQuery && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red-fg text-[10px] font-medium border border-db-red/20">
                        "{searchQuery}"
                        <button onClick={() => setSearchQuery('')} className="hover:text-db-red-fg">&times;</button>
                      </span>
                    )}
                  </div>
                )}
              </div>

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
                      const favKey = favoriteKeyOf(uc);
                      const tid = trackingIdOf(uc);
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
                        v130={uc._v130}
                        feedbackCurrent={feedbackCurrentFor(uc)}
                        implementStatus={tid ? implementState(implementLatestById[tid] || null, notebookStatus(uc, implementView.notebook_run)) : null}
                        onImplement={canImplement ? () => startImplement(uc) : undefined}
                        onOpenMvp={onOpenImplement && tid && selectedSessionId ? () => onOpenImplement(String(selectedSessionId), tid) : undefined}
                        notebookUrl={workspaceNotebookUrl(databricksHost, uc.notebook_path || '')}
                        {...detailPropsFor(uc)}
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
                      className="text-xs text-db-red-fg hover:underline mt-2 font-medium"
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
            setImplementRefresh((n) => n + 1);
            onOpenImplement?.(String(selectedSessionId), data.use_case_id);
          }}
          onOpenBuild={onOpenImplement ? (useCaseId) => {
            setImplementUc(null);
            setImplementFocus(null);
            onOpenImplement(String(selectedSessionId), useCaseId);
          } : null}
        />
      )}

    </div>
  );
}

const MVP_TILES = [
  { id: 'has', label: 'MVPs started', icon: Layers },
  { id: 'live', label: 'MVPs live', icon: CheckCircle2 },
  { id: 'building', label: 'Building', icon: Loader2 },
  { id: 'failed', label: 'Failed', icon: AlertCircle },
  { id: 'none', label: 'No MVP yet', icon: FileText },
];

function MvpTiles({ counts, active, onPick }) {
  return (
    <div role="group" aria-label="MVPs" className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
      {MVP_TILES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={active === id}
          aria-label={`${label}: ${counts[id]}`}
          title={active === id ? 'Show every use case' : `Show only: ${label}`}
          onClick={() => onPick(id)}
          className={`text-left rounded-xl border p-3 transition-smooth focus:outline-none focus-visible:ring-2 focus-visible:ring-db-red/40 ${
            active === id ? 'border-db-red/40 bg-db-red-50' : 'border-border bg-surface hover:border-db-red/25'
          }`}
        >
          <span className="flex items-center gap-2 mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">
            <Icon size={11} className="text-db-red-fg" />
            {label}
          </span>
          <span className="block text-2xl font-bold text-text-primary tabular-nums tracking-tight">{counts[id]}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ label, value, icon: Icon, renderValue }) {
  return (
    <GlassCard tilt className="p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-db-red/10 ring-1 ring-inset ring-db-red/15">
          <Icon size={11} className="text-db-red-fg" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text-primary tabular-nums tracking-tight">
        {renderValue != null ? renderValue : <AnimatedCounter value={Number(value) || 0} />}
      </div>
    </GlassCard>
  );
}
