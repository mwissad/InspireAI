import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Play,
  Loader2,
  AlertCircle,
  Building2,
  Database,
  Target,
  Layers,
  FileText,
  Search,
  CheckCircle2,
  Globe2,
  ChevronDown,
  Sliders,
  Settings2,
  Zap,
  Bot,
  Table2,
  ShoppingCart,
  X,
  TrendingUp,
  DollarSign,
  Cog,
  Shield,
  Users,
  Star,
  Rocket,
  Leaf,
  Lock,
  Crosshair,
  Eye,
  Calendar,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import DocumentLanguagesMultiselect from '../components/DocumentLanguagesMultiselect';
import SegmentedControl from '../components/SegmentedControl';
import StrategyEditor from '../components/StrategyEditor';
import { parseStrategicContext, splitPriorities, validateStrategicContextText, withPriorities } from '../lib/strategyContext';
import UcPermissionErrorHelp from '../components/UcPermissionErrorHelp';
import { parseDocumentLanguages, formatDocumentLanguages } from '../constants/documentLanguages';
import { interpretUcPermissionError, parseApiErrorMessage } from '../lib/ucPermissionErrors';

/* ─── Constants — notebook v1.2.0 widget `05_use_cases_quality` ─── */
const QUALITY_OPTIONS = ['Good', 'High', 'Ultra High'];

const DISCOVERY_OPTIONS = [
  {
    key: 'Deep',
    icon: Eye,
    desc: 'Reads aggregates (counts, dates, null rates). Never sends row values to the AI.',
  },
  {
    key: 'Standard',
    icon: Lock,
    desc: 'Metadata only. Never reads a row of your data.',
  },
];
const GENIE_SCOPE_OPTIONS = [
  { value: '0', label: 'Off' },
  { value: '5', label: 'Top 5' },
  { value: 'all', label: 'All' },
];
const QUALITY_SEGMENTS = QUALITY_OPTIONS.map((q) => ({ value: q, label: q.replace(' Quality', '') }));
const TABLE_ELECTION = ['Let Inspire Decides', 'All Tables', 'Transactional Only'];
/** Show guidance when explicit table selection exceeds this count. */
const TABLE_SELECTION_WARN_THRESHOLD = 10;
/** Documented sweet spot for discovery quality and runtime. */
const TABLE_SELECTION_IDEAL_MAX = 25;
const OPERATION_WIDGET_OPTIONS = ['Discover Use Cases', 'Generate Use Cases'];
const GENERATION_OPTIONS = [
  { key: 'PDF Catalog', icon: FileText, desc: 'Professional PDF use case catalog' },
  { key: 'Presentation', icon: Target, desc: 'Executive-ready slide deck' },
];
const BUSINESS_PRIORITIES = [
  { key: 'Increase Revenue', icon: TrendingUp },
  { key: 'Reduce Cost', icon: DollarSign },
  { key: 'Optimize Operations', icon: Cog },
  { key: 'Mitigate Risk', icon: Shield },
  { key: 'Empower Talent', icon: Users },
  { key: 'Enhance Experience', icon: Star },
  { key: 'Drive Innovation', icon: Rocket },
  { key: 'Achieve ESG', icon: Leaf },
  { key: 'Protect Revenue', icon: Lock },
  { key: 'Execute Strategy', icon: Crosshair },
];

