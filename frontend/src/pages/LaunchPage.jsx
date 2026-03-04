import { useState, useEffect, useRef } from 'react';
import {
  Rocket, Building2, Database, Target, Layers, FileText,
  Loader2, AlertCircle, ChevronDown, ChevronUp, Info,
  Sparkles, Search, CheckCircle2, Globe2, Cpu, Zap, BarChart3,
  Brain, Shield, Tag, Hash
} from 'lucide-react';
import DatabricksLogo from '../components/DatabricksLogo';

/* ─── Constants (matching v41 notebook widget options) ─── */
const QUALITY_OPTIONS   = ['Good Quality', 'High Quality', 'Very High Quality'];
const OPERATION_OPTIONS  = ['Discover Usecases', 'Re-generate SQL'];
const TABLE_ELECTION     = ['Let Inspire Decides', 'All Tables', 'Transactional Only'];
const GENERATION_OPTIONS = [
  { key: 'SQL Code',                    icon: Cpu,      desc: 'Generate SQL implementations' },
  { key: 'Sample Results',              icon: BarChart3, desc: 'Preview data products' },
  { key: 'PDF Catalog',                 icon: FileText, desc: 'Professional catalog PDF' },
  { key: 'Presentation',               icon: Target,   desc: 'Executive presentation' },
  { key: 'dashboards',                  icon: BarChart3, desc: 'Dashboard recommendations' },
  { key: 'Unstructured Data Usecases',  icon: Search,   desc: 'Document-based use cases' },
];
const BUSINESS_PRIORITIES = [
  { key: 'Increase Revenue',   icon: '📈' },
  { key: 'Reduce Cost',        icon: '💰' },
  { key: 'Optimize Operations',icon: '⚙️' },
  { key: 'Mitigate Risk',      icon: '🛡️' },
  { key: 'Empower Talent',     icon: '👥' },
  { key: 'Enhance Experience', icon: '✨' },
  { key: 'Drive Innovation',   icon: '🚀' },
  { key: 'Achieve ESG',        icon: '🌱' },
  { key: 'Protect Revenue',    icon: '🔒' },
  { key: 'Execute Strategy',   icon: '🎯' },
];
const SQL_PER_DOMAIN = ['0', '1', '2', '3', '4', '5', 'All'];

