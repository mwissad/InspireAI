import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity, CheckCircle2, AlertTriangle, XCircle, Loader2,
  ExternalLink, Clock, Sparkles, ArrowRight, BarChart3, Ban, Zap
} from 'lucide-react';
import DatabricksLogo from '../components/DatabricksLogo';

// Status → UI config (Databricks palette)
const STATUS_CONFIG = {
  started:        { color: 'text-db-red-light', bg: 'bg-db-red/5',     border: 'border-db-red/15',   icon: Loader2,       iconClass: 'animate-spin' },
  ended_success:  { color: 'text-db-teal',      bg: 'bg-db-teal/5',    border: 'border-db-teal/15',  icon: CheckCircle2,  iconClass: '' },
  ended_warning:  { color: 'text-db-gold',       bg: 'bg-db-gold/5',    border: 'border-db-gold/15',  icon: AlertTriangle, iconClass: '' },
  ended_error:    { color: 'text-red-400',       bg: 'bg-red-500/5',    border: 'border-red-500/15',  icon: XCircle,       iconClass: '' },
};

const POLL_INTERVAL = 5000;

export default function MonitorPage({ settings, apiFetch, runId, sessionId, onViewResults }) {
  const [session, setSession] = useState(null);
  const [steps, setSteps] = useState([]);
  const [runStatus, setRunStatus] = useState(null);
  const [polling, setPolling] = useState(true);
  const [error, _setError] = useState('');
  const [lastPollTime, setLastPollTime] = useState(null);

  const stepsRef = useRef([]);
  const lastSeenRef = useRef(null);
  const containerRef = useRef(null);
  const pollCountRef = useRef(0);

  const inspireDb = settings.inspireDatabase;
  const whId = settings.warehouseId;

  const pollRunStatus = useCallback(async () => {
    if (!runId) return;
    try {
      const res = await apiFetch(`/api/run/${runId}`);
      if (res.ok) setRunStatus(await res.json());
    } catch { /* ignore */ }
  }, [runId, apiFetch]);

  const pollSession = useCallback(async () => {
    if (!inspireDb || !whId) return;
    try {
      const params = new URLSearchParams({ inspire_database: inspireDb, warehouse_id: whId });
      if (sessionId) params.set('session_id', sessionId);
      const sessionRes = await apiFetch(`/api/inspire/session?${params}`);
      if (!sessionRes.ok) throw new Error('Failed to poll session');
      const sessionData = await sessionRes.json();
      const sess = sessionData.session;
      setSession(sess);
      if (!sess) { setLastPollTime(new Date()); return; }

      if (sess.processing_status === 'ready') {
        const stepParams = new URLSearchParams({ inspire_database: inspireDb, warehouse_id: whId });
        if (sess.session_id) stepParams.set('session_id', sess.session_id);
        if (lastSeenRef.current) stepParams.set('since', lastSeenRef.current);
        const stepsRes = await apiFetch(`/api/inspire/steps?${stepParams}`);
        if (stepsRes.ok) {
          const stepsData = await stepsRes.json();
          const newSteps = stepsData.steps || [];
          if (newSteps.length > 0) {
            const stepMap = new Map(stepsRef.current.map(s => [s.step_id, s]));
            for (const step of newSteps) {
              stepMap.set(step.step_id, step);
              if (step.last_updated) lastSeenRef.current = step.last_updated;
            }
            const allSteps = Array.from(stepMap.values())
              .sort((a, b) => (a.last_updated || '').localeCompare(b.last_updated || '') || (a.step_id - b.step_id));
            stepsRef.current = allSteps;
            setSteps([...allSteps]);
          }
        }
        await apiFetch('/api/inspire/ack', {
          method: 'POST',
          body: JSON.stringify({ inspire_database: inspireDb, warehouse_id: whId, session_id: sess.session_id }),
        });
      }
      if (sess.completed_on) setPolling(false);
      setLastPollTime(new Date());
    } catch (err) { console.warn('Poll error:', err.message); }
  }, [inspireDb, whId, sessionId, apiFetch]);

  useEffect(() => {
    if (!polling) return;
    pollRunStatus();
    pollSession();
    const interval = setInterval(() => { pollCountRef.current++; pollRunStatus(); pollSession(); }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [polling, pollRunStatus, pollSession]);

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [steps]);

  const cancelRun = async () => {
    if (!runId) return;
    try { await apiFetch(`/api/run/${runId}/cancel`, { method: 'POST' }); setPolling(false); } catch { /* ignore */ }
  };

  const progress = session?.completed_percent || 0;
  const isComplete = !!session?.completed_on;
  const isRunning = !isComplete && polling;
  const runPageUrl = runStatus?.run_page_url;

  // Group steps by stage
  const stageGroups = [];
  const stageMap = new Map();
  for (const step of steps) {
    const stage = step.stage_name || 'Unknown';
    if (!stageMap.has(stage)) {
      stageMap.set(stage, []);
      stageGroups.push({ name: stage, steps: stageMap.get(stage) });
    }
    stageMap.get(stage).push(step);
  }

  return (
    <div className="min-h-screen bg-db-darkest relative">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-db-red/3 rounded-full blur-[180px]" />
        <div className="absolute bottom-[20%] left-[-5%] w-[400px] h-[400px] bg-db-teal/3 rounded-full blur-[150px]" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,54,33,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,54,33,0.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Hero */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="h-px w-10 bg-gradient-to-r from-transparent to-db-red/60" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-db-red-light flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Live Monitor
            </span>
            <span className="h-px w-10 bg-gradient-to-l from-transparent to-db-red/60" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">
            Pipeline{' '}
            <span className="bg-gradient-to-r from-db-red via-db-orange to-db-gold bg-clip-text text-transparent">
              Monitor
            </span>
          </h1>
          {runId && (
            <p className="text-slate-500 text-sm">
              Run <code className="text-[11px] bg-db-navy/40 px-2 py-0.5 rounded-lg font-mono text-slate-400 border border-white/5">{runId}</code>
              {runPageUrl && (
                <a href={runPageUrl} target="_blank" rel="noopener noreferrer" className="ml-3 text-db-red-light hover:text-db-red inline-flex items-center gap-1 text-xs">
                  <ExternalLink size={11} /> View in Databricks
                </a>
              )}
            </p>
          )}
        </div>

        {/* ── Progress Card ── */}
        <div className="rounded-2xl border border-white/5 bg-db-navy/15 backdrop-blur-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {isComplete ? (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-db-teal to-emerald-600 flex items-center justify-center shadow-lg shadow-db-teal/20">
                  <CheckCircle2 size={20} className="text-white" />
                </div>
              ) : isRunning ? (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-db-red to-db-orange flex items-center justify-center shadow-lg shadow-db-red/20">
                  <Loader2 size={20} className="text-white animate-spin" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-db-navy/40 flex items-center justify-center border border-white/5">
                  <Activity size={20} className="text-slate-500" />
                </div>
              )}
              <div>
                <span className="text-base font-bold text-white">
                  {isComplete ? 'Pipeline Complete' : isRunning ? 'Running...' : 'Waiting...'}
                </span>
                {session && (
                  <p className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                    <Clock size={10} /> Status: <code className="text-slate-400">{session.processing_status}</code>
                    <span className="text-slate-700">·</span>
                    {steps.length} steps
                  </p>
                )}
              </div>
            </div>
            <span className={`text-3xl font-black tabular-nums ${
              isComplete ? 'text-db-teal' : 'bg-gradient-to-r from-db-red to-db-orange bg-clip-text text-transparent'
            }`}>
              {Math.round(progress)}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2.5 bg-db-darkest/60 rounded-full overflow-hidden border border-white/5">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                isComplete
                  ? 'bg-gradient-to-r from-db-teal to-emerald-400'
                  : 'bg-gradient-to-r from-db-red via-db-orange to-db-gold'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Actions row */}
          <div className="flex items-center justify-between mt-3">
            {lastPollTime && (
              <span className="text-[10px] text-slate-600">
                Last poll: {lastPollTime.toLocaleTimeString()}
              </span>
            )}
            {isRunning && (
              <button
                onClick={cancelRun}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 text-[11px] font-medium transition-colors"
              >
                <Ban size={11} /> Cancel Run
              </button>
            )}
          </div>

          {/* Waiting msg */}
          {!session && isRunning && (
            <div className="mt-4 flex items-center gap-2 text-slate-400 text-sm bg-db-darkest/40 p-3 rounded-xl border border-white/5">
              <Loader2 size={14} className="animate-spin text-db-red-light" />
              Waiting for Inspire to initialize session tables...
            </div>
          )}
        </div>

        {/* ── Run status chip ── */}
        {runStatus && (
          <div className="flex flex-wrap gap-2">
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
              runStatus.life_cycle_state === 'TERMINATED'
                ? 'bg-db-teal/8 text-db-teal border-db-teal/15'
                : runStatus.life_cycle_state === 'RUNNING' || runStatus.life_cycle_state === 'PENDING'
                  ? 'bg-db-red/8 text-db-red-light border-db-red/15'
                  : 'bg-db-navy/20 text-slate-500 border-white/5'
            }`}>
              Databricks: {runStatus.life_cycle_state}
              {runStatus.result_state && ` — ${runStatus.result_state}`}
            </span>
            {runStatus.state_message && (
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-db-navy/20 text-slate-500 border border-white/5 max-w-sm truncate">
                {runStatus.state_message}
              </span>
            )}
          </div>
        )}

        {/* ── Steps Timeline ── */}
        <div
          ref={containerRef}
          className="rounded-2xl border border-white/5 bg-db-navy/10 backdrop-blur-sm overflow-hidden max-h-[60vh] overflow-y-auto"
        >
          {stageGroups.length === 0 ? (
            <div className="p-12 text-center">
              <DatabricksLogo className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm text-slate-600">No steps yet. Waiting for Inspire to begin...</p>
            </div>
          ) : (
            stageGroups.map((stage, i) => (
              <div key={stage.name} className={i > 0 ? 'border-t border-white/5' : ''}>
                {/* Stage header */}
                <div className="sticky top-0 z-10 bg-db-navy/60 backdrop-blur-xl px-5 py-2.5 border-b border-white/5">
                  <h3 className="text-xs font-bold text-db-red-light uppercase tracking-wider flex items-center gap-2">
                    <BarChart3 size={12} />
                    {stage.name}
                    <span className="text-[10px] text-slate-600 font-normal normal-case">
                      ({stage.steps.length} step{stage.steps.length !== 1 ? 's' : ''})
                    </span>
                  </h3>
                </div>

                {/* Steps */}
                <div className="divide-y divide-white/3">
                  {stage.steps.map(step => {
                    const cfg = STATUS_CONFIG[step.status] || STATUS_CONFIG.started;
                    const Icon = cfg.icon;
                    return (
                      <div key={`${step.step_id}-${step.status}`} className={`px-5 py-3 ${cfg.bg} flex items-start gap-3 transition-colors`}>
                        <div className={`mt-0.5 shrink-0 ${cfg.color}`}>
                          <Icon size={15} className={cfg.iconClass} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-white">{step.step_name}</span>
                            {step.progress_increment > 0 && (
                              <span className="text-[10px] bg-db-darkest/50 px-1.5 py-0.5 rounded-md text-slate-400 border border-white/5">
                                +{step.progress_increment}%
                              </span>
                            )}
                          </div>
                          {step.sub_step_name && (
                            <p className="text-[11px] text-slate-500 mt-0.5">{step.sub_step_name}</p>
                          )}
                          {step.message && (
                            <p className="text-[11px] text-slate-600 mt-1 italic">{step.message}</p>
                          )}
                          {step.result_json && step.status !== 'started' && (
                            <div className="mt-1.5 text-[10px] text-slate-500 flex flex-wrap gap-2">
                              {step.result_json.use_cases_count != null && <span>📋 {step.result_json.use_cases_count} use cases</span>}
                              {step.result_json.scored_count != null && <span>⭐ {step.result_json.scored_count} scored</span>}
                              {step.result_json.domains_count != null && <span>🏢 {step.result_json.domains_count} domains</span>}
                              {step.result_json.response_chars != null && <span>📝 {step.result_json.response_chars.toLocaleString()} chars</span>}
                              {step.result_json.error && <span className="text-red-400">❌ {step.result_json.error}</span>}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-700 whitespace-nowrap font-mono">
                          {step.last_updated?.split('T')[1]?.slice(0, 8) || ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/5 p-4 rounded-xl border border-red-500/15">
            <XCircle size={14} /> <span>{error}</span>
          </div>
        )}

        {/* Complete → View Results */}
        {isComplete && (
          <div className="flex justify-center">
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-db-navy/40 to-db-darkest p-8 text-center overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[150px] bg-db-teal/6 rounded-full blur-[80px]" />
              <div className="relative z-10">
                <CheckCircle2 size={40} className="text-db-teal mx-auto mb-3 opacity-80" />
                <h2 className="text-lg font-bold text-white mb-1">Pipeline Complete!</h2>
                <p className="text-xs text-slate-500 mb-4">Your use case catalog is ready to explore</p>
                <button
                  onClick={onViewResults}
                  className="px-8 py-3.5 bg-gradient-to-r from-db-teal to-emerald-500 hover:from-db-teal hover:to-emerald-400 rounded-xl font-bold text-sm text-white transition-all flex items-center gap-2 mx-auto shadow-lg shadow-db-teal/20 hover:shadow-db-teal/30 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Sparkles size={16} /> View Results <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
