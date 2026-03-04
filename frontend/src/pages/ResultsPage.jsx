import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronUp,
  FileText,
  BarChart3,
  Target,
  Code,
  Filter,
  Download,
  Clock,
} from 'lucide-react';

export default function ResultsPage({ settings, sessionId: propSessionId }) {
  const { token, warehouseId, inspireDatabase } = settings;

  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(propSessionId || '');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterDomain, setFilterDomain] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  const apiFetch = useCallback(
    async (url) => {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(`${resp.status}`);
      return resp.json();
    },
    [token]
  );

  // Load sessions
  useEffect(() => {
    if (!warehouseId || !inspireDatabase) return;
    const q = new URLSearchParams({
      inspire_database: inspireDatabase,
      warehouse_id: warehouseId,
    });
    apiFetch(`/api/inspire/sessions?${q}`)
      .then((d) => {
        setSessions(d.sessions || []);
        if (!selectedSession && d.sessions?.length > 0) {
          setSelectedSession(d.sessions[0].session_id);
        }
      })
      .catch(() => {});
  }, [warehouseId, inspireDatabase, apiFetch, selectedSession]);

  // Load results for selected session
  useEffect(() => {
    if (!selectedSession || !warehouseId || !inspireDatabase) return;
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({
      inspire_database: inspireDatabase,
      warehouse_id: warehouseId,
      session_id: selectedSession,
    });
    apiFetch(`/api/inspire/results?${q}`)
      .then((d) => {
        if (d.results) {
          setResults(d.results);
        } else {
          setResults(null);
          setError(d.message || 'No results found for this session.');
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedSession, warehouseId, inspireDatabase, apiFetch]);

  // Extract use cases
  const useCases = results?.use_cases || results || [];
  const ucList = Array.isArray(useCases) ? useCases : [];

  // Compute domains and priorities
  const domains = [...new Set(ucList.map((uc) => uc.domain || uc.category || '').filter(Boolean))];
  const priorities = [...new Set(ucList.map((uc) => uc.priority || '').filter(Boolean))];

  // Filter use cases
  const filtered = ucList.filter((uc) => {
    const matchSearch =
      !search ||
      JSON.stringify(uc).toLowerCase().includes(search.toLowerCase());
    const matchDomain =
      !filterDomain || (uc.domain || uc.category || '') === filterDomain;
    const matchPriority =
      !filterPriority || uc.priority === filterPriority;
    return matchSearch && matchDomain && matchPriority;
  });

  // Export to JSON
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inspire_results_session_${selectedSession}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Results</h1>
          <p className="text-sm text-text-secondary mt-1">
            Review generated use cases and recommendations.
          </p>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary border border-border rounded-md hover:bg-bg-subtle transition-smooth"
          >
            <Download size={14} />
            Export JSON
          </button>
        )}
      </div>

      {/* Session picker */}
      {sessions.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-4 mb-6">
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
            Session
          </label>
          <div className="flex items-center gap-3">
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary glow-focus transition-smooth"
            >
              {sessions.map((s) => (
                <option key={s.session_id} value={s.session_id}>
                  Session {s.session_id}
                  {s.completed_on ? ` (completed)` : ` (${s.processing_status})`}
                </option>
              ))}
            </select>
            {sessions.find((s) => s.session_id === selectedSession)?.widget_values
              ?.['00_business_name'] && (
              <span className="text-sm text-text-secondary">
                {sessions.find((s) => s.session_id === selectedSession).widget_values['00_business_name']}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {ucList.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Use Cases" value={ucList.length} icon={FileText} />
          <StatCard
            label="Domains"
            value={domains.length}
            icon={Target}
          />
          <StatCard
            label="High Priority"
            value={ucList.filter((uc) => uc.priority === 'High' || uc.priority === 'high').length}
            icon={BarChart3}
          />
          <StatCard
            label="With SQL"
            value={ucList.filter((uc) => uc.sql || uc.sql_query).length}
            icon={Code}
          />
        </div>
      )}

      {/* Filters */}
      {ucList.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search use cases..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
              />
            </div>

            {/* Domain filter */}
            {domains.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Filter size={12} className="text-text-tertiary" />
                <select
                  value={filterDomain}
                  onChange={(e) => setFilterDomain(e.target.value)}
                  className="px-2.5 py-2 text-sm border border-border rounded-md bg-surface text-text-primary transition-smooth"
                >
                  <option value="">All domains</option>
                  {domains.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Priority filter */}
            {priorities.length > 0 && (
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="px-2.5 py-2 text-sm border border-border rounded-md bg-surface text-text-primary transition-smooth"
              >
                <option value="">All priorities</option>
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}

            {/* Result count */}
            <span className="text-xs text-text-tertiary ml-auto">
              {filtered.length} of {ucList.length} use cases
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <Loader2 size={20} className="animate-spin text-text-tertiary mx-auto mb-3" />
          <p className="text-sm text-text-secondary">Loading results...</p>
        </div>
      ) : error ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <AlertCircle size={20} className="text-text-tertiary mx-auto mb-3" />
          <p className="text-sm text-text-secondary">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <FileText size={24} className="text-text-tertiary mx-auto mb-3" />
          <p className="text-sm font-medium text-text-primary mb-1">No results yet</p>
          <p className="text-xs text-text-secondary">
            {ucList.length > 0
              ? 'No use cases match your current filters.'
              : 'Run the pipeline to generate use cases.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((uc, idx) => (
            <UseCaseCard key={idx} uc={uc} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-text-tertiary" />
        <span className="text-xs text-text-secondary">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text-primary">{value}</div>
    </div>
  );
}

function UseCaseCard({ uc, index }) {
  const [expanded, setExpanded] = useState(false);

  const title = uc.use_case_name || uc.name || uc.title || `Use Case ${index + 1}`;
  const description = uc.description || uc.problem_statement || '';
  const domain = uc.domain || uc.category || '';
  const priority = uc.priority || '';
  const score = uc.score || uc.business_value_score || '';
  const sql = uc.sql || uc.sql_query || '';
  const solution = uc.solution || uc.proposed_solution || '';
  const impact = uc.business_impact || uc.value || '';

  const priorityStyle =
    priority?.toLowerCase() === 'high'
      ? 'text-db-red bg-db-red-50'
      : priority?.toLowerCase() === 'medium'
        ? 'text-warning bg-warning-bg'
        : 'text-text-secondary bg-bg';

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden hover:border-border-strong transition-smooth">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-bg-subtle transition-smooth"
      >
        <span className="text-xs font-mono text-text-tertiary w-6 shrink-0">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text-primary truncate">
            {title}
          </div>
          {description && (
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">
              {description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {domain && (
            <span className="text-xs text-text-secondary bg-bg px-2 py-0.5 rounded-full">
              {domain}
            </span>
          )}
          {priority && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priorityStyle}`}>
              {priority}
            </span>
          )}
          {score && (
            <span className="text-xs font-mono text-text-tertiary">{score}</span>
          )}
          {expanded ? (
            <ChevronUp size={16} className="text-text-tertiary" />
          ) : (
            <ChevronDown size={16} className="text-text-tertiary" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 bg-panel">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Description */}
            {description && (
              <DetailSection title="Problem Statement" icon={AlertCircle}>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {description}
                </p>
              </DetailSection>
            )}

            {/* Solution */}
            {solution && (
              <DetailSection title="Proposed Solution" icon={Target}>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {solution}
                </p>
              </DetailSection>
            )}

            {/* Impact */}
            {impact && (
              <DetailSection title="Business Impact" icon={BarChart3}>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {impact}
                </p>
              </DetailSection>
            )}

            {/* Metadata */}
            <DetailSection title="Details" icon={Clock}>
              <div className="space-y-1 text-xs text-text-secondary">
                {Object.entries(uc)
                  .filter(
                    ([k]) =>
                      !['sql', 'sql_query', 'description', 'problem_statement',
                        'solution', 'proposed_solution', 'business_impact',
                        'value', 'use_case_name', 'name', 'title'].includes(k) &&
                      uc[k] !== null &&
                      uc[k] !== ''
                  )
                  .slice(0, 8)
                  .map(([k, v]) => (
                    <div key={k} className="flex">
                      <span className="font-medium text-text-primary w-32 shrink-0 truncate">
                        {k.replace(/_/g, ' ')}
                      </span>
                      <span className="truncate">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))}
              </div>
            </DetailSection>
          </div>

          {/* SQL */}
          {sql && (
            <div className="mt-4">
              <DetailSection title="SQL Implementation" icon={Code}>
                <pre className="p-3 bg-bg border border-border rounded-md overflow-x-auto text-xs font-mono text-text-primary whitespace-pre-wrap">
                  {sql}
                </pre>
              </DetailSection>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailSection({ title, icon: Icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={12} className="text-text-tertiary" />
        <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          {title}
        </h4>
      </div>
      {children}
    </div>
  );
}
