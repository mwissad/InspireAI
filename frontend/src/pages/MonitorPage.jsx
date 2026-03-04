import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2, XCircle, Clock, Loader2, ExternalLink,
  RotateCcw, StopCircle, Timer, Sparkles, AlertCircle,
  Database, Brain, Code2, FileSearch, FileText, Presentation,
  LayoutDashboard, Layers, Settings, Rocket, Trophy, Activity,
  GitBranch, ArrowRight
} from 'lucide-react';
import DatabricksLogo from '../components/DatabricksLogo';

/* ─── Single-notebook execution steps (heuristic) ─── */
const NOTEBOOK_STEPS = [
  { id: 'init',       label: 'Initialization',        desc: 'Validating configuration & setting up environment',      icon: Settings,        phase: 0 },
  { id: 'metadata',   label: 'Metadata Extraction',    desc: 'Reading table & column definitions from Unity Catalog',  icon: Database,        phase: 1 },
  { id: 'discovery',  label: 'Use Case Discovery',     desc: 'AI analysis to discover relevant use cases',             icon: Brain,           phase: 2 },
  { id: 'enrichment', label: 'Use Case Enrichment',    desc: 'Enriching use cases with details & priorities',          icon: Sparkles,        phase: 3 },
  { id: 'sql',        label: 'SQL Generation',          desc: 'Generating SQL code for each discovered use case',      icon: Code2,           phase: 4 },
  { id: 'samples',    label: 'Sample Results',          desc: 'Executing sample queries with real data',               icon: FileSearch,      phase: 5 },
  { id: 'pdf',        label: 'PDF Catalog',              desc: 'Generating professional PDF documentation',            icon: FileText,        phase: 6 },
  { id: 'pptx',       label: 'Presentation',             desc: 'Creating executive-ready PowerPoint slides',           icon: Presentation,    phase: 7 },
  { id: 'dashboards', label: 'Dashboards',               desc: 'Generating dashboard notebooks',                      icon: LayoutDashboard, phase: 8 },
  { id: 'complete',   label: 'Complete',                  desc: 'All artifacts generated successfully',                icon: Trophy,          phase: 9 },
];

/* ─── Pipeline task icons ─── */
const TASK_ICONS = {
  '01_init_validate': Settings,
  '02_business_context': Brain,
  '03_schema_discovery': Database,
  '04_use_case_gen': Sparkles,
  '05_scoring_quality': Layers,
  '06_sql_notebooks': Code2,
  '07_documentation': FileText,
  '08_samples_finalize': Rocket,
};

/* ─── Helpers ─── */
function isTerminal(status) {
  const ls = status?.life_cycle_state;
  return ls === 'TERMINATED' || ls === 'INTERNAL_ERROR' || ls === 'SKIPPED';
}

