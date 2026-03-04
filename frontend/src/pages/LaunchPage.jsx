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
  ChevronUp,
  Cpu,
  BarChart3,
  Sliders,
} from 'lucide-react';

/* ─── Constants (matching v41 notebook widget options) ─── */
const QUALITY_OPTIONS = ['Good Quality', 'High Quality', 'Very High Quality'];
const OPERATION_OPTIONS = ['Discover Usecases', 'Re-generate SQL'];
const TABLE_ELECTION = ['Let Inspire Decides', 'All Tables', 'Transactional Only'];
const GENERATION_OPTIONS = [
  { key: 'SQL Code', icon: Cpu, desc: 'Generate SQL implementations' },
  { key: 'Sample Results', icon: BarChart3, desc: 'Preview data products' },
  { key: 'PDF Catalog', icon: FileText, desc: 'Professional catalog PDF' },
  { key: 'Presentation', icon: Target, desc: 'Executive presentation' },
  { key: 'dashboards', icon: BarChart3, desc: 'Dashboard recommendations' },
  { key: 'Unstructured Data Usecases', icon: Search, desc: 'Document-based use cases' },
];
const BUSINESS_PRIORITIES = [
  { key: 'Increase Revenue', icon: '📈' },
  { key: 'Reduce Cost', icon: '💰' },
  { key: 'Optimize Operations', icon: '⚙️' },
  { key: 'Mitigate Risk', icon: '🛡️' },
  { key: 'Empower Talent', icon: '👥' },
  { key: 'Enhance Experience', icon: '✨' },
  { key: 'Drive Innovation', icon: '🚀' },
  { key: 'Achieve ESG', icon: '🌱' },
  { key: 'Protect Revenue', icon: '🔒' },
  { key: 'Execute Strategy', icon: '🎯' },
];
const SQL_PER_DOMAIN = ['0', '1', '2', '3', '4', '5', 'All'];

