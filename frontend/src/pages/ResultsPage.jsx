import { useState, useEffect } from 'react';
import {
  Database, Loader2, AlertCircle, Search, ChevronDown, ChevronUp,
  BarChart3, Target, Building2, FileText, Sparkles, RefreshCw,
  Calendar, Zap, Filter, ArrowDownUp, Eye, Cpu, Brain
} from 'lucide-react';
import DatabricksLogo from '../components/DatabricksLogo';

const PRIORITY_COLORS = {
  'Ultra High': 'bg-red-500/12 text-red-400 border-red-500/20',
  'Very High':  'bg-db-orange/12 text-db-orange border-db-orange/20',
  'High':       'bg-db-gold/12 text-db-gold border-db-gold/20',
  'Medium':     'bg-blue-400/12 text-blue-400 border-blue-400/20',
  'Low':        'bg-slate-500/12 text-slate-400 border-slate-500/20',
  'Very Low':   'bg-slate-600/12 text-slate-500 border-slate-600/20',
  'Ultra Low':  'bg-slate-700/12 text-slate-600 border-slate-700/20',
};

const TYPE_ICONS = {
  'Risk': '🛡️',
  'Opportunity': '💡',
  'Problem': '🔍',
  'Improvement': '📈',
};

export default function ResultsPage({ settings, update, apiFetch }) {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDomain, setFilterDomain] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const [expandedUseCase, setExpandedUseCase] = useState(null);
  const [inspireDb, setInspireDb] = useState(settings.inspireDatabase || '');
  const [warehouseId, setWarehouseId] = useState(settings.warehouseId || '');

  useEffect(() => {
    if (!inspireDb || !warehouseId) return;
    loadSessions();
  }, [inspireDb, warehouseId]);

  const loadSessions = async () => {
    try {
      const params = new URLSearchParams({ inspire_database: inspireDb, warehouse_id: warehouseId });
      const res = await apiFetch(`/api/inspire/sessions?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions || []);
      const completed = (data.sessions || []).find(s => s.completed_percent >= 100);
      if (completed) {
        setSelectedSessionId(completed.session_id);
        loadResults(completed.session_id);
      }
    } catch (err) { console.warn('Failed to load sessions:', err.message); }
  };

  const loadResults = async (sid) => {
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const params = new URLSearchParams({ inspire_database: inspireDb, warehouse_id: warehouseId });
      if (sid) params.set('session_id', sid);
      const res = await apiFetch(`/api/inspire/results?${params}`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      if (!data.results) { setError(data.message || 'No results found.'); return; }
      setResults(data.results);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // Extract use cases
  const allUseCases = [];
  if (results?.domains) {
    for (const domain of results.domains) {
      for (const uc of (domain.use_cases || []))
        allUseCases.push({ ...uc, _domain: domain.domain_name });
    }
  }

  // Filter & sort
  const filteredUseCases = allUseCases
    .filter(uc => {
      if (filterDomain !== 'all' && uc._domain !== filterDomain) return false;
      if (filterPriority !== 'all' && uc.Priority !== filterPriority) return false;
      if (filterType !== 'all' && uc.type !== filterType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (uc.Name || '').toLowerCase().includes(q) ||
               (uc.Statement || '').toLowerCase().includes(q) ||
               (uc.Solution || '').toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      const po = ['Ultra High', 'Very High', 'High', 'Medium', 'Low', 'Very Low', 'Ultra Low'];
      if (sortBy === 'priority') return (po.indexOf(a.Priority) ?? 99) - (po.indexOf(b.Priority) ?? 99);
      if (sortBy === 'domain') return (a._domain || '').localeCompare(b._domain || '');
      if (sortBy === 'name') return (a.Name || '').localeCompare(b.Name || '');
      return 0;
    });

  const domains = [...new Set(allUseCases.map(uc => uc._domain).filter(Boolean))];
  const priorities = [...new Set(allUseCases.map(uc => uc.Priority).filter(Boolean))];
  const types = [...new Set(allUseCases.map(uc => uc.type).filter(Boolean))];

  const resolveTable = (id) => {
    if (!results?.table_registry || !id) return id;
    return results.table_registry[id] || id;
  };

  return (
    <div className="min-h-screen bg-db-darkest relative">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-db-teal/3 rounded-full blur-[180px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-db-gold/3 rounded-full blur-[150px]" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,54,33,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,54,33,0.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Hero */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="h-px w-10 bg-gradient-to-r from-transparent to-db-teal/60" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-db-teal flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Results
            </span>
            <span className="h-px w-10 bg-gradient-to-l from-transparent to-db-teal/60" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">
            Use Case{' '}
            <span className="bg-gradient-to-r from-db-teal via-emerald-400 to-db-gold bg-clip-text text-transparent">
              Catalog
            </span>
          </h1>
          <p className="text-sm text-slate-400">Explore your AI-generated data strategy</p>
        </div>

        {/* ── Source picker ── */}
        {(!results && !loading) && (
          <div className="rounded-2xl border border-white/5 bg-db-navy/15 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-db-navy/30">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-db-teal to-emerald-600 flex items-center justify-center shadow-lg">
                <Database className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight">Data Source</h2>
                <p className="text-[11px] text-slate-500">Select your Inspire session to view results</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">Inspire Database</label>
                  <div className="relative group">
                    <Database className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-db-teal transition-colors" size={14} />
                    <input
                      type="text"
                      className="w-full bg-db-darkest/60 border border-white/8 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-db-teal/40 focus:ring-1 focus:ring-db-teal/20 transition-all"
                      placeholder="catalog._inspire"
                      value={inspireDb}
                      onChange={e => { setInspireDb(e.target.value); update('inspireDatabase', e.target.value); }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">Warehouse ID</label>
                  <div className="relative group">
                    <Cpu className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-db-teal transition-colors" size={14} />
                    <input
                      type="text"
                      className="w-full bg-db-darkest/60 border border-white/8 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-db-teal/40 focus:ring-1 focus:ring-db-teal/20 transition-all"
                      placeholder="SQL Warehouse ID"
                      value={warehouseId}
                      onChange={e => { setWarehouseId(e.target.value); update('warehouseId', e.target.value); }}
                    />
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={loadSessions}
                    disabled={!inspireDb || !warehouseId}
                    className="w-full py-2.5 bg-gradient-to-r from-db-teal to-emerald-500 hover:from-db-teal hover:to-emerald-400 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-db-teal/15 disabled:shadow-none"
                  >
                    <RefreshCw size={14} /> Load Sessions
                  </button>
                </div>
              </div>

              {/* Session picker */}
              {sessions.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">Sessions</label>
                  {sessions.map(s => {
                    const selected = selectedSessionId === s.session_id;
                    const isDone = s.completed_percent >= 100;
                    return (
                      <button
                        key={s.session_id}
                        onClick={() => { setSelectedSessionId(s.session_id); loadResults(s.session_id); }}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex items-center justify-between ${
                          selected
                            ? 'bg-db-teal/8 border-db-teal/25 shadow-sm'
                            : 'bg-db-darkest/40 border-white/5 hover:border-white/10 hover:bg-db-navy/20'
                        }`}
                      >
                        <div>
                          <span className="text-sm font-semibold text-white">
                            {s.widget_values?.business || 'Session'} — {s.session_id}
                          </span>
                          <div className="text-[10px] text-slate-500 flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1"><Calendar size={9} /> {s.create_at?.slice(0, 19) || 'Unknown'}</span>
                            <span>Progress: {Math.round(s.completed_percent)}%</span>
                          </div>
                        </div>
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold border ${
                          isDone
                            ? 'bg-db-teal/10 text-db-teal border-db-teal/20'
                            : 'bg-db-gold/10 text-db-gold border-db-gold/20'
                        }`}>
                          {isDone ? 'Complete' : `${Math.round(s.completed_percent)}%`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <DatabricksLogo className="w-12 h-12 opacity-30 animate-pulse" />
            <span className="text-sm text-slate-400">Loading results...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/5 p-4 rounded-xl border border-red-500/15">
            <AlertCircle size={14} /> <span>{error}</span>
          </div>
        )}

        {/* ── Results content ── */}
        {results && (
          <>
            {/* Executive summary */}
            <div className="rounded-2xl border border-white/5 bg-db-navy/15 backdrop-blur-sm overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-db-navy/30">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-db-gold to-amber-500 flex items-center justify-center shadow-lg">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-sm font-bold text-white">{results.title || 'Use Cases Catalog'}</h2>
              </div>
              <div className="p-6">
                {results.executive_summary && (
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{results.executive_summary}</p>
                )}
                {results.domains_summary && (
                  <p className="text-xs text-slate-500 mt-3 border-t border-white/5 pt-3">{results.domains_summary}</p>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={<Building2 size={18} />} label="Domains" value={results.domains?.length || 0} gradient="from-db-red to-db-orange" />
              <StatCard icon={<FileText size={18} />} label="Use Cases" value={allUseCases.length} gradient="from-db-orange to-db-gold" />
              <StatCard icon={<Target size={18} />} label="High Priority" value={allUseCases.filter(uc => ['Ultra High', 'Very High', 'High'].includes(uc.Priority)).length} gradient="from-db-gold to-db-teal" />
              <StatCard icon={<BarChart3 size={18} />} label="With SQL" value={allUseCases.filter(uc => uc.SQL && !uc.SQL.startsWith('--')).length} gradient="from-db-teal to-emerald-500" />
            </div>

            {/* Filters */}
            <div className="rounded-xl border border-white/5 bg-db-navy/10 backdrop-blur-sm p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-db-red-light transition-colors" size={13} />
                  <input
                    type="text"
                    className="w-full bg-db-darkest/60 border border-white/8 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-db-red/40 focus:ring-1 focus:ring-db-red/20 transition-all"
                    placeholder="Search use cases..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <FilterSelect value={filterDomain} onChange={setFilterDomain} options={domains} label="All Domains" />
                <FilterSelect value={filterPriority} onChange={setFilterPriority} options={priorities} label="All Priorities" />
                <FilterSelect value={filterType} onChange={setFilterType} options={types} label="All Types" />
                <FilterSelect value={sortBy} onChange={setSortBy} options={['priority', 'domain', 'name']} label="Sort by" isSort />
              </div>
              <p className="text-[10px] text-slate-600 mt-2">
                {filteredUseCases.length} of {allUseCases.length} use cases
              </p>
            </div>

            {/* Use case cards */}
            <div className="space-y-3">
              {filteredUseCases.map((uc, idx) => (
                <UseCaseCard
                  key={uc.No || idx}
                  uc={uc}
                  expanded={expandedUseCase === (uc.No || idx)}
                  onToggle={() => setExpandedUseCase(expandedUseCase === (uc.No || idx) ? null : (uc.No || idx))}
                  resolveTable={resolveTable}
                />
              ))}
            </div>

            {filteredUseCases.length === 0 && allUseCases.length > 0 && (
              <div className="text-center py-12">
                <Search size={40} className="mx-auto text-slate-700 mb-3" />
                <p className="text-sm text-slate-500">No use cases match your filters.</p>
              </div>
            )}

            {/* Back to source picker */}
            <div className="flex justify-center">
              <button
                onClick={() => setResults(null)}
                className="text-xs text-slate-500 hover:text-db-red-light flex items-center gap-1 transition-colors"
              >
                <RefreshCw size={11} /> Load Different Session
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Stat card ── */
function StatCard({ icon, label, value, gradient }) {
  return (
    <div className="rounded-xl border border-white/5 bg-db-navy/15 backdrop-blur-sm p-4 relative overflow-hidden group hover:border-white/10 transition-colors">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-[0.04] group-hover:opacity-[0.08] transition-opacity`} />
      <div className="relative z-10">
        <div className={`bg-gradient-to-br ${gradient} bg-clip-text text-transparent mb-2`}>{icon}</div>
        <div className="text-2xl font-black text-white">{value}</div>
        <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

/* ── Filter select ── */
function FilterSelect({ value, onChange, options, label, isSort }) {
  return (
    <select
      className="bg-db-darkest/60 border border-white/8 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-db-red/40 focus:ring-1 focus:ring-db-red/20 transition-all appearance-none cursor-pointer"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        paddingRight: '28px',
      }}
    >
      {isSort ? (
        options.map(o => <option key={o} value={o}>Sort: {o}</option>)
      ) : (
        <>
          <option value="all">{label}</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </>
      )}
    </select>
  );
}

