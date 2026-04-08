import { useState, useEffect, useCallback } from 'react';
import { Rocket, BarChart3, Loader2, AlertCircle, Clock, CheckCircle2, ArrowRight, Sparkles, ChevronRight, ChevronDown, ChevronUp, Trash2, Eye, EyeOff, Target, FileText } from 'lucide-react';
import SessionSparkline from '../components/SessionSparkline';
import MagneticButton from '../components/MagneticButton';
import { SkeletonCard } from '../components/SkeletonLoader';

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

function formatCompletedDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const HIGH_PRIORITIES = new Set(['Ultra High', 'Very High', 'High']);

function getSessionSummary(session) {
  const rj = session.results_json;
  if (!rj) return null;
  // Extract all use cases from results_json
  let useCases = [];
  const domains = new Set();
  if (Array.isArray(rj.domains)) {
    for (const d of rj.domains) {
      if (d.domain_name) domains.add(d.domain_name);
      if (Array.isArray(d.use_cases)) useCases.push(...d.use_cases);
    }
  } else if (Array.isArray(rj.use_cases)) {
    useCases = rj.use_cases;
    for (const uc of useCases) {
      const dom = uc['Business Domain'] || uc.domain || '';
      if (dom) domains.add(dom);
    }
  } else if (Array.isArray(rj)) {
    useCases = rj;
    for (const uc of useCases) {
      const dom = uc['Business Domain'] || uc.domain || '';
      if (dom) domains.add(dom);
    }
  }
  if (useCases.length === 0) return null;
  const highCount = useCases.filter(uc => HIGH_PRIORITIES.has(uc.Priority || uc.priority || '')).length;
  return { total: useCases.length, high: highCount, domains: domains.size, domainNames: [...domains], useCases };
}

