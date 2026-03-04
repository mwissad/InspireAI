import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2, XCircle, Clock, Loader2, ExternalLink,
  RotateCcw, StopCircle, Timer, Sparkles, AlertCircle,
  Activity, Trophy, AlertTriangle, ChevronDown, ChevronUp,
  Zap, Database
} from 'lucide-react';
import DatabricksLogo from '../components/DatabricksLogo';

/* ─── Status colors (from Integration Guide §6) ─── */
const STATUS_STYLES = {
  started:       { color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',  icon: Loader2,      animate: true  },
  ended_success: { color: 'text-db-teal',    bg: 'bg-db-teal/10',    border: 'border-db-teal/30',   icon: CheckCircle2, animate: false },
  ended_warning: { color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30', icon: AlertTriangle, animate: false },
  ended_error:   { color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',   icon: XCircle,      animate: false },
};

function getStepStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.started;
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remSec}s`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `${hours}h ${remMin}m`;
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return ''; }
}

/* ═══════════════════════════════════════════════════
   Monitor Page — v41 Integration Guide Protocol
   ═══════════════════════════════════════════════════ */

export default function MonitorPage({ runId, inspireDatabase, onNewRun, onBack, apiFetch }) {
  // ─── State ───
  const [runStatus, setRunStatus] = useState(null);          // Databricks run status
  const [session, setSession] = useState(null);              // __inspire_session row
  const [steps, setSteps] = useState([]);                    // __inspire_step rows (merged)
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [sessionId, setSessionId] = useState(null);          // Auto-detected session ID
  const [warehouseId, setWarehouseId] = useState(() => localStorage.getItem('inspire_warehouse_id') || '');
  const [expandedSteps, setExpandedSteps] = useState(new Set());
  const [stagesCollapsed, setStagesCollapsed] = useState(new Set());

  const runPollRef = useRef(null);
  const sessionPollRef = useRef(null);
  const timerRef = useRef(null);
  const lastSeenTimestamp = useRef(null);
  const stepsMapRef = useRef(new Map());   // step_id → step (for upsert)

  const isTerminal = runStatus?.life_cycle_state === 'TERMINATED' ||
                     runStatus?.life_cycle_state === 'INTERNAL_ERROR' ||
                     runStatus?.life_cycle_state === 'SKIPPED';
  const isCompleted = session?.completed_on != null;
  const progress = session?.completed_percent ?? 0;

  // ─── Auto-detect warehouse ID ───
  useEffect(() => {
    if (warehouseId) return;
    const fetchWarehouses = async () => {
      try {
        const res = await apiFetch('/api/warehouses');
        if (res.ok) {
          const data = await res.json();
          const running = data.warehouses?.find(w => w.state === 'RUNNING');
          if (running) {
            setWarehouseId(running.id);
            localStorage.setItem('inspire_warehouse_id', running.id);
          } else if (data.warehouses?.length > 0) {
            setWarehouseId(data.warehouses[0].id);
            localStorage.setItem('inspire_warehouse_id', data.warehouses[0].id);
          }
        }
      } catch {}
    };
    fetchWarehouses();
  }, [apiFetch, warehouseId]);

  // ─── Poll Databricks run status ───
  useEffect(() => {
    if (!runId) return;
    let active = true;
    let errorCount = 0;

    const poll = async () => {
      try {
        const res = await apiFetch(`/api/run/${runId}`);
        if (!active) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!active) return;
        errorCount = 0;
        setRunStatus(data);

        if (data.life_cycle_state === 'TERMINATED' || data.life_cycle_state === 'INTERNAL_ERROR') {
          clearInterval(runPollRef.current);
          clearInterval(timerRef.current);
        }
      } catch (err) {
        errorCount++;
        if (active && errorCount >= 5) {
          setError(`Lost connection: ${err.message}`);
          clearInterval(runPollRef.current);
        }
      }
    };

    poll();
    runPollRef.current = setInterval(poll, 5000);
    const startTime = Date.now();
    timerRef.current = setInterval(() => { if (active) setElapsed(Date.now() - startTime); }, 1000);

    return () => { active = false; clearInterval(runPollRef.current); clearInterval(timerRef.current); };
  }, [runId, apiFetch]);

  // ─── Detect session_id from __inspire_session ───
  useEffect(() => {
    if (!inspireDatabase || !warehouseId || sessionId) return;
    let active = true;

    const detectSession = async () => {
      try {
        const res = await apiFetch(`/api/inspire/sessions?inspire_database=${encodeURIComponent(inspireDatabase)}&warehouse_id=${encodeURIComponent(warehouseId)}`);
        if (!active || !res.ok) return;
          const data = await res.json();
        if (data.sessions?.length > 0) {
          // Pick the most recent session
          setSessionId(data.sessions[0].session_id);
        }
      } catch {}
    };

    // Wait a bit for the session to be created
    const timeout = setTimeout(detectSession, 10000);
    const interval = setInterval(detectSession, 15000);

    return () => { active = false; clearTimeout(timeout); clearInterval(interval); };
  }, [inspireDatabase, warehouseId, sessionId, apiFetch]);

  // ─── Poll session + steps (READY/DONE handshake — Integration Guide §3) ───
  const pollSession = useCallback(async () => {
    if (!inspireDatabase || !warehouseId || !sessionId) return;

    try {
      // 1. Poll __inspire_session
      const sessionRes = await apiFetch(
        `/api/inspire/session?inspire_database=${encodeURIComponent(inspireDatabase)}&warehouse_id=${encodeURIComponent(warehouseId)}&session_id=${sessionId}`
      );
      if (!sessionRes.ok) return;
      const sessionData = await sessionRes.json();
      if (!sessionData.session) return;
      setSession(sessionData.session);

      // 2. If processing_status === 'ready', read new steps
      if (sessionData.session.processing_status === 'ready') {
        const sinceParam = lastSeenTimestamp.current ? `&since=${encodeURIComponent(lastSeenTimestamp.current)}` : '';
        const stepsRes = await apiFetch(
          `/api/inspire/steps?inspire_database=${encodeURIComponent(inspireDatabase)}&warehouse_id=${encodeURIComponent(warehouseId)}&session_id=${sessionId}${sinceParam}`
        );
        if (stepsRes.ok) {
          const stepsData = await stepsRes.json();
          if (stepsData.steps?.length > 0) {
            // Upsert steps by step_id (§13 rule 1)
            const map = stepsMapRef.current;
            for (const step of stepsData.steps) {
              map.set(step.step_id, step);
              if (step.last_updated) {
                if (!lastSeenTimestamp.current || step.last_updated > lastSeenTimestamp.current) {
                  lastSeenTimestamp.current = step.last_updated;
                }
              }
            }
            setSteps(Array.from(map.values()).sort((a, b) => {
              if (a.last_updated !== b.last_updated) return a.last_updated < b.last_updated ? -1 : 1;
              return (a.step_id || 0) - (b.step_id || 0);
            }));
          }

          // 3. ACK: set processing_status = 'done'
          try {
            await apiFetch('/api/inspire/ack', {
              method: 'POST',
              body: JSON.stringify({ inspire_database: inspireDatabase, warehouse_id: warehouseId, session_id: sessionId }),
            });
          } catch {}
        }
      }

      // 4. Stop polling when completed_on IS NOT NULL
      if (sessionData.session.completed_on) {
        clearInterval(sessionPollRef.current);
      }
    } catch (err) {
      console.warn('Session poll error:', err.message);
    }
  }, [inspireDatabase, warehouseId, sessionId, apiFetch]);

  useEffect(() => {
    if (!sessionId || !warehouseId) return;
    let active = true;
    pollSession();
    sessionPollRef.current = setInterval(pollSession, 5000);
    return () => { active = false; clearInterval(sessionPollRef.current); };
  }, [sessionId, warehouseId, pollSession]);

  // ─── Cancel run ───
  const handleCancel = async () => {
    try { await apiFetch(`/api/run/${runId}/cancel`, { method: 'POST' }); } catch {}
  };

  // ─── Group steps by stage_name ───
  const stageGroups = [];
  const stageMap = new Map();
  for (const step of steps) {
    const stage = step.stage_name || 'Unknown';
    if (!stageMap.has(stage)) {
      stageMap.set(stage, []);
      stageGroups.push(stage);
    }
    stageMap.get(stage).push(step);
  }

  // Computed values
  const done = isTerminal;
  const succeeded = runStatus?.result_state === 'SUCCESS';
  const failed = done && !succeeded;
  const successSteps = steps.filter(s => s.status === 'ended_success').length;
  const errorSteps = steps.filter(s => s.status === 'ended_error').length;
  const warningSteps = steps.filter(s => s.status === 'ended_warning').length;
  const activeSteps = steps.filter(s => s.status === 'started').length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="text-center pt-2 pb-2">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
          isCompleted ? 'bg-db-teal/10 border border-db-teal/30' :
          failed ? 'bg-red-500/10 border border-red-500/30' :
          'bg-db-orange/10 border border-db-orange/30'
        }`}>
          {isCompleted ? <Trophy className="w-7 h-7 text-db-teal" /> :
           failed ? <XCircle className="w-7 h-7 text-red-400" /> :
           <Activity className="w-7 h-7 text-db-orange animate-pulse" />}
        </div>
        <h1 className="text-xl font-bold text-white">Inspire AI Monitor</h1>
        <div className="flex items-center justify-center gap-3 mt-1">
          <p className="text-sm text-slate-400">
            Run ID: <span className="font-mono text-slate-300">{runId}</span>
          </p>
          {sessionId && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-db-red/15 text-db-red-light font-semibold border border-db-red/20">
              Session: {String(sessionId).slice(-8)}
            </span>
          )}
        </div>
      </div>

      {/* ─── Progress Banner ─── */}
      <div className={`rounded-2xl border p-5 ${
        isCompleted ? 'border-db-teal/30 bg-db-teal/5' :
        failed ? 'border-red-500/30 bg-red-500/5' :
        'border-db-orange/30 bg-db-orange/5'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isCompleted ? <CheckCircle2 className="w-6 h-6 text-db-teal" /> :
             failed ? <XCircle className="w-6 h-6 text-red-400" /> :
             <Loader2 className="w-6 h-6 text-db-orange animate-spin" />}
            <div>
              <h2 className={`text-lg font-bold ${
                isCompleted ? 'text-db-teal' : failed ? 'text-red-400' : 'text-db-orange'
              }`}>
                {isCompleted ? 'Pipeline Complete!' :
                 failed ? 'Pipeline Failed' :
                 session ? `Running — ${Math.round(progress)}%` : 'Starting...'}
              </h2>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                <span className="flex items-center gap-1"><Timer className="w-3 h-3" /> {formatDuration(elapsed)}</span>
                {steps.length > 0 && (
                  <span className="text-[10px] text-slate-500">
                    {successSteps} done{warningSteps > 0 && ` · ${warningSteps} warnings`}{errorSteps > 0 && ` · ${errorSteps} errors`}{activeSteps > 0 && ` · ${activeSteps} active`}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!done && (
              <button onClick={handleCancel} className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-all">
                <StopCircle className="w-3.5 h-3.5 inline mr-1" /> Cancel
              </button>
            )}
            {runStatus?.run_page_url && (
              <a href={runStatus.run_page_url} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-db-red/10 border border-db-red/30 text-db-red-light text-xs font-medium hover:bg-db-red/20 transition-all">
                <ExternalLink className="w-3.5 h-3.5 inline mr-1" /> Databricks
              </a>
            )}
          </div>
        </div>

        {/* Progress bar (§13 rule 6: bind to completed_percent) */}
        {!isCompleted && !failed && (
          <div className="mt-4">
            <div className="h-2.5 bg-db-darkest rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-db-red via-db-orange to-db-gold rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${Math.min(100, Math.max(1, progress))}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 text-right">{Math.round(progress)}% complete</p>
          </div>
        )}
      </div>

      {/* ─── Waiting for session detection ─── */}
      {!sessionId && !isTerminal && (
        <div className="rounded-2xl border border-white/10 bg-db-navy/40 p-6 text-center">
          <Database className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Waiting for Inspire session to initialize...</p>
          <p className="text-[11px] text-slate-500 mt-1">The pipeline will start writing tracking data shortly.</p>
        </div>
      )}

      {/* ─── Step Timeline ─── */}
      {stageGroups.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-db-navy/40 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2">
            <Zap className="w-4 h-4 text-db-red-light" />
            <h3 className="text-sm font-semibold text-white">Pipeline Steps</h3>
            <span className="ml-auto text-[10px] text-slate-500 font-mono">
              {steps.length} events · {stageGroups.length} stages
            </span>
          </div>
          <div className="p-4 space-y-3">
            {stageGroups.map(stageName => {
              const stageSteps = stageMap.get(stageName);
              const isCollapsed = stagesCollapsed.has(stageName);
              const stageHasError = stageSteps.some(s => s.status === 'ended_error');
              const stageHasWarning = stageSteps.some(s => s.status === 'ended_warning');
              const stageActive = stageSteps.some(s => s.status === 'started');
              const stageComplete = stageSteps.every(s => s.status?.startsWith('ended_'));

                return (
                <div key={stageName} className="rounded-xl border border-white/5 overflow-hidden">
                  {/* Stage header */}
                  <button
                    onClick={() => setStagesCollapsed(prev => {
                      const next = new Set(prev);
                      next.has(stageName) ? next.delete(stageName) : next.add(stageName);
                      return next;
                    })}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-white/5 ${
                      stageHasError ? 'bg-red-500/5' :
                      stageActive ? 'bg-blue-500/5' :
                      stageComplete ? 'bg-db-teal/5' :
                      'bg-white/[0.02]'
                    }`}
                  >
                    {stageComplete ? <CheckCircle2 className="w-4 h-4 text-db-teal flex-shrink-0" /> :
                     stageActive ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" /> :
                     stageHasError ? <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" /> :
                     <Clock className="w-4 h-4 text-slate-500 flex-shrink-0" />}

                    <span className={`text-sm font-semibold flex-1 ${
                      stageComplete ? 'text-db-teal' :
                      stageActive ? 'text-blue-400' :
                      stageHasError ? 'text-red-400' :
                      'text-slate-300'
                    }`}>{stageName}</span>

                    <span className="text-[10px] text-slate-500 mr-2">
                      {stageSteps.filter(s => s.status?.startsWith('ended_')).length}/{stageSteps.length} steps
                      {stageHasWarning && ' ⚠️'}
                    </span>
                    {isCollapsed ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronUp className="w-4 h-4 text-slate-500" />}
                  </button>

                  {/* Stage steps */}
                  {!isCollapsed && (
                    <div className="px-4 pb-3 space-y-1">
                      {stageSteps.map((step, idx) => {
                        const sty = getStepStyle(step.status);
                        const StepIcon = sty.icon;
                        const isExpanded = expandedSteps.has(step.step_id);

                        return (
                          <div key={`${step.step_id}-${idx}`}>
                            <button
                              onClick={() => setExpandedSteps(prev => {
                                const next = new Set(prev);
                                next.has(step.step_id) ? next.delete(step.step_id) : next.add(step.step_id);
                                return next;
                              })}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all hover:bg-white/5 ${sty.bg}`}
                            >
                              <StepIcon className={`w-3.5 h-3.5 ${sty.color} flex-shrink-0 ${sty.animate ? 'animate-spin' : ''}`} />
                      <div className="flex-1 min-w-0">
                                <p className={`text-xs font-medium ${sty.color} truncate`}>
                                  {step.step_name || step.sub_step_name || 'Processing...'}
                                </p>
                                {step.sub_step_name && step.sub_step_name !== step.step_name && (
                                  <p className="text-[10px] text-slate-500 truncate">{step.sub_step_name}</p>
                          )}
                        </div>
                              <span className="text-[9px] text-slate-600 font-mono flex-shrink-0">
                                {formatTime(step.last_updated)}
                              </span>
                            </button>

                            {/* Expanded detail */}
                            {isExpanded && (
                              <div className="ml-6 mt-1 mb-2 p-3 rounded-lg bg-db-darkest/50 border border-white/5 text-[11px] space-y-1.5">
                                {step.message && (
                                  <p className="text-slate-300">{step.message}</p>
                                )}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-500">
                                  <span>Stage: <span className="text-slate-400">{step.stage_name}</span></span>
                                  <span>Status: <span className={sty.color}>{step.status}</span></span>
                                  {step.progress_increment != null && (
                                    <span>Progress delta: <span className="text-slate-400">{step.progress_increment}</span></span>
                                  )}
                                  <span>Step ID: <span className="text-slate-400 font-mono">{String(step.step_id).slice(-10)}</span></span>
                      </div>
                                {step.result_json && (
                                  <details className="mt-2">
                                    <summary className="text-slate-500 cursor-pointer hover:text-slate-300 text-[10px]">result_json</summary>
                                    <pre className="mt-1 p-2 rounded bg-db-darkest text-[10px] text-slate-400 overflow-auto max-h-40 font-mono">
                                      {JSON.stringify(step.result_json, null, 2)}
                                    </pre>
                                  </details>
                                )}
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
      )}

      {/* ─── Error display ─── */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ─── Success banner ─── */}
      {isCompleted && (
        <div className="rounded-2xl border border-db-teal/30 bg-db-teal/5 p-6 text-center">
          <DatabricksLogo className="w-14 h-14 mx-auto mb-3 opacity-80" />
          <h3 className="text-lg font-bold text-db-teal mb-1">Inspire AI Completed!</h3>
          <p className="text-sm text-db-teal/70">
            Pipeline finished successfully. Go to the Results tab to explore your use cases.
          </p>
        </div>
      )}

      {/* ─── Actions ─── */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-xl font-medium text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          New Run
        </button>
        {runStatus?.run_page_url && (
          <a
            href={runStatus.run_page_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 rounded-xl font-medium text-white bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange transition-all flex items-center justify-center gap-2 shadow-lg shadow-db-red/20"
          >
            <ExternalLink className="w-4 h-4" />
            Open in Databricks
          </a>
        )}
      </div>
    </div>
  );
}