function isNumericPriorityString(str) {
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

/** Same scoring rules as Results use case cards (for preview badges). */
function inspireScoreFromUc(uc) {
  if (!uc || typeof uc !== 'object') return null;
  const bob = Number(uc.bob_score ?? uc['BoB Score']);
  if (Number.isFinite(bob)) return bob;
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

function flattenPreviewFromResults(results) {
  const out = [];
  if (!results?.domains || !Array.isArray(results.domains)) return out;
  for (const domain of results.domains) {
    const ucs = Array.isArray(domain?.use_cases) ? domain.use_cases : [];
    for (const uc of ucs) {
      out.push({
        ...uc,
        _domain: domain.domain_name || '',
        Name: uc.Name || uc.use_case_name || uc.name || '',
        Statement: uc.Statement || uc.description || uc.problem_statement || '',
      });
    }
  }
  return out;
}

function useCaseTitle(uc) {
  return uc.Name || uc.use_case_name || uc.name || 'Use case';
}

function useCaseBlurb(uc) {
  return uc.Statement || uc.description || uc.problem_statement || uc.Solution || '';
}

function formatSessionWhen(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

/** Optional warehouse_id improves UC browsing for service principals (SQL SHOW … fallback). */
function ucBrowseQuery(warehouseId) {
  if (!warehouseId) return '';
  return `?warehouse_id=${encodeURIComponent(warehouseId)}`;
}

export default function LaunchPage({ settings, update, onLaunched, onOpenResults, onNoData }) {
  const { databricksHost, token, notebookPath, warehouseId, inspireDatabase, serverEnvHasPat } = settings;
  const canUseUcApi = !!(databricksHost && (token || serverEnvHasPat));

  // ── Widget params (must match notebook widget names exactly) ──
  const [params, setParams] = useState({
    '15_operation': 'Discover Use Cases',
    '00_business_name': '',
    '01_uc_metadata': '',
    '02_inspire_database': inspireDatabase || '',
    '03_discovery_type': 'Deep',
    '04_table_election': 'Let Inspire Decides',
    '05_use_cases_quality': 'Good',
    '06_business_domains': '',
    '07_business_priorities': '',
    '08_generation_instructions': '',
    '09_generation_options': 'PDF Catalog',
    '10_strategic_context': '',
    '11_generation_path': './../demos/',
    '12_documents_languages': 'English',
    '13_generate_genie_code_for': '5',
    '14_session_id': '',
    '16_best_of_best_count': '',
  });

  // ── Catalog/Schema pickers ──
  const [catalogs, setCatalogs] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [selectedCatalogs, setSelectedCatalogs] = useState([]);
  const [selectedSchemas, setSelectedSchemas] = useState([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [schemaSearch, setSchemaSearch] = useState('');

  // ── Table state ──
  const [tables, setTables] = useState([]);
  const [selectedTables, setSelectedTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tableSearch, setTableSearch] = useState('');

  // ── Launch state ──
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [catalogBrowseError, setCatalogBrowseError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showStrategy, setShowStrategy] = useState(false);
  const [discoveryTouched, setDiscoveryTouched] = useState(false);
  const [strategyTouched, setStrategyTouched] = useState(false);
  const [prefillNote, setPrefillNote] = useState('');

  const [sessionsList, setSessionsList] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [allCreatedUcs, setAllCreatedUcs] = useState([]);
  const [allCreatedError, setAllCreatedError] = useState('');
  const [quickViewSid, setQuickViewSid] = useState(null);
  const [quickViewCache, setQuickViewCache] = useState({});
  const [quickViewLoading, setQuickViewLoading] = useState(null);
  /** Experiments list + quick view — collapsed by default to keep Get Started above the fold */
  const [experimentsOverviewExpanded, setExperimentsOverviewExpanded] = useState(false);

  // ── Metadata picker state ──
  const [pickerExpanded, setPickerExpanded] = useState(true);
  const [metadataPreviewExpanded, setMetadataPreviewExpanded] = useState(false);

  // ── Multiselects ──
  const [genChecks, setGenChecks] = useState({
    'PDF Catalog': true,
    Presentation: false,
  });
  const [priorityChecks, setPriorityChecks] = useState({});
  const [customPriorities, setCustomPriorities] = useState([]);
  const [customPriorityDraft, setCustomPriorityDraft] = useState('');
  const [strategyBase, setStrategyBase] = useState('');


  // In Databricks App mode, the proxy injects x-forwarded-access-token automatically.
  // Only send explicit auth headers when the user has configured a PAT token locally.
  const apiFetch = useCallback(
    async (url, opts = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        ...opts.headers,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['X-DB-PAT-Token'] = token;
      }
      if (databricksHost) headers['X-Databricks-Host'] = databricksHost;
      const resp = await fetch(url, { ...opts, headers });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        const message = parseApiErrorMessage(errText) || `${resp.status}`;
        throw new Error(message);
      }
      return resp.json();
    },
    [token, databricksHost]
  );

  // Sync inspire database from settings
  useEffect(() => {
    if (inspireDatabase) {
      setParams((p) => ({ ...p, '02_inspire_database': inspireDatabase }));
    }
  }, [inspireDatabase]);

  const previewDb = inspireDatabase || params['02_inspire_database'];

  // Experiments list + all use cases (for per-session counts) when opening Get Started.
  useEffect(() => {
    if (!databricksHost || !(token || serverEnvHasPat) || !warehouseId || !previewDb) {
      setSessionsList([]);
      setAllCreatedUcs([]);
      setOverviewLoading(false);
      setOverviewError('');
      setAllCreatedError('');
      setQuickViewSid(null);
      setQuickViewCache({});
      setQuickViewLoading(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setOverviewLoading(true);
      setOverviewError('');
      setAllCreatedError('');
      setQuickViewSid(null);
      setQuickViewCache({});
      try {
        const qSessions = new URLSearchParams({
          inspire_database: previewDb,
          warehouse_id: warehouseId,
        });
        const qAll = new URLSearchParams({
          inspire_database: previewDb,
          warehouse_id: warehouseId,
          all_sessions: '1',
          limit: '400',
        });
        const [sessionPayload, allUcPayload] = await Promise.all([
          apiFetch(`/api/inspire/sessions?${qSessions}`),
          apiFetch(`/api/inspire/usecases?${qAll}`).catch((e) => ({
            usecases: [],
            _err: e.message || 'Could not load use cases',
          })),
        ]);
        if (cancelled) return;
        setSessionsList(sessionPayload.sessions || []);
        if (allUcPayload._err) setAllCreatedError(allUcPayload._err);
        else setAllCreatedUcs(allUcPayload.usecases || []);
      } catch (e) {
        if (!cancelled) {
          setOverviewError(e.message || 'Could not load experiments');
          setSessionsList([]);
        }
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [databricksHost, token, serverEnvHasPat, warehouseId, previewDb, apiFetch]);

  const useCaseCountBySession = useMemo(() => {
    const m = new Map();
    for (const uc of allCreatedUcs) {
      const k = String(uc.session_id ?? '');
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [allCreatedUcs]);

  const fetchUseCasesForSession = useCallback(
    async (sid) => {
      const q = new URLSearchParams({
        inspire_database: previewDb,
        warehouse_id: warehouseId,
        session_id: String(sid),
      });
      let ucs = [];
      try {
        const ucData = await apiFetch(`/api/inspire/usecases?${q}`);
        if (ucData.usecases?.length) ucs = ucData.usecases;
      } catch { /* fall through */ }
      if (ucs.length === 0) {
        try {
          const resData = await apiFetch(`/api/inspire/results?${q}`);
          if (resData.results) ucs = flattenPreviewFromResults(resData.results);
        } catch { /* ignore */ }
      }
      if (ucs.length === 0) {
        try {
          const step = await apiFetch(`/api/inspire/step-results?${q}`);
          if (step.results) ucs = flattenPreviewFromResults(step.results);
        } catch { /* ignore */ }
      }
      return ucs;
    },
    [previewDb, warehouseId, apiFetch]
  );

  const getUcsForSession = useCallback(
    (sid) => {
      const id = String(sid);
      const fromTable = allCreatedUcs.filter((uc) => String(uc.session_id) === id);
      if (fromTable.length > 0) return fromTable;
      if (Object.prototype.hasOwnProperty.call(quickViewCache, id)) return quickViewCache[id];
      return null;
    },
    [allCreatedUcs, quickViewCache]
  );

  const onQuickViewToggle = useCallback(
    async (sid) => {
      const id = String(sid);
      if (quickViewSid === id) {
        setQuickViewSid(null);
        return;
      }
      setQuickViewSid(id);
      const fromTable = allCreatedUcs.filter((uc) => String(uc.session_id) === id);
      if (fromTable.length > 0) return;
      if (Object.prototype.hasOwnProperty.call(quickViewCache, id)) return;
      setQuickViewLoading(id);
      try {
        const ucs = await fetchUseCasesForSession(id);
        setQuickViewCache((prev) => ({ ...prev, [id]: ucs }));
      } catch {
        setQuickViewCache((prev) => ({ ...prev, [id]: [] }));
      } finally {
        setQuickViewLoading((cur) => (cur === id ? null : cur));
      }
    },
    [quickViewSid, allCreatedUcs, quickViewCache, fetchUseCasesForSession]
  );

  // v1.2.0 generation options only control document artifacts.
  // Auto-Genie is independently controlled by 13_generate_genie_code_for.
  useEffect(() => {
    const sel = Object.entries(genChecks).filter(([, v]) => v).map(([k]) => k);
    setParams((p) => ({ ...p, '09_generation_options': sel.join(',') }));
  }, [genChecks]);

  // Sync business priorities
  useEffect(() => {
    const sel = Object.entries(priorityChecks).filter(([, v]) => v).map(([k]) => k);
    setParams((p) => ({ ...p, '07_business_priorities': sel.join(',') }));
  }, [priorityChecks]);

  // Build UC metadata — uses the most specific level selected (tables > schemas > catalogs)
  // All values use the Databricks 3-level namespace: catalog.schema.table
  useEffect(() => {
    let metadata = '';
    if (selectedTables.length > 0) {
      // Tables are the most specific — use full 3-level names (catalog.schema.table)
      metadata = selectedTables.join(',');
      setParams((p) => ({ ...p, '01_uc_metadata': metadata, '04_table_election': 'All Tables' })
      );
    } else if (selectedSchemas.length > 0) {
      // Schemas selected — use 2-level names (catalog.schema)
      metadata = selectedSchemas.join(',');
      setParams((p) => ({ ...p, '01_uc_metadata': metadata }));
    } else if (selectedCatalogs.length > 0) {
      // Only catalogs — use catalog names
      metadata = selectedCatalogs.join(',');
      setParams((p) => ({ ...p, '01_uc_metadata': metadata }));
    } else {
      setParams((p) => ({ ...p, '01_uc_metadata': '' }));
    }
  }, [selectedCatalogs, selectedSchemas, selectedTables]);

  // Load catalogs — host required; browser PAT optional when server has SP OAuth / DATABRICKS_TOKEN.
  useEffect(() => {
    if (!canUseUcApi) {
      setCatalogs([]);
      setLoadingCatalogs(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingCatalogs(true);
      setCatalogBrowseError('');
      let lastError = '';
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const data = await apiFetch(`/api/catalogs${ucBrowseQuery(warehouseId)}`);
          const cats = data.catalogs || [];
          console.log(`[catalogs] loaded ${cats.length}:`, cats.map(c => c.name));
          if (!cancelled) {
            setCatalogs(cats);
            if (cats.length === 0 && data.restError) {
              setCatalogBrowseError(data.restError);
            }
            setLoadingCatalogs(false);
          }
          return;
        } catch (err) {
          lastError = err.message || String(err);
          console.warn(`[catalogs] attempt ${attempt} error:`, lastError);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      if (!cancelled) {
        setCatalogBrowseError(lastError || 'Could not load Unity Catalog metadata.');
        setLoadingCatalogs(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [canUseUcApi, apiFetch, warehouseId]);

  // Load schemas when catalogs selected
  useEffect(() => {
    if (selectedCatalogs.length === 0) { setSchemas([]); return; }
    if (!canUseUcApi) { setSchemas([]); return; }
    let cancelled = false;
    setLoadingSchemas(true);
    Promise.all(
      selectedCatalogs.map((cat) =>
        apiFetch(`/api/catalogs/${encodeURIComponent(cat)}/schemas${ucBrowseQuery(warehouseId)}`)
          .then(d => d.schemas || [])
          .catch(() => [])
      )
    ).then((r) => {
      if (!cancelled) {
        const all = r.flat();
        console.log(`[schemas] loaded ${all.length} for ${selectedCatalogs.join(',')}`);
        setSchemas(all);
      }
    }).finally(() => { if (!cancelled) setLoadingSchemas(false); });
    return () => { cancelled = true; };
  }, [selectedCatalogs, canUseUcApi, apiFetch, warehouseId]);

  // Load tables when schemas selected
  useEffect(() => {
    if (selectedSchemas.length === 0) { setTables([]); return; }
    if (!canUseUcApi) { setTables([]); return; }
    let cancelled = false;
    setLoadingTables(true);
    Promise.all(
      selectedSchemas.map((schemaFullName) => {
        const [catalog, schema] = schemaFullName.split('.');
        return apiFetch(`/api/tables/${encodeURIComponent(catalog)}/${encodeURIComponent(schema)}${ucBrowseQuery(warehouseId)}`)
          .then(d => (d.tables || []).map(t => ({
            ...t,
            full_name: t.full_name || `${catalog}.${schema}.${t.name}`,
          })))
          .catch(() => []);
      })
    ).then((r) => {
      if (!cancelled) {
        const allTables = r.flat();
        console.log(`[tables] loaded ${allTables.length} for ${selectedSchemas.join(',')}`);
        setTables(allTables);
        const availableNames = new Set(allTables.map(t => t.full_name));
        setSelectedTables(prev => prev.filter(t => availableNames.has(t)));
      }
    }).finally(() => { if (!cancelled) setLoadingTables(false); });
    return () => { cancelled = true; };
  }, [selectedSchemas, canUseUcApi, apiFetch, warehouseId]);

  // Auto-populate inspire database when first catalog is selected
  useEffect(() => {
    if (selectedCatalogs.length === 1 && !params['02_inspire_database']) {
      const autoVal = `${selectedCatalogs[0]}._inspire`;
      setParams((p) => ({ ...p, '02_inspire_database': autoVal }));
      update('inspireDatabase', autoVal);
    }
  }, [selectedCatalogs]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateParam = (key, val) => {
    setParams((p) => ({ ...p, [key]: val }));
    if (key === '02_inspire_database') {
      update('inspireDatabase', val);
    }
  };

  const strategicContextText = params['10_strategic_context'];
  const strategyBaseRef = useRef(strategyBase);
  useEffect(() => {
    strategyBaseRef.current = strategyBase;
  }, [strategyBase]);
  const [strategyEditorKey, setStrategyEditorKey] = useState(0);
  const [prioritiesTouched, setPrioritiesTouched] = useState(false);

  const handleStrategyChange = useCallback((value) => {
    if (strategyBaseRef.current === value) return;
    strategyBaseRef.current = value;
    setStrategyTouched(true);
    setStrategyBase(value);
  }, []);

  const selectedBuiltInPriorities = useMemo(
    () => BUSINESS_PRIORITIES.map((bp) => bp.key).filter((key) => priorityChecks[key]),
    [priorityChecks],
  );

  useEffect(() => {
    const merged = customPriorities.length ? [...selectedBuiltInPriorities, ...customPriorities] : [];
    const value = withPriorities(strategyBase, merged);
    setParams((p) => (p['10_strategic_context'] === value ? p : { ...p, '10_strategic_context': value }));
  }, [strategyBase, selectedBuiltInPriorities, customPriorities]);

  const toggleBuiltInPriority = (key) => {
    setPrioritiesTouched(true);
    setPriorityChecks((p) => ({ ...p, [key]: !p[key] }));
  };

  const addCustomPriority = () => {
    const name = customPriorityDraft.trim();
    if (!name) return;
    setPrioritiesTouched(true);
    const builtIn = BUSINESS_PRIORITIES.find((bp) => bp.key.toLowerCase() === name.toLowerCase());
    if (builtIn) setPriorityChecks((p) => ({ ...p, [builtIn.key]: true }));
    else setCustomPriorities((c) => (c.some((x) => x.toLowerCase() === name.toLowerCase()) ? c : [...c, name]));
    setCustomPriorityDraft('');
  };

  const removeCustomPriority = (name) => {
    setPrioritiesTouched(true);
    setCustomPriorities((c) => c.filter((x) => x !== name));
  };

  useEffect(() => {
    const name = String(params['00_business_name'] || '').trim().toLowerCase();
    if (!name || !warehouseId || !previewDb || (discoveryTouched && strategyTouched)) return undefined;
    const match = sessionsList.find((s) => String(s.business_name || '').trim().toLowerCase() === name);
    if (!match) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ inspire_database: previewDb, warehouse_id: warehouseId, session_id: String(match.session_id) });
        const data = await apiFetch(`/api/inspire/session?${q}`);
        if (cancelled) return;
        const wv = data?.session?.widget_values || {};
        const next = {};
        if (!discoveryTouched && (wv.discovery_type === 'Deep' || wv.discovery_type === 'Standard')) {
          next['03_discovery_type'] = wv.discovery_type;
        }
        const prefillStrategy = !strategyTouched && wv.strategic_context ? String(wv.strategic_context) : '';
        if (Object.keys(next).length || prefillStrategy) {
          if (Object.keys(next).length) setParams((p) => ({ ...p, ...next }));
          if (prefillStrategy) {
            const saved = splitPriorities(parseStrategicContext(prefillStrategy).model.priorities, BUSINESS_PRIORITIES.map((bp) => bp.key));
            if (!prioritiesTouched && (saved.builtIn.length || saved.custom.length)) {
              setPriorityChecks(Object.fromEntries(saved.builtIn.map((key) => [key, true])));
              setCustomPriorities(saved.custom);
            }
            setStrategyBase(withPriorities(prefillStrategy, []));
            setStrategyEditorKey((k) => k + 1);
          }
          setPrefillNote(`Prefilled from this business's last session (${match.session_id}).`);
        }
      } catch {
        if (!cancelled) setPrefillNote('');
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params['00_business_name'], sessionsList, warehouseId, previewDb]); // eslint-disable-line react-hooks/exhaustive-deps

  const strategyProblems = useMemo(() => [
    ...validateStrategicContextText(strategicContextText),
    ...(customPriorities.length && parseStrategicContext(strategyBase).mode === 'path'
      ? ['Your own business priorities cannot be added to a strategy that comes from a file. Remove them or clear the strategy.']
      : []),
  ], [strategicContextText, customPriorities, strategyBase]);

  // Launch
  const handleLaunch = async () => {
    if (!params['00_business_name'])
      return setLaunchError('Business name is required.');
    if (!params['02_inspire_database'] && !inspireDatabase)
      return setLaunchError('Inspire Database is required. Set it in Settings.');
    if (!params['01_uc_metadata'])
      return setLaunchError('Select at least one catalog, schema, or table for UC Metadata.');
    if (strategyProblems.length)
      return setLaunchError(`Fix the strategic context first (Advanced → Strategy and organization): ${strategyProblems[0]}`);

    const genOpts = params['09_generation_options'] || '';
    const needsDocLang =
      genOpts.includes('PDF') || genOpts.includes('Presentation');
    if (needsDocLang && parseDocumentLanguages(params['12_documents_languages']).length === 0) {
      return setLaunchError(
        'Select at least one document language (Advanced → Document Languages) for PDF or Presentation.',
      );
    }

    setLaunching(true);
    setLaunchError('');
    const finalParams = { ...params };
    finalParams['12_documents_languages'] = formatDocumentLanguages(
      params['12_documents_languages'],
    );
    // Always auto-generate session ID
    finalParams['14_session_id'] =
      String(Date.now()) + String(Math.floor(Math.random() * 1e6));

    try {
      const data = await apiFetch('/api/run', {
        method: 'POST',
        body: JSON.stringify({
          notebook_path: notebookPath,
          params: finalParams,
          warehouse_id: warehouseId,
        }),
      });
      update('inspireDatabase', finalParams['02_inspire_database']);
      onLaunched?.(finalParams['14_session_id'], data.run_id);
    } catch (err) {
      setLaunchError(parseApiErrorMessage(err.message));
    } finally {
      setLaunching(false);
    }
  };

  // Derived
  const filteredCatalogs = catalogs.filter(
    (c) => !catalogSearch || c.name.toLowerCase().includes(catalogSearch.toLowerCase())
  );
  const filteredSchemas = schemas.filter(
    (s) => !schemaSearch || s.full_name.toLowerCase().includes(schemaSearch.toLowerCase())
  );
  const filteredTables = tables.filter(
    (t) => !tableSearch || t.full_name.toLowerCase().includes(tableSearch.toLowerCase())
  );
  const needsLanguage =
    params['09_generation_options'].includes('PDF') ||
    params['09_generation_options'].includes('Presentation');
  const selectedDocLanguages = useMemo(
    () => parseDocumentLanguages(params['12_documents_languages']),
    [params['12_documents_languages']],
  );

  // Table select all / deselect all
  const allTablesSelected = filteredTables.length > 0 && filteredTables.every((t) => selectedTables.includes(t.full_name));
  const toggleAllTables = () => {
    if (allTablesSelected) {
      const filteredNames = new Set(filteredTables.map((t) => t.full_name));
      setSelectedTables((prev) => prev.filter((t) => !filteredNames.has(t)));
    } else {
      const newNames = filteredTables.map((t) => t.full_name);
      setSelectedTables((prev) => [...new Set([...prev, ...newNames])]);
    }
  };

  // Validation state
  const effectiveDb = params['02_inspire_database'] || inspireDatabase;
  const bestOfBestText = String(params['16_best_of_best_count'] ?? '').trim();
  const bestOfBestInvalid = bestOfBestText !== '' && (!/^\d{1,3}$/.test(bestOfBestText) || Number(bestOfBestText) > 100);
  const canLaunch = params['00_business_name'] && effectiveDb && params['01_uc_metadata'] && strategyProblems.length === 0 && !bestOfBestInvalid;

  const launchErrorGuidance = useMemo(
    () => (launchError
      ? interpretUcPermissionError(launchError, {
        context: 'launch',
        inspireDatabase: effectiveDb,
        catalogs: selectedCatalogs,
        warehouseId,
      })
      : null),
    [launchError, effectiveDb, selectedCatalogs, warehouseId],
  );

  const catalogBrowseGuidance = useMemo(
    () => (catalogBrowseError
      ? interpretUcPermissionError(catalogBrowseError, {
        context: 'catalog_browse',
        inspireDatabase: effectiveDb,
        catalogs: selectedCatalogs,
        warehouseId,
      })
      : null),
    [catalogBrowseError, effectiveDb, selectedCatalogs, warehouseId],
  );

  /** Warn on many explicit tables, or when an entire schema/catalog is in scope. */
  const tableSelectionWarning = useMemo(() => {
    if (selectedTables.length > TABLE_SELECTION_WARN_THRESHOLD) {
      return {
        show: true,
        summary: `${selectedTables.length} tables selected`,
        tableCount: selectedTables.length,
        scope: 'tables',
      };
    }
    if (selectedSchemas.length > 0 && selectedTables.length === 0) {
      const names = selectedSchemas.join(', ');
      const n = selectedSchemas.length;
      return {
        show: true,
        summary:
          n === 1
            ? `entire schema ${names} (all tables in that schema)`
            : `${n} entire schemas (${names}) — all tables in each schema`,
        tableCount: null,
        scope: 'schemas',
      };
    }
    if (selectedCatalogs.length > 0 && selectedSchemas.length === 0 && selectedTables.length === 0) {
      const names = selectedCatalogs.join(', ');
      const n = selectedCatalogs.length;
      return {
        show: true,
        summary:
          n === 1
            ? `entire catalog ${names} (all schemas and tables)`
            : `${n} entire catalogs (${names}) — all schemas and tables`,
        tableCount: null,
        scope: 'catalogs',
      };
    }
    return { show: false };
  }, [selectedTables, selectedSchemas, selectedCatalogs]);

  /** Shown in the page `<h1>` — updates after a short typing pause or immediately on blur (“finished writing”). */
  const [headlineBusiness, setHeadlineBusiness] = useState('');
  useEffect(() => {
    const raw = (params['00_business_name'] || '').trim();
    if (!raw) {
      setHeadlineBusiness('');
      return undefined;
    }
    const id = setTimeout(() => setHeadlineBusiness(raw), 400);
    return () => clearTimeout(id);
  }, [params['00_business_name']]);

  const launchPageHeading = headlineBusiness
    ? `Discovering usecases for ${headlineBusiness}`
    : 'Get Started';

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-linear-to-br from-db-red to-db-red-hover flex items-center justify-center shadow-sm">
            <Rocket size={20} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="text-2xl font-bold text-text-primary line-clamp-2 wrap-break-word"
              title={headlineBusiness ? launchPageHeading : undefined}
              aria-live="polite"
            >
              {launchPageHeading}
            </h1>
            <p className="text-sm text-text-secondary">
              Fill in the essentials below, then get started. Everything else is optional.
            </p>
          </div>
        </div>
      </div>

      {(token || serverEnvHasPat) && warehouseId && previewDb && (
        <section
          className="mb-8 rounded-xl border border-border bg-surface/80 backdrop-blur-sm shadow-sm overflow-hidden"
          aria-label="Discovery Overview"
        >
          <button
            type="button"
            onClick={() => setExperimentsOverviewExpanded((v) => !v)}
            className="flex w-full items-center gap-3 px-5 py-3 border-b border-border bg-bg-subtle/50 text-left transition-colors hover:bg-bg-subtle/80"
            aria-expanded={experimentsOverviewExpanded}
          >
            <Layers size={16} className="text-db-red shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-text-primary">Discovery Overview</h2>
              <p className="text-[11px] text-text-secondary truncate">
                {overviewLoading
                  ? 'Loading your recent runs…'
                  : sessionsList.length > 0
                    ? `${sessionsList.length} experiment${sessionsList.length === 1 ? '' : 's'} · use Quick view to see use cases created in each run`
                    : 'No experiments yet. Launch a run to see it listed here.'}
              </p>
            </div>
            <ChevronDown
              size={18}
              className={`shrink-0 text-text-tertiary transition-transform duration-200 ${experimentsOverviewExpanded ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          {(overviewError || allCreatedError) && (
            <div className="space-y-2 border-b border-border bg-surface/60 px-5 py-2.5">
              {overviewError && (
                <p className="flex items-center gap-1.5 text-xs text-error">
                  <AlertCircle size={14} className="shrink-0" />
                  {overviewError}
                </p>
              )}
              {allCreatedError && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle size={14} className="shrink-0" />
                  {allCreatedError}
                </p>
              )}
            </div>
          )}
          {experimentsOverviewExpanded && (
          <div className="px-5 py-4">
            {overviewLoading && !overviewError && (
              <div className="flex items-center gap-2 text-sm text-text-secondary py-2">
                <Loader2 size={16} className="animate-spin text-db-red" />
                Loading experiments…
              </div>
            )}
            {!overviewLoading && !overviewError && sessionsList.length === 0 && (
              <p className="text-sm text-text-secondary py-1">
                Run the Inspire pipeline once to populate sessions. Use cases appear under Quick view when data exists.
              </p>
            )}
            {!overviewLoading && sessionsList.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border bg-bg-subtle/30 overflow-hidden">
                {sessionsList.map((s) => {
                  const sidStr = String(s.session_id);
                  const expanded = quickViewSid === sidStr;
                  const count = useCaseCountBySession.get(sidStr) ?? 0;
                  const ucs = expanded ? getUcsForSession(s.session_id) : null;
                  const loadingUc = quickViewLoading === sidStr;
                  const business =
                    s.widget_values?.['00_business_name'] ||
                    s.widget_values?.business ||
                    s.business_name ||
                    '—';
                  const pct = Number(s.completed_percent) || 0;
                  return (
                    <li key={sidStr} className="bg-surface/60">
                      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-text-primary truncate">{business}</span>
                            <span className="text-[10px] font-mono text-text-tertiary bg-bg-subtle px-1.5 py-0.5 rounded border border-border shrink-0">
                              {sidStr}
                            </span>
                            {pct >= 100 ? (
                              <span className="text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20">
                                Complete
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-text-secondary bg-bg-subtle px-1.5 py-0.5 rounded border border-border">
                                {pct}% done
                              </span>
                            )}
                            <span className="text-[10px] text-text-tertiary">
                              {count > 0 ? `${count} in table` : '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                            <Calendar size={12} className="shrink-0 text-text-tertiary" aria-hidden />
                            <span>{formatSessionWhen(s.create_at)}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onQuickViewToggle(s.session_id)}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                              expanded
                                ? 'border-db-red bg-db-red-50 text-db-red'
                                : 'border-border bg-surface text-text-primary hover:border-db-red/40 hover:text-db-red'
                            }`}
                            aria-expanded={expanded}
                          >
                            <Eye size={14} aria-hidden />
                            Quick view
                            <ChevronDown
                              size={14}
                              className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                              aria-hidden
                            />
                          </button>
                          {typeof onOpenResults === 'function' && (
                            <button
                              type="button"
                              onClick={() => onOpenResults(sidStr)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary hover:border-db-red/40 hover:text-db-red transition-colors"
                            >
                              <ExternalLink size={14} aria-hidden />
                              Open results
                            </button>
                          )}
                        </div>
                      </div>
                      {expanded && (
                        <div className="border-t border-border bg-bg-subtle/50 px-4 py-3">
                          {loadingUc && (
                            <div className="flex items-center gap-2 text-sm text-text-secondary py-2">
                              <Loader2 size={14} className="animate-spin text-db-red" />
                              Loading use cases for this session…
                            </div>
                          )}
                          {!loadingUc && Array.isArray(ucs) && ucs.length === 0 && (
                            <p className="text-sm text-text-secondary py-1">
                              No use cases found for this session in the catalog or results yet.
                            </p>
                          )}
                          {!loadingUc && Array.isArray(ucs) && ucs.length > 0 && (
                            <ul className="max-h-72 overflow-y-auto space-y-2 pr-1">
                              {ucs.map((uc, i) => {
                                const title = useCaseTitle(uc);
                                const blurb = useCaseBlurb(uc);
                                const score = inspireScoreFromUc(uc);
                                return (
                                  <li
                                    key={`qv-${sidStr}-${uc.id ?? uc.No ?? i}-${title}`}
                                    className="rounded-lg border border-border bg-surface/80 px-3 py-2"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="text-xs font-semibold text-text-primary line-clamp-2 leading-snug">
                                        {title}
                                      </span>
                                      {score != null && Number.isFinite(score) && (
                                        <span className="shrink-0 text-[10px] font-bold tabular-nums text-db-red bg-db-red-50 border border-db-red/20 px-1.5 py-0.5 rounded">
                                          {score.toFixed(1)}
                                        </span>
                                      )}
                                    </div>
                                    {(uc._domain || uc['Business Domain'] || uc.domain) && (
                                      <p className="text-[10px] text-text-tertiary mt-0.5 truncate">
                                        {uc._domain || uc['Business Domain'] || uc.domain}
                                      </p>
                                    )}
                                    {blurb && (
                                      <p className="text-[11px] text-text-secondary mt-1 line-clamp-2 leading-relaxed">
                                        {blurb}
                                      </p>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          )}
        </section>
      )}

      {/* Error banner */}
      {launchErrorGuidance && <UcPermissionErrorHelp guidance={launchErrorGuidance} />}

      <div className="space-y-6">

        {/* ═══════════════════════════════════════════════
            SECTION 1: ESSENTIALS
           ═══════════════════════════════════════════════ */}
        <section className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-surface">
            <div className="w-8 h-8 rounded-lg bg-db-red flex items-center justify-center shadow-sm">
              <Zap size={16} className="text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-text-primary">Essentials</h2>
              <p className="text-xs text-text-secondary">Required fields to run the pipeline</p>
            </div>
            <span className="text-[10px] font-semibold text-db-red bg-db-red-50 border border-db-red/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
              Required
            </span>
          </div>

          <div className="px-6 py-6 space-y-6">
            {/* Business Name */}
            <Field label="Business Name" required icon={Building2} hint="The company or business unit to analyze">
              <input
                type="text"
                placeholder="e.g. Contoso, Acme Corp, Retail Division"
                value={params['00_business_name']}
                onChange={(e) => updateParam('00_business_name', e.target.value)}
                onBlur={(e) => setHeadlineBusiness((e.target.value || '').trim())}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
              />
            </Field>

            {/* UC Metadata — Catalog/Schema/Table pickers with shopping basket */}
            <Field label="Unity Catalog Metadata" required icon={Database} hint="Navigate catalogs and schemas to select tables">
                {catalogBrowseGuidance && <UcPermissionErrorHelp guidance={catalogBrowseGuidance} />}
                {onNoData && (
                  <button
                    type="button"
                    onClick={onNoData}
                    className="mb-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border text-sm text-text-secondary hover:border-db-red/40 hover:text-db-red hover:bg-db-red-50/30 transition-smooth"
                  >
                    <Sparkles size={16} />
                    I don&apos;t have data — generate demo tables instead
                  </button>
                )}
                {/* Selected Metadata Basket — always visible */}
                {(selectedCatalogs.length > 0 || selectedSchemas.length > 0 || selectedTables.length > 0) && (
                  <div className="mb-3 rounded-lg border border-db-red/20 bg-db-red-50/50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ShoppingCart size={12} className="text-db-red" />
                      <span className="text-[11px] font-bold text-db-red">Selected Metadata</span>
                      <span className="text-[10px] text-text-tertiary ml-auto">
                        {selectedTables.length > 0 && `${selectedTables.length} table${selectedTables.length > 1 ? 's' : ''}`}
                        {selectedTables.length > 0 && selectedSchemas.length > 0 && ', '}
                        {selectedSchemas.length > 0 && `${selectedSchemas.length} schema${selectedSchemas.length > 1 ? 's' : ''}`}
                        {(selectedTables.length > 0 || selectedSchemas.length > 0) && selectedCatalogs.length > 0 && ', '}
                        {selectedCatalogs.length > 0 && `${selectedCatalogs.length} catalog${selectedCatalogs.length > 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1">
                      {selectedTables.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                          <Table2 size={9} />
                          {t.split('.').pop()}
                          <button aria-label={`Remove ${t}`} onClick={() => setSelectedTables((p) => p.filter((x) => x !== t))} className="hover:text-db-red-hover ml-0.5"><X size={8} /></button>
                        </span>
                      ))}
                      {selectedSchemas.map((s) => (
                        <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-subtle text-text-secondary text-[10px] font-medium border border-border">
                          {s}
                          <button aria-label={`Remove ${s}`} onClick={() => { setSelectedSchemas((p) => p.filter((x) => x !== s)); setSelectedTables((p) => p.filter((x) => !x.startsWith(s + '.'))); }} className="hover:text-db-red ml-0.5"><X size={8} /></button>
                        </span>
                      ))}
                      {selectedCatalogs.map((c) => (
                        <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-subtle text-text-secondary text-[10px] font-medium border border-border">
                          <Database size={9} />
                          {c}
                          <button aria-label={`Remove ${c}`} onClick={() => { setSelectedCatalogs((p) => p.filter((x) => x !== c)); setSelectedSchemas((p) => p.filter((x) => !x.startsWith(c + '.'))); setSelectedTables((p) => p.filter((x) => !x.startsWith(c + '.'))); }} className="hover:text-db-red ml-0.5"><X size={8} /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {tableSelectionWarning.show && (
                  <TableSelectionGuidanceWarning
                    selectionSummary={tableSelectionWarning.summary}
                    tableCount={tableSelectionWarning.tableCount}
                    scope={tableSelectionWarning.scope}
                    idealMax={TABLE_SELECTION_IDEAL_MAX}
                  />
                )}

                {/* Collapsible picker toggle */}
                <button
                  type="button"
                  onClick={() => setPickerExpanded(!pickerExpanded)}
                  className="flex items-center gap-2 mb-2 text-xs font-semibold text-text-secondary hover:text-text-primary transition-smooth"
                >
                  <div className={`transition-transform duration-200 ${pickerExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown size={14} />
                  </div>
                  {pickerExpanded ? 'Hide catalog browser' : 'Browse catalogs'}
                  {!pickerExpanded && (selectedCatalogs.length + selectedSchemas.length + selectedTables.length > 0) && (
                    <span className="text-[10px] text-db-red font-medium ml-1">
                      ({selectedTables.length > 0 ? `${selectedTables.length} tables` : selectedSchemas.length > 0 ? `${selectedSchemas.length} schemas` : `${selectedCatalogs.length} catalogs`} selected)
                    </span>
                  )}
                </button>

                {pickerExpanded && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Catalogs */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[11px] font-semibold text-text-secondary">Catalogs</span>
                        {loadingCatalogs && <Loader2 size={10} className="animate-spin text-text-tertiary" />}
                      </div>
                      <PickerList
                        items={filteredCatalogs}
                        selected={selectedCatalogs}
                        onToggle={(name) => {
                          if (selectedCatalogs.includes(name)) {
                            setSelectedCatalogs((p) => p.filter((x) => x !== name));
                            setSelectedSchemas((p) => p.filter((x) => !x.startsWith(name + '.')));
                            setSelectedTables((p) => p.filter((x) => !x.startsWith(name + '.')));
                          } else {
                            setSelectedCatalogs((p) => [...p, name]);
                          }
                        }}
                        getKey={(c) => c.name}
                        getLabel={(c) => c.name}
                        searchValue={catalogSearch}
                        onSearch={setCatalogSearch}
                        searchPlaceholder="Search catalogs..."
                        emptyText={
                          !databricksHost
                            ? 'Set DATABRICKS_HOST in .env or Workspace setup'
                            : !token && !serverEnvHasPat
                              ? 'No server auth — ensure app.yaml declares the service principal, then run npm run deploy from the repo'
                              : loadingCatalogs
                                ? 'Loading...'
                                : 'No catalogs found'
                        }
                      />
                    </div>

                    {/* Schemas */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[11px] font-semibold text-text-secondary">Schemas</span>
                        {loadingSchemas && <Loader2 size={10} className="animate-spin text-text-tertiary" />}
                      </div>
                      <PickerList
                        items={filteredSchemas}
                        selected={selectedSchemas}
                        onToggle={(name) => {
                          if (selectedSchemas.includes(name)) {
                            setSelectedSchemas((p) => p.filter((x) => x !== name));
                            setSelectedTables((p) => p.filter((x) => !x.startsWith(name + '.')));
                          } else {
                            setSelectedSchemas((p) => [...p, name]);
                          }
                        }}
                        getKey={(s) => s.full_name}
                        getLabel={(s) => selectedCatalogs.length > 1 ? s.full_name : s.name}
                        searchValue={schemaSearch}
                        onSearch={setSchemaSearch}
                        searchPlaceholder="Search schemas..."
                        emptyText={selectedCatalogs.length === 0 ? 'Select catalogs first' : loadingSchemas ? 'Loading...' : 'No schemas found'}
                      />
                    </div>

                    {/* Tables */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[11px] font-semibold text-text-secondary">Tables</span>
                        <span className="text-[10px] text-text-tertiary">primary selection</span>
                        {loadingTables && <Loader2 size={10} className="animate-spin text-text-tertiary" />}
                      </div>
                      {filteredTables.length > 0 && (
                        <button
                          type="button"
                          onClick={toggleAllTables}
                          className="mb-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-smooth border border-border hover:border-border-strong text-text-secondary hover:text-db-red"
                        >
                          {allTablesSelected ? 'Deselect All' : 'Select All'}
                        </button>
                      )}
                      <PickerList
                        items={filteredTables}
                        selected={selectedTables}
                        onToggle={(name) => {
                          if (selectedTables.includes(name)) setSelectedTables((p) => p.filter((x) => x !== name));
                          else setSelectedTables((p) => [...p, name]);
                        }}
                        getKey={(t) => t.full_name}
                        getLabel={(t) => selectedSchemas.length > 1 ? `${t.schema_name}.${t.name}` : t.name}
                        searchValue={tableSearch}
                        onSearch={setTableSearch}
                        searchPlaceholder="Search tables..."
                        emptyText={selectedSchemas.length === 0 ? 'Select schemas first' : loadingTables ? 'Loading...' : 'No tables found'}
                      />
                    </div>
                  </div>
                )}

                {/* UC Metadata preview — collapsible & scrollable */}
                {params['01_uc_metadata'] && (
                  <div className="mt-3 rounded-lg border border-success/20 bg-success-bg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setMetadataPreviewExpanded(!metadataPreviewExpanded)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-success/5 transition-smooth"
                    >
                      <CheckCircle2 size={14} className="text-success shrink-0" />
                      <p className="text-[10px] text-success font-semibold uppercase tracking-wider flex-1">Metadata Selected</p>
                      <span className="text-[10px] text-success/70 font-mono">
                        {params['01_uc_metadata'].split(',').length} item{params['01_uc_metadata'].split(',').length > 1 ? 's' : ''}
                      </span>
                      <ChevronDown size={12} className={`text-success transition-transform duration-200 ${metadataPreviewExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {metadataPreviewExpanded && (
                      <div className="px-4 pb-3 max-h-32 overflow-y-auto">
                        <p className="text-xs text-text-primary font-mono break-all leading-relaxed">{params['01_uc_metadata']}</p>
                      </div>
                    )}
                  </div>
                )}
              </Field>

            {/* Generation Instructions — optional */}
            <FieldSection label="Generation Instructions" hint="Optional — guide use case generation with specific instructions">
              <div className="relative">
                <Target size={14} className="absolute left-3 top-3 text-text-tertiary" />
                <textarea
                  rows={3}
                  placeholder="Focus on fraud detection, join orders with customers on customer_id, exclude staging tables..."
                  value={params['08_generation_instructions']}
                  onChange={(e) => updateParam('08_generation_instructions', e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth resize-none"
                />
              </div>
            </FieldSection>

            {/* Discovery Type — v1.3.0 widget 03_discovery_type */}
            <FieldSection label="Discovery Type" hint="Whether Inspire may read aggregates from your tables">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-stretch">
                {DISCOVERY_OPTIONS.map((opt) => {
                  const active = params['03_discovery_type'] === opt.key;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setDiscoveryTouched(true);
                        updateParam('03_discovery_type', opt.key);
                      }}
                      className={`relative flex flex-col h-full min-h-[5.5rem] p-3.5 rounded-xl text-left transition-smooth border ${
                        active ? 'border-db-red/30 bg-db-red-50 shadow-sm' : 'border-border hover:border-border-strong bg-surface'
                      }`}
                    >
                      <span className={`flex items-center gap-1.5 text-xs font-semibold ${active ? 'text-db-red' : 'text-text-primary'}`}>
                        <Icon size={14} className={active ? 'text-db-red' : 'text-text-tertiary'} />
                        {opt.key}
                        {opt.key === 'Deep' && <span className="text-[10px] font-normal text-text-tertiary">(default)</span>}
                      </span>
                      <p className="text-[11px] text-text-tertiary leading-snug mt-1.5 pr-5">{opt.desc}</p>
                      {active && <CheckCircle2 size={14} className="absolute top-3 right-3 text-db-red" />}
                    </button>
                  );
                })}
              </div>
              {prefillNote && <p className="text-[10px] text-text-tertiary mt-1.5">{prefillNote}</p>}
            </FieldSection>

          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            SECTION 2: ADVANCED (Collapsible)
           ═══════════════════════════════════════════════ */}
        <section className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-bg-subtle/50 transition-smooth"
          >
            <div className="w-8 h-8 rounded-lg bg-bg-subtle flex items-center justify-center">
              <Settings2 size={16} className="text-text-secondary" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-text-primary">Advanced Settings</h2>
              <p className="text-xs text-text-secondary">
                Generation options, operation mode, quality, and more
              </p>
            </div>
            <div className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}>
              <ChevronDown size={18} className="text-text-tertiary" />
            </div>
          </button>

          {showAdvanced && (
            <div className="px-6 pb-6 pt-2 border-t border-border space-y-6">

              {/* Inspire Database */}
              <Field label="Inspire Database" icon={Database} hint="catalog.schema format — where Inspire stores session tracking tables">
                <input
                  type="text"
                  placeholder="e.g. my_catalog._inspire"
                  value={params['02_inspire_database']}
                  onChange={(e) => updateParam('02_inspire_database', e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth font-mono"
                />
              </Field>

              <FieldSection label="Operation" hint="Widget 15_operation — Discover runs the pipeline; Generate regen Genie for flagged UCs only">
                <GlowSelect
                  value={params['15_operation']}
                  onChange={(v) => updateParam('15_operation', v)}
                  options={OPERATION_WIDGET_OPTIONS}
                />
              </FieldSection>

              {/* Business Priorities */}
              <FieldSection label="Business Priorities" hint="Pick what matters most, or add your own">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 items-stretch">
                  {BUSINESS_PRIORITIES.map((bp) => {
                    const active = !!priorityChecks[bp.key];
                    return (
                      <button
                        key={bp.key}
                        type="button"
                        onClick={() => toggleBuiltInPriority(bp.key)}
                        className={`relative flex items-center min-h-10 px-3 py-2 rounded-lg text-xs font-medium text-left transition-smooth border ${
                          active
                            ? 'border-db-red/30 bg-db-red-50 text-db-red'
                            : 'border-border text-text-secondary hover:border-border-strong bg-surface'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 min-w-0 pr-4">
                          <bp.icon size={13} className={`shrink-0 ${active ? 'text-db-red' : 'text-text-tertiary'}`} />
                          <span className="truncate">{bp.key}</span>
                        </span>
                        {active && <CheckCircle2 size={12} className="absolute top-1/2 -translate-y-1/2 right-1.5 text-db-red" />}
                      </button>
                    );
                  })}
                  {customPriorities.map((name) => (
                    <span
                      key={name}
                      className="relative min-h-10 px-3 py-2 rounded-lg text-xs font-medium border border-db-red/30 bg-db-red-50 text-db-red flex items-center gap-1.5"
                    >
                      <Target size={13} className="text-db-red shrink-0" />
                      <span className="truncate" title={name}>{name}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${name}`}
                        onClick={() => removeCustomPriority(name)}
                        className="ml-auto shrink-0 text-db-red hover:text-text-primary transition-smooth"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={customPriorityDraft}
                    onChange={(e) => setCustomPriorityDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomPriority();
                      }
                    }}
                    placeholder="Add your own priority, for example Improve on-time delivery"
                    aria-label="Add your own business priority"
                    className="flex-1 h-10 px-3 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
                  />
                  <button
                    type="button"
                    onClick={addCustomPriority}
                    disabled={!customPriorityDraft.trim()}
                    className="btn-secondary h-10 px-4 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </FieldSection>

              {/* Business Domains */}
              <FieldSection label="Business Domains" hint="Leave empty to auto-infer from data">
                <div className="relative">
                  <Layers size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text"
                    placeholder="Sales, Marketing, Finance, Operations, Supply Chain..."
                    value={params['06_business_domains']}
                    onChange={(e) => updateParam('06_business_domains', e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
                  />
                </div>
              </FieldSection>

              {/* Strategy and organization — v1.3.0 widget 10_strategic_context */}
              <div className="border border-border rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowStrategy(!showStrategy)}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-bg-subtle/50 transition-smooth"
                >
                  <Target size={14} className="text-text-tertiary shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-text-primary block">Strategy and organization</span>
                    <span className="text-[10px] text-text-tertiary">
                      Optional — aligns and orders results after discovery
                    </span>
                  </span>
                  <span className="ml-auto flex items-center gap-2 shrink-0">
                    {(strategyBase || strategyProblems.length > 0) && (
                      <span className={`text-[10px] font-semibold ${strategyProblems.length ? 'text-db-red' : 'text-success'}`}>
                        {strategyProblems.length ? `${strategyProblems.length} problem${strategyProblems.length > 1 ? 's' : ''}` : 'Set'}
                      </span>
                    )}
                    <ChevronDown
                      size={14}
                      className={`text-text-tertiary transition-transform duration-200 ${showStrategy ? 'rotate-180' : ''}`}
                    />
                  </span>
                </button>
                {showStrategy && (
                  <div className="px-4 pb-4 pt-1 border-t border-border">
                    <StrategyEditor key={strategyEditorKey} value={strategyBase} onChange={handleStrategyChange} />
                  </div>
                )}
              </div>

              {/* Generation Options */}
              <Field
                label="Generation Options"
                icon={Layers}
                hint="PDF / Presentation artifacts. Auto-Genie is configured separately below."
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-stretch">
                  {GENERATION_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = !!genChecks[opt.key];
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setGenChecks((p) => ({ ...p, [opt.key]: !p[opt.key] }))}
                        className={`relative flex flex-col h-full min-h-[6.5rem] p-3.5 rounded-xl text-left transition-smooth border group ${
                          active
                            ? 'border-db-red/30 bg-db-red-50 shadow-sm'
                            : 'border-border hover:border-border-strong hover:shadow-sm bg-surface'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            active ? 'bg-db-red/10' : 'bg-bg-subtle group-hover:bg-bg'
                          }`}>
                            <Icon size={14} className={active ? 'text-db-red' : 'text-text-tertiary'} />
                          </div>
                        </div>
                        <span className={`text-xs font-semibold block ${active ? 'text-db-red' : 'text-text-primary'}`}>
                          {opt.key}
                        </span>
                        <p className="text-[10px] text-text-tertiary leading-snug mt-0.5">{opt.desc}</p>
                        {active && (
                          <CheckCircle2 size={14} className="absolute top-2.5 right-2.5 text-db-red" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {/* Generation Path + Languages side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Field label="Generation Path" icon={FileText} hint="Where to write output artifacts">
                  <input
                    type="text"
                    value={params['11_generation_path']}
                    onChange={(e) => updateParam('11_generation_path', e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg bg-surface text-text-primary glow-focus transition-smooth font-mono"
                  />
                </Field>

                <Field
                  label="Document Languages"
                  required={needsLanguage}
                  icon={Globe2}
                  hint={
                    needsLanguage
                      ? 'Required for PDF/Presentation · matches notebook widget 12_documents_languages'
                      : 'Optional unless PDF or Presentation is selected'
                  }
                >
                  <DocumentLanguagesMultiselect
                    variant="launch"
                    value={params['12_documents_languages']}
                    onChange={(v) => updateParam('12_documents_languages', v)}
                  />
                  {needsLanguage && selectedDocLanguages.length === 0 && (
                    <p className="text-[11px] text-db-red mt-2 font-medium">
                      Select at least one language before launching.
                    </p>
                  )}
                </Field>
              </div>

              {/* Row: Table Election + Quality */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FieldSection label="Table Election">
                  <GlowSelect
                    value={params['04_table_election']}
                    onChange={(v) => updateParam('04_table_election', v)}
                    options={TABLE_ELECTION}
                  />
                  <p className="text-[10px] text-text-tertiary mt-1">How Inspire selects tables</p>
                </FieldSection>

                <FieldSection label="Use Cases Quality">
                  <SegmentedControl
                    ariaLabel="Use cases quality"
                    options={QUALITY_SEGMENTS}
                    value={params['05_use_cases_quality']}
                    onChange={(v) => updateParam('05_use_cases_quality', v)}
                  />
                </FieldSection>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                <Field
                  label="Auto-Genie scope"
                  icon={Bot}
                  hint="Full Genie instructions for Off, the top 5, or every use case."
                >
                  <SegmentedControl
                    ariaLabel="Auto-Genie scope"
                    options={GENIE_SCOPE_OPTIONS}
                    value={String(params['13_generate_genie_code_for'] || '5')}
                    onChange={(v) => updateParam('13_generate_genie_code_for', v)}
                  />
                </Field>
                <Field
                  label="Best of Best stars"
                  icon={Star}
                  hint="16_best_of_best_count — how many use cases to star (0 to 100). Empty uses the number in your generation instructions, or 20. Stars never add, remove or reorder a use case."
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    value={params['16_best_of_best_count']}
                    onChange={(e) => updateParam('16_best_of_best_count', e.target.value)}
                    placeholder="20"
                    aria-invalid={bestOfBestInvalid}
                    className={`w-full pl-10 pr-4 py-2.5 text-sm border rounded-lg bg-surface text-text-primary glow-focus transition-smooth font-mono ${bestOfBestInvalid ? 'border-error' : 'border-border'}`}
                  />
                  {bestOfBestInvalid && (
                    <p className="mt-1.5 text-xs text-error">Use a whole number from 0 to 100, or leave it empty for 20.</p>
                  )}
                </Field>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Launch Footer */}
      <div className="mt-8 pt-6 border-t border-border">
        {/* Summary chips */}
        {tableSelectionWarning.show && (
          <div className="mb-5">
            <TableSelectionGuidanceWarning
              selectionSummary={tableSelectionWarning.summary}
              tableCount={tableSelectionWarning.tableCount}
              scope={tableSelectionWarning.scope}
              idealMax={TABLE_SELECTION_IDEAL_MAX}
              compact
            />
          </div>
        )}

        {canLaunch && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <Chip icon={<Building2 size={10} />}>{params['00_business_name']}</Chip>
            <Chip icon={<Database size={10} />}>{params['02_inspire_database']}</Chip>
            {selectedTables.length > 0 && (
              <Chip icon={<Table2 size={10} />}>
                {selectedTables.length} table{selectedTables.length > 1 ? 's' : ''}
              </Chip>
            )}
            {selectedTables.length === 0 && selectedCatalogs.length > 0 && (
              <Chip icon={<Database size={10} />}>
                {selectedCatalogs.length} catalog{selectedCatalogs.length > 1 ? 's' : ''}
              </Chip>
            )}
            {selectedTables.length === 0 && selectedSchemas.length > 0 && (
              <Chip icon={<Layers size={10} />}>
                {selectedSchemas.length} schema{selectedSchemas.length > 1 ? 's' : ''}
              </Chip>
            )}
            <Chip icon={<Sliders size={10} />}>{params['05_use_cases_quality']}</Chip>
            <Chip icon={params['03_discovery_type'] === 'Standard' ? <Lock size={10} /> : <Eye size={10} />}>
              {params['03_discovery_type'] || 'Deep'}
            </Chip>
            {strategyBase && <Chip icon={<Target size={10} />}>Strategy set</Chip>}
            <Chip icon={<Star size={10} />}>
              Stars: {bestOfBestText === '0' ? 'off' : bestOfBestText || '20'}
            </Chip>
            <Chip icon={<Bot size={10} />}>
              Genie:{' '}
              {String(params['13_generate_genie_code_for'] || '').trim() === '0'
                ? 'off'
                : params['13_generate_genie_code_for'] || '5'}
            </Chip>
          </div>
        )}

        <button
          onClick={handleLaunch}
          disabled={launching || !canLaunch}
          className="w-full min-h-12 py-3.5 bg-linear-to-r from-db-red to-db-red-hover text-white text-sm font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-smooth flex items-center justify-center gap-2.5"
          style={{ boxShadow: '0 0 0 1px rgba(255,54,33,0.3), 0 4px 12px rgba(255,54,33,0.2), 0 8px 30px rgba(255,54,33,0.15)' }}
        >
          {launching ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Starting pipeline…
            </>
          ) : (
            <>
              <Play size={18} />
              Get Started
            </>
          )}
        </button>

        <p className="text-xs text-text-tertiary mt-3 text-center">
          Notebook: <span className="font-mono text-text-secondary">{notebookPath || 'not set'}</span>
          {warehouseId && <> &middot; Warehouse: <span className="font-mono text-text-secondary">{warehouseId.slice(0, 12)}...</span></>}
        </p>
      </div>
    </div>
  );
}


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Reusable form primitives
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function Field({ label, required, icon: Icon, hint, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 min-h-5">
        {Icon && (
          <div className="w-5 h-5 rounded-md flex items-center justify-center bg-bg-subtle shrink-0">
            <Icon size={12} className="text-text-tertiary" />
          </div>
        )}
        <span className="text-xs font-bold text-text-primary shrink-0">
          {label}
          {required && <span className="text-db-red ml-0.5">*</span>}
        </span>
        {hint && <span className="text-[10px] text-text-tertiary truncate">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function FieldSection({ label, required, hint, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 min-h-5">
        <span className="text-xs font-semibold text-text-primary shrink-0">
          {label}
          {required && <span className="text-db-red ml-0.5">*</span>}
        </span>
        {hint && <span className="text-[10px] text-text-tertiary truncate">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function GlowSelect({ value, onChange, options }) {
  return (
    <select
      className="w-full px-4 py-2.5 text-sm border border-border rounded-lg bg-surface text-text-primary glow-focus transition-smooth"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function PickerList({ items, selected, onToggle, getKey, getLabel, searchValue, onSearch, searchPlaceholder, emptyText }) {
  return (
    <div className="rounded-lg border border-border bg-bg overflow-hidden flex flex-col min-h-0">
      <div className="relative shrink-0">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          type="text"
          className="w-full bg-transparent border-b border-border pl-8 pr-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      {items.length > 0 && (
        <p className="text-[10px] text-text-tertiary px-2 py-1 border-b border-border bg-bg-subtle/40 shrink-0">
          {items.length} item{items.length === 1 ? '' : 's'} — scroll the list to see all
        </p>
      )}
      <div className="max-h-[min(22rem,55vh)] overflow-y-auto p-1.5 min-h-0">
        {items.length === 0 ? (
          <p className="text-[10px] text-text-tertiary p-2 text-center">{emptyText}</p>
        ) : (
          items.map((item) => {
            const key = getKey(item);
            const label = getLabel(item);
            const active = selected.includes(key);
            return (
              <button
                key={key}
                type="button"
                title={label}
                onClick={() => onToggle(key)}
                className={`w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-xs text-left transition-smooth ${
                  active
                    ? 'bg-db-red-50 text-db-red border border-db-red/20'
                    : 'text-text-primary hover:bg-bg-subtle border border-transparent'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                  active ? 'bg-db-red border-db-red' : 'border-border-strong'
                }`}>
                  {active && <CheckCircle2 size={10} className="text-white" />}
                </div>
                <span className="font-mono break-all leading-snug">{label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function Chip({ children, icon }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border border-db-red/20 bg-db-red-50 text-db-red">
      {icon} {children}
    </span>
  );
}

function TableSelectionGuidanceWarning({
  selectionSummary,
  tableCount,
  scope = 'tables',
  idealMax,
  compact = false,
}) {
  const overIdeal = tableCount != null && tableCount >= idealMax;
  const isBroadScope = scope === 'schemas' || scope === 'catalogs';

  return (
    <div
      className={`rounded-lg border border-amber-500/35 bg-amber-500/5 ${compact ? 'p-3' : 'p-4 mb-3'}`}
      role="status"
    >
      <div className="flex gap-2.5">
        <AlertCircle size={compact ? 16 : 18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-2 text-sm text-text-secondary leading-relaxed">
          <p className="font-semibold text-amber-800 dark:text-amber-200">
            {selectionSummary} — this run will likely take longer
          </p>
          {isBroadScope && (
            <p className="text-xs text-amber-800/90 dark:text-amber-200/90">
              You selected a {scope === 'catalogs' ? 'whole catalog' : 'whole schema'} without naming individual
              tables. Inspire will scan everything in scope. For faster, higher-quality discovery, open the table
              list and pick a focused set instead.
            </p>
          )}
          <p>
            For the best outcomes, select a <strong className="text-text-primary">small set of tables</strong>{' '}
            (ideally fewer than {idealMax}) in <strong className="text-text-primary">one business domain</strong>{' '}
            (for example, all sales-related tables).
          </p>
          <ul className="list-disc pl-4 space-y-1 text-xs sm:text-sm">
            <li>
              Prefer <strong className="text-text-primary">transactional</strong> tables that change often with new
              data (for example <span className="font-mono text-[11px]">sales_transactions</span>).
            </li>
            <li>
              Static reference tables add little value (for example{' '}
              <span className="font-mono text-[11px]">store_location</span>).
            </li>
            <li>
              If relationships are not visible in metadata (no primary/foreign keys), describe joins in{' '}
              <strong className="text-text-primary">Generation Instructions</strong> below.
            </li>
          </ul>
          {overIdeal && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              You are at or above {idealMax} tables — consider narrowing to transactional tables in a single domain
              before launching.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
