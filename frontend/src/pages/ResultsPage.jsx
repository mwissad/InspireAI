import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronRight,
  FileText,
  BarChart3,
  Target,
  Code,
  Filter,
  Download,
  Database,
  Server,
  RefreshCw,
  Calendar,
  Building2,
  Layers,
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  FolderOpen,
} from 'lucide-react';

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

/* ── Type icons ── */
const TYPE_ICONS = {
  Risk: '🛡️',
  Opportunity: '💡',
  Problem: '🔍',
  Improvement: '📈',
};

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

export default function ResultsPage({ settings, update, sessionId: propSessionId }) {
  const { databricksHost, token, warehouseId: settingsWarehouseId, inspireDatabase: settingsInspireDb } = settings;

  // Local editable copies for the source-picker
  const [inspireDb, setInspireDb] = useState(settingsInspireDb || '');
  const [warehouseId, setWarehouseId] = useState(settingsWarehouseId || '');

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

  // Filters & sort
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDomain, setFilterDomain] = useState('all');
  const [filterSubdomain, setFilterSubdomain] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterTechnique, setFilterTechnique] = useState('all');
  const [filterAlignment, setFilterAlignment] = useState('all');
  const [filterGoalsAlignment, setFilterGoalsAlignment] = useState('all');
  const [filterQuality, setFilterQuality] = useState('all');
  const [sortBy, setSortBy] = useState('priority');

  // Subdomain expansion state
  const [expandedDomains, setExpandedDomains] = useState({});

  // Artifacts state — tree-based with expandable folders
  const [artifactTree, setArtifactTree] = useState({}); // { [path]: { files: [], loading, error } }
  const [artifactsRootFiles, setArtifactsRootFiles] = useState(null);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifactsExpanded, setArtifactsExpanded] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState({});

  // Only one card expanded at a time
  const [expandedUseCase, setExpandedUseCase] = useState(null);

  const apiFetch = useCallback(
    async (url) => {
      const headers = { Authorization: `Bearer ${token}`, 'X-DB-PAT-Token': token };
      if (databricksHost) headers['X-Databricks-Host'] = databricksHost;
      const resp = await fetch(url, { headers });
      if (!resp.ok) throw new Error(`${resp.status}`);
      return resp.json();
    },
    [token, databricksHost]
  );

  // ── Auto-load sessions on mount if settings exist ──
  useEffect(() => {
    if (!inspireDb || !warehouseId) return;
    handleLoadSessions(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    try {
      const q = new URLSearchParams({
        inspire_database: inspireDb,
        warehouse_id: warehouseId,
      });
      if (sid) q.set('session_id', sid);

      // Try final results_json first
      const data = await apiFetch(`/api/inspire/results?${q}`);
      if (data.results) {
        setResults(data.results);
        // Also try loading polished usecases from __inspire_usecases
        try {
          const ucData = await apiFetch(`/api/inspire/usecases?${q}`);
          if (ucData.usecases?.length > 0) {
            setUsecases(ucData.usecases);
          }
        } catch { /* silent */ }
        return;
      }

      // No final results — try progressive results from __inspire_step
      const stepData = await apiFetch(`/api/inspire/step-results?${q}`);
      if (stepData.results && stepData.results._use_case_count > 0) {
        setResults(stepData.results);
        setIsProgressive(true);
        // Also try loading polished usecases
        try {
          const ucData = await apiFetch(`/api/inspire/usecases?${q}`);
          if (ucData.usecases?.length > 0) {
            setUsecases(ucData.usecases);
          }
        } catch { /* silent */ }
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
    // Priority: use polished usecases from __inspire_usecases if available
    if (usecases && usecases.length > 0) {
      allUseCases = usecases.map((uc) => ({
        ...uc,
        _domain: uc['Business Domain'] || uc.domain || uc._domain || '',
        Name: uc.Name || uc.use_case_name || uc.name || '',
        Statement: uc.Statement || uc.description || uc.problem_statement || '',
        Solution: uc.Solution || uc.solution || '',
        Priority: uc.Priority || uc.priority || '',
        SQL: uc.SQL || uc.sql || uc.sql_query || '',
      }));
    } else if (Array.isArray(results?.domains)) {
      for (const domain of results.domains) {
        const ucs = Array.isArray(domain?.use_cases) ? domain.use_cases : [];
        for (const uc of ucs)
          allUseCases.push({ ...uc, _domain: domain.domain_name || '' });
      }
    } else if (Array.isArray(results?.use_cases)) {
      allUseCases.push(...results.use_cases);
    } else if (Array.isArray(results)) {
      allUseCases.push(...results);
    }
  } catch (err) {
    console.error('Error extracting use cases:', err);
    allUseCases = [];
  }

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
        if (filterAlignment !== 'all' && String(uc['Business Priority Alignment'] || '') !== filterAlignment) return false;
        if (filterGoalsAlignment !== 'all' && String(uc['Strategic Goals Alignment'] || '') !== filterGoalsAlignment) return false;
        if (filterQuality !== 'all' && String(uc.Quality || '') !== filterQuality) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            String(uc.Name || '').toLowerCase().includes(q) ||
            String(uc.Statement || '').toLowerCase().includes(q) ||
            String(uc.Solution || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'priority') {
          const ia = PRIORITY_ORDER.indexOf(a.Priority);
          const ib = PRIORITY_ORDER.indexOf(b.Priority);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        }
        if (sortBy === 'domain')
          return String(a._domain || '').localeCompare(String(b._domain || ''));
        if (sortBy === 'name')
          return String(a.Name || '').localeCompare(String(b.Name || ''));
        return 0;
      });
  } catch (err) {
    console.error('Error filtering/sorting use cases:', err);
    filteredUseCases = allUseCases;
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
  const alignments = [
    ...new Set(allUseCases.map((uc) => uc?.['Business Priority Alignment']).filter(Boolean)),
  ];
  const goalsAlignments = [
    ...new Set(allUseCases.map((uc) => uc?.['Strategic Goals Alignment']).filter(Boolean)),
  ];
  const qualities = [
    ...new Set(allUseCases.map((uc) => uc?.Quality).filter(Boolean)),
  ];

  // Compute subdomain counts by domain
  const subdomainsByDomain = {};
  for (const uc of allUseCases) {
    const d = uc?._domain || 'Unknown';
    const sd = String(uc?.Subdomain || '');
    if (!sd) continue;
    if (!subdomainsByDomain[d]) subdomainsByDomain[d] = {};
    subdomainsByDomain[d][sd] = (subdomainsByDomain[d][sd] || 0) + 1;
  }

  // ── Export to JSON ──
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(filteredUseCases, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inspire_results_session_${selectedSessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Compute domain counts for sidebar
  const domainCounts = {};
  for (const uc of allUseCases) {
    const d = uc?._domain || 'Unknown';
    domainCounts[d] = (domainCounts[d] || 0) + 1;
  }

  const hasActiveFilters = searchQuery || filterDomain !== 'all' || filterSubdomain !== 'all' || filterPriority !== 'all' || filterType !== 'all' || filterTechnique !== 'all' || filterAlignment !== 'all' || filterGoalsAlignment !== 'all' || filterQuality !== 'all';

  const clearAllFilters = () => {
    setSearchQuery(''); setFilterDomain('all'); setFilterSubdomain('all');
    setFilterPriority('all'); setFilterType('all'); setFilterTechnique('all');
    setFilterAlignment('all'); setFilterGoalsAlignment('all'); setFilterQuality('all');
  };

  // Load generation artifacts — tries multiple path variations
  const artifactHeaders = useCallback(() => {
    const h = { Authorization: `Bearer ${token}`, 'X-DB-PAT-Token': token };
    if (databricksHost) h['X-Databricks-Host'] = databricksHost;
    return h;
  }, [token, databricksHost]);

  const loadArtifacts = useCallback(async (genPath) => {
    if (!genPath || !token) return;
    setArtifactsLoading(true);
    setArtifactsRootFiles(null);
    const headers = artifactHeaders();

    // Build candidate paths: original, absolute workspace, Volumes
    const candidates = [genPath];
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
            setArtifactsRootFiles(data.files);
            setArtifactsLoading(false);
            return;
          }
        }
      } catch { /* try next */ }
    }
    setArtifactsRootFiles([]);
    setArtifactsLoading(false);
  }, [token, databricksHost, artifactHeaders]);

  const loadFolder = useCallback(async (folderPath) => {
    if (!folderPath || !token) return;
    setArtifactTree(prev => ({ ...prev, [folderPath]: { files: [], loading: true, error: null } }));
    const headers = artifactHeaders();
    try {
      const resp = await fetch(`/api/workspace/list?path=${encodeURIComponent(folderPath)}`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        setArtifactTree(prev => ({ ...prev, [folderPath]: { files: data.files || [], loading: false, error: null } }));
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

  // Find generation path from selected session
  const selectedSession = sessions.find(s => String(s.session_id) === String(selectedSessionId));
  const generationPath = selectedSession?.generation_path || selectedSession?.widget_values?.generation_path || '';

  const highPriorityCount = allUseCases.filter((uc) => ['Ultra High', 'Very High', 'High'].includes(String(uc?.Priority || ''))).length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-db-red to-db-red-hover flex items-center justify-center shadow-sm">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Results</h1>
            <p className="text-sm text-text-secondary">
              Explore your AI-generated data strategy.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          {filteredUseCases.length > 0 && (
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary border border-border rounded-lg hover:bg-bg-subtle hover:shadow-sm transition-smooth"
            >
              <Download size={14} />
              Export JSON
            </button>
          )}
        </div>
      </div>

      {/* ═══ Source Picker — shown when no results loaded ═══ */}
      {!results && !loading && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden mb-6">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-panel">
            <div className="w-7 h-7 rounded-full bg-db-red flex items-center justify-center">
              <Database size={14} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Data Source
              </h2>
              <p className="text-xs text-text-secondary">
                Select your Inspire session to view results
              </p>
            </div>
          </div>

          <div className="px-5 py-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Inspire Database */}
              <div>
                <label className="text-xs font-semibold text-text-primary block mb-1.5">
                  Inspire Database
                </label>
                <div className="relative">
                  <Database
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                  />
                  <input
                    type="text"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
                    placeholder="catalog._inspire"
                    value={inspireDb}
                    onChange={(e) => {
                      setInspireDb(e.target.value);
                      update?.('inspireDatabase', e.target.value);
                    }}
                  />
                </div>
              </div>

              {/* Warehouse ID */}
              <div>
                <label className="text-xs font-semibold text-text-primary block mb-1.5">
                  Warehouse ID
                </label>
                <div className="relative">
                  <Server
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                  />
                  <input
                    type="text"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
                    placeholder="SQL Warehouse ID"
                    value={warehouseId}
                    onChange={(e) => {
                      setWarehouseId(e.target.value);
                      update?.('warehouseId', e.target.value);
                    }}
                  />
                </div>
              </div>

              {/* Load button */}
              <div className="flex items-end">
                <button
                  onClick={() => handleLoadSessions(false)}
                  disabled={!inspireDb || !warehouseId || sessionsLoading}
                  className="w-full py-2 bg-db-red text-white text-sm font-semibold rounded-md hover:bg-db-red-hover disabled:opacity-50 disabled:cursor-not-allowed transition-smooth flex items-center justify-center gap-2"
                >
                  {sessionsLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  {sessionsLoading ? 'Loading...' : 'Load Sessions'}
                </button>
              </div>
            </div>

            {/* Sessions error */}
            {sessionsError && (
              <div className="flex items-center gap-2 p-3 bg-error-bg border border-error/20 rounded-lg">
                <AlertCircle size={14} className="text-error shrink-0" />
                <span className="text-sm text-error">{sessionsError}</span>
              </div>
            )}

            {/* No sessions found */}
            {sessionsLoaded && sessions.length === 0 && !sessionsError && (
              <div className="p-4 bg-bg rounded-lg border border-border text-center">
                <FileText size={18} className="text-text-tertiary mx-auto mb-2" />
                <p className="text-sm text-text-secondary">No sessions found.</p>
                <p className="text-xs text-text-tertiary mt-1">
                  Run the pipeline first to generate results.
                </p>
              </div>
            )}

            {/* Session list (button-style) */}
            {sessions.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider block">
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
                          {s.widget_values?.['00_business_name'] ||
                            s.widget_values?.business ||
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
                        className={`text-[10px] px-2.5 py-1 rounded-full font-semibold border ${
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
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <Loader2
            size={20}
            className="animate-spin text-text-tertiary mx-auto mb-3"
          />
          <p className="text-sm text-text-secondary">Loading results...</p>
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
        <>
          {/* Progressive results banner */}
          {isProgressive && (
            <div className="flex items-center gap-3 p-3 bg-warning-bg border border-warning/20 rounded-lg mb-6">
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

          {/* Executive summary */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden mb-6 shadow-sm">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-gradient-to-r from-db-red-50 to-surface">
              <div className="w-7 h-7 rounded-lg bg-db-red flex items-center justify-center">
                <Target size={14} className="text-white" />
              </div>
              <h2 className="text-sm font-bold text-text-primary">
                {typeof results.title === 'string' ? results.title.replace(/<[^>]*>/g, '') : 'Use Cases Catalog'}
              </h2>
            </div>
            <div className="px-5 py-4">
              {typeof results.executive_summary === 'string' && results.executive_summary && (
                <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                  {results.executive_summary.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim()}
                </p>
              )}
              {typeof results.domains_summary === 'string' && results.domains_summary && (
                <p className="text-xs text-text-tertiary mt-3 border-t border-border pt-3">
                  {results.domains_summary.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim()}
                </p>
              )}
            </div>
          </div>

          {/* ═══ Execution Summary Banner ═══ */}
          {!isProgressive && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden mb-6 shadow-sm">
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center">
                      <CheckCircle2 size={14} className="text-success" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-text-primary">Execution Complete</h3>
                      <p className="text-[10px] text-text-tertiary">
                        {typeof results.title === 'string' ? results.title.replace(/<[^>]*>/g, '') : 'Pipeline finished successfully'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-text-primary">{allUseCases.length}</div>
                      <div className="text-[9px] text-text-tertiary uppercase tracking-wider font-semibold">Use Cases</div>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div className="text-center">
                      <div className="text-lg font-bold text-text-primary">{domains.length}</div>
                      <div className="text-[9px] text-text-tertiary uppercase tracking-wider font-semibold">Domains</div>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div className="text-center">
                      <div className="text-lg font-bold text-db-red">{highPriorityCount}</div>
                      <div className="text-[9px] text-text-tertiary uppercase tracking-wider font-semibold">High Priority</div>
                    </div>
                  </div>
                </div>
                {/* Pipeline stages row */}
                <div className="flex items-center gap-1 pt-3 border-t border-border overflow-x-auto">
                  {PIPELINE_STAGES.map((stage, i) => (
                    <div key={stage} className="flex items-center shrink-0">
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-success-bg">
                        <CheckCircle2 size={11} className="text-success shrink-0" />
                        <span className="text-[10px] font-medium text-success whitespace-nowrap">{stage}</span>
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
                        {!isDir && (
                          <button
                            type="button"
                            className="text-[10px] text-db-red hover:underline font-medium flex items-center gap-0.5 shrink-0"
                            onClick={(e) => { e.stopPropagation(); downloadFile(f.path, f.name); }}
                          >
                            <Download size={10} /> Download
                          </button>
                        )}
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
                              <button type="button" onClick={(e) => { e.stopPropagation(); loadFolder(f.path); }} className="ml-2 text-[10px] text-db-red hover:underline">Retry</button>
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
              <div className="bg-surface border border-border rounded-xl overflow-hidden mb-6 shadow-sm">
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
                    <FolderOpen size={14} className="text-info" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xs font-bold text-text-primary">Generated Artifacts</h3>
                    <p className="text-[10px] text-text-tertiary font-mono">{generationPath}</p>
                  </div>
                  {artifactsRootFiles && artifactsRootFiles.length > 0 && (
                    <span className="text-[10px] text-info font-semibold bg-info-bg px-2 py-0.5 rounded-full">
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
                        <p className="text-[10px] text-text-tertiary mt-1">
                          The generation path <span className="font-mono">{generationPath}</span> may be relative to the notebook workspace.
                        </p>
                        <button
                          type="button"
                          onClick={() => loadArtifacts(generationPath)}
                          className="mt-2 text-[10px] text-db-red hover:underline font-medium"
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

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatCard label="Domains" value={results.domains?.length || domains.length} icon={Building2} />
            <StatCard label="Use Cases" value={allUseCases.length} icon={FileText} />
            <StatCard
              label="High Priority"
              value={highPriorityCount}
              icon={Target}
            />
            <StatCard
              label="With SQL"
              value={allUseCases.filter((uc) => uc.SQL && typeof uc.SQL === 'string' && !uc.SQL.startsWith('--')).length}
              icon={Code}
            />
          </div>

          {/* ═══ Two-Column: Domain Sidebar + Use Cases ═══ */}
          <div className="flex gap-4">
            {/* ── Left Sidebar: Domains ── */}
            <div className="w-56 shrink-0">
              <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden sticky top-6">
                {/* Sidebar header */}
                <div className="px-4 py-3 border-b border-border bg-gradient-to-b from-db-red-50 to-surface">
                  <div className="flex items-center gap-2">
                    <Layers size={14} className="text-db-red" />
                    <span className="text-xs font-bold text-text-primary">Domains</span>
                  </div>
                  <p className="text-[10px] text-text-tertiary mt-0.5">
                    {domains.length} domain{domains.length !== 1 ? 's' : ''} &middot; {allUseCases.length} use cases
                  </p>
                </div>

                {/* Domain list */}
                <div className="p-1.5 space-y-0.5 max-h-[65vh] overflow-y-auto">
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
                      <Layers size={10} className={filterDomain === 'all' ? 'text-db-red' : 'text-text-tertiary'} />
                    </div>
                    <span className={`text-[11px] font-semibold flex-1 ${
                      filterDomain === 'all' ? 'text-db-red' : 'text-text-primary'
                    }`}>
                      All Domains
                    </span>
                    <span className={`text-[10px] font-mono ${filterDomain === 'all' ? 'text-db-red' : 'text-text-tertiary'}`}>
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
                              <Building2 size={10} className={active ? 'text-db-red' : 'text-text-tertiary'} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className={`text-[11px] font-semibold block truncate ${
                                active ? 'text-db-red' : 'text-text-primary'
                              }`}>
                                {d}
                              </span>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] text-text-tertiary font-mono">{count} use case{count !== 1 ? 's' : ''}</span>
                                {highPriCount > 0 && (
                                  <span className="text-[9px] text-db-red font-medium">{highPriCount} high pri</span>
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
                                      ? 'bg-db-red-50/70 text-db-red'
                                      : 'text-text-secondary hover:bg-bg-subtle'
                                  }`}
                                >
                                  <span className={`text-[10px] font-medium truncate flex-1 ${sdActive ? 'text-db-red' : ''}`}>{sd}</span>
                                  <span className={`text-[9px] font-mono ${sdActive ? 'text-db-red' : 'text-text-tertiary'}`}>{sdCount}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Right Panel: Filters + Use Case Cards ── */}
            <div className="flex-1 min-w-0">
              {/* Filter toolbar */}
              <div className="bg-surface border border-border rounded-xl mb-4 shadow-sm overflow-hidden">
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
                                ? 'border-db-red/30 bg-db-red-50 text-db-red'
                                : 'border-transparent text-text-secondary hover:bg-bg-subtle'
                            }`}
                          >
                            {p.replace('Ultra ', 'U-').replace('Very ', 'V-')}
                            <span className={`font-mono ${active ? 'text-db-red' : 'text-text-tertiary'}`}>{cnt}</span>
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
                        <option key={t} value={t}>{TYPE_ICONS[t] || ''} {t}</option>
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

                  {/* Alignment filter */}
                  {alignments.length > 0 && (
                    <select
                      value={filterAlignment}
                      onChange={(e) => setFilterAlignment(e.target.value)}
                      className="px-2 py-1.5 text-[11px] border border-border rounded-lg bg-bg text-text-primary focus:outline-none focus:border-db-red/30 transition-smooth"
                    >
                      <option value="all">All Alignments</option>
                      {alignments.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  )}

                  {/* Goals Alignment filter */}
                  {goalsAlignments.length > 0 && (
                    <select
                      value={filterGoalsAlignment}
                      onChange={(e) => setFilterGoalsAlignment(e.target.value)}
                      className="px-2 py-1.5 text-[11px] border border-border rounded-lg bg-bg text-text-primary focus:outline-none focus:border-db-red/30 transition-smooth"
                    >
                      <option value="all">All Goals</option>
                      {goalsAlignments.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  )}

                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-2 py-1.5 text-[11px] border border-border rounded-lg bg-bg text-text-primary focus:outline-none focus:border-db-red/30 transition-smooth"
                  >
                    <option value="priority">Sort: Priority</option>
                    <option value="domain">Sort: Domain</option>
                    <option value="name">Sort: Name</option>
                  </select>

                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="text-[11px] text-db-red hover:underline font-medium shrink-0"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Active filter chips */}
                {hasActiveFilters && (
                  <div className="px-4 py-2 bg-db-red-50/50 border-t border-border flex items-center gap-2 flex-wrap">
                    <Filter size={12} className="text-db-red shrink-0" />
                    <span className="text-[11px] text-text-secondary">
                      <span className="font-semibold text-text-primary">{filteredUseCases.length}</span> of{' '}
                      <span className="font-semibold text-text-primary">{allUseCases.length}</span> use cases
                    </span>
                    {filterDomain !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        {filterDomain}
                        <button onClick={() => { setFilterDomain('all'); setFilterSubdomain('all'); }} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {filterSubdomain !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        Sub: {filterSubdomain}
                        <button onClick={() => setFilterSubdomain('all')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {filterPriority !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        {filterPriority}
                        <button onClick={() => setFilterPriority('all')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {filterType !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        {filterType}
                        <button onClick={() => setFilterType('all')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {filterTechnique !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        {filterTechnique}
                        <button onClick={() => setFilterTechnique('all')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {filterQuality !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        Q: {filterQuality}
                        <button onClick={() => setFilterQuality('all')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {filterAlignment !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        {filterAlignment}
                        <button onClick={() => setFilterAlignment('all')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {filterGoalsAlignment !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        {filterGoalsAlignment}
                        <button onClick={() => setFilterGoalsAlignment('all')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                    {searchQuery && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                        "{searchQuery}"
                        <button onClick={() => setSearchQuery('')} className="hover:text-db-red-hover">&times;</button>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Use case cards */}
              {filteredUseCases.length > 0 ? (
                <div className="space-y-3">
                  {filteredUseCases.map((uc, idx) => (
                    <UseCaseCard
                      key={uc.No || idx}
                      uc={uc}
                      index={idx}
                      expanded={expandedUseCase === (uc.No || idx)}
                      onToggle={() =>
                        setExpandedUseCase(expandedUseCase === (uc.No || idx) ? null : uc.No || idx)
                      }
                      resolveTable={resolveTable}
                    />
                  ))}
                </div>
              ) : allUseCases.length > 0 ? (
                <div className="bg-surface border border-border rounded-xl p-10 text-center shadow-sm">
                  <Search size={20} className="text-text-tertiary mx-auto mb-3" />
                  <p className="text-sm text-text-secondary">No use cases match your filters.</p>
                  <button
                    onClick={clearAllFilters}
                    className="text-xs text-db-red hover:underline mt-2 font-medium"
                  >
                    Clear all filters
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}

    </div>
  );
}

/* ── Stat Card ── */
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
function UseCaseCard({ uc, index, expanded, onToggle, resolveTable }) {
  if (!uc || typeof uc !== 'object') return null;

  const s = (v) => (v == null ? '' : String(v));      // safe-string helper
  const stripHtml = (v) => (v == null ? '' : String(v).replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim());

  const title =
    s(uc.Name) || s(uc.use_case_name) || s(uc.name) || s(uc.title) || `Use Case ${index + 1}`;
  const statement = stripHtml(uc.Statement || uc.description || uc.problem_statement);
  const domain = s(uc._domain || uc['Business Domain'] || uc.domain);
  const subdomain = s(uc.Subdomain);
  const ucType = s(uc.type);
  const technique = s(uc['Analytics Technique']);
  const priority = s(uc.Priority || uc.priority);
  const quality = s(uc.Quality);
  const solution = stripHtml(uc.Solution || uc.solution);
  const businessValue = stripHtml(uc['Business Value'] || uc.business_impact);
  const beneficiary = s(uc.Beneficiary);
  const sponsor = s(uc.Sponsor);
  const alignment = s(uc['Business Priority Alignment']);
  const rawSql = uc.SQL || uc.sql || uc.sql_query || '';
  const sql = typeof rawSql === 'string' ? rawSql : String(rawSql);
  const resultTable = s(uc.result_table);
  const technicalDesign = stripHtml(uc['Technical Design']);
  const tablesInvolved = s(uc['Tables Involved']);
  const typeIcon = TYPE_ICONS[ucType] || '📋';

  const priorityLower = priority.toLowerCase();
  const priorityStyle =
    priorityLower.includes('ultra high') || priorityLower.includes('very high')
      ? 'text-db-red bg-db-red-50 border-db-red/20'
      : priorityLower.includes('high')
        ? 'text-error bg-error-bg border-error/20'
        : priorityLower.includes('medium')
          ? 'text-warning bg-warning-bg border-warning/20'
          : 'text-text-secondary bg-bg border-border';

  const qualityLower = quality.toLowerCase();
  const qualityStyle =
    qualityLower.includes('ultra high') || qualityLower.includes('very high')
      ? 'text-success bg-success-bg'
      : qualityLower.includes('high')
        ? 'text-success bg-success-bg'
        : qualityLower.includes('medium')
          ? 'text-warning bg-warning-bg'
          : 'text-text-secondary bg-bg';

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden hover:border-border-strong transition-smooth">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-bg-subtle transition-smooth"
      >
        <span className="text-lg shrink-0">{typeIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">
              {title}
            </span>
            {priority && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${priorityStyle}`}
              >
                {priority}
              </span>
            )}
            {quality && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${qualityStyle}`}
              >
                Q: {quality}
              </span>
            )}
          </div>
          <div className="text-[10px] text-text-tertiary mt-1 flex items-center gap-3">
            <span>🏢 {domain || 'Unknown'}</span>
            {subdomain && <span>&rarr; {subdomain}</span>}
            <span>🔬 {technique || ucType || '—'}</span>
          </div>
        </div>
        <ChevronDown
          size={14}
          className={`text-text-tertiary transition-transform duration-300 shrink-0 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-border px-5 py-5 bg-panel space-y-4">
          {/* Statement & Solution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-[10px] font-bold text-db-red uppercase tracking-wider mb-1">
                Problem Statement
              </h4>
              <p className="text-sm text-text-secondary leading-relaxed">
                {statement || 'N/A'}
              </p>
            </div>
            <div>
              <h4 className="text-[10px] font-bold text-success uppercase tracking-wider mb-1">
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
              <h4 className="text-[10px] font-bold text-warning uppercase tracking-wider mb-1">
                Business Value
              </h4>
              <p className="text-sm text-text-secondary leading-relaxed">
                {businessValue}
              </p>
            </div>
          )}

          {/* Detail chips */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            {[
              { label: 'Beneficiary', val: beneficiary },
              { label: 'Sponsor', val: sponsor },
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
                className="bg-bg rounded-lg p-2.5 border border-border"
              >
                <span className="text-[9px] text-text-tertiary uppercase tracking-wider font-bold block mb-0.5">
                  {item.label}
                </span>
                <span
                  className={`text-text-secondary ${
                    item.mono ? 'font-mono text-[10px]' : ''
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
                <h4 className="text-[10px] font-bold text-info uppercase tracking-wider flex items-center gap-1.5">
                  <Code size={10} /> SQL Implementation
                  {resultTable && (
                    <span className="text-text-tertiary font-normal normal-case ml-1">
                      &rarr; {resultTable}
                    </span>
                  )}
                </h4>
                <CopyButton text={sql} />
              </div>
              <div className="relative rounded-lg border border-border overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-info/30 rounded-l-lg" />
                <pre className="text-[11px] text-text-primary bg-bg p-4 pl-5 overflow-x-auto max-h-60 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
                  {sql}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