function isTaskTerminal(task) {
  const ls = task?.life_cycle_state;
  return ls === 'TERMINATED' || ls === 'INTERNAL_ERROR' || ls === 'SKIPPED';
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

function getStatusStyle(status) {
  const ls = status?.life_cycle_state;
  const rs = status?.result_state;
  if (ls === 'TERMINATED' && rs === 'SUCCESS')  return { color: 'text-db-teal',   bg: 'bg-db-teal/10',   border: 'border-db-teal/30',   label: 'Completed' };
  if (ls === 'TERMINATED' && rs === 'FAILED')   return { color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/30',   label: 'Failed' };
  if (ls === 'TERMINATED' && rs === 'CANCELED') return { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30', label: 'Canceled' };
  if (ls === 'INTERNAL_ERROR')                  return { color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/30',   label: 'Internal Error' };
  if (ls === 'RUNNING')                         return { color: 'text-db-orange', bg: 'bg-db-orange/10', border: 'border-db-orange/30', label: 'Running' };
  return { color: 'text-db-gold', bg: 'bg-db-gold/10', border: 'border-db-gold/30', label: ls === 'QUEUED' ? 'Queued' : 'Pending' };
}

function getTaskStyle(task) {
  const ls = task?.life_cycle_state;
  const rs = task?.result_state;
  if (ls === 'TERMINATED' && rs === 'SUCCESS')  return { color: 'text-db-teal',   bg: 'bg-db-teal/10',   border: 'border-db-teal/30',   label: 'Success' };
  if (ls === 'TERMINATED' && rs === 'FAILED')   return { color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/30',   label: 'Failed' };
  if (ls === 'TERMINATED' && rs === 'CANCELED') return { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30', label: 'Canceled' };
  if (ls === 'INTERNAL_ERROR')                  return { color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/30',   label: 'Error' };
  if (ls === 'RUNNING')                         return { color: 'text-db-orange', bg: 'bg-db-orange/10', border: 'border-db-orange/30', label: 'Running' };
  if (ls === 'PENDING' || ls === 'BLOCKED')     return { color: 'text-db-gold',   bg: 'bg-db-gold/10',   border: 'border-db-gold/30',   label: ls === 'BLOCKED' ? 'Waiting' : 'Pending' };
  if (ls === 'QUEUED')                          return { color: 'text-db-gold',   bg: 'bg-db-gold/10',   border: 'border-db-gold/30',   label: 'Queued' };
  return { color: 'text-slate-500', bg: 'bg-white/5', border: 'border-white/10', label: ls || 'Pending' };
}

/* ─── Estimate current step from tables (single-notebook mode) ─── */
function estimateStepFromTables(tables) {
  if (!tables || tables.length === 0) return 0;
  const inspireTableCount = tables.filter(t => t.name.startsWith('_inspire_')).length;
  if (inspireTableCount === 0) return 1;
  if (inspireTableCount <= 2) return 2;
  if (inspireTableCount <= 5) return 3;
  if (inspireTableCount <= 10) return 4;
  if (inspireTableCount <= 15) return 5;
  if (inspireTableCount <= 20) return 6;
  if (inspireTableCount <= 25) return 7;
  if (inspireTableCount <= 30) return 8;
  return 9;
}

function estimateStepFromTime(elapsedMs, isRunning) {
  if (!isRunning) return -1;
  const mins = elapsedMs / 60000;
  if (mins < 0.5) return 0;
  if (mins < 2) return 1;
  if (mins < 5) return 2;
  if (mins < 10) return 3;
  if (mins < 15) return 4;
  if (mins < 20) return 5;
  if (mins < 25) return 6;
  if (mins < 30) return 7;
  if (mins < 35) return 8;
  return 8;
}

/* ═══════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════ */

export default function MonitorPage({ runId, runMode, inspireDatabase, generationOptions, onNewRun, onBack, apiFetch }) {
  const [status, setStatus] = useState(null);
  const [output, setOutput] = useState(null);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [tables, setTables] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const intervalRef = useRef(null);
  const timerRef = useRef(null);
  const tablesRef = useRef(null);

  const isPipeline = runMode === 'pipeline';

  // Parse inspire_database into catalog.schema
  const dbParts = (inspireDatabase || '').split('.');
  const catalog = dbParts[0] || '';
  const schema = dbParts[1] || '';

  // Poll run status
  useEffect(() => {
    let active = true;
    let consecutiveErrors = 0;

    const poll = async () => {
      try {
        const res = await apiFetch(`/api/run/${runId}`);
        if (!active) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!active) return;
        consecutiveErrors = 0;
        setError(null);
        setStatus(data);

        if (isTerminal(data)) {
          clearInterval(intervalRef.current);
          clearInterval(timerRef.current);
          clearInterval(tablesRef.current);
          if (data.result_state === 'SUCCESS') {
            setCurrentStep(9);
          }
          try {
            const outRes = await apiFetch(`/api/run/${runId}/output`);
            if (outRes.ok) {
              const outData = await outRes.json();
              if (active) setOutput(outData);
            }
          } catch {}
        }
      } catch (err) {
        consecutiveErrors++;
        if (active && consecutiveErrors >= 5) {
          setError(`Lost connection: ${err.message}`);
          clearInterval(intervalRef.current);
        }
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 5000);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      if (active) setElapsed(Date.now() - startTime);
    }, 1000);

    return () => { active = false; clearInterval(intervalRef.current); clearInterval(timerRef.current); };
  }, [runId, apiFetch]);

  // Poll tables for step tracking (single mode only)
  useEffect(() => {
    if (isPipeline) return; // Pipeline mode uses task status, not table heuristic
    if (!catalog || !schema || !apiFetch) return;
    let active = true;

    const pollTables = async () => {
      try {
        const res = await apiFetch(`/api/tables/${encodeURIComponent(catalog)}/${encodeURIComponent(schema)}`);
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          setTables(data.tables || []);
        }
      } catch {}
    };

    pollTables();
    tablesRef.current = setInterval(pollTables, 10000);

    return () => { active = false; clearInterval(tablesRef.current); };
  }, [catalog, schema, apiFetch, isPipeline]);

  // Compute current step from tables + time (single mode only)
  useEffect(() => {
    if (isPipeline) return;
    const isRunning = status?.life_cycle_state === 'RUNNING';
    const done = status && isTerminal(status);

    if (done && status.result_state === 'SUCCESS') {
      setCurrentStep(9);
      return;
    }
    if (done) return;

    if (tables && tables.length > 0) {
      setCurrentStep(estimateStepFromTables(tables));
    } else if (isRunning) {
      const timeStep = estimateStepFromTime(elapsed, true);
      setCurrentStep(prev => Math.max(prev, timeStep));
    }
  }, [tables, elapsed, status, isPipeline]);

  const handleCancel = async () => {
    try { await apiFetch(`/api/run/${runId}/cancel`, { method: 'POST' }); } catch {}
  };

  const done = status && isTerminal(status);
  const succeeded = status?.result_state === 'SUCCESS';
  const failed = done && !succeeded;
  const style = status ? getStatusStyle(status) : getStatusStyle(null);

  // Pipeline task progress
  const tasks = status?.tasks || [];
  const completedTasks = tasks.filter(t => t.life_cycle_state === 'TERMINATED' && t.result_state === 'SUCCESS').length;
  const runningTasks = tasks.filter(t => t.life_cycle_state === 'RUNNING').length;
  const failedTasks = tasks.filter(t =>
    (t.life_cycle_state === 'TERMINATED' && t.result_state === 'FAILED') ||
    t.life_cycle_state === 'INTERNAL_ERROR'
  ).length;

  // Filter steps for single mode
  const activeSteps = NOTEBOOK_STEPS.filter(s => {
    if (!generationOptions?.length) return true;
    if (s.id === 'samples' && !generationOptions.includes('Sample Results')) return false;
    if (s.id === 'pdf' && !generationOptions.includes('PDF Catalog')) return false;
    if (s.id === 'pptx' && !generationOptions.includes('Presentation')) return false;
    if (s.id === 'dashboards' && !generationOptions.includes('dashboards')) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="text-center pt-2 pb-2">
        <div className={`w-14 h-14 rounded-2xl ${style.bg} border ${style.border} flex items-center justify-center mx-auto mb-4`}>
          {done ? (
            succeeded ? <Trophy className="w-7 h-7 text-db-teal" /> : <XCircle className="w-7 h-7 text-red-400" />
          ) : (
            <Activity className="w-7 h-7 text-db-orange animate-pulse" />
          )}
        </div>
        <h1 className="text-xl font-bold text-white">Job Monitor</h1>
        <div className="flex items-center justify-center gap-3 mt-1">
          <p className="text-sm text-slate-400">
            Run ID: <span className="font-mono text-slate-300">{runId}</span>
          </p>
          {isPipeline && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-db-red/15 text-db-red-light font-semibold border border-db-red/20">
              <GitBranch className="w-3 h-3 inline mr-0.5 -mt-0.5" /> Pipeline
            </span>
          )}
        </div>
      </div>

      {/* Status banner */}
      <div className={`rounded-2xl border ${style.border} ${style.bg} p-5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!done ? (
              <Loader2 className={`w-6 h-6 ${style.color} animate-spin`} />
            ) : succeeded ? (
              <CheckCircle2 className="w-6 h-6 text-db-teal" />
            ) : (
              <XCircle className="w-6 h-6 text-red-400" />
            )}
            <div>
              <h2 className={`text-lg font-bold ${style.color}`}>{style.label}</h2>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                <span className="flex items-center gap-1"><Timer className="w-3 h-3" /> {formatDuration(elapsed)}</span>
                {status?.life_cycle_state && (
                  <span className="px-2 py-0.5 rounded-full bg-white/5 font-mono text-[10px]">
                    {status.life_cycle_state}{status.result_state ? ` · ${status.result_state}` : ''}
                  </span>
                )}
                {isPipeline && tasks.length > 0 && (
                  <span className="text-[10px] text-slate-500">
                    {completedTasks}/{tasks.length} tasks
                    {runningTasks > 0 && ` · ${runningTasks} running`}
                    {failedTasks > 0 && ` · ${failedTasks} failed`}
                  </span>
                )}
              </div>
              {status?.state_message && failed && (
                <p className="text-xs text-red-400/80 mt-1 max-w-xl truncate">{status.state_message}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!done && (
              <button onClick={handleCancel} className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-all">
                <StopCircle className="w-3.5 h-3.5 inline mr-1" /> Cancel
              </button>
            )}
            {status?.run_page_url && (
              <a href={status.run_page_url} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-db-red/10 border border-db-red/30 text-db-red-light text-xs font-medium hover:bg-db-red/20 transition-all">
                <ExternalLink className="w-3.5 h-3.5 inline mr-1" /> Databricks
              </a>
            )}
          </div>
        </div>

        {/* Overall progress bar */}
        {!done && (
          <div className="mt-4">
            <div className="h-2 bg-db-darkest rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-db-red via-db-orange to-db-gold rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: isPipeline
                    ? `${tasks.length > 0 ? ((completedTasks + runningTasks * 0.5) / tasks.length) * 100 : 0}%`
                    : `${Math.min(100, ((currentStep) / (activeSteps.length - 1)) * 100)}%`
                }}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 text-right">
              {isPipeline
                ? `Task ${completedTasks + (runningTasks > 0 ? 1 : 0)} of ${tasks.length}`
                : `Step ${Math.min(currentStep + 1, activeSteps.length)} of ${activeSteps.length}`
              }
            </p>
          </div>
        )}

        {/* Duration stats for completed runs */}
        {done && (
          <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-3 gap-4 text-center">
            <div><p className="text-[10px] text-slate-500 uppercase">Setup</p><p className="text-sm font-semibold text-white">{formatDuration(status.setup_duration)}</p></div>
            <div><p className="text-[10px] text-slate-500 uppercase">Execution</p><p className="text-sm font-semibold text-white">{formatDuration(status.execution_duration)}</p></div>
            <div><p className="text-[10px] text-slate-500 uppercase">Cleanup</p><p className="text-sm font-semibold text-white">{formatDuration(status.cleanup_duration)}</p></div>
          </div>
        )}
      </div>

      {/* ─── Pipeline: per-task progress ─── */}
      {isPipeline && tasks.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-db-navy/40 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-db-red-light" />
            <h3 className="text-sm font-semibold text-white">Pipeline Tasks</h3>
            <span className="ml-auto text-[10px] text-slate-500 font-mono">
              {completedTasks}/{tasks.length} completed
            </span>
          </div>
          <div className="p-4">
            <div className="space-y-1.5">
              {tasks.map((task, i) => {
                const taskStyle = getTaskStyle(task);
                const TaskIcon = TASK_ICONS[task.task_key] || Settings;
                const isActive = task.life_cycle_state === 'RUNNING';
                const isDone = task.life_cycle_state === 'TERMINATED' && task.result_state === 'SUCCESS';
                const isFailed = (task.life_cycle_state === 'TERMINATED' && task.result_state === 'FAILED') || task.life_cycle_state === 'INTERNAL_ERROR';
                const isWaiting = task.life_cycle_state === 'BLOCKED' || task.life_cycle_state === 'PENDING' || task.life_cycle_state === 'QUEUED';
                const isNotStarted = !task.life_cycle_state;
                const taskDuration = task.start_time && task.end_time
                  ? task.end_time - task.start_time
                  : task.start_time && isActive
                    ? Date.now() - task.start_time
                    : null;

                return (
                  <div key={task.task_key}>
                    <div
                      className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-300 ${
                        isActive ? 'bg-db-orange/10 border border-db-orange/30' :
                        isDone ? 'bg-db-teal/5 border border-transparent' :
                        isFailed ? 'bg-red-500/10 border border-red-500/30' :
                        isWaiting ? 'bg-db-gold/5 border border-db-gold/20' :
                        'border border-transparent opacity-40'
                      }`}
                    >
                      {/* Task number + icon */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        isActive ? 'bg-db-orange/20 border border-db-orange/40' :
                        isDone ? 'bg-db-teal/20 border border-db-teal/30' :
                        isFailed ? 'bg-red-500/20 border border-red-500/30' :
                        isWaiting ? 'bg-db-gold/10 border border-db-gold/20' :
                        'bg-white/5 border border-white/10'
                      }`}>
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-db-teal" />
                        ) : isActive ? (
                          <Loader2 className="w-4 h-4 text-db-orange animate-spin" />
                        ) : isFailed ? (
                          <XCircle className="w-4 h-4 text-red-400" />
                        ) : isWaiting ? (
                          <Clock className="w-4 h-4 text-db-gold" />
                        ) : (
                          <TaskIcon className="w-4 h-4 text-slate-500" />
                        )}
                      </div>

                      {/* Task info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium ${
                            isActive ? 'text-db-orange' :
                            isDone ? 'text-db-teal' :
                            isFailed ? 'text-red-400' :
                            isWaiting ? 'text-db-gold' :
                            'text-slate-500'
                          }`}>
                            {task.description || task.task_key.replace(/_/g, ' ')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-600 font-mono">{task.task_key}</span>
                          {task.depends_on?.length > 0 && (
                            <span className="text-[9px] text-slate-600 flex items-center gap-0.5">
                              <ArrowRight className="w-2.5 h-2.5 rotate-180" />
                              {task.depends_on.join(', ')}
                            </span>
                          )}
                        </div>
                        {isFailed && task.state_message && (
                          <p className="text-[10px] text-red-400/80 mt-1 truncate max-w-md">{task.state_message}</p>
                        )}
                      </div>

                      {/* Right side: duration + status */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {taskDuration != null && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {formatDuration(taskDuration)}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${taskStyle.color} ${
                          isActive ? 'animate-pulse' : ''
                        }`}>
                          {taskStyle.label}
                        </span>
                      </div>
                    </div>

                    {/* Connector line between tasks */}
                    {i < tasks.length - 1 && (
                      <div className="flex justify-center py-0.5">
                        <div className={`w-0.5 h-3 rounded-full ${
                          isDone ? 'bg-db-teal/30' : 'bg-white/10'
                        }`} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Single mode: step-by-step progress ─── */}
      {!isPipeline && (
        <div className="rounded-2xl border border-white/10 bg-db-navy/40 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-db-red-light" />
            <h3 className="text-sm font-semibold text-white">Notebook Steps</h3>
            {tables && (
              <span className="ml-auto text-[10px] text-slate-500 font-mono">
                {tables.filter(t => t.name.startsWith('_inspire_')).length} tables created
              </span>
            )}
          </div>
          <div className="p-5">
            <div className="space-y-1">
              {activeSteps.map((step, i) => {
                const StepIcon = step.icon;
                const isActive = i === currentStep && !done;
                const isDone = i < currentStep || (done && succeeded);
                const isFailed = failed && i === currentStep;
                const isPending = i > currentStep;

                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-300 ${
                      isActive ? 'bg-db-orange/10 border border-db-orange/30' :
                      isDone ? 'bg-db-teal/5 border border-transparent' :
                      isFailed ? 'bg-red-500/10 border border-red-500/30' :
                      'border border-transparent opacity-40'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      isActive ? 'bg-db-orange/20 border border-db-orange/40' :
                      isDone ? 'bg-db-teal/20 border border-db-teal/30' :
                      isFailed ? 'bg-red-500/20 border border-red-500/30' :
                      'bg-white/5 border border-white/10'
                    }`}>
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-db-teal" />
                      ) : isActive ? (
                        <Loader2 className="w-4 h-4 text-db-orange animate-spin" />
                      ) : isFailed ? (
                        <XCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        <StepIcon className="w-4 h-4 text-slate-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        isActive ? 'text-db-orange' :
                        isDone ? 'text-db-teal' :
                        isFailed ? 'text-red-400' :
                        'text-slate-500'
                      }`}>
                        {step.label}
                      </p>
                      <p className={`text-[11px] ${
                        isActive ? 'text-db-orange/60' :
                        isDone ? 'text-db-teal/50' :
                        'text-slate-600'
                      }`}>
                        {step.desc}
                      </p>
                    </div>

                    {isActive && (
                      <span className="text-[10px] text-db-orange font-bold uppercase tracking-wider animate-pulse">
                        Running
                      </span>
                    )}
                    {isDone && !isActive && (
                      <span className="text-[10px] text-db-teal/60">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Output Card ─── */}
      {output && (
        <div className="rounded-2xl border border-white/10 bg-db-navy/50 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-db-red-light" />
            <h3 className="text-sm font-semibold text-white">Notebook Output</h3>
          </div>
          <div className="p-5">
            {output.notebook_output?.result && (
              <div className="mb-4">
                <p className="text-xs text-slate-500 uppercase font-medium mb-2">Result</p>
                <div className="p-4 rounded-xl bg-db-darkest/80 border border-white/5 text-sm text-slate-200 font-mono whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                  {output.notebook_output.result}
                </div>
              </div>
            )}
            {output.error && (
              <div className="mb-4">
                <p className="text-xs text-red-400 uppercase font-medium mb-2">Error</p>
                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-sm text-red-300 font-mono whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                  {output.error}
                </div>
              </div>
            )}
            {output.error_trace && (
              <div>
                <p className="text-xs text-red-400 uppercase font-medium mb-2">Stack Trace</p>
                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-xs text-red-400 font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                  {output.error_trace}
                </div>
              </div>
            )}
            {!output.notebook_output?.result && !output.error && (
              <p className="text-slate-500 text-sm">No output captured from the notebook.</p>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Success banner */}
      {succeeded && (
        <div className="rounded-2xl border border-db-teal/30 bg-db-teal/5 p-6 text-center">
          <DatabricksLogo className="w-14 h-14 mx-auto mb-3 opacity-80" />
          <h3 className="text-lg font-bold text-db-teal mb-1">
            {isPipeline ? 'Pipeline Completed!' : 'Inspire AI Completed!'}
          </h3>
          <p className="text-sm text-db-teal/70">
            {isPipeline
              ? `All ${tasks.length} tasks completed successfully. Check your workspace for artifacts.`
              : 'Check your Databricks workspace for the generated artifacts.'
            }
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-xl font-medium text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          New Run
        </button>
        {status?.run_page_url && (
          <a
            href={status.run_page_url}
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