/* ─── Animated section wrapper ─── */
function Section({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
    LAUNCH PAGE
   ═══════════════════════════════════════════════════ */
export default function LaunchPage({ settings, update, apiFetch, onRun }) {
  // ── Widget params (v41 exact widget names) ──
  const [params, setParams] = useState({
    '00_business_name': '',
    '01_uc_metadata': '',
    '02_inspire_database': settings.inspireDatabase || '',
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

  // Keep 09_generation_options synced
  useEffect(() => {
    const sel = Object.entries(genChecks).filter(([, v]) => v).map(([k]) => k);
    setParams(p => ({ ...p, '09_generation_options': sel.join(',') }));
  }, [genChecks]);

  // Keep 07_business_priorities synced
  useEffect(() => {
    const sel = Object.entries(priorityChecks).filter(([, v]) => v).map(([k]) => k);
    setParams(p => ({ ...p, '07_business_priorities': sel.join(',') }));
  }, [priorityChecks]);

  // Build 01_uc_metadata from selections
  useEffect(() => {
    const parts = [
      ...selectedCatalogs,
      ...selectedSchemas,
      ...manualTables.split(',').map(t => t.trim()).filter(Boolean),
    ];
    setParams(p => ({ ...p, '01_uc_metadata': parts.join(',') }));
  }, [selectedCatalogs, selectedSchemas, manualTables]);

  // Load catalogs
  useEffect(() => {
    setLoadingCatalogs(true);
    apiFetch('/api/catalogs')
      .then(r => r.json())
      .then(data => setCatalogs(data.catalogs || []))
      .catch(() => {})
      .finally(() => setLoadingCatalogs(false));
  }, []);

  // Load schemas when catalogs change
  useEffect(() => {
    if (selectedCatalogs.length === 0) { setSchemas([]); return; }
    setLoadingSchemas(true);
    Promise.all(
      selectedCatalogs.map(cat =>
        apiFetch(`/api/catalogs/${encodeURIComponent(cat)}/schemas`)
          .then(r => r.json())
          .then(d => d.schemas || [])
          .catch(() => [])
      )
    ).then(r => setSchemas(r.flat())).finally(() => setLoadingSchemas(false));
  }, [selectedCatalogs]);

  const updateParam = (key, val) => {
    setParams(p => ({ ...p, [key]: val }));
    if (key === '02_inspire_database') update('inspireDatabase', val);
  };

  // Launch
  const handleLaunch = async () => {
    if (!params['00_business_name']) return setLaunchError('Business name is required.');
    if (!params['02_inspire_database']) return setLaunchError('Inspire Database is required.');
    if (params['03_operation'] === 'Discover Usecases' && !params['01_uc_metadata'])
      return setLaunchError('Select at least one catalog or schema for UC Metadata.');

    setLaunching(true);
    setLaunchError('');
    const finalParams = { ...params };
    if (!finalParams['14_session_id'])
      finalParams['14_session_id'] = String(Date.now()) + String(Math.floor(Math.random() * 1e6));

    try {
      const res = await apiFetch('/api/run', {
        method: 'POST',
        body: JSON.stringify({ notebook_path: settings.notebookPath, params: finalParams }),
      });
      const data = await res.json();
      if (!res.ok) return setLaunchError(data.error || 'Failed to launch.');
      update('inspireDatabase', finalParams['02_inspire_database']);
      onRun(data.run_id, finalParams['14_session_id']);
    } catch (err) { setLaunchError(err.message); }
    finally { setLaunching(false); }
  };

  // Derived
  const filteredCatalogs = catalogs.filter(c =>
    !catalogSearch || c.name.toLowerCase().includes(catalogSearch.toLowerCase())
  );
  const filteredSchemas = schemas.filter(s =>
    !schemaSearch || s.full_name.toLowerCase().includes(schemaSearch.toLowerCase())
  );
  const isDiscover = params['03_operation'] === 'Discover Usecases';

  return (
    <div className="min-h-screen bg-db-darkest relative">
      {/* ── Background effects ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-db-red/4 rounded-full blur-[180px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-db-orange/3 rounded-full blur-[160px]" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,54,33,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,54,33,0.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ═══ Hero header ═══ */}
        <Section delay={0} className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="h-px w-10 bg-gradient-to-r from-transparent to-db-red/60" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-db-red-light flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Pipeline Configuration
            </span>
            <span className="h-px w-10 bg-gradient-to-l from-transparent to-db-red/60" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">
            Launch{' '}
            <span className="bg-gradient-to-r from-db-red via-db-orange to-db-gold bg-clip-text text-transparent">
              Inspire AI
            </span>
          </h1>
          <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
            Configure your analysis parameters below. Inspire will scan your Unity Catalog,
            generate use cases, score them, and produce a full data strategy.
          </p>
        </Section>

        {/* ═══ 1. Business Identity ═══ */}
        <Section delay={100} className="mb-6">
          <div className="rounded-2xl border border-white/5 bg-db-navy/15 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-db-navy/30">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-db-red to-db-orange flex items-center justify-center shadow-lg">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight">Business Identity</h2>
                <p className="text-[11px] text-slate-500">Define your organization and strategic direction</p>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Business name */}
                <div>
                  <Label required>Business Name</Label>
                  <Input
                    placeholder="e.g. Contoso, Acme Corp"
                    value={params['00_business_name']}
                    onChange={v => updateParam('00_business_name', v)}
                    icon={<Building2 size={14} />}
                  />
                </div>
                {/* Operation */}
                <div>
                  <Label>Operation Mode</Label>
                  <Select
                    value={params['03_operation']}
                    onChange={v => updateParam('03_operation', v)}
                    options={OPERATION_OPTIONS}
                  />
                </div>
                {/* Strategic goals */}
                <div className="lg:col-span-2">
                  <Label hint="Comma-separated">Strategic Goals</Label>
                  <Input
                    placeholder="Increase market share, Reduce operational costs, Improve customer retention..."
                    value={params['08_strategic_goals']}
                    onChange={v => updateParam('08_strategic_goals', v)}
                    icon={<Target size={14} />}
                  />
                </div>
                {/* Business domains */}
                <div className="lg:col-span-2">
                  <Label hint="Comma-separated">Business Domains</Label>
                  <Input
                    placeholder="Sales, Marketing, Finance, Operations..."
                    value={params['06_business_domains']}
                    onChange={v => updateParam('06_business_domains', v)}
                    icon={<Layers size={14} />}
                  />
                </div>
                {/* Business priorities */}
                <div className="lg:col-span-2">
                  <Label>Business Priorities</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-1">
                    {BUSINESS_PRIORITIES.map(bp => {
                      const active = !!priorityChecks[bp.key];
                      return (
                        <button
                          key={bp.key}
                          type="button"
                          onClick={() => setPriorityChecks(p => ({ ...p, [bp.key]: !p[bp.key] }))}
                          className={`group relative px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 text-left ${
                            active
                              ? 'bg-db-red/10 border border-db-red/30 text-db-red-light shadow-sm shadow-db-red/10'
                              : 'bg-db-navy/20 border border-white/5 text-slate-400 hover:border-white/10 hover:bg-db-navy/30'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm">{bp.icon}</span>
                            <span className="truncate">{bp.key}</span>
                          </span>
                          {active && (
                            <CheckCircle2 size={12} className="absolute top-1.5 right-1.5 text-db-red-light" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ═══ 2. Data Sources ═══ */}
        <Section delay={200} className="mb-6">
          <div className="rounded-2xl border border-white/5 bg-db-navy/15 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-db-navy/30">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-db-teal to-emerald-500 flex items-center justify-center shadow-lg">
                <Database className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight">Data Sources</h2>
                <p className="text-[11px] text-slate-500">Select Unity Catalog metadata for analysis</p>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Inspire Database */}
                <div>
                  <Label required hint="catalog.schema">Inspire Database</Label>
                  <Input
                    placeholder="my_catalog._inspire"
                    value={params['02_inspire_database']}
                    onChange={v => updateParam('02_inspire_database', v)}
                    icon={<Database size={14} />}
                  />
                  <p className="text-[10px] text-slate-600 mt-1">Where Inspire stores tracking tables & results</p>
                </div>
                {/* Table election */}
                <div>
                  <Label>Table Election</Label>
                  <Select
                    value={params['04_table_election']}
                    onChange={v => updateParam('04_table_election', v)}
                    options={TABLE_ELECTION}
                  />
                  <p className="text-[10px] text-slate-600 mt-1">How Inspire selects tables for analysis</p>
                </div>
              </div>

              {/* Catalog + Schema pickers */}
              {isDiscover && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Catalogs */}
                  <div>
                    <Label required hint="UC Metadata">
                      Catalogs {loadingCatalogs && <Loader2 size={10} className="animate-spin inline ml-1" />}
                    </Label>
                    <div className="rounded-xl border border-white/5 bg-db-darkest/60 overflow-hidden">
                      <div className="relative">
                        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                        <input
                          type="text"
                          className="w-full bg-transparent border-b border-white/5 pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none"
                          placeholder="Search catalogs..."
                          value={catalogSearch}
                          onChange={e => setCatalogSearch(e.target.value)}
                        />
                      </div>
                      <div className="max-h-44 overflow-y-auto p-1.5">
                        {filteredCatalogs.length === 0 ? (
                          <p className="text-[10px] text-slate-600 p-2 text-center">
                            {loadingCatalogs ? 'Loading...' : 'No catalogs found'}
                          </p>
                        ) : (
                          filteredCatalogs.map(c => {
                            const active = selectedCatalogs.includes(c.name);
                            return (
                              <button
                                key={c.name}
                                type="button"
                                onClick={() => {
                                  if (active) {
                                    setSelectedCatalogs(p => p.filter(x => x !== c.name));
                                    setSelectedSchemas(p => p.filter(x => !x.startsWith(c.name + '.')));
                                  } else {
                                    setSelectedCatalogs(p => [...p, c.name]);
                                  }
                                }}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                                  active
                                    ? 'bg-db-teal/10 text-db-teal border border-db-teal/20'
                                    : 'text-slate-300 hover:bg-white/3 border border-transparent'
                                }`}
                              >
                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                                  active ? 'bg-db-teal border-db-teal' : 'border-slate-600'
                                }`}>
                                  {active && <CheckCircle2 size={10} className="text-white" />}
                                </div>
                                <Database size={11} className={active ? 'text-db-teal' : 'text-slate-600'} />
                                <span className="font-mono truncate">{c.name}</span>
                                {c.comment && <span className="text-slate-600 truncate ml-auto text-[10px]">{c.comment}</span>}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                    {selectedCatalogs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedCatalogs.map(c => (
                          <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-teal/10 text-db-teal text-[10px] font-medium border border-db-teal/20">
                            <Database size={9} /> {c}
                            <button onClick={() => setSelectedCatalogs(p => p.filter(x => x !== c))} className="hover:text-white ml-0.5">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Schemas */}
                  <div>
                    <Label hint="Optional — narrow scope">
                      Schemas {loadingSchemas && <Loader2 size={10} className="animate-spin inline ml-1" />}
                    </Label>
                    <div className="rounded-xl border border-white/5 bg-db-darkest/60 overflow-hidden">
                      <div className="relative">
                        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                        <input
                          type="text"
                          className="w-full bg-transparent border-b border-white/5 pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none"
                          placeholder="Search schemas..."
                          value={schemaSearch}
                          onChange={e => setSchemaSearch(e.target.value)}
                        />
                      </div>
                      <div className="max-h-44 overflow-y-auto p-1.5">
                        {selectedCatalogs.length === 0 ? (
                          <p className="text-[10px] text-slate-600 p-2 text-center">Select catalogs first</p>
                        ) : filteredSchemas.length === 0 ? (
                          <p className="text-[10px] text-slate-600 p-2 text-center">{loadingSchemas ? 'Loading...' : 'No schemas found'}</p>
                        ) : (
                          filteredSchemas.map(s => {
                            const active = selectedSchemas.includes(s.full_name);
                            return (
                              <button
                                key={s.full_name}
                                type="button"
                                onClick={() => {
                                  if (active) setSelectedSchemas(p => p.filter(x => x !== s.full_name));
                                  else setSelectedSchemas(p => [...p, s.full_name]);
                                }}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                                  active
                                    ? 'bg-db-teal/10 text-db-teal border border-db-teal/20'
                                    : 'text-slate-300 hover:bg-white/3 border border-transparent'
                                }`}
                              >
                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                                  active ? 'bg-db-teal border-db-teal' : 'border-slate-600'
                                }`}>
                                  {active && <CheckCircle2 size={10} className="text-white" />}
                                </div>
                                <span className="font-mono truncate">{s.full_name}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                    {selectedSchemas.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedSchemas.map(s => (
                          <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-teal/10 text-db-teal text-[10px] font-medium border border-db-teal/20">
                            {s}
                            <button onClick={() => setSelectedSchemas(p => p.filter(x => x !== s))} className="hover:text-white ml-0.5">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Manual tables */}
              {isDiscover && (
                <div>
                  <Label hint="catalog.schema.table — comma-separated">Additional Tables</Label>
                  <Input
                    placeholder="my_catalog.sales.orders, my_catalog.marketing.campaigns"
                    value={manualTables}
                    onChange={setManualTables}
                    icon={<Tag size={14} />}
                  />
                </div>
              )}

              {/* UC Metadata summary */}
              {isDiscover && params['01_uc_metadata'] && (
                <div className="rounded-lg border border-db-teal/10 bg-db-teal/5 px-4 py-2.5">
                  <p className="text-[10px] text-db-teal font-semibold uppercase tracking-wider mb-1">01_uc_metadata</p>
                  <p className="text-xs text-slate-300 font-mono break-all">{params['01_uc_metadata']}</p>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* ═══ 3. Quality & Outputs ═══ */}
        <Section delay={300} className="mb-6">
          <div className="rounded-2xl border border-white/5 bg-db-navy/15 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-db-navy/30">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-db-gold to-amber-500 flex items-center justify-center shadow-lg">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight">Quality & Outputs</h2>
                <p className="text-[11px] text-slate-500">Choose quality level and what to generate</p>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Quality */}
                <div>
                  <Label>Use Case Quality</Label>
                  <div className="flex gap-2 mt-1">
                    {QUALITY_OPTIONS.map(q => {
                      const active = params['05_use_cases_quality'] === q;
                      return (
                        <button
                          key={q}
                          type="button"
                          onClick={() => updateParam('05_use_cases_quality', q)}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 border ${
                            active
                              ? 'bg-db-gold/10 border-db-gold/30 text-db-gold shadow-sm shadow-db-gold/10'
                              : 'bg-db-navy/20 border-white/5 text-slate-400 hover:border-white/10'
                          }`}
                        >
                          {q.replace(' Quality', '')}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Languages */}
                <div>
                  <Label hint="Comma-separated">Output Languages</Label>
                  <Input
                    placeholder="English, French, Arabic"
                    value={params['12_documents_languages']}
                    onChange={v => updateParam('12_documents_languages', v)}
                    icon={<Globe2 size={14} />}
                  />
                </div>
              </div>

              {/* Generation options */}
              <div>
                <Label>Generation Options</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                  {GENERATION_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const active = !!genChecks[opt.key];
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setGenChecks(p => ({ ...p, [opt.key]: !p[opt.key] }))}
                        className={`group relative p-3 rounded-xl text-left transition-all duration-200 border ${
                          active
                            ? 'bg-db-orange/8 border-db-orange/25 shadow-sm'
                            : 'bg-db-navy/20 border-white/5 hover:border-white/10 hover:bg-db-navy/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon size={14} className={active ? 'text-db-orange' : 'text-slate-500'} />
                          <span className={`text-xs font-semibold ${active ? 'text-db-orange' : 'text-slate-300'}`}>
                            {opt.key}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-snug">{opt.desc}</p>
                        {active && (
                          <CheckCircle2 size={12} className="absolute top-2 right-2 text-db-orange" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ═══ 4. Advanced (collapsible) ═══ */}
        <Section delay={400} className="mb-8">
          <div className="rounded-2xl border border-white/5 bg-db-navy/15 backdrop-blur-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/2 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-white" />
                </div>
                <div className="text-left">
                  <h2 className="text-sm font-bold text-white tracking-tight">Advanced Settings</h2>
                  <p className="text-[11px] text-slate-500">Model, paths, SQL config, session</p>
                </div>
              </div>
              <ChevronDown
                size={16}
                className={`text-slate-500 transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`}
              />
            </button>

            {showAdvanced && (
              <div className="px-6 pb-6 pt-2 grid grid-cols-1 lg:grid-cols-2 gap-5 border-t border-white/5">
                <div>
                  <Label hint="11_generation_path">Generation Path</Label>
                  <Input
                    value={params['11_generation_path']}
                    onChange={v => updateParam('11_generation_path', v)}
                    icon={<FileText size={14} />}
                  />
                </div>
                <div>
                  <Label hint="10_sql_generation_per_domain">SQL per Domain</Label>
                  <Select
                    value={params['10_sql_generation_per_domain']}
                    onChange={v => updateParam('10_sql_generation_per_domain', v)}
                    options={SQL_PER_DOMAIN}
                  />
                </div>
                <div>
                  <Label hint="13_ai_model">AI Model Endpoint</Label>
                  <Input
                    placeholder="databricks-gpt-oss-120b"
                    value={params['13_ai_model']}
                    onChange={v => updateParam('13_ai_model', v)}
                    icon={<Brain size={14} />}
                  />
                </div>
                <div>
                  <Label hint="14_session_id">Session ID</Label>
                  <Input
                    placeholder="Auto-generated if empty"
                    value={params['14_session_id']}
                    onChange={v => updateParam('14_session_id', v)}
                    icon={<Hash size={14} />}
                  />
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* ═══ Error ═══ */}
        {launchError && (
          <Section delay={0} className="mb-6">
            <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/5">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{launchError}</p>
            </div>
          </Section>
        )}

        {/* ═══ Launch Button ═══ */}
        <Section delay={500} className="mb-12">
          <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-db-navy/40 to-db-darkest p-8 text-center overflow-hidden">
            {/* Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-db-red/6 rounded-full blur-[80px]" />

            <div className="relative z-10">
              <DatabricksLogo className="w-10 h-10 mx-auto mb-4 opacity-80" />

              {/* Summary chips */}
              <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
                {params['00_business_name'] && (
                  <Chip icon={<Building2 size={10} />} color="red">{params['00_business_name']}</Chip>
                )}
                {params['02_inspire_database'] && (
                  <Chip icon={<Database size={10} />} color="teal">{params['02_inspire_database']}</Chip>
                )}
                {selectedCatalogs.length > 0 && (
                  <Chip icon={<Database size={10} />} color="teal">{selectedCatalogs.length} catalog{selectedCatalogs.length > 1 ? 's' : ''}</Chip>
                )}
                {selectedSchemas.length > 0 && (
                  <Chip icon={<Layers size={10} />} color="teal">{selectedSchemas.length} schema{selectedSchemas.length > 1 ? 's' : ''}</Chip>
                )}
                <Chip icon={<Shield size={10} />} color="gold">{params['05_use_cases_quality']}</Chip>
              </div>

              <button
                onClick={handleLaunch}
                disabled={launching || !params['00_business_name'] || !params['02_inspire_database']}
                className="group relative px-10 py-4 rounded-xl font-bold text-white text-base bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 transition-all shadow-lg shadow-db-red/25 hover:shadow-db-red/40 hover:scale-[1.02] active:scale-[0.98] disabled:shadow-none disabled:hover:scale-100"
              >
                <span className="flex items-center gap-3">
                  {launching ? (
                    <><Loader2 size={20} className="animate-spin" /> Launching Pipeline...</>
                  ) : (
                    <>
                      <Rocket size={20} />
                      Launch Inspire AI
                      <Sparkles size={16} className="opacity-60 group-hover:opacity-100 transition-opacity" />
                    </>
                  )}
                </span>
              </button>

              <p className="text-[10px] text-slate-600 mt-3">
                Notebook: <span className="font-mono text-slate-500">{settings.notebookPath || 'not set'}</span>
              </p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Reusable form primitives (Databricks style)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function Label({ children, required, hint }) {
  return (
    <label className="flex items-baseline gap-1.5 mb-1.5">
      <span className="text-xs font-semibold text-slate-300">
        {children}
        {required && <span className="text-db-red ml-0.5">*</span>}
      </span>
      {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
    </label>
  );
}

function Input({ value, onChange, placeholder, icon, className = '' }) {
  return (
    <div className="relative group">
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-db-red-light transition-colors">
          {icon}
        </div>
      )}
      <input
        type="text"
        className={`w-full bg-db-darkest/60 border border-white/8 rounded-xl ${icon ? 'pl-9' : 'pl-3'} pr-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-db-red/40 focus:ring-1 focus:ring-db-red/20 transition-all ${className}`}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      className="w-full bg-db-darkest/60 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-db-red/40 focus:ring-1 focus:ring-db-red/20 transition-all appearance-none cursor-pointer"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
      }}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Chip({ children, icon, color = 'red' }) {
  const colors = {
    red:  'bg-db-red/10 text-db-red-light border-db-red/20',
    teal: 'bg-db-teal/10 text-db-teal border-db-teal/20',
    gold: 'bg-db-gold/10 text-db-gold border-db-gold/20',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${colors[color]}`}>
      {icon} {children}
    </span>
  );
}