export default function LaunchPage({ settings, update, onLaunched }) {
  const { databricksHost, token, notebookPath, warehouseId, inspireDatabase } = settings;

  // ── Widget params (v41 exact widget names) ──
  const [params, setParams] = useState({
    '00_business_name': '',
    '01_uc_metadata': '',
    '02_inspire_database': inspireDatabase || '',
    '03_operation': 'Discover Usecases',
    '04_table_election': 'Let Inspire Decides',
    '05_use_cases_quality': 'High Quality',
    '06_business_domains': '',
    '07_business_priorities': 'Increase Revenue',
    '08_strategic_goals': '',
    '09_generation_options': 'SQL Code',
    '10_sql_generation_per_domain': '0',
    '11_generation_path': './inspire_gen/',
    '12_documents_languages': 'English',
    '13_ai_model': 'databricks-gpt-oss-120b',
    '14_session_id': '',
  });

  // ── Catalog/Schema pickers ──
  const [catalogs, setCatalogs] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [selectedCatalogs, setSelectedCatalogs] = useState([]);
  const [selectedSchemas, setSelectedSchemas] = useState([]);
  const [manualTables, setManualTables] = useState('');
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [schemaSearch, setSchemaSearch] = useState('');

  // ── Launch state ──
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Multiselects ──
  const [genChecks, setGenChecks] = useState({ 'SQL Code': true });
  const [priorityChecks, setPriorityChecks] = useState({ 'Increase Revenue': true });

  const apiFetch = useCallback(
    async (url, opts = {}) => {
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...opts.headers,
      };
      if (databricksHost) headers['X-Databricks-Host'] = databricksHost;
      const resp = await fetch(url, { ...opts, headers });
      if (!resp.ok) throw new Error(`${resp.status}`);
      return resp.json();
    },
    [token, databricksHost]
  );

  // Keep 09_generation_options synced
  useEffect(() => {
    const sel = Object.entries(genChecks).filter(([, v]) => v).map(([k]) => k);
    setParams((p) => ({ ...p, '09_generation_options': sel.join(',') }));
  }, [genChecks]);

  // Keep 07_business_priorities synced
  useEffect(() => {
    const sel = Object.entries(priorityChecks).filter(([, v]) => v).map(([k]) => k);
    setParams((p) => ({ ...p, '07_business_priorities': sel.join(',') }));
  }, [priorityChecks]);

  // Build 01_uc_metadata from selections
  useEffect(() => {
    const parts = [
      ...selectedCatalogs,
      ...selectedSchemas,
      ...manualTables.split(',').map((t) => t.trim()).filter(Boolean),
    ];
    setParams((p) => ({ ...p, '01_uc_metadata': parts.join(',') }));
  }, [selectedCatalogs, selectedSchemas, manualTables]);

  // Load catalogs
  useEffect(() => {
    if (!token) return;
    setLoadingCatalogs(true);
    apiFetch('/api/catalogs')
      .then((data) => setCatalogs(data.catalogs || []))
      .catch(() => {})
      .finally(() => setLoadingCatalogs(false));
  }, [token, apiFetch]);

  // Load schemas when catalogs change
  useEffect(() => {
    if (selectedCatalogs.length === 0) {
      setSchemas([]);
      return;
    }
    setLoadingSchemas(true);
    Promise.all(
      selectedCatalogs.map((cat) =>
        apiFetch(`/api/catalogs/${encodeURIComponent(cat)}/schemas`)
          .then((d) => d.schemas || [])
          .catch(() => [])
      )
    )
      .then((r) => setSchemas(r.flat()))
      .finally(() => setLoadingSchemas(false));
  }, [selectedCatalogs, apiFetch]);

  const updateParam = (key, val) => {
    setParams((p) => ({ ...p, [key]: val }));
    if (key === '02_inspire_database') update('inspireDatabase', val);
  };

  // Launch
  const handleLaunch = async () => {
    if (!params['00_business_name'])
      return setLaunchError('Business name is required.');
    if (!params['02_inspire_database'])
      return setLaunchError('Inspire Database is required.');
    if (params['03_operation'] === 'Discover Usecases' && !params['01_uc_metadata'])
      return setLaunchError('Select at least one catalog or schema for UC Metadata.');

    setLaunching(true);
    setLaunchError('');
    const finalParams = { ...params };
    if (!finalParams['14_session_id'])
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
  const isDiscover = params['03_operation'] === 'Discover Usecases';

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Launch Pipeline</h1>
        <p className="text-sm text-text-secondary mt-1">
          Configure your analysis parameters and start the Inspire AI pipeline.
        </p>
      </div>

      {/* Error */}
      {launchError && (
        <div className="flex items-center gap-2 p-3 bg-error-bg border border-error/20 rounded-lg mb-6">
          <AlertCircle size={16} className="text-error shrink-0" />
          <span className="text-sm text-error">{launchError}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* ═══ 1. Business Identity ═══ */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-panel">
            <div className="w-7 h-7 rounded-full bg-db-red flex items-center justify-center">
              <Building2 size={14} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Business Identity</h2>
              <p className="text-xs text-text-secondary">
                Define your organization and strategic direction
              </p>
            </div>
          </div>
          <div className="px-5 py-5 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Business name */}
              <FieldSection label="Business Name" required>
                <div className="relative">
                  <Building2
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                  />
                  <input
                    type="text"
                    placeholder="e.g. Contoso, Acme Corp"
                    value={params['00_business_name']}
                    onChange={(e) => updateParam('00_business_name', e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
                  />
                </div>
              </FieldSection>

              {/* Operation */}
              <FieldSection label="Operation Mode">
                <GlowSelect
                  value={params['03_operation']}
                  onChange={(v) => updateParam('03_operation', v)}
                  options={OPERATION_OPTIONS}
                />
              </FieldSection>

              {/* Strategic goals */}
              <div className="lg:col-span-2">
                <FieldSection label="Strategic Goals" hint="Comma-separated">
                  <div className="relative">
                    <Target
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                    />
                    <input
                      type="text"
                      placeholder="Increase market share, Reduce operational costs..."
                      value={params['08_strategic_goals']}
                      onChange={(e) => updateParam('08_strategic_goals', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
                    />
                  </div>
                </FieldSection>
              </div>

              {/* Business domains */}
              <div className="lg:col-span-2">
                <FieldSection label="Business Domains" hint="Comma-separated">
                  <div className="relative">
                    <Layers
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                    />
                    <input
                      type="text"
                      placeholder="Sales, Marketing, Finance, Operations..."
                      value={params['06_business_domains']}
                      onChange={(e) => updateParam('06_business_domains', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
                    />
                  </div>
                </FieldSection>
              </div>

              {/* Business priorities */}
              <div className="lg:col-span-2">
                <FieldSection label="Business Priorities">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {BUSINESS_PRIORITIES.map((bp) => {
                      const active = !!priorityChecks[bp.key];
                      return (
                        <button
                          key={bp.key}
                          type="button"
                          onClick={() =>
                            setPriorityChecks((p) => ({ ...p, [bp.key]: !p[bp.key] }))
                          }
                          className={`
                            relative px-3 py-2 rounded-lg text-xs font-medium text-left transition-smooth border
                            ${
                              active
                                ? 'border-db-red/30 bg-db-red-50 text-db-red glow-active'
                                : 'border-border text-text-secondary hover:border-border-strong glow-hover'
                            }
                          `}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm">{bp.icon}</span>
                            <span className="truncate">{bp.key}</span>
                          </span>
                          {active && (
                            <CheckCircle2
                              size={12}
                              className="absolute top-1.5 right-1.5 text-db-red"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </FieldSection>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ 2. Data Sources ═══ */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-panel">
            <div className="w-7 h-7 rounded-full bg-success flex items-center justify-center">
              <Database size={14} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Data Sources</h2>
              <p className="text-xs text-text-secondary">
                Select Unity Catalog metadata for analysis
              </p>
            </div>
          </div>
          <div className="px-5 py-5 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Inspire Database */}
              <FieldSection label="Inspire Database" required hint="catalog.schema">
                <div className="relative">
                  <Database
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                  />
                  <input
                    type="text"
                    placeholder="my_catalog._inspire"
                    value={params['02_inspire_database']}
                    onChange={(e) => updateParam('02_inspire_database', e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
                  />
                </div>
                <p className="text-[10px] text-text-tertiary mt-1">
                  Where Inspire stores tracking tables & results
                </p>
              </FieldSection>

              {/* Table election */}
              <FieldSection label="Table Election">
                <GlowSelect
                  value={params['04_table_election']}
                  onChange={(v) => updateParam('04_table_election', v)}
                  options={TABLE_ELECTION}
                />
                <p className="text-[10px] text-text-tertiary mt-1">
                  How Inspire selects tables for analysis
                </p>
              </FieldSection>
            </div>

            {/* Catalog + Schema pickers */}
            {isDiscover && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Catalogs */}
                <div>
                  <FieldSection
                    label="Catalogs"
                    required
                    hint="UC Metadata"
                    extra={
                      loadingCatalogs ? (
                        <Loader2 size={10} className="animate-spin inline ml-1" />
                      ) : null
                    }
                  >
                    <div className="rounded-lg border border-border bg-bg overflow-hidden">
                      <div className="relative">
                        <Search
                          size={12}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                        />
                        <input
                          type="text"
                          className="w-full bg-transparent border-b border-border pl-8 pr-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
                          placeholder="Search catalogs..."
                          value={catalogSearch}
                          onChange={(e) => setCatalogSearch(e.target.value)}
                        />
                      </div>
                      <div className="max-h-44 overflow-y-auto p-1.5">
                        {filteredCatalogs.length === 0 ? (
                          <p className="text-[10px] text-text-tertiary p-2 text-center">
                            {loadingCatalogs ? 'Loading...' : 'No catalogs found'}
                          </p>
                        ) : (
                          filteredCatalogs.map((c) => {
                            const active = selectedCatalogs.includes(c.name);
                            return (
                              <button
                                key={c.name}
                                type="button"
                                onClick={() => {
                                  if (active) {
                                    setSelectedCatalogs((p) =>
                                      p.filter((x) => x !== c.name)
                                    );
                                    setSelectedSchemas((p) =>
                                      p.filter((x) => !x.startsWith(c.name + '.'))
                                    );
                                  } else {
                                    setSelectedCatalogs((p) => [...p, c.name]);
                                  }
                                }}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-smooth ${
                                  active
                                    ? 'bg-db-red-50 text-db-red border border-db-red/20'
                                    : 'text-text-primary hover:bg-bg-subtle border border-transparent'
                                }`}
                              >
                                <div
                                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                                    active
                                      ? 'bg-db-red border-db-red'
                                      : 'border-border-strong'
                                  }`}
                                >
                                  {active && (
                                    <CheckCircle2 size={10} className="text-white" />
                                  )}
                                </div>
                                <Database
                                  size={11}
                                  className={
                                    active ? 'text-db-red' : 'text-text-tertiary'
                                  }
                                />
                                <span className="font-mono truncate">{c.name}</span>
                                {c.comment && (
                                  <span className="text-text-tertiary truncate ml-auto text-[10px]">
                                    {c.comment}
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </FieldSection>
                  {selectedCatalogs.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedCatalogs.map((c) => (
                        <span
                          key={c}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20"
                        >
                          <Database size={9} /> {c}
                          <button
                            onClick={() =>
                              setSelectedCatalogs((p) => p.filter((x) => x !== c))
                            }
                            className="hover:text-db-red-hover ml-0.5"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Schemas */}
                <div>
                  <FieldSection
                    label="Schemas"
                    hint="Optional — narrow scope"
                    extra={
                      loadingSchemas ? (
                        <Loader2 size={10} className="animate-spin inline ml-1" />
                      ) : null
                    }
                  >
                    <div className="rounded-lg border border-border bg-bg overflow-hidden">
                      <div className="relative">
                        <Search
                          size={12}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                        />
                        <input
                          type="text"
                          className="w-full bg-transparent border-b border-border pl-8 pr-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
                          placeholder="Search schemas..."
                          value={schemaSearch}
                          onChange={(e) => setSchemaSearch(e.target.value)}
                        />
                      </div>
                      <div className="max-h-44 overflow-y-auto p-1.5">
                        {selectedCatalogs.length === 0 ? (
                          <p className="text-[10px] text-text-tertiary p-2 text-center">
                            Select catalogs first
                          </p>
                        ) : filteredSchemas.length === 0 ? (
                          <p className="text-[10px] text-text-tertiary p-2 text-center">
                            {loadingSchemas ? 'Loading...' : 'No schemas found'}
                          </p>
                        ) : (
                          filteredSchemas.map((s) => {
                            const active = selectedSchemas.includes(s.full_name);
                            return (
                              <button
                                key={s.full_name}
                                type="button"
                                onClick={() => {
                                  if (active)
                                    setSelectedSchemas((p) =>
                                      p.filter((x) => x !== s.full_name)
                                    );
                                  else
                                    setSelectedSchemas((p) => [...p, s.full_name]);
                                }}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-smooth ${
                                  active
                                    ? 'bg-db-red-50 text-db-red border border-db-red/20'
                                    : 'text-text-primary hover:bg-bg-subtle border border-transparent'
                                }`}
                              >
                                <div
                                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                                    active
                                      ? 'bg-db-red border-db-red'
                                      : 'border-border-strong'
                                  }`}
                                >
                                  {active && (
                                    <CheckCircle2 size={10} className="text-white" />
                                  )}
                                </div>
                                <span className="font-mono truncate">{s.full_name}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </FieldSection>
                  {selectedSchemas.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedSchemas.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20"
                        >
                          {s}
                          <button
                            onClick={() =>
                              setSelectedSchemas((p) => p.filter((x) => x !== s))
                            }
                            className="hover:text-db-red-hover ml-0.5"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Manual tables */}
            {isDiscover && (
              <FieldSection label="Additional Tables" hint="catalog.schema.table — comma-separated">
                <div className="relative">
                  <FileText
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                  />
                  <input
                    type="text"
                    placeholder="my_catalog.sales.orders, my_catalog.marketing.campaigns"
                    value={manualTables}
                    onChange={(e) => setManualTables(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
                  />
                </div>
              </FieldSection>
            )}

            {/* UC Metadata summary */}
            {isDiscover && params['01_uc_metadata'] && (
              <div className="rounded-md border border-db-red/10 bg-db-red-50 px-4 py-2.5">
                <p className="text-[10px] text-db-red font-semibold uppercase tracking-wider mb-1">
                  01_uc_metadata
                </p>
                <p className="text-xs text-text-primary font-mono break-all">
                  {params['01_uc_metadata']}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ═══ 3. Quality & Outputs ═══ */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-panel">
            <div className="w-7 h-7 rounded-full bg-warning flex items-center justify-center">
              <Sliders size={14} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Quality & Outputs</h2>
              <p className="text-xs text-text-secondary">
                Choose quality level and what to generate
              </p>
            </div>
          </div>
          <div className="px-5 py-5 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Quality */}
              <FieldSection label="Use Case Quality">
                <div className="flex gap-2">
                  {QUALITY_OPTIONS.map((q) => {
                    const active = params['05_use_cases_quality'] === q;
                    return (
                      <button
                        key={q}
                        type="button"
                        onClick={() => updateParam('05_use_cases_quality', q)}
                        className={`
                          flex-1 py-2 rounded-md text-xs font-medium transition-smooth border capitalize
                          ${
                            active
                              ? 'border-db-red/30 bg-db-red-50 text-db-red glow-active'
                              : 'border-border text-text-secondary hover:border-border-strong glow-hover'
                          }
                        `}
                      >
                        {q.replace(' Quality', '')}
                      </button>
                    );
                  })}
                </div>
              </FieldSection>

              {/* Languages */}
              <FieldSection label="Output Languages" hint="Comma-separated">
                <div className="relative">
                  <Globe2
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                  />
                  <input
                    type="text"
                    placeholder="English, French, Arabic"
                    value={params['12_documents_languages']}
                    onChange={(e) => updateParam('12_documents_languages', e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
                  />
                </div>
              </FieldSection>
            </div>

            {/* Generation options */}
            <FieldSection label="Generation Options">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {GENERATION_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = !!genChecks[opt.key];
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() =>
                        setGenChecks((p) => ({ ...p, [opt.key]: !p[opt.key] }))
                      }
                      className={`
                        relative p-3 rounded-lg text-left transition-smooth border
                        ${
                          active
                            ? 'border-db-red/30 bg-db-red-50 glow-active'
                            : 'border-border hover:border-border-strong glow-hover'
                        }
                      `}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon
                          size={14}
                          className={active ? 'text-db-red' : 'text-text-tertiary'}
                        />
                        <span
                          className={`text-xs font-semibold ${
                            active ? 'text-db-red' : 'text-text-primary'
                          }`}
                        >
                          {opt.key}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-tertiary leading-snug">
                        {opt.desc}
                      </p>
                      {active && (
                        <CheckCircle2
                          size={12}
                          className="absolute top-2 right-2 text-db-red"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </FieldSection>
          </div>
        </section>

        {/* ═══ 4. Advanced (collapsible) ═══ */}
        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-text-secondary hover:bg-bg-subtle transition-smooth"
          >
            <div className="flex items-center gap-2.5">
              <Layers size={14} className="text-text-tertiary" />
              <span>Advanced Settings</span>
            </div>
            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showAdvanced && (
            <div className="px-5 pb-5 pt-2 grid grid-cols-1 lg:grid-cols-2 gap-5 border-t border-border bg-panel">
              <FieldSection label="Generation Path" hint="11_generation_path">
                <div className="relative">
                  <FileText
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                  />
                  <input
                    type="text"
                    value={params['11_generation_path']}
                    onChange={(e) => updateParam('11_generation_path', e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary glow-focus transition-smooth font-mono"
                  />
                </div>
              </FieldSection>

              <FieldSection label="SQL per Domain" hint="10_sql_generation_per_domain">
                <GlowSelect
                  value={params['10_sql_generation_per_domain']}
                  onChange={(v) => updateParam('10_sql_generation_per_domain', v)}
                  options={SQL_PER_DOMAIN}
                />
              </FieldSection>

              <FieldSection label="AI Model Endpoint" hint="13_ai_model">
                <div className="relative">
                  <Cpu
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                  />
                  <input
                    type="text"
                    placeholder="databricks-gpt-oss-120b"
                    value={params['13_ai_model']}
                    onChange={(e) => updateParam('13_ai_model', e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth font-mono"
                  />
                </div>
              </FieldSection>

              <FieldSection label="Session ID" hint="14_session_id">
                <input
                  type="text"
                  placeholder="Auto-generated if empty"
                  value={params['14_session_id']}
                  onChange={(e) => updateParam('14_session_id', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth font-mono"
                />
              </FieldSection>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Launch Button ═══ */}
      <div className="mt-8 pt-6 border-t border-border">
        {/* Summary chips */}
        {(params['00_business_name'] || params['02_inspire_database'] || selectedCatalogs.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {params['00_business_name'] && (
              <Chip icon={<Building2 size={10} />}>
                {params['00_business_name']}
              </Chip>
            )}
            {params['02_inspire_database'] && (
              <Chip icon={<Database size={10} />}>
                {params['02_inspire_database']}
              </Chip>
            )}
            {selectedCatalogs.length > 0 && (
              <Chip icon={<Database size={10} />}>
                {selectedCatalogs.length} catalog{selectedCatalogs.length > 1 ? 's' : ''}
              </Chip>
            )}
            {selectedSchemas.length > 0 && (
              <Chip icon={<Layers size={10} />}>
                {selectedSchemas.length} schema{selectedSchemas.length > 1 ? 's' : ''}
              </Chip>
            )}
            <Chip icon={<Sliders size={10} />}>
              {params['05_use_cases_quality']}
            </Chip>
          </div>
        )}

        <button
          onClick={handleLaunch}
          disabled={
            launching || !params['00_business_name'] || !params['02_inspire_database']
          }
          className="w-full py-3 bg-db-red text-white text-sm font-semibold rounded-lg hover:bg-db-red-hover disabled:opacity-50 disabled:cursor-not-allowed transition-smooth flex items-center justify-center gap-2 shadow-sm"
        >
          {launching ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Launching Pipeline...
            </>
          ) : (
            <>
              <Play size={16} />
              Launch Inspire AI
            </>
          )}
        </button>

        <p className="text-xs text-text-tertiary mt-2 text-center">
          Notebook:{' '}
          <span className="font-mono text-text-secondary">
            {notebookPath || 'not set'}
          </span>
        </p>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Reusable form primitives (glow style)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function FieldSection({ label, required, hint, extra, children }) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5 mb-1.5">
        <span className="text-xs font-semibold text-text-primary">
          {label}
          {required && <span className="text-db-red ml-0.5">*</span>}
        </span>
        {hint && <span className="text-[10px] text-text-tertiary">{hint}</span>}
        {extra}
      </div>
      {children}
    </div>
  );
}

function GlowSelect({ value, onChange, options }) {
  return (
    <select
      className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary glow-focus transition-smooth"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Chip({ children, icon }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border border-db-red/20 bg-db-red-50 text-db-red">
      {icon} {children}
    </span>
  );
}
