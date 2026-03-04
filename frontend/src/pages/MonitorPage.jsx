import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  ExternalLink,
  XCircle,
  ArrowRight,
  Play,
} from 'lucide-react';

// Run lifecycle phases
const PHASE_PENDING   = 'PENDING';
const PHASE_RUNNING   = 'RUNNING';
const PHASE_TERMINATED = 'TERMINATED';

export default function MonitorPage({ settings, sessionId, runId, onComplete }) {
  const { databricksHost, token, warehouseId, inspireDatabase } = settings;

  // Run-level state (primary source of truth)
  const [runInfo, setRunInfo] = useState(null);
  const [runPhase, setRunPhase] = useState(PHASE_PENDING); // PENDING | RUNNING | TERMINATED

  // Session/step state (secondary, from notebook tables)
  const [session, setSession] = useState(null);
  const [steps, setSteps] = useState([]);
  const [polling, setPolling] = useState(true);
  const lastPollRef = useRef(null);
  const trackedSessionRef = useRef(null); // track which session_id we're following

  const apiFetch = useCallback(
    async (url, opts = {}) => {
      const headers = {
        Authorization: `Bearer ${token}`,
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
      // ── 1. Always poll the Databricks run status first ──
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
            // TERMINATED, INTERNAL_ERROR, SKIPPED, CANCELED
            setRunPhase(PHASE_TERMINATED);
          }

          // If the run failed outright, stop polling
          if (lcs === 'INTERNAL_ERROR' || lcs === 'SKIPPED') {
            setPolling(false);
            return;
          }

          // If terminated with failure, stop
          if (lcs === 'TERMINATED' && ri.result_state === 'FAILED') {
            setPolling(false);
            return;
          }
        } catch {
          // Run info fetch failed, keep polling
        }
      }

      // ── 2. Poll session & steps only if we have a warehouse + database ──
      // Always fetch the LATEST session (no session_id filter) so we
      // automatically pick up new runs.
      if (warehouseId && inspireDatabase) {
        try {
          const sessQ = new URLSearchParams({
            inspire_database: inspireDatabase,
            warehouse_id: warehouseId,
          });
          const sessData = await apiFetch(`/api/inspire/session?${sessQ}`);

          if (sessData.session) {
            const sess = sessData.session;
            const sid = sess.session_id;

            // Detect session change → reset steps and delta pointer
            if (trackedSessionRef.current && trackedSessionRef.current !== String(sid)) {
              setSteps([]);
              lastPollRef.current = null;
            }
            trackedSessionRef.current = String(sid);

            setSession(sess);

            // Poll steps for the current session
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
                  for (const s of stepData.steps) {
                    map.set(s.step_id, s);
                  }
                  return Array.from(map.values()).sort(
                    (a, b) =>
                      (a.last_updated || '').localeCompare(b.last_updated || '')
                  );
                });
                lastPollRef.current =
                  stepData.steps[stepData.steps.length - 1].last_updated;
              }
            } catch {
              // Steps table might not exist yet
            }

            // ACK if status === 'ready'
            if (sess.processing_status === 'ready') {
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

            // Only stop polling when the Databricks run has terminated
            // AND the session confirms completion.
            const runDone =
              !runId ||
              currentRunInfo?.life_cycle_state === 'TERMINATED' ||
              currentRunInfo?.life_cycle_state === 'INTERNAL_ERROR';
            const sessionDone =
              sess.completed_on || sess.completed_percent >= 100;

            if (runDone && sessionDone) {
              setPolling(false);
            }
          }
        } catch {
          // Session table might not exist yet - keep polling
        }
      } else if (!runId) {
        // No run and no warehouse — nothing to poll
        setPolling(false);
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [polling, warehouseId, inspireDatabase, sessionId, runId, apiFetch]); // eslint-disable-line

  // ── Derived display state ──

  // Detect stale session: if session shows completed but the run is still active,
  // the session belongs to a previous run — ignore its progress.
  const isStaleSession =
    session?.completed_on && runPhase !== PHASE_TERMINATED;

  const percent = isStaleSession ? 0 : (session?.completed_percent || 0);

  const isFailed =
    runInfo?.result_state === 'FAILED' ||
    runInfo?.life_cycle_state === 'INTERNAL_ERROR';

  const isComplete =
    !isFailed &&
    !isStaleSession &&
    runPhase === PHASE_TERMINATED &&
    runInfo?.result_state === 'SUCCESS' &&
    (session?.completed_on || percent >= 100);

  const isPending = runPhase === PHASE_PENDING;
  const isRunning = runPhase === PHASE_RUNNING && !isComplete && !isFailed;

  // Compute display status label
  let statusLabel = 'Initializing';
  let statusDetail = '';
  if (isPending) {
    statusLabel = 'Starting';
    statusDetail = 'Provisioning compute resources...';
  } else if (isRunning) {
    statusLabel = 'Running';
    statusDetail = isStaleSession || !session
      ? 'Notebook is initializing...'
      : `${Math.round(percent)}% complete`;
  } else if (isComplete) {
    statusLabel = 'Completed';
    statusDetail = 'Pipeline finished successfully.';
  } else if (isFailed) {
    statusLabel = 'Failed';
    statusDetail = runInfo?.state_message || 'Pipeline execution failed.';
  } else if (runPhase === PHASE_TERMINATED && runInfo?.result_state === 'SUCCESS' && !session?.completed_on) {
    // Run terminated with success but session not yet complete
    statusLabel = 'Finalizing';
    statusDetail = 'Run completed, waiting for results...';
  }

  // Elapsed time
  const elapsed = runInfo?.execution_duration
    ? formatDuration(runInfo.execution_duration)
    : null;

  // Group steps by stage (hide stale steps from old sessions)
  const stages = {};
  if (!isStaleSession) {
    for (const step of steps) {
      const stage = step.stage_name || 'Pipeline';
      if (!stages[stage]) stages[stage] = [];
      stages[stage].push(step);
    }
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

      {/* Run status card */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <StatusIcon
              isPending={isPending}
              isRunning={isRunning}
              isComplete={isComplete}
              isFailed={isFailed}
            />
            <div>
              <span className={`text-sm font-semibold ${
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
            {elapsed && <span className="text-text-tertiary">{elapsed}</span>}
            {runInfo?.life_cycle_state && (
              <span className={`font-mono px-2 py-0.5 rounded font-medium ${
                isComplete
                  ? 'bg-success-bg text-success'
                  : isFailed
                    ? 'bg-error-bg text-error'
                    : isPending
                      ? 'bg-info-bg text-info'
                      : 'bg-db-red-50 text-db-red'
              }`}>
                {isComplete
                  ? 'TERMINATED / SUCCESS'
                  : runInfo.life_cycle_state}
                {!isComplete && runInfo.result_state ? ` / ${runInfo.result_state}` : ''}
              </span>
            )}
            {isRunning && (
              <span className="font-mono text-sm text-text-secondary">
                {Math.round(percent)}%
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-bg rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isComplete
                ? 'bg-success'
                : isFailed
                  ? 'bg-error'
                  : isPending
                    ? 'bg-text-tertiary animate-pulse'
                    : isStaleSession
                      ? 'bg-db-red/40 animate-pulse'
                      : 'bg-db-red progress-glow'
            }`}
                style={{
              width: isComplete
                ? '100%'
                : isPending
                  ? '3%'
                  : isStaleSession
                    ? '15%'
                    : `${Math.max(Math.min(percent, 100), 1)}%`,
                }}
              />
            </div>

        {/* Run name */}
        {runInfo?.run_name && (
          <p className="text-xs text-text-tertiary mt-3">{runInfo.run_name}</p>
        )}
      </div>

      {/* Pending state detail */}
      {isPending && (
        <div className="bg-info-bg border border-info/20 rounded-lg p-5 mb-6 flex items-start gap-3">
          <Clock size={16} className="text-info mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-text-primary">
              Job is queued
            </p>
            <p className="text-xs text-text-secondary mt-1">
              The Databricks cluster is being provisioned. This may take 1-3 minutes
              for serverless, or longer for standard clusters. The progress bar will
              update once the notebook starts executing.
            </p>
          </div>
        </div>
      )}

      {/* Steps timeline */}
      {Object.keys(stages).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(stages).map(([stageName, stageSteps]) => (
            <div
              key={stageName}
              className="bg-surface border border-border rounded-lg overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-border bg-panel flex items-center justify-between">
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  {stageName}
                </h3>
                <span className="text-xs text-text-tertiary">
                  {stageSteps.filter((s) => isStepDone(s.status)).length}/{stageSteps.length} completed
              </span>
              </div>
              <div className="divide-y divide-border-subtle">
                {stageSteps.map((step) => (
                  <StepRow key={step.step_id} step={step} />
                ))}
              </div>
          </div>
          ))}
                    </div>
      ) : isRunning || isPending ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <Loader2
            size={20}
            className="animate-spin text-text-tertiary mx-auto mb-3"
          />
          <p className="text-sm text-text-secondary">
            {isPending
              ? 'Waiting for cluster to start...'
              : 'Waiting for pipeline steps...'}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            Steps will appear here as the notebook executes.
                      </p>
                    </div>
      ) : null}

      {/* Failed state */}
      {isFailed && (
        <div className="mt-6 bg-error-bg border border-error/20 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <XCircle size={18} className="text-error mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Pipeline failed
              </p>
              {runInfo?.state_message && (
                <p className="text-xs text-text-secondary mt-1 font-mono whitespace-pre-wrap">
                  {runInfo.state_message}
                </p>
              )}
              {runInfo?.run_page_url && (
                <a
                  href={runInfo.run_page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-db-red mt-2 hover:underline"
                >
                  View full error in Databricks
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
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
                {elapsed && ` Total execution time: ${elapsed}.`}
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

// ── Sub-components ──

function StatusIcon({ isPending, isRunning, isComplete, isFailed }) {
  if (isComplete)
    return <CheckCircle2 size={18} className="text-success" />;
  if (isFailed)
    return <XCircle size={18} className="text-error" />;
  if (isPending)
    return <Clock size={18} className="text-info" />;
  if (isRunning)
    return <Loader2 size={18} className="animate-spin text-db-red" />;
  return <Play size={18} className="text-text-tertiary" />;
}

// Map notebook status values to display config
function getStepStyle(status) {
  switch (status) {
    case 'ended_success':
      return {
        icon: <CheckCircle2 size={14} className="text-success" />,
        badge: 'bg-success-bg text-success',
        label: 'Success',
      };
    case 'started':
      return {
        icon: <Loader2 size={14} className="animate-spin text-info" />,
        badge: 'bg-info-bg text-info',
        label: 'In Progress',
      };
    case 'ended_warning':
      return {
        icon: <AlertCircle size={14} className="text-warning" />,
        badge: 'bg-warning-bg text-warning',
        label: 'Warning',
      };
    case 'ended_error':
      return {
        icon: <XCircle size={14} className="text-error" />,
        badge: 'bg-error-bg text-error',
        label: 'Error',
      };
    // Fallbacks for any other status values
    case 'completed':
      return {
        icon: <CheckCircle2 size={14} className="text-success" />,
        badge: 'bg-success-bg text-success',
        label: 'Success',
      };
    case 'running':
      return {
        icon: <Loader2 size={14} className="animate-spin text-info" />,
        badge: 'bg-info-bg text-info',
        label: 'Running',
      };
    case 'failed':
    case 'error':
      return {
        icon: <XCircle size={14} className="text-error" />,
        badge: 'bg-error-bg text-error',
        label: 'Failed',
      };
    default:
      return {
        icon: <Clock size={14} className="text-text-tertiary" />,
        badge: 'bg-bg text-text-tertiary',
        label: status || 'Pending',
      };
  }
}

// Check if a step is "done" (for counter)
function isStepDone(status) {
  return status === 'ended_success' || status === 'ended_warning' || status === 'completed';
}

function StepRow({ step }) {
  const style = getStepStyle(step.status);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-subtle transition-smooth">
      {style.icon}
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
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.badge}`}>
          {style.label}
        </span>
      </div>
    </div>
  );
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
