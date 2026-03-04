import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Database, Search, Filter, ChevronDown, ChevronUp, Loader2,
  BarChart3, Target, Lightbulb, Users, Table2, Sparkles,
  TrendingUp, Shield, Clock, Layers, Brain, AlertTriangle,
  Star, ArrowUpDown, X, Eye, Code, Building2, GitBranch,
  Gauge, CheckCircle2, XCircle, Tag, Briefcase
} from 'lucide-react';

/* ─── Quality badge colors ─── */
const QUALITY_COLORS = {
  'Ultra High': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Very High': 'bg-green-500/20 text-green-300 border-green-500/30',
  'High': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  'Medium': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'Low': 'bg-red-500/20 text-red-300 border-red-500/30',
};

const TYPE_ICONS = {
  'Dashboard': BarChart3,
  'Report': BarChart3,
  'ML Model': Brain,
  'Data Product': Database,
  'Analytics': TrendingUp,
  'Prediction': Brain,
  'Monitoring': Gauge,
  'Alert': AlertTriangle,
};

/* ─── Score bar ─── */
function ScoreBar({ label, value, max = 10, icon: Icon }) {
  const pct = Math.min(100, ((value || 0) / max) * 100);
  const color =
    pct >= 70 ? 'bg-emerald-500' :
    pct >= 40 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className="w-3 h-3 text-slate-500 shrink-0" />}
      <span className="text-[10px] text-slate-400 w-24 truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-500 w-6 text-right font-mono">{(value || 0).toFixed(1)}</span>
    </div>
  );
}

/* ─── Aggregate score donut ─── */
function ScoreDonut({ value, max = 10, size = 48, label }) {
  const pct = Math.min(100, ((value || 0) / max) * 100);
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference * (1 - pct / 100);
  const color =
    pct >= 70 ? 'stroke-emerald-400' :
    pct >= 40 ? 'stroke-amber-400' : 'stroke-red-400';

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={3} />
          <circle
            cx={size/2} cy={size/2} r={r} fill="none"
            className={`${color} transition-all duration-1000`}
            strokeWidth={3} strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
          {(value || 0).toFixed(1)}
        </span>
      </div>
      {label && <span className="text-[9px] text-slate-500 font-medium">{label}</span>}
    </div>
  );
}