export default function ChoosePage({ settings, onNewExperiment, onViewResults }) {
  const { token, databricksHost, warehouseId, inspireDatabase } = settings;
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [expandedQuickView, setExpandedQuickView] = useState(null);

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
      <div className="min-h-[calc(100vh-64px)] flex items-start justify-center pt-12 pb-16 px-6">
        <div className="max-w-3xl w-full space-y-6">
          <div className="text-center space-y-3">
            <div className="skeleton w-40 h-5 mx-auto rounded-full" />
            <div className="skeleton w-64 h-9 mx-auto rounded-lg" />
            <div className="skeleton w-52 h-4 mx-auto rounded" />
          </div>
          <div className="skeleton w-full h-20 rounded-2xl" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (sessions.length === 0 && !error) return null;

  const completedSessions = sessions.filter(s => s.completed_percent >= 100);
  const completedCount = completedSessions.length;
  const inProgressCount = sessions.length - completedCount;

  // Aggregate summary across all completed sessions
  const totalSummary = (() => {
    let totalUc = 0, totalHigh = 0;
    const allDomains = new Set();
    for (const s of completedSessions) {
      const sum = getSessionSummary(s);
      if (sum) {
        totalUc += sum.total;
        totalHigh += sum.high;
        // Collect domain names
        const rj = s.results_json;
        if (Array.isArray(rj?.domains)) {
          for (const d of rj.domains) if (d.domain_name) allDomains.add(d.domain_name);
        }
      }
    }
    return totalUc > 0 ? { total: totalUc, high: totalHigh, domains: allDomains.size } : null;
  })();

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
          {totalSummary && (
            <p className="text-[11px] text-text-tertiary">
              {totalSummary.total} use cases discovered · {totalSummary.high} high priority · {totalSummary.domains} domain{totalSummary.domains !== 1 ? 's' : ''} explored
            </p>
          )}
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
              const isCompleted = session.completed_percent >= 100;
              const summary = isCompleted ? getSessionSummary(session) : null;

              // Build a short text description from domain names and catalog
              const description = (() => {
                const parts = [];
                // Domain names from results_json
                const rj = session.results_json;
                if (rj && Array.isArray(rj.domains)) {
                  const domainNames = rj.domains.map(d => d.domain_name).filter(Boolean);
                  if (domainNames.length > 0) {
                    parts.push(domainNames.length <= 3 ? domainNames.join(', ') : `${domainNames.slice(0, 3).join(', ')} +${domainNames.length - 3} more`);
                  }
                }
                // Catalog info
                const db = session.inspire_database_name || '';
                if (db) parts.push(db.split('.')[0]);
                // Business domains from session config (fallback if no results_json)
                if (parts.length === 0 && session.business_domains) {
                  parts.push(session.business_domains.length > 60 ? session.business_domains.slice(0, 57) + '...' : session.business_domains);
                }
                return parts.join(' · ');
              })();

              const isQuickOpen = expandedQuickView === session.session_id;
              const PRIORITY_COLORS = { 'Ultra High': '#DC2626', 'Very High': '#EA580C', 'High': '#D97706', 'Medium': '#2563EB', 'Low': '#6B7280' };

              return (
                <div
                  key={session.session_id}
                  className={`rounded-xl bg-surface/50 border transition-all duration-200 ${isQuickOpen ? 'border-border-strong' : 'border-border hover:border-[rgba(255,248,237,0.12)]'}`}
                >
                  {/* Main clickable row */}
                  <button
                    onClick={() => onViewResults(session.session_id)}
                    className="group w-full flex items-center gap-4 px-5 py-4 hover:bg-surface transition-all duration-200 text-left rounded-xl"
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
                      {description && (
                        <p className="text-[11px] text-text-secondary truncate mt-0.5">{description}</p>
                      )}
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
                      {summary && (
                        <p className="text-[11px] text-text-secondary mt-1.5">
                          {summary.total} use case{summary.total !== 1 ? 's' : ''}
                          {' · '}{summary.high} high priority
                          {' · '}{summary.domains} domain{summary.domains !== 1 ? 's' : ''}
                          {session.completed_on ? ` · Completed ${formatCompletedDate(session.completed_on)}` : ''}
                        </p>
                      )}
                    </div>

                    {/* Progress / Quick View / Delete / Arrow */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {status === 'running' && (
                        <div className="w-16 h-1.5 rounded-full bg-[rgba(255,248,237,0.06)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#FF8A6B] transition-all duration-500"
                            style={{ width: `${session.completed_percent || 0}%` }}
                          />
                        </div>
                      )}

                      {/* Quick View toggle */}
                      {summary && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedQuickView(isQuickOpen ? null : session.session_id); }}
                          className="px-2.5 py-1.5 text-[10px] font-medium rounded-lg flex items-center gap-1 transition-all border border-border hover:border-[#FF3621]/30 hover:bg-[#FF3621]/5 text-text-tertiary hover:text-[#FF3621]"
                          title="Quick view use cases"
                        >
                          {isQuickOpen ? <><EyeOff size={10} /> Hide</> : <><Eye size={10} /> Quick View</>}
                        </button>
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

                      {!isQuickOpen && <SessionSparkline session={session} />}
                      <ChevronRight size={16} className={`text-text-tertiary transition-all ${isQuickOpen ? 'rotate-90' : 'group-hover:text-text-secondary'}`} />
                    </div>
                  </button>

                  {/* ── Quick View Panel ── */}
                  {isQuickOpen && summary && (
                    <div className="border-t border-border px-5 py-4 space-y-4">
                      {/* Domain chips */}
                      <div className="flex flex-wrap gap-1.5">
                        {summary.domainNames.map((d) => (
                          <span key={d} className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-[#FF3621]/8 text-[#FF3621] border border-[#FF3621]/15">
                            {d}
                          </span>
                        ))}
                      </div>

                      {/* Top use cases list */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Top Use Cases</p>
                        {summary.useCases
                          .sort((a, b) => {
                            const order = ['Ultra High', 'Very High', 'High', 'Medium', 'Low', 'Very Low'];
                            return order.indexOf(a.Priority || a.priority || '') - order.indexOf(b.Priority || b.priority || '');
                          })
                          .slice(0, 8)
                          .map((uc, i) => {
                            const ucName = uc.Name || uc.use_case_name || uc.name || uc.usecase || `Use Case ${i + 1}`;
                            const ucPriority = uc.Priority || uc.priority || '';
                            const ucDomain = uc['Business Domain'] || uc.domain || '';
                            const ucTechnique = uc['Analytics Technique'] || '';
                            const priorityColor = PRIORITY_COLORS[ucPriority] || '#6B7280';
                            return (
                              <div key={uc.No || i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-subtle/50 hover:bg-bg-subtle transition-colors">
                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: priorityColor }} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-medium text-text-primary truncate">{ucName}</p>
                                  <p className="text-[10px] text-text-tertiary truncate">
                                    {ucDomain}{ucTechnique ? ` · ${ucTechnique}` : ''}
                                  </p>
                                </div>
                                {ucPriority && (
                                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${priorityColor}15`, color: priorityColor }}>
                                    {ucPriority}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        {summary.useCases.length > 8 && (
                          <p className="text-[10px] text-text-tertiary text-center pt-1">
                            +{summary.useCases.length - 8} more use cases
                          </p>
                        )}
                      </div>

                      {/* View full results button */}
                      <button
                        onClick={() => onViewResults(session.session_id)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#FF3621]/10 text-[#FF3621] text-[11px] font-semibold hover:bg-[#FF3621]/15 transition-colors"
                      >
                        <BarChart3 size={12} /> View Full Results
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  )}
                </div>
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
