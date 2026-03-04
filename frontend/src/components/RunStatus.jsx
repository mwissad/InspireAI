import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2, XCircle, Clock, Loader2, ExternalLink,
  RotateCcw, StopCircle, Timer, Cpu, Trash2, Sparkles
} from 'lucide-react';
import DatabricksLogo from './DatabricksLogo';

const STATE_CONFIG = {
  PENDING: { color: 'text-db-gold', bg: 'bg-db-gold/10', border: 'border-db-gold/30', icon: Clock, label: 'Pending' },
  QUEUED: { color: 'text-db-gold', bg: 'bg-db-gold/10', border: 'border-db-gold/30', icon: Clock, label: 'Queued' },
  RUNNING: { color: 'text-db-red-light', bg: 'bg-db-red/10', border: 'border-db-red/30', icon: Loader2, label: 'Running', spin: true },
  TERMINATING: { color: 'text-db-orange', bg: 'bg-db-orange/10', border: 'border-db-orange/30', icon: StopCircle, label: 'Terminating' },
  TERMINATED: { color: 'text-db-teal', bg: 'bg-db-teal/10', border: 'border-db-teal/30', icon: CheckCircle2, label: 'Completed' },
  SKIPPED: { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30', icon: Trash2, label: 'Skipped' },
  INTERNAL_ERROR: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: XCircle, label: 'Internal Error' },
};

function getStateConfig(state) {
  const lifeState = state?.life_cycle_state;
  const resultState = state?.result_state;

  if (lifeState === 'TERMINATED' && resultState === 'SUCCESS') return STATE_CONFIG.TERMINATED;
  if (lifeState === 'TERMINATED' && resultState === 'FAILED') return { ...STATE_CONFIG.INTERNAL_ERROR, label: 'Failed' };
  if (lifeState === 'TERMINATED' && resultState === 'CANCELED') return { ...STATE_CONFIG.SKIPPED, label: 'Canceled' };
  if (lifeState === 'INTERNAL_ERROR') return STATE_CONFIG.INTERNAL_ERROR;
  if (lifeState === 'RUNNING') return STATE_CONFIG.RUNNING;
  if (lifeState === 'PENDING' || lifeState === 'QUEUED' || lifeState === 'BLOCKED') return STATE_CONFIG.PENDING;
  if (lifeState === 'TERMINATING') return STATE_CONFIG.TERMINATING;
  return STATE_CONFIG.PENDING;
}

function isTerminal(state) {
  const ls = state?.life_cycle_state;
  return ls === 'TERMINATED' || ls === 'INTERNAL_ERROR' || ls === 'SKIPPED';
}