/* ─── Use Case Card ─── */
function UseCaseCard({ uc, index }) {
  const [expanded, setExpanded] = useState(false);
  const [showSql, setShowSql] = useState(false);

  const quality = uc.Quality || 'Medium';
  const qualityClass = QUALITY_COLORS[quality] || QUALITY_COLORS.Medium;
  const TypeIcon = TYPE_ICONS[uc.type] || Lightbulb;
  const priority = parseFloat(uc.Priority) || 0;
  const value = parseFloat(uc.Value) || 0;
  const feasibility = parseFloat(uc.Feasibility) || 0;

  const scores = [
    { label: 'Strategic Align.', value: parseFloat(uc['Strategic Alignment']) || 0, icon: Target },
    { label: 'ROI', value: parseFloat(uc['Return on Investment']) || 0, icon: TrendingUp },
    { label: 'Reusability', value: parseFloat(uc['Reusability']) || 0, icon: Layers },
    { label: 'Time to Value', value: parseFloat(uc['Time to Value']) || 0, icon: Clock },
    { label: 'Data Availability', value: parseFloat(uc['Data Availability']) || 0, icon: Database },
    { label: 'Data Accessibility', value: parseFloat(uc['Data Accessibility']) || 0, icon: Shield },
    { label: 'Arch. Fitness', value: parseFloat(uc['Architecture Fitness']) || 0, icon: Building2 },
    { label: 'Team Skills', value: parseFloat(uc['Team Skills']) || 0, icon: Users },
  ];

  const tablesInvolved = (uc['Tables Involved'] || '').split(',').map(t => t.trim()).filter(Boolean);

  return (
    <div className="group relative rounded-xl border border-white/5 bg-db-navy/20 hover:bg-db-navy/30 hover:border-white/10 transition-all duration-300 overflow-hidden">
      {/* Priority stripe */}
      <div
        className="absolute top-0 left-0 w-1 h-full rounded-l-xl transition-all"
        style={{
          background: priority >= 7 ? '#10b981' : priority >= 4 ? '#f59e0b' : '#ef4444',
          opacity: 0.8,
        }}
      />

      {/* Main content */}
      <div className="pl-4 pr-4 py-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-db-red/20 to-db-orange/20 border border-db-red/20 flex items-center justify-center shrink-0 mt-0.5">
            <TypeIcon className="w-5 h-5 text-db-red-light" />
          </div>

          {/* Title & meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-mono text-slate-500">#{uc.No || index + 1}</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${qualityClass}`}>
                {quality}
              </span>
              {uc.type && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-db-navy/60 text-slate-400 border border-white/5">
                  {uc.type}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-white leading-snug mb-1">
              {uc.Name || 'Untitled Use Case'}
            </h3>
            {uc['Business Domain'] && (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Building2 className="w-3 h-3" />
                <span>{uc['Business Domain']}</span>
                {uc.Subdomain && (
                  <>
                    <span className="text-slate-700">·</span>
                    <span>{uc.Subdomain}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Score donuts */}
          <div className="hidden sm:flex items-center gap-3">
            <ScoreDonut value={value} label="Value" />
            <ScoreDonut value={feasibility} label="Feasibility" />
            <ScoreDonut value={priority} label="Priority" />
          </div>
        </div>

        {/* Statement */}
        {uc.Statement && (
          <p className="mt-3 text-xs text-slate-400 leading-relaxed line-clamp-2">
            {uc.Statement}
          </p>
        )}

        {/* Tags row */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {uc['Analytics Technique'] && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20">
              <Brain className="w-2.5 h-2.5" />
              {uc['Analytics Technique']}
            </span>
          )}
          {tablesInvolved.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              <Table2 className="w-2.5 h-2.5" />
              {tablesInvolved.length} table{tablesInvolved.length !== 1 ? 's' : ''}
            </span>
          )}
          {uc.Beneficiary && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20">
              <Users className="w-2.5 h-2.5" />
              {uc.Beneficiary}
            </span>
          )}

          {/* Mobile scores */}
          <div className="flex sm:hidden items-center gap-2 ml-auto">
            <span className="text-[10px] text-emerald-400 font-mono">P:{priority.toFixed(1)}</span>
            <span className="text-[10px] text-amber-400 font-mono">V:{value.toFixed(1)}</span>
          </div>
        </div>

        {/* Expand button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 mt-3 text-[11px] text-db-red-light hover:text-db-red transition-colors font-medium"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Show less' : 'Show details'}
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-white/5 space-y-4 animate-fade-in-up">
            {/* Solution & Business Value */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {uc.Solution && (
                <div>
                  <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Lightbulb className="w-3 h-3 text-db-gold" /> Solution
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{uc.Solution}</p>
                </div>
              )}
              {uc['Business Value'] && (
                <div>
                  <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-400" /> Business Value
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{uc['Business Value']}</p>
                </div>
              )}
            </div>

            {/* Alignments */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {uc['Business Priority Alignment'] && (
                <div>
                  <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Target className="w-3 h-3 text-db-red-light" /> Priority Alignment
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{uc['Business Priority Alignment']}</p>
                </div>
              )}
              {uc['Strategic Goals Alignment'] && (
                <div>
                  <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Star className="w-3 h-3 text-db-gold" /> Strategic Goals Alignment
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{uc['Strategic Goals Alignment']}</p>
                </div>
              )}
            </div>

            {/* Sponsor */}
            {uc.Sponsor && (
              <div>
                <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Briefcase className="w-3 h-3 text-blue-400" /> Sponsor
                </h4>
                <p className="text-xs text-slate-400">{uc.Sponsor}</p>
              </div>
            )}

            {/* Quality Justification */}
            {uc.Justification && (
              <div>
                <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-teal-400" /> Quality Justification
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">{uc.Justification}</p>
              </div>
            )}

            {/* Scores */}
            <div>
              <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                <BarChart3 className="w-3 h-3 text-db-orange" /> Scoring Breakdown
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {scores.map(s => (
                  <ScoreBar key={s.label} label={s.label} value={s.value} icon={s.icon} />
                ))}
              </div>
            </div>

            {/* Tables */}
            {tablesInvolved.length > 0 && (
              <div>
                <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Table2 className="w-3 h-3 text-cyan-400" /> Tables Involved
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {tablesInvolved.map((t, i) => (
                    <span key={i} className="px-2 py-1 rounded-md text-[10px] font-mono bg-db-darkest border border-white/5 text-slate-400">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* SQL */}
            {uc.SQL && (
              <div>
                <button
                  onClick={() => setShowSql(!showSql)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-2 hover:text-white transition-colors"
                >
                  <Code className="w-3 h-3 text-db-gold" />
                  SQL Query
                  {showSql ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {showSql && (
                  <pre className="p-3 rounded-lg bg-db-darkest border border-white/5 text-[11px] font-mono text-slate-400 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                    {uc.SQL}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Stats summary bar ─── */
function StatsSummary({ useCases }) {
  const domains = [...new Set(useCases.map(uc => uc['Business Domain']).filter(Boolean))];
  const avgPriority = useCases.length
    ? (useCases.reduce((s, uc) => s + (parseFloat(uc.Priority) || 0), 0) / useCases.length)
    : 0;
  const withSql = useCases.filter(uc => uc.SQL).length;
  const qualityCounts = {};
  useCases.forEach(uc => {
    const q = uc.Quality || 'Unknown';
    qualityCounts[q] = (qualityCounts[q] || 0) + 1;
  });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Use Cases', value: useCases.length, icon: Lightbulb, color: 'from-db-red to-db-orange' },
        { label: 'Domains', value: domains.length, icon: Building2, color: 'from-purple-500 to-blue-500' },
        { label: 'Avg Priority', value: avgPriority.toFixed(1), icon: Target, color: 'from-emerald-500 to-teal-500' },
        { label: 'With SQL', value: withSql, icon: Code, color: 'from-db-gold to-amber-500' },
      ].map(stat => {
        const Icon = stat.icon;
        return (
          <div key={stat.label} className="p-3 rounded-xl border border-white/5 bg-db-navy/20">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                <Icon className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-lg font-bold text-white">{stat.value}</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">{stat.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MAIN RESULTS PAGE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function ResultsPage({ apiFetch, inspireDatabase: initialDb }) {
  // Restore last used values from localStorage
  const savedDb = initialDb || localStorage.getItem('inspire_results_db') || '';
  const savedWarehouse = localStorage.getItem('inspire_results_warehouse') || '';

  const [inspireDatabase, setInspireDatabase] = useState(savedDb);
  const [warehouseId, setWarehouseId] = useState(savedWarehouse);
  const [warehouses, setWarehouses] = useState([]);
  const [useCases, setUseCases] = useState([]);
  const [sourceTable, setSourceTable] = useState('');
  const [pipelineState, setPipelineState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [warehouseLoading, setWarehouseLoading] = useState(false);

  // Catalog/schema pickers
  const [catalogs, setCatalogs] = useState([]);
  const [catalogsLoading, setCatalogsLoading] = useState(false);
  const [schemas, setSchemas] = useState([]);
  const [schemasLoading, setSchemasLoading] = useState(false);
  const [selectedCatalog, setSelectedCatalog] = useState(() => {
    const parts = savedDb.split('.');
    return parts.length >= 2 ? parts[0] : '';
  });
  const [selectedSchema, setSelectedSchema] = useState(() => {
    const parts = savedDb.split('.');
    return parts.length >= 2 ? parts[1] : '';
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [qualityFilter, setQualityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('priority');
  const [sortDir, setSortDir] = useState('desc');

  // Persist values to localStorage
  useEffect(() => {
    if (inspireDatabase) localStorage.setItem('inspire_results_db', inspireDatabase);
  }, [inspireDatabase]);
  useEffect(() => {
    if (warehouseId) localStorage.setItem('inspire_results_warehouse', warehouseId);
  }, [warehouseId]);

  // Fetch catalogs on mount
  useEffect(() => {
    if (!apiFetch) return;
    setCatalogsLoading(true);
    apiFetch('/api/catalogs')
      .then(r => r.json())
      .then(data => setCatalogs(data.catalogs || []))
      .catch(() => {})
      .finally(() => setCatalogsLoading(false));
  }, [apiFetch]);

  // Fetch schemas when catalog changes
  useEffect(() => {
    if (!apiFetch || !selectedCatalog) { setSchemas([]); return; }
    setSchemasLoading(true);
    apiFetch(`/api/catalogs/${encodeURIComponent(selectedCatalog)}/schemas`)
      .then(r => r.json())
      .then(data => setSchemas(data.schemas || []))
      .catch(() => setSchemas([]))
      .finally(() => setSchemasLoading(false));
  }, [apiFetch, selectedCatalog]);

  // Sync catalog/schema selection → inspireDatabase
  useEffect(() => {
    if (selectedCatalog && selectedSchema) {
      setInspireDatabase(`${selectedCatalog}.${selectedSchema}`);
    }
  }, [selectedCatalog, selectedSchema]);

  // Fetch warehouses on mount
  useEffect(() => {
    if (!apiFetch) return;
    setWarehouseLoading(true);
    apiFetch('/api/warehouses')
      .then(r => r.json())
      .then(data => {
        const wh = data.warehouses || [];
        setWarehouses(wh);
        // Auto-select saved warehouse if still valid, else first running
        if (savedWarehouse && wh.find(w => w.id === savedWarehouse)) {
          setWarehouseId(savedWarehouse);
        } else {
          const running = wh.find(w => w.state === 'RUNNING');
          if (running) setWarehouseId(running.id);
          else if (wh.length === 1) setWarehouseId(wh[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setWarehouseLoading(false));
  }, [apiFetch]);

  // Available tables state
  const [availableTables, setAvailableTables] = useState([]);

  // Fetch use cases
  const fetchResults = useCallback(async () => {
    if (!inspireDatabase || !inspireDatabase.includes('.') || !warehouseId) return;
    setLoading(true);
    setError(null);
    setAvailableTables([]);
    try {
      // Step 1: List available tables in the schema
      let tables = [];
      try {
        const tablesResp = await apiFetch(`/api/results/tables?inspire_database=${encodeURIComponent(inspireDatabase)}`);
        const tablesData = await tablesResp.json();
        tables = tablesData.all_tables || [];
        setAvailableTables(tables);
      } catch (e) {
        console.warn('Could not list tables:', e);
      }

      // Step 2: Fetch use cases
      const ucResp = await apiFetch(`/api/results/use-cases?inspire_database=${encodeURIComponent(inspireDatabase)}&warehouse_id=${encodeURIComponent(warehouseId)}`);
      const ucData = await ucResp.json();
      if (ucData.error) throw new Error(ucData.error);
      setUseCases(ucData.use_cases || []);
      setSourceTable(ucData.source_table || '');

      // Step 3: Fetch pipeline state (non-blocking — don't let it break the page)
      try {
        const stateResp = await apiFetch(`/api/results/pipeline-state?inspire_database=${encodeURIComponent(inspireDatabase)}&warehouse_id=${encodeURIComponent(warehouseId)}`);
        const stateData = await stateResp.json();
        if (!stateData.error) {
          setPipelineState(stateData.states || null);
        }
      } catch (e) {
        console.warn('Pipeline state fetch failed (non-critical):', e);
      }

      // If no use cases found, show what tables exist and what was tried
      if ((ucData.use_cases || []).length === 0) {
        const tried = ucData.tried_tables || [];
        const available = ucData.available_tables || tables.map(t => t.name);
        const msg = available.length > 0
          ? `No use case data found. Tried: ${tried.join(', ') || 'none'}. Available tables in ${inspireDatabase}: ${available.join(', ')}`
          : `Schema ${inspireDatabase} appears to be empty or inaccessible. Make sure a pipeline has completed successfully.`;
        setError(msg);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, inspireDatabase, warehouseId]);

  // Auto-fetch when both inspireDatabase and warehouseId are set
  const [autoFetched, setAutoFetched] = useState(false);
  useEffect(() => {
    if (inspireDatabase && inspireDatabase.includes('.') && warehouseId && !autoFetched && useCases.length === 0 && !loading) {
      setAutoFetched(true);
      fetchResults();
    }
  }, [inspireDatabase, warehouseId, autoFetched, useCases.length, loading, fetchResults]);

  // Derived data
  const domains = useMemo(() =>
    [...new Set(useCases.map(uc => uc['Business Domain']).filter(Boolean))].sort(),
    [useCases]
  );
  const qualities = useMemo(() =>
    [...new Set(useCases.map(uc => uc.Quality).filter(Boolean))],
    [useCases]
  );
  const types = useMemo(() =>
    [...new Set(useCases.map(uc => uc.type).filter(Boolean))].sort(),
    [useCases]
  );

  // Filtered & sorted use cases
  const filteredUseCases = useMemo(() => {
    let list = [...useCases];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(uc =>
        (uc.Name || '').toLowerCase().includes(q) ||
        (uc.Statement || '').toLowerCase().includes(q) ||
        (uc.Solution || '').toLowerCase().includes(q) ||
        (uc['Business Domain'] || '').toLowerCase().includes(q) ||
        (uc['Tables Involved'] || '').toLowerCase().includes(q)
      );
    }

    // Domain filter
    if (domainFilter) {
      list = list.filter(uc => uc['Business Domain'] === domainFilter);
    }

    // Quality filter
    if (qualityFilter) {
      list = list.filter(uc => uc.Quality === qualityFilter);
    }

    // Type filter
    if (typeFilter) {
      list = list.filter(uc => uc.type === typeFilter);
    }

    // Sort
    list.sort((a, b) => {
      let va, vb;
      if (sortBy === 'priority') {
        va = parseFloat(a.Priority) || 0;
        vb = parseFloat(b.Priority) || 0;
      } else if (sortBy === 'value') {
        va = parseFloat(a.Value) || 0;
        vb = parseFloat(b.Value) || 0;
      } else if (sortBy === 'feasibility') {
        va = parseFloat(a.Feasibility) || 0;
        vb = parseFloat(b.Feasibility) || 0;
      } else if (sortBy === 'name') {
        va = (a.Name || '').toLowerCase();
        vb = (b.Name || '').toLowerCase();
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      } else if (sortBy === 'domain') {
        va = (a['Business Domain'] || '').toLowerCase();
        vb = (b['Business Domain'] || '').toLowerCase();
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      } else {
        va = parseInt(a.No) || 0;
        vb = parseInt(b.No) || 0;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    return list;
  }, [useCases, searchQuery, domainFilter, qualityFilter, typeFilter, sortBy, sortDir]);

  const hasFilters = searchQuery || domainFilter || qualityFilter || typeFilter;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="text-center pt-2 pb-4">
        <div className="w-14 h-14 rounded-2xl bg-db-navy/60 border border-white/10 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-7 h-7 text-db-gold" />
        </div>
        <h1 className="text-xl font-bold text-white">Results Explorer</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
          Browse and explore the AI-generated use cases from your pipeline run.
        </p>
      </div>

      {/* Connection panel */}
      <div className="rounded-xl border border-white/5 bg-db-navy/20 p-4 space-y-4">
        <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-db-teal" />
          Data Source
        </h2>

        {/* Row 1: Catalog & Schema pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Catalog picker */}
          <div>
            <label className="text-[10px] text-slate-500 font-medium mb-1 block">Catalog</label>
            {catalogsLoading ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-500 rounded-lg bg-db-darkest/80 border border-white/10">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading catalogs...
              </div>
            ) : (
              <select
                value={selectedCatalog}
                onChange={e => { setSelectedCatalog(e.target.value); setSelectedSchema(''); }}
                className="w-full px-3 py-2.5 rounded-lg bg-db-darkest/80 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-db-red/40 focus:border-db-red/40 transition-all appearance-none"
              >
                <option value="">Select a catalog...</option>
                {catalogs.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} {c.comment ? `— ${c.comment}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Schema picker */}
          <div>
            <label className="text-[10px] text-slate-500 font-medium mb-1 block">Schema</label>
            {schemasLoading ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-500 rounded-lg bg-db-darkest/80 border border-white/10">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading schemas...
              </div>
            ) : (
              <select
                value={selectedSchema}
                onChange={e => setSelectedSchema(e.target.value)}
                disabled={!selectedCatalog}
                className="w-full px-3 py-2.5 rounded-lg bg-db-darkest/80 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-db-red/40 focus:border-db-red/40 transition-all appearance-none disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="">{selectedCatalog ? 'Select a schema...' : 'Pick a catalog first'}</option>
                {schemas.map(s => (
                  <option key={s.name} value={s.name}>
                    {s.name} {s.comment ? `— ${s.comment}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Resolved inspire_database display */}
        {inspireDatabase && inspireDatabase.includes('.') && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-db-darkest/60 border border-white/5">
            <Database className="w-3.5 h-3.5 text-db-teal" />
            <span className="text-xs text-slate-400">Inspire Database:</span>
            <span className="text-xs font-mono text-white font-medium">{inspireDatabase}</span>
          </div>
        )}

        {/* Or manual input */}
        <details className="group">
          <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-300 transition-colors flex items-center gap-1">
            <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
            Or type manually
          </summary>
          <div className="mt-2">
            <input
              type="text"
              value={inspireDatabase}
              onChange={e => {
                setInspireDatabase(e.target.value);
                const parts = e.target.value.split('.');
                if (parts.length >= 2) {
                  setSelectedCatalog(parts[0]);
                  setSelectedSchema(parts[1]);
                }
              }}
              placeholder="catalog.schema"
              className="w-full px-3 py-2 rounded-lg bg-db-darkest/80 border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-db-red/40 focus:border-db-red/40 transition-all font-mono"
            />
          </div>
        </details>

        {/* Row 2: Warehouse + Fetch */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Warehouse */}
          <div className="sm:col-span-2">
            <label className="text-[10px] text-slate-500 font-medium mb-1 block">SQL Warehouse</label>
            {warehouseLoading ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-500 rounded-lg bg-db-darkest/80 border border-white/10">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading warehouses...
              </div>
            ) : warehouses.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-amber-400 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <AlertTriangle className="w-3 h-3" /> No SQL warehouses found. Create one in your Databricks workspace.
              </div>
            ) : (
              <select
                value={warehouseId}
                onChange={e => setWarehouseId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-db-darkest/80 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-db-red/40 focus:border-db-red/40 transition-all appearance-none"
              >
                <option value="">Select warehouse...</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.state}){w.cluster_size ? ` · ${w.cluster_size}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Fetch button */}
          <div className="flex items-end">
            <button
              onClick={fetchResults}
              disabled={!inspireDatabase || !inspireDatabase.includes('.') || !warehouseId || loading}
              className="w-full px-4 py-2.5 rounded-lg font-semibold text-white text-sm bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-db-red/10 hover:shadow-db-red/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Querying...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Fetch Results
                </>
              )}
            </button>
          </div>
        </div>

        {/* Source table indicator */}
        {sourceTable && (
          <div className="flex items-center gap-2 text-[11px] text-db-teal">
            <CheckCircle2 className="w-3 h-3" />
            <span>Loaded <strong>{useCases.length}</strong> use cases from <span className="font-mono text-slate-400">{inspireDatabase}.{sourceTable}</span></span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium mb-0.5">Failed to load results</p>
              <p className="text-red-400/80">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Pipeline Summary */}
      {pipelineState && useCases.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-db-orange" />
            Pipeline Summary
          </h2>
          <StatsSummary useCases={useCases} />
        </div>
      )}

      {/* Filters & Search */}
      {useCases.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-db-navy/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              Filters
            </h2>
            {hasFilters && (
              <button
                onClick={() => { setSearchQuery(''); setDomainFilter(''); setQualityFilter(''); setTypeFilter(''); }}
                className="text-[10px] text-db-red-light hover:text-db-red flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search use cases by name, description, tables..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-db-darkest/80 border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-db-red/40 focus:border-db-red/40 transition-all"
            />
          </div>

          {/* Filter dropdowns */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select
              value={domainFilter}
              onChange={e => setDomainFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-db-darkest/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-db-red/40 transition-all appearance-none"
            >
              <option value="">All Domains</option>
              {domains.map(d => <option key={d} value={d}>{d}</option>)}
            </select>

            <select
              value={qualityFilter}
              onChange={e => setQualityFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-db-darkest/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-db-red/40 transition-all appearance-none"
            >
              <option value="">All Qualities</option>
              {qualities.map(q => <option key={q} value={q}>{q}</option>)}
            </select>

            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-db-darkest/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-db-red/40 transition-all appearance-none"
            >
              <option value="">All Types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <select
              value={`${sortBy}:${sortDir}`}
              onChange={e => {
                const [by, dir] = e.target.value.split(':');
                setSortBy(by);
                setSortDir(dir);
              }}
              className="px-3 py-2 rounded-lg bg-db-darkest/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-db-red/40 transition-all appearance-none"
            >
              <option value="priority:desc">Priority ↓</option>
              <option value="priority:asc">Priority ↑</option>
              <option value="value:desc">Value ↓</option>
              <option value="value:asc">Value ↑</option>
              <option value="feasibility:desc">Feasibility ↓</option>
              <option value="name:asc">Name A→Z</option>
              <option value="name:desc">Name Z→A</option>
              <option value="domain:asc">Domain A→Z</option>
              <option value="id:asc">ID ↑</option>
            </select>
          </div>

          <div className="text-[11px] text-slate-500">
            Showing {filteredUseCases.length} of {useCases.length} use cases
          </div>
        </div>
      )}

      {/* Use case list */}
      {useCases.length > 0 && (
        <div className="space-y-3">
          {filteredUseCases.map((uc, i) => (
            <UseCaseCard key={uc.No || i} uc={uc} index={i} />
          ))}
          {filteredUseCases.length === 0 && hasFilters && (
            <div className="text-center py-12">
              <Search className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No use cases match your filters.</p>
              <button
                onClick={() => { setSearchQuery(''); setDomainFilter(''); setQualityFilter(''); setTypeFilter(''); }}
                className="mt-2 text-db-red-light text-sm font-medium hover:text-db-red transition-colors"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty state — contextual guidance */}
      {!loading && useCases.length === 0 && !error && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-db-navy/40 border border-white/5 flex items-center justify-center mx-auto mb-4">
            <Database className="w-8 h-8 text-slate-600" />
          </div>
          {!selectedCatalog ? (
            <>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">Select a Catalog</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Choose the <strong className="text-slate-400">Catalog</strong> that contains your Inspire pipeline output from the dropdown above.
              </p>
            </>
          ) : !selectedSchema ? (
            <>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">Select a Schema</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Now select the <strong className="text-slate-400">Schema</strong> (e.g. <code className="text-slate-400 bg-white/5 px-1 rounded">_inspire</code>) where Inspire stored its results.
              </p>
            </>
          ) : !warehouseId ? (
            <>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">Select a SQL Warehouse</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Pick a <strong className="text-slate-400">SQL Warehouse</strong> to query the data. Make sure it is in a <em>RUNNING</em> state.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">Ready to fetch</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                Database <code className="text-slate-400 bg-white/5 px-1 rounded">{inspireDatabase}</code> selected. Click the button below to load your use cases.
              </p>
              <button
                onClick={() => { setAutoFetched(false); fetchResults(); }}
                className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange transition-all flex items-center gap-2 mx-auto shadow-lg shadow-db-red/20"
              >
                <Search className="w-4 h-4" />
                Fetch Results
              </button>
            </>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && useCases.length === 0 && (
        <div className="text-center py-16">
          <Loader2 className="w-10 h-10 text-db-red-light animate-spin mx-auto mb-4" />
          <h3 className="text-sm font-semibold text-slate-300 mb-1">Querying Databricks...</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Fetching use cases from <code className="text-slate-400 bg-white/5 px-1 rounded">{inspireDatabase}</code>. This may take a few seconds if the warehouse is starting up.
          </p>
        </div>
      )}
    </div>
  );
}
