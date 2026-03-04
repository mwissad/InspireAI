import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  ExternalLink,
  XCircle,
  ArrowRight,
} from 'lucide-react';

export default function MonitorPage({ settings, sessionId, runId, onComplete }) {
  const { token, warehouseId, inspireDatabase } = settings;

  const [session, setSession] = useState(null);
  const [steps, setSteps] = useState([]);
  const [runInfo, setRunInfo] = useState(null);
  const [polling, setPolling] = useState(true);
  const lastPollRef = useRef(null);

  const apiFetch = useCallback(
    async (url, opts = {}) => {
      const resp = await fetch(url, {
        ...opts,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...opts.headers,
        },
      });
      if (!resp.ok) throw new Error(`${resp.status}`);
      return resp.json();
    },
    [token]
  );

  // Poll session + steps
  useEffect(() => {
    if (!polling || !warehouseId || !inspireDatabase) return;

    const poll = async () => {
      try {
        // Poll session
        const sessQ = new URLSearchParams({
          inspire_database: inspireDatabase,
          warehouse_id: warehouseId,
          ...(sessionId ? { session_id: sessionId } : {}),
        });
        const sessData = await apiFetch(`/api/inspire/session?${sessQ}`);
        if (sessData.session) {
          setSession(sessData.session);

          const sid = sessData.session.session_id;

          // Poll steps
          const stepQ = new URLSearchParams({
            inspire_database: inspireDatabase,
            warehouse_id: warehouseId,
            session_id: sid,
            ...(lastPollRef.current ? { since: lastPollRef.current } : {}),
          });
          const stepData = await apiFetch(`/api/inspire/steps?${stepQ}`);
          if (stepData.steps?.length > 0) {
            setSteps((prev) => {
              const map = new Map(prev.map((s) => [s.step_id, s]));
              for (const s of stepData.steps) {
                map.set(s.step_id, s);
              }
              return Array.from(map.values()).sort(
                (a, b) => (a.last_updated || '').localeCompare(b.last_updated || '')
              );
            });
            lastPollRef.current =
              stepData.steps[stepData.steps.length - 1].last_updated;
          }

          // ACK if status === 'ready'
          if (sessData.session.processing_status === 'ready') {
            try {
              await apiFetch('/api/inspire/ack', {
                method: 'POST',
                body: JSON.stringify({
                  inspire_database: inspireDatabase,
                  warehouse_id: warehouseId,
                  session_id: sid,
                }),
              });
            } catch {
              // silent
            }
          }

          // Check completed
          if (sessData.session.completed_on || sessData.session.completed_percent >= 100) {
            setPolling(false);
          }
        }
      } catch {
        // silent retry
      }

      // Poll run info
      if (runId) {
        try {
          const ri = await apiFetch(`/api/run/${runId}`);
          setRunInfo(ri);
          if (
            ri.life_cycle_state === 'TERMINATED' ||
            ri.life_cycle_state === 'INTERNAL_ERROR' ||
            ri.life_cycle_state === 'SKIPPED'
          ) {
            // don't stop polling session — the notebook might still be writing results
          }
        } catch {
          // silent
        }
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [polling, warehouseId, inspireDatabase, sessionId, runId, apiFetch]);

  const percent = session?.completed_percent || 0;
  const isComplete = session?.completed_on || percent >= 100;
  const isFailed =
    runInfo?.result_state === 'FAILED' ||
    runInfo?.life_cycle_state === 'INTERNAL_ERROR';

  // Group steps by stage
  const stages = {};
  for (const step of steps) {
    const stage = step.stage_name || 'Pipeline';
    if (!stages[stage]) stages[stage] = [];
    stages[stage].push(step);
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Monitor</h1>
          <p className="text-sm text-text-secondary mt-1">
            Track the Inspire AI pipeline execution.
          </p>
        </div>
        {runInfo?.run_page_url && (
          <a
            href={runInfo.run_page_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary border border-border rounded-md hover:bg-bg-subtle transition-smooth"
          >
            View in Databricks
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {/* Progress bar */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isComplete ? (
              <CheckCircle2 size={16} className="text-success" />
            ) : isFailed ? (
              <XCircle size={16} className="text-error" />
            ) : (
              <Loader2 size={16} className="animate-spin text-db-red" />
            )}
            <span className="text-sm font-semibold text-text-primary">
              {isComplete
                ? 'Pipeline Completed'
                : isFailed
                  ? 'Pipeline Failed'
                  : 'Pipeline Running'}
            </span>
          </div>
          <span className="text-sm font-mono text-text-secondary">
            {Math.round(percent)}%
          </span>
        </div>

        {/* Bar */}
        <div className="h-2 bg-bg rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isComplete
                ? 'bg-success'
                : isFailed
                  ? 'bg-error'
                  : 'bg-db-red progress-glow'
            }`}
            style={{ width: `${Math.min(percent, 100)}%` }}
              />
            </div>

        {/* Run metadata */}
        {runInfo && (
          <div className="flex items-center gap-4 mt-3 text-xs text-text-tertiary">
            {runInfo.run_name && <span>{runInfo.run_name}</span>}
            {runInfo.life_cycle_state && (
              <span className="font-mono">{runInfo.life_cycle_state}</span>
            )}
            {runInfo.execution_duration && (
              <span>
                {Math.round(runInfo.execution_duration / 1000)}s elapsed
              </span>
            )}
          </div>
        )}
      </div>

      {/* Steps timeline */}
      {Object.keys(stages).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(stages).map(([stageName, stageSteps]) => (
            <div
              key={stageName}
              className="bg-surface border border-border rounded-lg overflow-hidden"
            >
              {/* Stage header */}
              <div className="px-4 py-2.5 border-b border-border bg-panel">
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  {stageName}
                </h3>
                      </div>

              {/* Steps */}
              <div className="divide-y divide-border-subtle">
                {stageSteps.map((step) => (
                  <StepRow key={step.step_id} step={step} />
                ))}
                  </div>
            </div>
          ))}
          </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <Loader2 size={20} className="animate-spin text-text-tertiary mx-auto mb-3" />
          <p className="text-sm text-text-secondary">
            Waiting for pipeline steps...
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            The notebook is initializing. Steps will appear here as they execute.
          </p>
        </div>
      )}

      {/* Complete action */}
      {isComplete && (
        <div className="mt-6 bg-success-bg border border-success/20 rounded-lg p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} className="text-success" />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Pipeline completed successfully
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                Results are ready for review.
              </p>
            </div>
          </div>
          <button
            onClick={onComplete}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-db-red text-white text-sm font-medium rounded-lg hover:bg-db-red-hover transition-smooth"
          >
            View Results
            <ArrowRight size={14} />
          </button>
        </div>
      )}
          </div>
  );
}

function StepRow({ step }) {
  const statusIcon = {
    completed: <CheckCircle2 size={14} className="text-success" />,
    running: <Loader2 size={14} className="animate-spin text-db-red" />,
    pending: <Clock size={14} className="text-text-tertiary" />,
    failed: <XCircle size={14} className="text-error" />,
    error: <AlertCircle size={14} className="text-error" />,
  };

  const icon = statusIcon[step.status] || statusIcon.pending;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-subtle transition-smooth">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary font-medium truncate">
          {step.step_name || step.sub_step_name || 'Step'}
        </div>
        {step.message && (
          <p className="text-xs text-text-tertiary mt-0.5 truncate">
            {step.message}
          </p>
        )}
        </div>
      <div className="flex items-center gap-3 shrink-0">
        {step.progress_increment > 0 && (
          <span className="text-xs font-mono text-text-tertiary">
            +{step.progress_increment}%
          </span>
        )}
        <span
          className={`text-xs font-medium capitalize px-2 py-0.5 rounded-full ${
            step.status === 'completed'
              ? 'bg-success-bg text-success'
              : step.status === 'running'
                ? 'bg-db-red-50 text-db-red'
                : step.status === 'failed' || step.status === 'error'
                  ? 'bg-error-bg text-error'
                  : 'bg-bg text-text-tertiary'
          }`}
        >
          {step.status || 'pending'}
        </span>
      </div>
    </div>
  );
}
