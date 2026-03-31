import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  ExternalLink,
  XCircle,
  ArrowRight,
  Play,
  Search,
  Filter,
  ChevronDown,
  Activity,
  Eye,
  EyeOff,
  Layers,
  Building2,
  Sparkles,
} from 'lucide-react';
import ResultsPage from './ResultsPage';

// Run lifecycle phases
const PHASE_PENDING = 'PENDING';
const PHASE_RUNNING = 'RUNNING';
const PHASE_TERMINATED = 'TERMINATED';

// Filter presets
const STATUS_FILTERS = [
  { key: 'all', label: 'All', color: 'text-text-secondary' },
  { key: 'running', label: 'In Progress', color: 'text-info' },
  { key: 'success', label: 'Success', color: 'text-success' },
  { key: 'warning', label: 'Warning', color: 'text-warning' },
  { key: 'error', label: 'Error', color: 'text-error' },
];

export default function MonitorPage({ settings, update, sessionId, runId, onComplete }) {
  const { databricksHost, token, warehouseId, inspireDatabase } = settings;

  // Run-level state
  const [runInfo, setRunInfo] = useState(null);
  const [runPhase, setRunPhase] = useState(PHASE_PENDING);

  // Session/step state
  const [session, setSession] = useState(null);
  const [steps, setSteps] = useState([]);
  const [polling, setPolling] = useState(true);
  const lastPollRef = useRef(null);
  const trackedSessionRef = useRef(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [collapsedStages, setCollapsedStages] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const stepsEndRef = useRef(null);

  // Results inline display state
  const [showInlineResults, setShowInlineResults] = useState(false);

  // Live use case preview (extracted from steps during the run)
  const [liveUseCases, setLiveUseCases] = useState([]);

  const apiFetch = useCallback(
    async (url, opts = {}) => {
      const headers = {
        Authorization: `Bearer ${token}`,
        'X-DB-PAT-Token': token,
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

  // Main polling loop
  useEffect(() => {
    if (!polling) return;

    const poll = async () => {
      let currentRunInfo = runInfo;
      if (runId) {
        try {
          const ri = await apiFetch(`/api/run/${runId}`);
          setRunInfo(ri);
          currentRunInfo = ri;
          const lcs = ri.life_cycle_state || '';
          if (lcs === 'PENDING' || lcs === 'QUEUED' || lcs === 'BLOCKED') {
            setRunPhase(PHASE_PENDING);
          } else if (lcs === 'RUNNING' || lcs === 'TERMINATING') {
            setRunPhase(PHASE_RUNNING);
          } else {
            setRunPhase(PHASE_TERMINATED);
          }
          if (lcs === 'INTERNAL_ERROR' || lcs === 'SKIPPED') { setPolling(false); return; }
          if (lcs === 'TERMINATED' && ri.result_state === 'FAILED') { setPolling(false); return; }
        } catch { /* keep polling */ }
      }

      if (warehouseId && inspireDatabase) {
        try {
          const sessQ = new URLSearchParams({ inspire_database: inspireDatabase, warehouse_id: warehouseId });
          if (sessionId) sessQ.set('session_id', String(sessionId));
          const sessData = await apiFetch(`/api/inspire/session?${sessQ}`);
          if (sessData.session) {
            const sess = sessData.session;
            const sid = sess.session_id;
            if (trackedSessionRef.current && trackedSessionRef.current !== String(sid)) {
              setSteps([]);
              lastPollRef.current = null;
            }
            trackedSessionRef.current = String(sid);
            setSession(sess);

            try {
              const stepQ = new URLSearchParams({
                inspire_database: inspireDatabase,
                warehouse_id: warehouseId,
                session_id: String(sid),
                ...(lastPollRef.current ? { since: lastPollRef.current } : {}),
              });
              const stepData = await apiFetch(`/api/inspire/steps?${stepQ}`);
              if (stepData.steps?.length > 0) {
                setSteps((prev) => {
                  const map = new Map(prev.map((s) => [s.step_id, s]));
                  for (const s of stepData.steps) map.set(s.step_id, s);
                  return Array.from(map.values()).sort((a, b) => (a.last_updated || '').localeCompare(b.last_updated || ''));
                });
                lastPollRef.current = stepData.steps[stepData.steps.length - 1].last_updated;
              }
            } catch { /* steps table might not exist */ }

            if (sess.processing_status === 'ready') {
              try {
                await apiFetch('/api/inspire/ack', {
                  method: 'POST',
                  body: JSON.stringify({ inspire_database: inspireDatabase, warehouse_id: warehouseId, session_id: sid }),
                });
              } catch { /* silent */ }
            }

            const runDone = !runId || currentRunInfo?.life_cycle_state === 'TERMINATED' || currentRunInfo?.life_cycle_state === 'INTERNAL_ERROR';
            const sessionDone = sess.completed_on || sess.completed_percent >= 100;
            const sessionFinal = sess.processing_status === 'done' || sess.processing_status === 'ready';
            if (runDone && sessionDone && (!sessionOnly || sessionFinal)) setPolling(false);
          }
        } catch { /* session table might not exist */ }
      } else if (!runId) {
        setPolling(false);
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [polling, warehouseId, inspireDatabase, sessionId, runId, apiFetch]); // eslint-disable-line

  // Auto-scroll to bottom when new steps arrive
  useEffect(() => {
    if (autoScroll && stepsEndRef.current) {
      stepsEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [steps, autoScroll]);

  // ── Derived display state ──
  // When no runId, derive state purely from session data
  const sessionOnly = !runId;
  const isStaleSession = !sessionOnly && session?.completed_on && runPhase !== PHASE_TERMINATED;
  const percent = isStaleSession ? 0 : (session?.completed_percent || 0);
  const isFailed = runInfo?.result_state === 'FAILED' || runInfo?.life_cycle_state === 'INTERNAL_ERROR';
  const isComplete = sessionOnly
    ? (session && (session.completed_on || percent >= 100) && session.processing_status !== 'running')
    : (!isFailed && !isStaleSession && runPhase === PHASE_TERMINATED && runInfo?.result_state === 'SUCCESS' && (session?.completed_on || percent >= 100));
  const isPending = sessionOnly ? (!session) : (runPhase === PHASE_PENDING);
  const isRunning = sessionOnly
    ? (session && !isComplete && session.processing_status !== 'done')
    : (runPhase === PHASE_RUNNING && !isComplete && !isFailed);

  let statusLabel = 'Initializing';
  let statusDetail = '';
  if (isPending) { statusLabel = 'Starting'; statusDetail = 'Provisioning compute resources...'; }
  else if (isRunning) { statusLabel = 'Running'; statusDetail = isStaleSession || !session ? 'Notebook is initializing...' : `${Math.round(percent)}% complete`; }
  else if (isComplete) { statusLabel = 'Completed'; statusDetail = 'Pipeline finished successfully.'; }
  else if (isFailed) { statusLabel = 'Failed'; statusDetail = runInfo?.state_message || 'Pipeline execution failed.'; }
  else if (runPhase === PHASE_TERMINATED && runInfo?.result_state === 'SUCCESS' && !session?.completed_on) { statusLabel = 'Finalizing'; statusDetail = 'Run completed, waiting for results...'; }

  const elapsed = runInfo?.execution_duration ? formatDuration(runInfo.execution_duration) : null;

  // Auto-show inline results when pipeline completes
  useEffect(() => {
    if (isComplete) setShowInlineResults(true);
  }, [isComplete]);

  // Extract live use case preview from steps as they arrive
  useEffect(() => {
    const ucs = [];

    // Validate that an item is a real use case object (not a string or LLM feedback)
    const isValidUseCase = (uc) => {
      if (!uc || typeof uc !== 'object' || Array.isArray(uc)) return false;
      const name = uc.Name || uc.name || '';
      // Must have a non-empty name that looks like a use case title (not markdown/feedback)
      if (!name || typeof name !== 'string') return false;
      if (name.length < 5 || name.length > 200) return false;
      // Reject markdown fragments, bullet points, feedback text
      if (name.startsWith('**') || name.startsWith('-') || name.startsWith('#') || name.startsWith('*')) return false;
      if (name.includes('Pass 1') || name.includes('DUPLICATE') || name.includes('coverage')) return false;
      return true;
    };

    for (const step of steps) {
      const rj = step.result_json;
      if (!rj || typeof rj !== 'object') continue;
      // Use case generation steps
      if (Array.isArray(rj.use_cases)) {
        for (const uc of rj.use_cases) {
          if (!isValidUseCase(uc)) continue;
          ucs.push({
            name: uc.Name || uc.name || '',
            domain: uc['Business Domain'] || uc.domain || '',
            priority: uc.Priority || uc.priority || '',
            id: uc.No || uc.id || '',
          });
        }
      }
      // Scoring steps
      if (Array.isArray(rj.scored_use_cases)) {
        for (const sc of rj.scored_use_cases) {
          if (!isValidUseCase(sc)) continue;
          ucs.push({
            name: sc.Name || sc.name || '',
            domain: sc['Business Domain'] || sc.domain || '',
            priority: sc.Priority || sc.priority || '',
            quality: sc.Quality || sc.quality || '',
            id: sc.No || sc.id || '',
          });
        }
      }
    }
    // Deduplicate by name
    const seen = new Set();
    const deduped = [];
    for (const uc of ucs) {
      const key = uc.name || uc.id;
      if (key && !seen.has(key)) {
        seen.add(key);
        deduped.push(uc);
      }
    }
    setLiveUseCases(deduped);
  }, [steps]);

  // Group steps by stage, applying filters
  const { stages, stageNames, filteredCount, totalCount, statusCounts } = useMemo(() => {
    const stageMap = {};
    const counts = { all: 0, running: 0, success: 0, warning: 0, error: 0 };
    let filtered = 0;

    const visibleSteps = isStaleSession ? [] : steps;

    for (const step of visibleSteps) {
      const stage = step.stage_name || 'Pipeline';
      if (!stageMap[stage]) stageMap[stage] = [];

      const cat = getStatusCategory(step.status);
      counts.all++;
      counts[cat]++;

      // Apply filters
      const matchesStatus = statusFilter === 'all' || cat === statusFilter;
      const matchesStage = stageFilter === 'all' || stage === stageFilter;
      const matchesSearch = !searchQuery ||
        (step.step_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (step.sub_step_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (step.message || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        stage.toLowerCase().includes(searchQuery.toLowerCase());

      if (matchesStatus && matchesStage && matchesSearch) {
        stageMap[stage].push(step);
        filtered++;
      }
    }

    // Remove empty stages after filtering
    const nonEmptyStages = {};
    const names = [];
    for (const [name, stageSteps] of Object.entries(stageMap)) {
      if (stageSteps.length > 0) {
        nonEmptyStages[name] = stageSteps;
        names.push(name);
      } else if (stageFilter === 'all' && statusFilter === 'all' && !searchQuery) {
        // Keep empty stages only when no filters are active (to show all stage headers)
      }
    }

    // Also collect all unique stage names for the filter dropdown
    const allStageNames = [...new Set(visibleSteps.map((s) => s.stage_name || 'Pipeline'))];

    return {
      stages: nonEmptyStages,
      stageNames: allStageNames,
      filteredCount: filtered,
      totalCount: counts.all,
      statusCounts: counts,
    };
  }, [steps, isStaleSession, statusFilter, stageFilter, searchQuery]);

  const hasActiveFilters = statusFilter !== 'all' || stageFilter !== 'all' || searchQuery;

  const toggleStage = (name) => {
    setCollapsedStages((prev) => ({ ...prev, [name]: prev[name] === false ? true : false }));
  };

  // Latest activity — most recent step by timestamp
  const latestStep = useMemo(() => {
    if (steps.length === 0) return null;
    return steps.reduce((a, b) => ((a.last_updated || '') > (b.last_updated || '') ? a : b));
  }, [steps]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* ═══ Page Header ═══ */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-db-red to-db-red-hover flex items-center justify-center shadow-sm">
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Pipeline Monitor</h1>
            <p className="text-sm text-text-secondary">
              Real-time tracking of the Inspire AI pipeline.
            </p>
          </div>
        </div>
        {runInfo?.run_page_url && (
          <a
            href={runInfo.run_page_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm text-text-secondary border border-border rounded-lg hover:bg-bg-subtle hover:shadow-sm transition-smooth"
          >
            View in Databricks
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
      </div>

      {/* ═══ Status Card ═══ */}
      <div className={`border rounded-xl p-5 mb-6 shadow-sm ${
        isComplete ? 'bg-success-bg border-success/20' :
        isFailed ? 'bg-error-bg border-error/20' :
        'bg-surface border-border'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <StatusIcon isPending={isPending} isRunning={isRunning} isComplete={isComplete} isFailed={isFailed} />
            <div>
              <span className={`text-base font-bold ${
                isComplete ? 'text-success' : isFailed ? 'text-error' : 'text-text-primary'
              }`}>
                {statusLabel}
              </span>
              {statusDetail && (
                <p className={`text-xs mt-0.5 ${
                  isComplete ? 'text-success' : isFailed ? 'text-error' : 'text-text-secondary'
                }`}>
                  {statusDetail}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            {elapsed && (
              <div className="flex items-center gap-1.5 text-text-tertiary">
                <Clock size={12} />
                <span className="font-mono">{elapsed}</span>
              </div>
            )}
            {runInfo?.life_cycle_state && (
              <span className={`font-mono px-2.5 py-1 rounded-lg font-medium text-[11px] ${
                isComplete ? 'bg-success-bg text-success' :
                isFailed ? 'bg-error-bg text-error' :
                isPending ? 'bg-info-bg text-info' :
                'bg-db-red-50 text-db-red'
              }`}>
                {isComplete ? 'SUCCESS' : runInfo.life_cycle_state}
                {!isComplete && runInfo.result_state ? ` / ${runInfo.result_state}` : ''}
              </span>
            )}
            {isRunning && (
              <span className="font-mono text-lg font-bold text-db-red">
                {Math.round(percent)}%
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2.5 bg-bg-subtle rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isComplete ? 'bg-success' :
              isFailed ? 'bg-error' :
              isPending ? 'bg-text-tertiary animate-pulse' :
              isStaleSession ? 'bg-db-red/40 animate-pulse' :
              'bg-db-red progress-glow'
            }`}
            style={{
              width: isComplete ? '100%' : isPending ? '3%' : isStaleSession ? '15%' : `${Math.max(Math.min(percent, 100), 1)}%`,
            }}
          />
        </div>

        {/* Latest activity line */}
        {latestStep && isRunning && (
          <div className="mt-3 flex items-center gap-2">
            <Activity size={11} className="text-db-red shrink-0 animate-pulse" />
            <p className="text-[11px] text-text-secondary font-mono truncate">
              <span className="text-text-tertiary">{latestStep.stage_name}</span>
              {' → '}
              <span className="text-text-primary font-medium">{latestStep.step_name}</span>
              {latestStep.sub_step_name && (
                <span className="text-text-tertiary">: {latestStep.sub_step_name}</span>
              )}
            </p>
          </div>
        )}
        {runInfo?.run_name && !latestStep && (
          <p className="text-[11px] text-text-tertiary mt-3 font-mono">{runInfo.run_name}</p>
        )}
      </div>

      {/* Pending info */}
      {isPending && (
        <div className="bg-info-bg border border-info/20 rounded-xl p-5 mb-6 flex items-start gap-3">
          <Clock size={16} className="text-info mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-text-primary">Job is queued</p>
            <p className="text-xs text-text-secondary mt-1">
              The Databricks cluster is being provisioned. This may take 1-3 minutes for serverless, or longer for standard clusters.
            </p>
          </div>
        </div>
      )}

      {/* ═══ Detailed Steps (Collapsible Advanced) ═══ */}
      {totalCount > 0 ? (
        <section className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm mb-6">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-bg-subtle/50 transition-smooth"
          >
            <div className="w-8 h-8 rounded-lg bg-bg-subtle flex items-center justify-center">
              <Layers size={16} className="text-text-secondary" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-text-primary">Detailed Steps</h2>
              <p className="text-xs text-text-secondary">
                {stageNames.length} stage{stageNames.length !== 1 ? 's' : ''} &middot; {totalCount} step{totalCount !== 1 ? 's' : ''}
                {statusCounts.running > 0 && <> &middot; <span className="text-info font-medium">{statusCounts.running} in progress</span></>}
                {statusCounts.error > 0 && <> &middot; <span className="text-error font-medium">{statusCounts.error} error{statusCounts.error > 1 ? 's' : ''}</span></>}
              </p>
            </div>
            <div className={`transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`}>
              <ChevronDown size={18} className="text-text-tertiary" />
            </div>
          </button>

          {showFilters && (
            <div className="border-t border-border px-5 py-4">
        <div className="flex gap-4">
          {/* ── Left Sidebar: Stages ── */}
          <div className="w-56 shrink-0">
            <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden sticky top-6">
              {/* Sidebar header */}
              <div className="px-4 py-3 border-b border-border bg-gradient-to-b from-db-red-50 to-surface">
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-db-red" />
                  <span className="text-xs font-bold text-text-primary">Stages</span>
                </div>
                <p className="text-[10px] text-text-tertiary mt-0.5">
                  {stageNames.length} stage{stageNames.length !== 1 ? 's' : ''} &middot; {totalCount} steps
                </p>
              </div>

              {/* Stage list */}
              <div className="p-1.5 space-y-0.5 max-h-[60vh] overflow-y-auto">
                {/* All stages option */}
                <button
                  onClick={() => setStageFilter('all')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-smooth ${
                    stageFilter === 'all'
                      ? 'bg-db-red-50 border border-db-red/20'
                      : 'hover:bg-bg-subtle border border-transparent'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    stageFilter === 'all' ? 'bg-db-red/10' : 'bg-bg-subtle'
                  }`}>
                    <Layers size={10} className={stageFilter === 'all' ? 'text-db-red' : 'text-text-tertiary'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-[11px] font-semibold block ${
                      stageFilter === 'all' ? 'text-db-red' : 'text-text-primary'
                    }`}>
                      All Stages
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono ${stageFilter === 'all' ? 'text-db-red' : 'text-text-tertiary'}`}>
                    {totalCount}
                  </span>
                </button>

                {/* Individual stages */}
                {stageNames.map((name) => {
                  const allStageSteps = isStaleSession ? [] : steps.filter((s) => (s.stage_name || 'Pipeline') === name);
                  const done = allStageSteps.filter((s) => isStepDone(s.status)).length;
                  const errors = allStageSteps.filter((s) => getStatusCategory(s.status) === 'error').length;
                  const running = allStageSteps.filter((s) => getStatusCategory(s.status) === 'running').length;
                  const active = stageFilter === name;
                  const total = allStageSteps.length;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                  return (
                    <button
                      key={name}
                      onClick={() => setStageFilter(active ? 'all' : name)}
                      className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-smooth ${
                        active
                          ? 'bg-db-red-50 border border-db-red/20'
                          : 'hover:bg-bg-subtle border border-transparent'
                      }`}
                    >
                      {/* Status indicator */}
                      {errors > 0 ? (
                        <div className="w-5 h-5 rounded-full bg-error-bg flex items-center justify-center shrink-0 mt-0.5">
                          <XCircle size={10} className="text-error" />
                        </div>
                      ) : running > 0 ? (
                        <div className="w-5 h-5 rounded-full bg-info-bg flex items-center justify-center shrink-0 mt-0.5">
                          <Loader2 size={10} className="animate-spin text-info" />
                        </div>
                      ) : done === total && total > 0 ? (
                        <div className="w-5 h-5 rounded-full bg-success-bg flex items-center justify-center shrink-0 mt-0.5">
                          <CheckCircle2 size={10} className="text-success" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-bg-subtle flex items-center justify-center shrink-0 mt-0.5">
                          <Clock size={10} className="text-text-tertiary" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <span className={`text-[11px] font-semibold block truncate ${
                          active ? 'text-db-red' : 'text-text-primary'
                        }`}>
                          {name}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1 bg-bg rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                errors > 0 ? 'bg-error' : done === total && total > 0 ? 'bg-success' : 'bg-db-red'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-text-tertiary shrink-0">{done}/{total}</span>
                        </div>
                        {errors > 0 && (
                          <span className="text-[10px] text-error font-medium mt-0.5 block">
                            {errors} error{errors > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Right: Search/Filters + Steps Timeline ── */}
          <div className="flex-1 min-w-0">
            {/* Filter toolbar */}
            <div className="bg-surface border border-border rounded-xl mb-4 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Search */}
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text"
                    placeholder="Search steps, messages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-border rounded-lg bg-bg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-db-red/30 focus:ring-1 focus:ring-db-red/20 transition-smooth"
                  />
                </div>

                {/* Status pills */}
                <div className="flex items-center gap-1">
                  {STATUS_FILTERS.map((f) => {
                    const count = statusCounts[f.key] || 0;
                    const active = statusFilter === f.key;
                    if (f.key !== 'all' && count === 0) return null;
                    return (
                      <button
                        key={f.key}
                        onClick={() => setStatusFilter(active ? 'all' : f.key)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-smooth border ${
                          active
                            ? 'border-db-red/30 bg-db-red-50 text-db-red'
                            : 'border-transparent text-text-secondary hover:bg-bg-subtle'
                        }`}
                      >
                        {f.label}
                        <span className={`text-[10px] font-mono ${active ? 'text-db-red' : 'text-text-tertiary'}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Auto-scroll */}
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`p-1.5 rounded-lg transition-smooth border ${
                    autoScroll ? 'border-db-red/20 bg-db-red-50 text-db-red' : 'border-transparent text-text-tertiary hover:bg-bg-subtle'
                  }`}
                  aria-label={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
                >
                  {autoScroll ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>

                {hasActiveFilters && (
                  <button
                    onClick={() => { setSearchQuery(''); setStatusFilter('all'); setStageFilter('all'); }}
                    className="text-[11px] text-db-red hover:underline font-medium shrink-0"
                    aria-label="Clear all filters"
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
                    <span className="font-semibold text-text-primary">{filteredCount}</span> of{' '}
                    <span className="font-semibold text-text-primary">{totalCount}</span> steps
                  </span>
                  {statusFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                      {STATUS_FILTERS.find((f) => f.key === statusFilter)?.label}
                      <button onClick={() => setStatusFilter('all')} aria-label="Remove status filter" className="hover:text-db-red-hover">&times;</button>
                    </span>
                  )}
                  {stageFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                      {stageFilter}
                      <button onClick={() => setStageFilter('all')} aria-label="Remove stage filter" className="hover:text-db-red-hover">&times;</button>
                    </span>
                  )}
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-db-red-50 text-db-red text-[10px] font-medium border border-db-red/20">
                      "{searchQuery}"
                      <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="hover:text-db-red-hover">&times;</button>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Steps list */}
            {Object.keys(stages).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(stages).map(([stageName, stageSteps]) => {
                  const collapsed = collapsedStages[stageName] !== false;
                  const doneCount = stageSteps.filter((s) => isStepDone(s.status)).length;
                  const errorCount = stageSteps.filter((s) => getStatusCategory(s.status) === 'error').length;
                  const runningCount = stageSteps.filter((s) => getStatusCategory(s.status) === 'running').length;

                  return (
                    <div key={stageName} className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
                      <button
                        onClick={() => toggleStage(stageName)}
                        className="w-full px-4 py-3 border-b border-border bg-panel flex items-center gap-3 hover:bg-bg-subtle transition-smooth text-left"
                      >
                        <div className={`transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}>
                          <ChevronDown size={14} className="text-text-tertiary" />
                        </div>
                        {errorCount > 0 ? (
                          <div className="w-5 h-5 rounded-full bg-error-bg flex items-center justify-center"><XCircle size={11} className="text-error" /></div>
                        ) : runningCount > 0 ? (
                          <div className="w-5 h-5 rounded-full bg-info-bg flex items-center justify-center"><Loader2 size={11} className="animate-spin text-info" /></div>
                        ) : doneCount === stageSteps.length ? (
                          <div className="w-5 h-5 rounded-full bg-success-bg flex items-center justify-center"><CheckCircle2 size={11} className="text-success" /></div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-bg-subtle flex items-center justify-center"><Clock size={11} className="text-text-tertiary" /></div>
                        )}
                        <h3 className="text-xs font-bold text-text-primary flex-1">{stageName}</h3>
                        <div className="flex items-center gap-2">
                          {errorCount > 0 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-error-bg text-error">
                              {errorCount} error{errorCount > 1 ? 's' : ''}
                            </span>
                          )}
                          <span className="text-[11px] text-text-tertiary font-mono">{doneCount}/{stageSteps.length}</span>
                          <div className="w-16 h-1.5 bg-bg rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                errorCount > 0 ? 'bg-error' : doneCount === stageSteps.length ? 'bg-success' : 'bg-db-red'
                              }`}
                              style={{ width: `${stageSteps.length > 0 ? (doneCount / stageSteps.length) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      </button>
                      {!collapsed && (
                        <div className="divide-y divide-border-subtle">
                          {stageSteps.map((step) => (
                            <StepRow key={step.step_id} step={step} searchQuery={searchQuery} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={stepsEndRef} />
              </div>
            ) : (
              <div className="bg-surface border border-border rounded-xl p-8 text-center shadow-sm">
                <Search size={20} className="text-text-tertiary mx-auto mb-3" />
                <p className="text-sm text-text-secondary">No steps match your filters</p>
                <button
                  onClick={() => { setSearchQuery(''); setStatusFilter('all'); setStageFilter('all'); }}
                  className="text-xs text-db-red hover:underline mt-2 font-medium"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
          )}
        </section>
      ) : isRunning || isPending ? (
        <div className="bg-surface border border-border rounded-xl p-10 text-center shadow-sm">
          <Loader2 size={24} className="animate-spin text-db-red mx-auto mb-3" />
          <p className="text-sm font-medium text-text-primary">
            {isPending ? 'Waiting for cluster to start...' : 'Waiting for pipeline steps...'}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            Steps will appear here as the notebook executes.
          </p>
        </div>
      ) : null}

      {/* ═══ Live Use Case Preview (during run) ═══ */}
      {!isComplete && liveUseCases.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm mb-6">
          <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-db-red-50 to-surface flex items-center gap-2">
            <Sparkles size={14} className="text-db-red" />
            <span className="text-xs font-bold text-text-primary">Use Cases Discovered</span>
            <span className="text-[10px] text-text-tertiary ml-auto">
              {liveUseCases.length} use case{liveUseCases.length !== 1 ? 's' : ''} so far
              {isRunning && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-db-red animate-pulse" />}
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {liveUseCases.slice(0, 20).map((uc, i) => {
              const priorityLower = (uc.priority || '').toLowerCase();
              const priBadge = priorityLower.includes('ultra') || priorityLower.includes('very high')
                ? 'text-db-red bg-db-red-50'
                : priorityLower.includes('high')
                  ? 'text-error bg-error-bg'
                  : priorityLower.includes('medium')
                    ? 'text-warning bg-warning-bg'
                    : 'text-text-secondary bg-bg';
              return (
                <div key={uc.id || i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-[10px] font-mono text-text-tertiary w-5 shrink-0">
                    {uc.id || `#${i + 1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">{uc.name}</p>
                    {uc.domain && (
                      <p className="text-[10px] text-text-tertiary flex items-center gap-1 mt-0.5">
                        <Building2 size={8} /> {uc.domain}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {uc.quality && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-bg-subtle text-text-secondary">
                        Q: {uc.quality}
                      </span>
                    )}
                    {uc.priority && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${priBadge}`}>
                        {uc.priority}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {liveUseCases.length > 20 && (
            <div className="px-4 py-2 bg-bg border-t border-border text-center">
              <span className="text-[10px] text-text-tertiary font-medium">
                +{liveUseCases.length - 20} more use cases
              </span>
            </div>
          )}
        </div>
      )}

      {/* ═══ Failed State ═══ */}
      {isFailed && (
        <div className="mt-6 bg-error-bg border border-error/20 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <XCircle size={18} className="text-error mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-text-primary">Pipeline failed</p>
              {runInfo?.state_message && (
                <p className="text-xs text-text-secondary mt-1 font-mono whitespace-pre-wrap bg-error-bg/50 rounded-lg p-3 mt-2 border border-error/10">
                  {runInfo.state_message}
                </p>
              )}
              {runInfo?.run_page_url && (
                <a
                  href={runInfo.run_page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-db-red mt-3 hover:underline font-medium"
                >
                  View full error in Databricks <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Complete Action ═══ */}
      {isComplete && (
        <div className="mt-6 space-y-4">
          <div className="bg-success-bg border border-success/20 rounded-xl p-5 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                <CheckCircle2 size={22} className="text-success" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">Pipeline completed successfully</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Results are ready for review.
                  {elapsed && ` Total execution time: ${elapsed}.`}
                  {totalCount > 0 && ` ${totalCount} steps processed.`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowInlineResults(!showInlineResults)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl transition-smooth border ${
                  showInlineResults
                    ? 'border-db-red/20 bg-db-red-50 text-db-red'
                    : 'border-border bg-surface text-text-secondary hover:bg-bg-subtle'
                }`}
              >
                {showInlineResults ? <EyeOff size={14} /> : <Eye size={14} />}
                {showInlineResults ? 'Hide Results' : 'Show Results'}
              </button>
              <button
                onClick={onComplete}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-db-red to-db-red-hover text-white text-sm font-bold rounded-xl hover:shadow-md transition-smooth"
              >
                Open Results Page
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Inline Results — full ResultsPage embedded */}
          {showInlineResults && (
            <div className="border border-border rounded-xl overflow-hidden shadow-sm bg-surface">
              <div className="px-4 py-3 border-b border-border bg-panel flex items-center gap-2">
                <Sparkles size={14} className="text-db-red" />
                <span className="text-xs font-bold text-text-primary">Results — Session {sessionId}</span>
              </div>
              <ResultsPage settings={settings} update={update} sessionId={sessionId} embedded />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Sub-components
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function StatusIcon({ isPending, isRunning, isComplete, isFailed }) {
  const base = 'w-10 h-10 rounded-xl flex items-center justify-center';
  if (isComplete) return <div className={`${base} bg-success/10`}><CheckCircle2 size={22} className="text-success" /></div>;
  if (isFailed) return <div className={`${base} bg-error/10`}><XCircle size={22} className="text-error" /></div>;
  if (isPending) return <div className={`${base} bg-info/10`}><Clock size={22} className="text-info" /></div>;
  if (isRunning) return <div className={`${base} bg-db-red/10`}><Loader2 size={22} className="animate-spin text-db-red" /></div>;
  return <div className={`${base} bg-bg-subtle`}><Play size={22} className="text-text-tertiary" /></div>;
}

function getStatusCategory(status) {
  switch (status) {
    case 'ended_success': case 'completed': return 'success';
    case 'started': case 'running': return 'running';
    case 'ended_warning': return 'warning';
    case 'ended_error': case 'failed': case 'error': return 'error';
    default: return 'running';
  }
}

function getStepStyle(status) {
  switch (status) {
    case 'ended_success': case 'completed':
      return { icon: <CheckCircle2 size={14} className="text-success" />, badge: 'bg-success-bg text-success', label: 'Success' };
    case 'started': case 'running':
      return { icon: <Loader2 size={14} className="animate-spin text-info" />, badge: 'bg-info-bg text-info', label: 'In Progress' };
    case 'ended_warning':
      return { icon: <AlertCircle size={14} className="text-warning" />, badge: 'bg-warning-bg text-warning', label: 'Warning' };
    case 'ended_error': case 'failed': case 'error':
      return { icon: <XCircle size={14} className="text-error" />, badge: 'bg-error-bg text-error', label: 'Error' };
    default:
      return { icon: <Clock size={14} className="text-text-tertiary" />, badge: 'bg-bg text-text-tertiary', label: status || 'Pending' };
  }
}

function isStepDone(status) {
  return status === 'ended_success' || status === 'ended_warning' || status === 'completed';
}

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-db-red-100 text-db-red rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function StepRow({ step, searchQuery }) {
  const style = getStepStyle(step.status);
  const [expanded, setExpanded] = useState(false);
  const hasDetails = step.message || step.sub_step_name || (step.result_json && Object.keys(step.result_json).length > 0);

  return (
    <div className="hover:bg-bg-subtle/50 transition-smooth">
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {style.icon}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary font-medium truncate">
            {highlightMatch(step.step_name || step.sub_step_name || 'Step', searchQuery)}
          </div>
          {step.message && !expanded && (
            <p className="text-[11px] text-text-tertiary mt-0.5 truncate">
              {highlightMatch(step.message, searchQuery)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {step.progress_increment > 0 && (
            <span className="text-[11px] font-mono text-text-tertiary bg-bg-subtle px-1.5 py-0.5 rounded">
              +{step.progress_increment}%
            </span>
          )}
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${style.badge}`}>
            {style.label}
          </span>
          {hasDetails && (
            <ChevronDown size={12} className={`text-text-tertiary transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <div className="px-4 pb-3 pl-11 space-y-1.5">
          {step.sub_step_name && (
            <p className="text-xs text-text-secondary">
              <span className="text-text-tertiary">Sub-step:</span> {step.sub_step_name}
            </p>
          )}
          {step.message && (
            <p className="text-xs text-text-secondary bg-bg-subtle rounded-lg p-2.5 font-mono leading-relaxed">
              {step.message}
            </p>
          )}
          {step.result_json && Object.keys(step.result_json).length > 0 && (
            <ResultJsonDisplay resultJson={step.result_json} />
          )}
        </div>
      )}
    </div>
  );
}

function ResultJsonDisplay({ resultJson }) {
  if (!resultJson || typeof resultJson !== 'object') return null;
  const rj = resultJson;
  const prompt = rj.prompt_name || '';

  // Error display
  if (rj.error) {
    return (
      <div className="text-xs bg-error-bg/50 rounded-lg p-2.5 border border-error/10">
        <span className="text-error font-semibold">Error:</span>{' '}
        <span className="text-text-secondary">{rj.error}</span>
      </div>
    );
  }

  // Use Case Generation
  if (prompt.endsWith('_USE_CASE_GEN_PROMPT') && Array.isArray(rj.use_cases)) {
    return (
      <div className="text-xs space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded bg-success-bg text-success font-semibold text-[10px]">
            {rj.use_cases_count || rj.use_cases.length} use cases
          </span>
          {rj.is_truncated && <span className="px-1.5 py-0.5 rounded bg-warning-bg text-warning text-[10px]">truncated</span>}
        </div>
        <div className="flex flex-wrap gap-1">
          {rj.use_cases.slice(0, 10).map((uc, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full bg-bg-subtle text-text-secondary text-[10px] border border-border">
              {uc.name || uc.Name || `#${uc.id}`}
            </span>
          ))}
          {rj.use_cases.length > 10 && (
            <span className="px-2 py-0.5 rounded-full bg-bg-subtle text-text-tertiary text-[10px]">
              +{rj.use_cases.length - 10} more
            </span>
          )}
        </div>
      </div>
    );
  }

  // Scoring
  if (prompt === 'COMBINED_VALUE_QUALITY_SCORE_PROMPT' && Array.isArray(rj.scored_use_cases)) {
    return (
      <div className="text-xs space-y-1.5">
        <span className="px-1.5 py-0.5 rounded bg-info-bg text-info font-semibold text-[10px]">
          {rj.scored_count || rj.scored_use_cases.length} scored
        </span>
        <div className="grid grid-cols-1 gap-0.5 max-h-28 overflow-y-auto">
          {rj.scored_use_cases.slice(0, 8).map((sc, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] py-0.5">
              <span className="text-text-primary font-medium truncate flex-1">{sc.name || `#${sc.id}`}</span>
              <span className={`px-1.5 py-0.5 rounded font-semibold ${
                ['Ultra High', 'Very High', 'High'].includes(sc.priority) ? 'bg-db-red-50 text-db-red' : 'bg-bg-subtle text-text-secondary'
              }`}>{sc.priority}</span>
              <span className="text-text-tertiary">Q: {sc.quality}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Domain Clustering
  if (prompt === 'DOMAIN_FINDER_PROMPT' && Array.isArray(rj.domains)) {
    return (
      <div className="text-xs space-y-1.5">
        <span className="px-1.5 py-0.5 rounded bg-info-bg text-info font-semibold text-[10px]">
          {rj.domains_count || rj.domains.length} domains
        </span>
        <div className="flex flex-wrap gap-1">
          {rj.domains.map((d, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full bg-bg-subtle text-text-secondary text-[10px] border border-border">
              {d.domain_name} ({(d.use_case_ids || []).length})
            </span>
          ))}
        </div>
      </div>
    );
  }

  // SQL Generation
  if (prompt === 'USE_CASE_SQL_GEN_PROMPT' && rj.sql_preview) {
    return (
      <div className="text-xs space-y-1">
        <span className="px-1.5 py-0.5 rounded bg-info-bg text-info font-semibold text-[10px]">SQL Generated</span>
        <pre className="text-[10px] text-text-secondary bg-bg-subtle rounded p-2 font-mono max-h-20 overflow-hidden">
          {rj.sql_preview.slice(0, 200)}{rj.sql_preview.length > 200 ? '...' : ''}
        </pre>
      </div>
    );
  }

  // Summary
  if (prompt === 'SUMMARY_GEN_PROMPT') {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="px-1.5 py-0.5 rounded bg-success-bg text-success font-semibold text-[10px]">Summary generated</span>
        {rj.response_chars && <span className="text-text-tertiary text-[10px]">{rj.response_chars.toLocaleString()} chars</span>}
      </div>
    );
  }

  // Business Context
  if (prompt === 'BUSINESS_CONTEXT_WORKER_PROMPT' && rj.json) {
    const ctx = rj.json;
    return (
      <div className="text-xs space-y-1">
        {ctx.business_context && (
          <p className="text-text-secondary text-[10px] line-clamp-2">{ctx.business_context.slice(0, 200)}</p>
        )}
        {Array.isArray(ctx.strategic_goals) && ctx.strategic_goals.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {ctx.strategic_goals.map((g, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-bg-subtle text-text-secondary text-[10px]">{g}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Default: show key metrics as badges
  const metricKeys = ['response_chars', 'rows_count', 'use_cases_count', 'scored_count', 'domains_count', 'batch_rows'];
  const badges = metricKeys.filter((k) => rj[k] != null).map((k) => ({ key: k, val: rj[k] }));
  if (badges.length > 0) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {badges.map((b) => (
          <span key={b.key} className="px-1.5 py-0.5 rounded bg-bg-subtle text-text-tertiary text-[10px] font-mono">
            {b.key.replace(/_/g, ' ')}: {typeof b.val === 'number' ? b.val.toLocaleString() : b.val}
          </span>
        ))}
      </div>
    );
  }

  return null;
}

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  const rm = min % 60;
  return `${hr}h ${rm}m`;
}