function formatDuration(ms) {
  if (!ms) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remSec}s`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `${hours}h ${remMin}m`;
}

export default function RunStatus({ runId, onNewRun, apiFetch }) {
  const [status, setStatus] = useState(null);
  const [output, setOutput] = useState(null);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    let active = true;
    let consecutiveErrors = 0;
    const MAX_ERRORS = 5;

    const poll = async () => {
      try {
        const res = await apiFetch(`/api/run/${runId}`);
        if (!active) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to fetch status (HTTP ${res.status})`);
        }
        const data = await res.json();
        if (!active) return;
        consecutiveErrors = 0; // reset on success
        setError(null);
        setStatus(data);

        if (isTerminal(data.state)) {
          clearInterval(intervalRef.current);
          clearInterval(timerRef.current);
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
        console.error(`Poll error (${consecutiveErrors}/${MAX_ERRORS}):`, err.message);
        if (active) {
          if (consecutiveErrors >= MAX_ERRORS) {
            setError(`Lost connection after ${MAX_ERRORS} retries: ${err.message}`);
            clearInterval(intervalRef.current);
          } else {
            setError(`Retrying... (${err.message})`);
          }
        }
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 5000);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      if (active) setElapsed(Date.now() - startTime);
    }, 1000);

    return () => {
      active = false;
      clearInterval(intervalRef.current);
      clearInterval(timerRef.current);
    };
  }, [runId, apiFetch]);

  const handleCancel = async () => {
    try {
      await apiFetch(`/api/run/${runId}/cancel`, { method: 'POST' });
    } catch {}
  };

  const config = status ? getStateConfig(status.state) : STATE_CONFIG.PENDING;
  const Icon = config.icon;
  const done = status && isTerminal(status.state);
  const succeeded = status?.state?.result_state === 'SUCCESS';

  return (
    <div className="mt-6 space-y-6">
      {/* Main Status Card */}
      <div className={`rounded-2xl border ${config.border} ${config.bg} backdrop-blur-lg overflow-hidden`}>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl ${config.bg} border ${config.border} flex items-center justify-center`}>
                <Icon className={`w-6 h-6 ${config.color} ${config.spin ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <h2 className={`text-lg font-bold ${config.color}`}>{config.label}</h2>
                <p className="text-sm text-slate-400">
                  Run ID: <span className="font-mono text-slate-300">{runId}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!done && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-all"
                >
                  <StopCircle className="w-4 h-4 inline mr-1.5" />
                  Cancel
                </button>
              )}
              {status?.run_page_url && (
                <a
                  href={status.run_page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-db-red/10 border border-db-red/30 text-db-red-light text-sm font-medium hover:bg-db-red/20 transition-all"
                >
                  <ExternalLink className="w-4 h-4 inline mr-1.5" />
                  View in Databricks
                </a>
              )}
            </div>
          </div>

          {/* Progress indicators */}
          {!done && (
            <div className="mt-6">
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Timer className="w-4 h-4" />
                  Elapsed: {formatDuration(elapsed)}
                </div>
                {status?.state?.life_cycle_state && (
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-4 h-4" />
                    State: {status.state.life_cycle_state}
                  </div>
                )}
              </div>
              <div className="mt-3 h-1.5 bg-db-darkest rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-db-red to-db-orange rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}
        </div>

        {/* Duration stats for completed runs */}
        {done && (
          <div className="border-t border-white/5 px-6 py-4 grid grid-cols-3 gap-4">
            <StatBlock label="Setup" value={formatDuration(status.setup_duration)} />
            <StatBlock label="Execution" value={formatDuration(status.execution_duration)} />
            <StatBlock label="Cleanup" value={formatDuration(status.cleanup_duration)} />
          </div>
        )}
      </div>

      {/* Output Card */}
      {output && (
        <div className="rounded-2xl border border-white/10 bg-db-navy/50 backdrop-blur-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-db-red-light" />
            <h3 className="text-sm font-semibold text-white">Notebook Output</h3>
          </div>
          <div className="p-6">
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
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Success message */}
      {succeeded && (
        <div className="rounded-2xl border border-db-teal/30 bg-db-teal/5 backdrop-blur-lg p-6 text-center">
          <DatabricksLogo className="w-16 h-16 mx-auto mb-3 opacity-80" />
          <h3 className="text-lg font-bold text-db-teal mb-1">Inspire AI Completed Successfully!</h3>
          <p className="text-sm text-db-teal/70 mb-4">
            Your artifacts have been generated. Check your Databricks workspace for the output files.
          </p>
        </div>
      )}

      {/* New Run Button */}
      <button
        onClick={onNewRun}
        className="w-full py-4 rounded-2xl font-semibold text-white transition-all duration-300 flex items-center justify-center gap-3 bg-gradient-to-r from-db-dark to-db-navy hover:from-db-navy hover:to-db-dark border border-white/10 shadow-lg active:scale-[0.98]"
      >
        <RotateCcw className="w-5 h-5" />
        Start New Run
      </button>
    </div>
  );
}

function StatBlock({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-xs text-slate-500 uppercase">{label}</p>
      <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
    </div>
  );
}
