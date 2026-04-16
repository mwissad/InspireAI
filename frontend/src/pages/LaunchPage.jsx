import { useState, useEffect, useCallback } from 'react';
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
  Sparkles,
  Settings2,
  Zap,
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
} from 'lucide-react';

/* ─── Constants (v45 notebook widget options) ─── */
const QUALITY_OPTIONS = ['Good Quality', 'High Quality', 'Very High Quality'];
const TABLE_ELECTION = ['Let Inspire Decides', 'Selected Tables', 'All Tables', 'Transactional Only'];
const GENERATION_OPTIONS = [
  { key: 'Genie Code Instructions', icon: Sparkles, desc: 'Generate Genie code instructions per use case' },
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

export default function LaunchPage({ settings, update, onLaunched }) {
  const { databricksHost, token, notebookPath, warehouseId, inspireDatabase } = settings;

  // ── Widget params (must match notebook widget names exactly) ──
  const [params, setParams] = useState({
    '00_business_name': '',
    '01_uc_metadata': '',
    '02_inspire_database': inspireDatabase || '',
    '04_table_election': 'Let Inspire Decides',
    '05_use_cases_quality': 'High Quality',
    '06_business_domains': '',
    '07_business_priorities': '',
    '08_generation_instructions': '',
    '09_generation_options': 'Genie Code Instructions,PDF Catalog',
    '11_generation_path': './inspire_gen/',
    '12_documents_languages': 'English',
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

  // ── Metadata picker state ──
  const [pickerExpanded, setPickerExpanded] = useState(true);
  const [metadataPreviewExpanded, setMetadataPreviewExpanded] = useState(false);

  // ── Multiselects ──
  const [genChecks, setGenChecks] = useState({ 'Genie Code Instructions': true, 'PDF Catalog': true });
  const [priorityChecks, setPriorityChecks] = useState({});


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
      if (!resp.ok) throw new Error(`${resp.status}`);
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

  // Sync generation options
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
      setParams((p) => p['04_table_election'] !== 'Selected Tables'
        ? { ...p, '01_uc_metadata': metadata, '04_table_election': 'Selected Tables' }
        : { ...p, '01_uc_metadata': metadata }
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

  // Load catalogs — retry until we get them
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingCatalogs(true);
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const resp = await fetch('/api/catalogs');
          if (!resp.ok) {
            console.warn(`[catalogs] attempt ${attempt} failed: ${resp.status}`);
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          const data = await resp.json();
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load schemas when catalogs selected — plain fetch, no token dependency
  useEffect(() => {
    if (selectedCatalogs.length === 0) { setSchemas([]); return; }
    let cancelled = false;
    setLoadingSchemas(true);
    Promise.all(
      selectedCatalogs.map((cat) =>
        fetch(`/api/catalogs/${encodeURIComponent(cat)}/schemas`)
          .then(r => r.ok ? r.json() : { schemas: [] })
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
  }, [selectedCatalogs]);

  // Load tables when schemas selected — plain fetch, no token dependency
  useEffect(() => {
    if (selectedSchemas.length === 0) { setTables([]); return; }
    let cancelled = false;
    setLoadingTables(true);
    Promise.all(
      selectedSchemas.map((schemaFullName) => {
        const [catalog, schema] = schemaFullName.split('.');
        return fetch(`/api/tables/${encodeURIComponent(catalog)}/${encodeURIComponent(schema)}`)
          .then(r => r.ok ? r.json() : { tables: [] })
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
  }, [selectedSchemas]);

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
  const canLaunch = params['00_business_name'] && (params['02_inspire_database'] || inspireDatabase) && params['01_uc_metadata'];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-db-red to-db-red-hover flex items-center justify-center shadow-sm">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Launch Inspire AI</h1>
            <p className="text-sm text-text-secondary">
              Fill in the essentials below, then hit launch. Everything else is optional.
            </p>
          </div>
        </div>
      </div>

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
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
              />
            </Field>

            {/* Inspire Database */}
            <Field label="Inspire Database" required icon={Database} hint="catalog.schema format — where Inspire stores tracking tables">
              <input
                type="text"
                placeholder="e.g. my_catalog._inspire"
                value={params['02_inspire_database']}
                onChange={(e) => updateParam('02_inspire_database', e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth font-mono"
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
                  <CatalogTree
                    catalogs={filteredCatalogs}
                    schemas={schemas}
                    tables={tables}
                    selectedCatalogs={selectedCatalogs}
                    selectedSchemas={selectedSchemas}
                    selectedTables={selectedTables}
                    loadingCatalogs={loadingCatalogs}
                    loadingSchemas={loadingSchemas}
                    loadingTables={loadingTables}
                    onToggleCatalog={(name) => {
                      if (selectedCatalogs.includes(name)) {
                        setSelectedCatalogs((p) => p.filter((x) => x !== name));
                        setSelectedSchemas((p) => p.filter((x) => !x.startsWith(name + '.')));
                        setSelectedTables((p) => p.filter((x) => !x.startsWith(name + '.')));
                      } else {
                        setSelectedCatalogs((p) => [...p, name]);
                      }
                    }}
                    onToggleSchema={(name) => {
                      if (selectedSchemas.includes(name)) {
                        setSelectedSchemas((p) => p.filter((x) => x !== name));
                        setSelectedTables((p) => p.filter((x) => !x.startsWith(name + '.')));
                      } else {
                        setSelectedSchemas((p) => [...p, name]);
                      }
                    }}
                    onToggleTable={(name) => {
                      if (selectedTables.includes(name)) setSelectedTables((p) => p.filter((x) => x !== name));
                      else setSelectedTables((p) => [...p, name]);
                    }}
                  />
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

              {/* Strategic Goals */}
              <FieldSection label="Strategic Goals" hint="Highest priority influence on use case generation">
                <div className="relative">
                  <Target size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text"
                    placeholder="Increase market share, Reduce operational costs, Improve customer retention..."
                    value={params['08_generation_instructions']}
                    onChange={(e) => updateParam('08_generation_instructions', e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
                  />
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
              <Field label="Generation Options" icon={Layers} hint="What should Inspire AI produce?">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {GENERATION_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = !!genChecks[opt.key];
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          if (opt.key === 'Genie Code Instructions') return; // always on
                          setGenChecks((p) => ({ ...p, [opt.key]: !p[opt.key] }));
                        }}
                        className={`relative p-3.5 rounded-xl text-left transition-smooth border group ${
                          active
                            ? 'border-db-red/30 bg-db-red-50 shadow-sm'
                            : 'border-border hover:border-border-strong hover:shadow-sm'
                        } ${opt.key === 'Genie Code Instructions' ? 'cursor-default' : ''}`}
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
                        {active && opt.key === 'Genie Code Instructions' && (
                          <span className="absolute top-2.5 right-2.5 text-[9px] font-semibold text-db-red bg-db-red/10 px-1.5 py-0.5 rounded-full">Always on</span>
                        )}
                        {active && opt.key !== 'Genie Code Instructions' && (
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

              {/* Technical exclusion is always "Aggressive" in v45 — no user option needed */}
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
              Launching Pipeline...
            </>
          ) : (
            <>
              <Play size={18} />
              Launch Inspire AI
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

function CatalogTree({ catalogs, schemas, tables, selectedCatalogs, selectedSchemas, selectedTables, loadingCatalogs, loadingSchemas, loadingTables, onToggleCatalog, onToggleSchema, onToggleTable }) {
  const [expandedCatalogs, setExpandedCatalogs] = useState({});
  const [expandedSchemas, setExpandedSchemas] = useState({});
  const [search, setSearch] = useState('');

  const toggleExpand = (key, setter) => setter(prev => ({ ...prev, [key]: !prev[key] }));

  const matchSearch = (name) => !search || name.toLowerCase().includes(search.toLowerCase());

  return (
    <div className="rounded-lg border border-border bg-bg overflow-hidden">
      <div className="relative">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input type="text" className="w-full bg-transparent border-b border-border pl-8 pr-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none" placeholder="Search catalogs, schemas, tables..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {loadingCatalogs && <p className="text-[10px] text-text-tertiary p-3 text-center">Loading catalogs...</p>}
        {!loadingCatalogs && catalogs.length === 0 && <p className="text-[10px] text-text-tertiary p-3 text-center">No catalogs found</p>}
        {catalogs.filter(c => matchSearch(c.name)).map((cat) => {
          const catName = cat.name;
          const catSelected = selectedCatalogs.includes(catName);
          const isExpanded = expandedCatalogs[catName];
          const catSchemas = schemas.filter(s => s.full_name && s.full_name.startsWith(catName + '.'));

          return (
            <div key={catName}>
              {/* Catalog row */}
              <div className="flex items-center gap-1 group">
                <button type="button" onClick={() => { toggleExpand(catName, setExpandedCatalogs); if (!selectedCatalogs.includes(catName)) onToggleCatalog(catName); }} className="p-1 text-text-tertiary hover:text-text-primary">
                  <ChevronDown size={12} className={`transition-transform duration-150 ${isExpanded ? '' : '-rotate-90'}`} />
                </button>
                <button type="button" onClick={() => onToggleCatalog(catName)} className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all ${catSelected ? 'bg-db-red-50 text-db-red' : 'text-text-primary hover:bg-bg-subtle'}`}>
                  <div className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${catSelected ? 'bg-db-red border-db-red' : 'border-border-strong'}`}>
                    {catSelected && <CheckCircle2 size={8} className="text-white" />}
                  </div>
                  <Database size={11} className="shrink-0 opacity-50" />
                  <span className="font-mono font-medium truncate">{catName}</span>
                </button>
              </div>

              {/* Schemas under this catalog */}
              {isExpanded && (
                <div className="ml-5 border-l border-border/50 pl-1">
                  {loadingSchemas && catSchemas.length === 0 && <p className="text-[10px] text-text-tertiary py-1 pl-4">Loading schemas...</p>}
                  {!loadingSchemas && catSchemas.length === 0 && <p className="text-[10px] text-text-tertiary py-1 pl-4">No schemas</p>}
                  {catSchemas.filter(s => matchSearch(s.name) || matchSearch(s.full_name)).map((sch) => {
                    const schName = sch.full_name;
                    const schSelected = selectedSchemas.includes(schName);
                    const isSchExpanded = expandedSchemas[schName];
                    const schTables = tables.filter(t => t.full_name && t.full_name.startsWith(schName + '.'));

                    return (
                      <div key={schName}>
                        {/* Schema row */}
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => { toggleExpand(schName, setExpandedSchemas); if (!selectedSchemas.includes(schName)) onToggleSchema(schName); }} className="p-1 text-text-tertiary hover:text-text-primary">
                            <ChevronDown size={10} className={`transition-transform duration-150 ${isSchExpanded ? '' : '-rotate-90'}`} />
                          </button>
                          <button type="button" onClick={() => onToggleSchema(schName)} className={`flex-1 flex items-center gap-2 px-2 py-1 rounded-md text-[11px] transition-all ${schSelected ? 'bg-db-red-50 text-db-red' : 'text-text-primary hover:bg-bg-subtle'}`}>
                            <div className={`w-2.5 h-2.5 rounded border flex items-center justify-center shrink-0 ${schSelected ? 'bg-db-red border-db-red' : 'border-border-strong'}`}>
                              {schSelected && <CheckCircle2 size={7} className="text-white" />}
                            </div>
                            <Layers size={10} className="shrink-0 opacity-50" />
                            <span className="font-mono truncate">{sch.name}</span>
                          </button>
                        </div>

                        {/* Tables under this schema */}
                        {isSchExpanded && (
                          <div className="ml-5 border-l border-border/30 pl-1">
                            {loadingTables && schTables.length === 0 && <p className="text-[10px] text-text-tertiary py-1 pl-4">Loading tables...</p>}
                            {!loadingTables && schTables.length === 0 && <p className="text-[10px] text-text-tertiary py-1 pl-4">No tables</p>}
                            {schTables.filter(t => matchSearch(t.name) || matchSearch(t.full_name)).map((tbl) => {
                              const tblName = tbl.full_name;
                              const tblSelected = selectedTables.includes(tblName);
                              return (
                                <button key={tblName} type="button" onClick={() => onToggleTable(tblName)} className={`w-full flex items-center gap-2 px-2 py-1 ml-2 rounded-md text-[11px] transition-all ${tblSelected ? 'bg-db-red-50 text-db-red' : 'text-text-primary hover:bg-bg-subtle'}`}>
                                  <div className={`w-2.5 h-2.5 rounded border flex items-center justify-center shrink-0 ${tblSelected ? 'bg-db-red border-db-red' : 'border-border-strong'}`}>
                                    {tblSelected && <CheckCircle2 size={7} className="text-white" />}
                                  </div>
                                  <FileText size={10} className="shrink-0 opacity-50" />
                                  <span className="font-mono truncate">{tbl.name}</span>
                                  {tbl.table_type && <span className="text-[9px] text-text-tertiary ml-auto shrink-0">{tbl.table_type}</span>}
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
          );
        })}
      </div>
    </div>
  );
}

function PickerList({ items, selected, onToggle, getKey, getLabel, searchValue, onSearch, searchPlaceholder, emptyText }) {
  return (
    <div className="rounded-lg border border-border bg-bg overflow-hidden">
      <div className="relative">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          type="text"
          className="w-full bg-transparent border-b border-border pl-8 pr-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <div className="max-h-40 overflow-y-auto p-1.5">
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
                onClick={() => onToggle(key)}
                className={`w-full flex items-center gap-2 px-2.5 py-2.5 rounded-md text-xs transition-smooth ${
                  active
                    ? 'bg-db-red-50 text-db-red border border-db-red/20'
                    : 'text-text-primary hover:bg-bg-subtle border border-transparent'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                  active ? 'bg-db-red border-db-red' : 'border-border-strong'
                }`}>
                  {active && <CheckCircle2 size={10} className="text-white" />}
                </div>
                <span className="font-mono truncate">{label}</span>
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