/* ── Use case card ── */
function UseCaseCard({ uc, expanded, onToggle, resolveTable }) {
  const priorityClass = PRIORITY_COLORS[uc.Priority] || PRIORITY_COLORS['Medium'];
  const typeIcon = TYPE_ICONS[uc.type] || '📋';

  return (
    <div className="rounded-xl border border-white/5 bg-db-navy/10 backdrop-blur-sm overflow-hidden hover:border-white/10 transition-all duration-200 group">
      {/* Header */}
      <button onClick={onToggle} className="w-full text-left p-4 flex items-center gap-3">
        <span className="text-lg">{typeIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-white group-hover:text-db-red-light transition-colors">{uc.Name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${priorityClass}`}>{uc.Priority || 'Unscored'}</span>
            {uc.Quality && <span className="text-[10px] text-slate-600">Quality: {uc.Quality}</span>}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-3">
            <span>🏢 {uc._domain || uc['Business Domain'] || 'Unknown'}</span>
            {uc.Subdomain && <span>→ {uc.Subdomain}</span>}
            <span>🔬 {uc['Analytics Technique'] || uc.type}</span>
          </div>
        </div>
        <ChevronDown
          size={14}
          className={`text-slate-600 transition-transform duration-300 shrink-0 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-white/5 p-5 space-y-4 bg-db-darkest/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-[10px] font-bold text-db-red-light uppercase tracking-wider mb-1">Problem Statement</h4>
              <p className="text-sm text-slate-300 leading-relaxed">{uc.Statement || 'N/A'}</p>
            </div>
            <div>
              <h4 className="text-[10px] font-bold text-db-teal uppercase tracking-wider mb-1">Proposed Solution</h4>
              <p className="text-sm text-slate-300 leading-relaxed">{uc.Solution || 'N/A'}</p>
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-bold text-db-gold uppercase tracking-wider mb-1">Business Value</h4>
            <p className="text-sm text-slate-300 leading-relaxed">{uc['Business Value'] || 'N/A'}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            {[
              { label: 'Beneficiary', val: uc.Beneficiary },
              { label: 'Sponsor', val: uc.Sponsor },
              { label: 'Priority Alignment', val: uc['Business Priority Alignment'] },
              { label: 'Tables', val: (uc['Tables Involved'] || '').split(',').map(t => resolveTable(t.trim())).join(', '), mono: true },
            ].map(item => (
              <div key={item.label} className="bg-db-darkest/40 rounded-lg p-2.5 border border-white/3">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider font-bold block mb-0.5">{item.label}</span>
                <span className={`text-slate-300 ${item.mono ? 'font-mono text-[10px]' : ''}`}>{item.val || 'N/A'}</span>
              </div>
            ))}
          </div>

          {uc['Technical Design'] && (
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Technical Design</h4>
              <p className="text-[11px] text-slate-400 bg-db-darkest/60 p-3 rounded-lg border border-white/5 font-mono whitespace-pre-wrap leading-relaxed">
                {uc['Technical Design']}
              </p>
            </div>
          )}

          {uc.SQL && !uc.SQL.startsWith('--') && (
            <div>
              <h4 className="text-[10px] font-bold text-db-teal uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Cpu size={10} /> SQL Implementation
                {uc.result_table && <span className="text-slate-600 font-normal normal-case ml-1">→ {uc.result_table}</span>}
              </h4>
              <pre className="text-[11px] text-db-teal/70 bg-db-darkest/60 p-4 rounded-lg border border-db-teal/8 overflow-x-auto max-h-60 overflow-y-auto font-mono leading-relaxed">
                {uc.SQL}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
