import { useState, useEffect, useCallback } from 'react';
import { Rocket, BarChart3, Loader2, AlertCircle, Clock, CheckCircle2, ArrowRight, Sparkles, ChevronRight, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

const STATUS_CONFIG = {
  completed: { label: 'Completed', bg: 'bg-[#27AE60]/10', text: 'text-[#27AE60]', dot: 'bg-[#27AE60]' },
  running:   { label: 'In Progress', bg: 'bg-[#FF8A6B]/10', text: 'text-[#FF8A6B]', dot: 'bg-[#FF8A6B]' },
  failed:    { label: 'Failed', bg: 'bg-[#E74C3C]/10', text: 'text-[#E74C3C]', dot: 'bg-[#E74C3C]' },
};

function getStatus(session) {
  if (session.completed_percent >= 100) return 'completed';
  if (session.processing_status === 'FAILED') return 'failed';
  return 'running';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 1) return `${Math.max(1, Math.round(diffMs / 60000))}m ago`;
  if (diffH < 24) return `${Math.round(diffH)}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ChoosePage({ settings, onNewExperiment, onViewResults }) {
  const { token, databricksHost, warehouseId, inspireDatabase } = settings;
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const deleteSession = useCallback(async (sessionId) => {
    if (!token || !inspireDatabase || !warehouseId) return;
    setDeleting(sessionId);
    try {
      const headers = { Authorization: `Bearer ${token}`, 'X-DB-PAT-Token': token };
      if (databricksHost) headers['X-Databricks-Host'] = databricksHost;
      const q = new URLSearchParams({ inspire_database: inspireDatabase, warehouse_id: warehouseId, session_id: String(sessionId) });
      const resp = await fetch(`/api/inspire/session?${q}`, { method: 'DELETE', headers });
      if (resp.ok) {
        setSessions(prev => prev.filter(s => s.session_id !== sessionId));
      }
    } catch { /* silent */ }
    setDeleting(null);
    setConfirmDelete(null);
  }, [token, databricksHost, warehouseId, inspireDatabase]);

  useEffect(() => {
    if (!token || !inspireDatabase || !warehouseId) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const headers = { Authorization: `Bearer ${token}`, 'X-DB-PAT-Token': token };
        if (databricksHost) headers['X-Databricks-Host'] = databricksHost;
        const q = new URLSearchParams({ inspire_database: inspireDatabase, warehouse_id: warehouseId });
        const resp = await fetch(`/api/inspire/sessions?${q}`, { headers });
        if (resp.ok) {
          const data = await resp.json();
          setSessions(data.sessions || []);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, databricksHost, warehouseId, inspireDatabase]);

  // Auto-redirect to launch if no sessions
  useEffect(() => {
    if (!loading && sessions.length === 0 && !error) {
      onNewExperiment();
    }
  }, [loading, sessions, error, onNewExperiment]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full bg-[#FF3621]/20 blur-xl animate-pulse" />
            <Loader2 className="relative w-10 h-10 animate-spin text-[#FF3621] mx-auto mt-3" />
          </div>
          <p className="text-sm text-text-secondary">Discovering your experiments...</p>
        </div>
      </div>
    );
  }

  if (sessions.length === 0 && !error) return null;

  const completedCount = sessions.filter(s => s.completed_percent >= 100).length;
  const inProgressCount = sessions.length - completedCount;

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-start justify-center pt-12 pb-16 px-6 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-[-15%] left-[-5%] w-[40%] h-[40%] rounded-full bg-[#FF3621]/[0.03] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[35%] h-[35%] rounded-full bg-[#FF6B50]/[0.02] blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl w-full space-y-8">

        {/* ── Header ── */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[rgba(255,248,237,0.04)] border border-[rgba(255,248,237,0.08)] rounded-full">
            <Sparkles size={12} className="text-[#FF3621]" />
            <span className="text-[11px] font-medium text-text-secondary">
              {completedCount} completed{inProgressCount > 0 ? ` · ${inProgressCount} in progress` : ''}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em]">
            Welcome back
          </h1>
          <p className="text-sm text-text-secondary max-w-md mx-auto">
            Pick up where you left off or start a fresh experiment.
          </p>
        </div>

        {/* ── New Experiment CTA ── */}
        <button
          onClick={onNewExperiment}
          className="group w-full flex items-center gap-5 px-6 py-5 rounded-2xl border border-[#FF3621]/20 bg-gradient-to-r from-[#FF3621]/[0.06] to-transparent hover:from-[#FF3621]/[0.12] hover:border-[#FF3621]/40 transition-all duration-300"
          style={{ boxShadow: '0 0 40px rgba(255,54,33,0.04)' }}
        >
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#FF3621]/10 flex items-center justify-center group-hover:bg-[#FF3621]/20 transition-colors">
            <Rocket size={22} className="text-[#FF3621]" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-text-primary">New Experiment</p>
            <p className="text-xs text-text-secondary mt-0.5">Launch a new Inspire AI use case generation</p>
          </div>
          <ArrowRight size={18} className="text-text-tertiary group-hover:text-[#FF3621] group-hover:translate-x-1 transition-all" />
        </button>

        {/* ── Previous Experiments ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-[0.1em]">Previous Experiments</h2>
            <button
              onClick={() => onViewResults(null)}
              className="text-[11px] text-text-tertiary hover:text-[#FF3621] transition-colors flex items-center gap-1"
            >
              View all <ChevronRight size={12} />
            </button>
          </div>

          <div className="space-y-2">
            {(showAll ? sessions : sessions.slice(0, 5)).map((session) => {
              const status = getStatus(session);
              const cfg = STATUS_CONFIG[status];
              const name = session.widget_values?.['00_business_name'] || session.business_name || `Session ${session.session_id}`;
              const date = session.completed_on || session.create_at;
              const mode = session.widget_values?.['02_operation_mode'] || session.operation_mode || '';

              return (
                <button
                  key={session.session_id}
                  onClick={() => onViewResults(session.session_id)}
                  className="group w-full flex items-center gap-4 px-5 py-4 rounded-xl bg-surface/50 border border-border hover:border-[rgba(255,248,237,0.12)] hover:bg-surface transition-all duration-200 text-left"
                >
                  {/* Status indicator */}
                  <div className="flex-shrink-0 relative">
                    <div className={`w-10 h-10 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                      {status === 'completed' ? (
                        <CheckCircle2 size={18} className={cfg.text} />
                      ) : status === 'running' ? (
                        <Loader2 size={18} className={`${cfg.text} animate-spin`} />
                      ) : (
                        <AlertCircle size={18} className={cfg.text} />
                      )}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {date && (
                        <span className="flex items-center gap-1 text-[11px] text-text-tertiary">
                          <Clock size={10} />
                          {formatDate(date)}
                        </span>
                      )}
                      {mode && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(255,248,237,0.04)] text-text-tertiary font-mono">
                          {mode}
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>

                  {/* Progress / Delete / Arrow */}
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {status === 'running' && (
                      <div className="w-16 h-1.5 rounded-full bg-[rgba(255,248,237,0.06)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#FF8A6B] transition-all duration-500"
                          style={{ width: `${session.completed_percent || 0}%` }}
                        />
                      </div>
                    )}

                    {/* Delete button */}
                    {confirmDelete === session.session_id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteSession(session.session_id); }}
                          disabled={deleting === session.session_id}
                          className="px-2 py-1 text-[10px] font-medium rounded-md bg-[#E74C3C]/15 text-[#E74C3C] hover:bg-[#E74C3C]/25 transition-colors"
                        >
                          {deleting === session.session_id ? <Loader2 size={10} className="animate-spin" /> : 'Delete'}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                          className="px-2 py-1 text-[10px] font-medium rounded-md bg-[rgba(255,248,237,0.06)] text-text-tertiary hover:text-text-secondary transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(session.session_id); }}
                        className="p-1.5 rounded-lg text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-all"
                        title="Delete experiment"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}

                    <ChevronRight size={16} className="text-text-tertiary group-hover:text-text-secondary transition-colors" />
                  </div>
                </button>
              );
            })}

            {sessions.length > 5 && (
              <button
                onClick={() => setShowAll(prev => !prev)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border hover:border-[rgba(255,248,237,0.15)] text-text-tertiary hover:text-text-secondary transition-all duration-200 text-xs font-medium"
              >
                {showAll ? (
                  <><ChevronUp size={14} /> Show less</>
                ) : (
                  <><ChevronDown size={14} /> Show {sessions.length - 5} more experiment{sessions.length - 5 !== 1 ? 's' : ''}</>
                )}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-yellow-400/80 justify-center pt-2">
            <AlertCircle size={13} />
            <span>Could not load all sessions — you can still launch a new experiment.</span>
          </div>
        )}
      </div>
    </div>
  );
}
