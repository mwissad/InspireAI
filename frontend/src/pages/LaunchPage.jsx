import { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'lucide-react';

/* ─── Constants — notebook widget `05_use_cases_quality` (Good/High/Very High) ─── */
const QUALITY_OPTIONS = ['Good Quality', 'High Quality', 'Very High Quality'];
const TABLE_ELECTION = ['Let Inspire Decides', 'All Tables', 'Transactional Only'];
const OPERATION_WIDGET_OPTIONS = ['Discover Use Cases', 'Generate Use Cases'];
const GENERATION_OPTIONS = [
  { key: 'PDF Catalog', icon: FileText, desc: 'Professional PDF use case catalog' },
  { key: 'Presentation', icon: Target, desc: 'Executive-ready slide deck' },
  {
    key: 'Genie Code Instructions',
    icon: Bot,
    desc: 'Discover: full Genie text for top N via Auto-Genie (see scope below). Generate mode: flagged use cases only.',
  },
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

export default function LaunchPage({ settings, update, onLaunched, onOpenResults }) {
  const { databricksHost, token, notebookPath, warehouseId, inspireDatabase, serverEnvHasPat } = settings;
  const canUseUcApi = !!(databricksHost && (token || serverEnvHasPat));

  // ── Widget params (must match notebook widget names exactly) ──
  const [params, setParams] = useState({
    '15_operation': 'Discover Use Cases',
    '00_business_name': '',
    '01_uc_metadata': '',
    '02_inspire_database': inspireDatabase || '',
    '04_table_election': 'Let Inspire Decides',
    '05_use_cases_quality': 'High Quality',
    '06_business_domains': '',
    '07_business_priorities': 'Increase Revenue',
    '08_generation_instructions': '',
    '09_generation_options': 'PDF Catalog,Genie Code Instructions',
    '11_generation_path': './../demos/',
    '12_documents_languages': 'English',
    '13_generate_genie_code_for': '5',
    '14_session_id': '',
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
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    'Genie Code Instructions': true,
  });
  const [priorityChecks, setPriorityChecks] = useState({ 'Increase Revenue': true });


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
        throw new Error(errText || `${resp.status}`);
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

  // Sync generation options + Auto-Genie scope: unchecking Genie sets 13_generate_genie_code_for to 0 (skip Auto-Genie).
  useEffect(() => {
    const sel = Object.entries(genChecks).filter(([, v]) => v).map(([k]) => k);
    const genieOn = !!genChecks['Genie Code Instructions'];
    setParams((p) => {
      const next = { ...p, '09_generation_options': sel.join(',') };
      if (!genieOn) next['13_generate_genie_code_for'] = '0';
      else {
        const cur = String(p['13_generate_genie_code_for'] || '').trim().toLowerCase();
        if (cur === '0' || cur === '') next['13_generate_genie_code_for'] = '5';
      }
      return next;
    });
  }, [genChecks]);

  // Typing 0 in Auto-Genie scope unchecks Genie; positive integer or all checks it.
  useEffect(() => {
    const v = String(params['13_generate_genie_code_for'] || '').trim().toLowerCase();
    if (v === '0') {
      setGenChecks((c) => (c['Genie Code Instructions'] ? { ...c, 'Genie Code Instructions': false } : c));
    } else if (v === 'all' || (/^\d+$/.test(v) && parseInt(v, 10) > 0)) {
      setGenChecks((c) => (!c['Genie Code Instructions'] ? { ...c, 'Genie Code Instructions': true } : c));
    }
  }, [params['13_generate_genie_code_for']]);

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
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const data = await apiFetch(`/api/catalogs${ucBrowseQuery(warehouseId)}`);
          const cats = data.catalogs || [];
          console.log(`[catalogs] loaded ${cats.length}:`, cats.map(c => c.name));
          if (!cancelled) {
            setCatalogs(cats);
            setLoadingCatalogs(false);
          }
          return;
        } catch (err) {
          console.warn(`[catalogs] attempt ${attempt} error:`, err.message);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      if (!cancelled) setLoadingCatalogs(false);
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

  // Launch
  const handleLaunch = async () => {
    if (!params['00_business_name'])
      return setLaunchError('Business name is required.');
    if (!params['02_inspire_database'] && !inspireDatabase)
      return setLaunchError('Inspire Database is required. Set it in Settings.');
    if (!params['01_uc_metadata'])
      return setLaunchError('Select at least one catalog, schema, or table for UC Metadata.');

    setLaunching(true);
    setLaunchError('');
    const finalParams = { ...params };
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
      setLaunchError(err.message);
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
  const needsLanguage = params['09_generation_options'].includes('PDF') || params['09_generation_options'].includes('Presentation');

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
  const canLaunch = params['00_business_name'] && effectiveDb && params['01_uc_metadata'];

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
          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-db-red to-db-red-hover flex items-center justify-center shadow-sm">
            <Rocket size={20} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="text-2xl font-bold text-text-primary line-clamp-2 break-words"
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
      {launchError && (
        <div className="flex items-center gap-2 p-3 bg-error-bg border border-error/20 rounded-lg mb-6 animate-in">
          <AlertCircle size={16} className="text-error shrink-0" />
          <span className="text-sm text-error">{launchError}</span>
        </div>
      )}

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
              <FieldSection label="Business Priorities" hint="Select what matters most">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {BUSINESS_PRIORITIES.map((bp) => {
                    const active = !!priorityChecks[bp.key];
                    return (
                      <button
                        key={bp.key}
                        type="button"
                        onClick={() => setPriorityChecks((p) => ({ ...p, [bp.key]: !p[bp.key] }))}
                        className={`relative px-3 py-2 rounded-lg text-xs font-medium text-left transition-smooth border ${
                          active
                            ? 'border-db-red/30 bg-db-red-50 text-db-red'
                            : 'border-border text-text-secondary hover:border-border-strong'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <bp.icon size={13} className={active ? 'text-db-red' : 'text-text-tertiary'} />
                          <span className="truncate">{bp.key}</span>
                        </span>
                        {active && <CheckCircle2 size={12} className="absolute top-1.5 right-1.5 text-db-red" />}
                      </button>
                    );
                  })}
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

              {/* Generation Options */}
              <Field
                label="Generation Options"
                icon={Layers}
                hint="PDF / Presentation artifacts. Genie Code Instructions toggles Auto-Genie on Discover (pairs with Auto-Genie scope); always on for Generate Use Cases."
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {GENERATION_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = !!genChecks[opt.key];
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setGenChecks((p) => ({ ...p, [opt.key]: !p[opt.key] }))}
                        className={`relative p-3.5 rounded-xl text-left transition-smooth border group ${
                          active
                            ? 'border-db-red/30 bg-db-red-50 shadow-sm'
                            : 'border-border hover:border-border-strong hover:shadow-sm'
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

                <Field label="Document Languages" required={needsLanguage} icon={Globe2} hint={needsLanguage ? 'Required for PDF/Presentation' : 'Comma-separated'}>
                  <input
                    type="text"
                    placeholder="English, French, Arabic"
                    value={params['12_documents_languages']}
                    onChange={(e) => updateParam('12_documents_languages', e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
                  />
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
                  <div className="flex gap-1.5">
                    {QUALITY_OPTIONS.map((q) => {
                      const active = params['05_use_cases_quality'] === q;
                      return (
                        <button
                          key={q}
                          type="button"
                          onClick={() => updateParam('05_use_cases_quality', q)}
                          className={`flex-1 py-2 rounded-lg text-[11px] font-medium transition-smooth border ${
                            active
                              ? 'border-db-red/30 bg-db-red-50 text-db-red'
                              : 'border-border text-text-secondary hover:border-border-strong'
                          }`}
                        >
                          {q.replace(' Quality', '')}
                        </button>
                      );
                    })}
                  </div>
                </FieldSection>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Field
                  label="Auto-Genie scope"
                  icon={Bot}
                  hint="13_generate_genie_code_for — all (every UC), top-N (e.g. 5), or 0 when Genie is off. Top-N is “up to N”: if your portfolio has N or fewer use cases after scoring, Auto-Genie can cover all of them. Re-publish the Inspire notebook after pulling this repo so ranking fixes apply."
                >
                  <input
                    type="text"
                    value={params['13_generate_genie_code_for']}
                    onChange={(e) => updateParam('13_generate_genie_code_for', e.target.value)}
                    placeholder="5"
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg bg-surface text-text-primary glow-focus transition-smooth font-mono"
                  />
                </Field>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Launch Footer */}
      <div className="mt-8 pt-6 border-t border-border">
        {/* Summary chips */}
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
          className="w-full py-3.5 bg-gradient-to-r from-db-red to-db-red-hover text-white text-sm font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-smooth flex items-center justify-center gap-2.5 hover:-translate-y-0.5"
          style={{ boxShadow: '0 0 0 1px rgba(255,54,33,0.3), 0 4px 12px rgba(255,54,33,0.2), 0 8px 30px rgba(255,54,33,0.15), 0 20px 60px rgba(255,54,33,0.1)' }}
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
    <div>
      <div className="flex items-center gap-2 mb-2">
        {Icon && (
          <div className="w-5 h-5 rounded flex items-center justify-center bg-bg-subtle">
            <Icon size={12} className="text-text-tertiary" />
          </div>
        )}
        <span className="text-xs font-bold text-text-primary">
          {label}
          {required && <span className="text-db-red ml-0.5">*</span>}
        </span>
        {hint && <span className="text-[10px] text-text-tertiary">&mdash; {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function FieldSection({ label, required, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5 mb-1.5">
        <span className="text-xs font-semibold text-text-primary">
          {label}
          {required && <span className="text-db-red ml-0.5">*</span>}
        </span>
        {hint && <span className="text-[10px] text-text-tertiary">{hint}</span>}
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
