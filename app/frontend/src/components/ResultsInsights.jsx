import { useState } from 'react';
import { ChevronRight, Compass, Eye, Layers, Lock, MessageSquareText } from 'lucide-react';
import { Card } from './ui/card';
import { SidebarItem, SidebarSection } from './results/SidebarSection';
import { STRATEGY_PATH_SEPARATOR, dataAccessSummary, excludedFeedbackText, feedbackLabel, formatBaseline } from '../lib/v130UseCase';

export function SidebarFilterPanel({ title, subtitle, icon, open, onToggle, allLabel, allCount, options, value, onChange }) {
  const selected = options.find((o) => o.value === value);
  const allActive = value === 'all';
  return (
    <SidebarSection
      title={title}
      subtitle={subtitle}
      icon={icon}
      count={options.length}
      open={open}
      onToggle={onToggle}
      activeFilter={allActive ? '' : selected?.label || value}
      activeFilterTitle={selected?.title || selected?.label || value}
    >
      <SidebarItem active={allActive} onClick={() => onChange('all')} label={allLabel} count={allCount} />
      {options.map((o) => {
        const active = value === o.value;
        return (
          <SidebarItem
            key={o.value}
            active={active}
            onClick={() => onChange(active ? 'all' : o.value)}
            title={o.title || o.label}
            depth={o.depth}
            label={o.label}
            meta={`${o.count} use case${o.count !== 1 ? 's' : ''}`}
          />
        );
      })}
    </SidebarSection>
  );
}

function InsightCard({ icon, title, summary, children }) {
  const Icon = icon;
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden shadow-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-muted"
      >
        <Icon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{summary}</p>
        </div>
        <ChevronRight size={16} className={`mt-0.5 shrink-0 text-subtle-foreground transition-transform duration-200 ${open ? 'rotate-90' : ''}`} aria-hidden />
      </button>
      {open && <div className="border-t px-5 py-4 space-y-3">{children}</div>}
    </Card>
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function DataAccessBadge({ results }) {
  const access = dataAccessSummary(results);
  if (!access) return null;
  if (!access.deep) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">
        <Lock size={14} className="mt-0.5 shrink-0 text-success" aria-hidden />
        <span>
          <span className="font-semibold text-text-primary">Standard discovery: no data read.</span> Inspire used table and column
          metadata, metric views, lineage and access counts only.
        </span>
      </div>
    );
  }
  const skipped = Object.entries(access.tablesSkipped);
  return (
    <details className="rounded-xl border bg-card">
      <summary className="flex cursor-pointer items-start gap-2.5 px-4 py-3 text-xs leading-5 text-muted-foreground">
        <Eye size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          <span className="font-semibold text-text-primary">Deep discovery:</span> read aggregates from{' '}
          {plural(access.tablesReadCount, 'table')} in {plural(access.statements, 'statement')}.{' '}
          {access.piiColumnsExcluded > 0 && `${plural(access.piiColumnsExcluded, 'personal column')} counted only. `}
          {access.rowsSentToAi} rows sent to the AI.
        </span>
      </summary>
      <div className="px-4 pb-3 space-y-2">
        {access.tablesRead.length > 0 && (
          <ul className="grid gap-0.5 sm:grid-cols-2">
            {access.tablesRead.map((t) => (
              <li key={t} className="truncate font-mono text-[10px] text-text-secondary" title={t}>{t}</li>
            ))}
          </ul>
        )}
        {skipped.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-text-tertiary">Not read</p>
            <ul className="space-y-0.5">
              {skipped.map(([table, reason]) => (
                <li key={table} className="text-[10px] text-text-tertiary">
                  <span className="font-mono">{table}</span>: {String(reason)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

export function StrategyCoveragePanel({ coverage, onSelectPath, onSelectNotAligned }) {
  if (!coverage || !Array.isArray(coverage.entries)) return null;
  const gaps = Array.isArray(coverage.gaps) ? coverage.gaps : [];
  const gapIds = new Set(gaps.map((g) => g.id));
  const priorities = Array.isArray(coverage.priorities) ? coverage.priorities : [];
  const priorityGaps = new Set(coverage.priority_gaps || []);
  const summary = `${coverage.aligned ?? 0} of ${coverage.use_cases ?? 0} use cases aligned · ${plural(gaps.length, 'gap')}` +
    (priorities.length ? ` · ${priorities.length - priorityGaps.size} of ${priorities.length} priorities covered` : '');
  return (
    <InsightCard icon={Compass} title="Strategy coverage" summary={summary}>
      {coverage.source !== 'customer' && (
        <p className="text-[10px] text-text-tertiary">No strategy was given, so Inspire used its built-in goals.</p>
      )}
      <ul className="space-y-0.5">
        {coverage.entries.map((e) => {
          const parts = String(e.path || '').split(STRATEGY_PATH_SEPARATOR);
          const isGap = gapIds.has(e.id);
          const count = Number(e.use_cases) || 0;
          return (
            <li key={e.id} style={{ paddingLeft: `${(parts.length - 1) * 0.9}rem` }} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!count || !onSelectPath}
                onClick={() => onSelectPath?.(e.path)}
                title={e.path}
                className="min-w-0 flex-1 truncate text-left text-[11px] text-text-primary enabled:hover:underline disabled:cursor-default"
              >
                {parts[parts.length - 1]}
                {e.level && <span className="ml-1 text-[9px] text-text-tertiary"> {e.level}</span>}
              </button>
              {isGap && (
                <span
                  className="shrink-0 rounded border border-warning/35 bg-warning-bg px-1.5 py-0.5 text-[9px] font-semibold text-warning"
                  title={gaps.find((g) => g.id === e.id)?.reason || ''}
                >
                  Gap
                </span>
              )}
              <span className={`shrink-0 font-mono text-[10px] ${count ? 'text-text-secondary' : 'text-text-tertiary'}`}>{count}</span>
            </li>
          );
        })}
      </ul>
      {gaps.length > 0 && (
        <p className="text-[10px] text-text-tertiary">{gaps[0].reason}. A gap is never filled with a made-up use case.</p>
      )}
      {(coverage.not_aligned ?? 0) > 0 && (
        <button type="button" onClick={onSelectNotAligned} className="text-xs font-medium text-foreground underline-offset-4 hover:underline">
          {plural(coverage.not_aligned, 'use case')} not aligned to any entry
        </button>
      )}
      {priorities.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary mb-1">Business priorities</p>
          <ul className="space-y-0.5">
            {priorities.map((p) => (
              <li key={p.priority} className="flex items-center gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-text-primary" title={p.priority}>{p.priority}</span>
                {priorityGaps.has(p.priority) && (
                  <span className="shrink-0 rounded border border-warning/35 bg-warning-bg px-1.5 py-0.5 text-[9px] font-semibold text-warning">Gap</span>
                )}
                <span className="shrink-0 font-mono text-[10px] text-text-secondary">{p.use_cases}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </InsightCard>
  );
}

export function FoundationsPanel({ foundations, deliveryOrder, nameById }) {
  if (!Array.isArray(foundations)) return null;
  const unlocked = new Set(foundations.flatMap((f) => f.use_cases || [])).size;
  const name = (id) => nameById.get(String(id)) || String(id);
  const order = Array.isArray(deliveryOrder) ? deliveryOrder : [];
  return (
    <InsightCard
      icon={Layers}
      title="Data foundations"
      summary={foundations.length
        ? `${plural(foundations.length, 'shared foundation')} · ${plural(unlocked, 'use case')} build on them`
        : 'No table is shared by two or more use cases'}
    >
      {foundations.map((f) => (
        <div key={f.id} className="rounded-lg border border-border bg-bg p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold text-text-primary">{f.id} · {f.name}</span>
            <span className="shrink-0 text-[10px] text-text-tertiary">{plural(f.use_case_count ?? (f.use_cases || []).length, 'use case')}</span>
          </div>
          <p className="mt-1 font-mono text-[10px] text-text-secondary break-all">{(f.tables || []).join(', ')}</p>
          {(f.joins || []).map((j) => (
            <p key={`${j.left}=${j.right}`} className="font-mono text-[10px] text-text-tertiary break-all">
              {j.left} = {j.right} <span className="font-sans">({j.source})</span>
            </p>
          ))}
          <p className="mt-1 text-[10px] text-text-secondary">{(f.use_cases || []).map(name).join(' · ')}</p>
        </div>
      ))}
      {order.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary mb-1">Suggested build order</p>
          <ol className="list-decimal pl-5 space-y-0.5 text-[11px] text-text-secondary">
            {order.map((id) => <li key={id}>{name(id)}</li>)}
          </ol>
          <p className="mt-1 text-[10px] text-text-tertiary">Ordered by shared foundation, then Inspire Score. The pace is yours to set.</p>
        </div>
      )}
    </InsightCard>
  );
}

function valueText(point) {
  return point && point.value != null && Number.isFinite(Number(point.value)) ? formatBaseline(point.value) : '—';
}

export function FeedbackPanel({ results, feedback }) {
  const excluded = Array.isArray(results?.excluded_by_feedback) ? results.excluded_by_feedback : [];
  const snapshot = Array.isArray(results?.portfolio_history) ? results.portfolio_history : [];
  const tracking = Array.isArray(results?.value_tracking) ? results.value_tracking : [];
  const live = feedback?.available ? feedback.latest || [] : null;
  const history = live || snapshot;
  if (!excluded.length && !history.length && !tracking.length && feedback?.available !== false) return null;
  return (
    <InsightCard
      icon={MessageSquareText}
      title="Feedback and value"
      summary={`${excluded.length} hidden by feedback · ${plural(history.length, 'use case')} with feedback · ${plural(tracking.length, 'KPI')} tracked`}
    >
      {feedback?.available === false && (
        <p className="text-[10px] text-text-tertiary">{feedback.message || 'Feedback becomes available after a v1.3.0 run.'}</p>
      )}
      {excluded.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary mb-1">Hidden by feedback</p>
          <ul className="space-y-0.5">
            {excluded.map((e, index) => (
              <li key={`${e.use_case_key}|${e.use_case_id ?? index}`} className="text-[11px] text-text-secondary">
                {excludedFeedbackText(e)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {history.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary mb-1">
            {live ? 'Latest feedback' : 'Feedback at the time of this run'}
          </p>
          <ul className="space-y-0.5">
            {history.map((h) => (
              <li key={h.use_case_key} className="flex items-baseline gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-text-primary" title={h.use_case_title || h.title}>{h.use_case_title || h.title}</span>
                <span className="shrink-0 text-text-secondary">{feedbackLabel(h.status)}</span>
                <span className="shrink-0 font-mono text-[9px] text-text-tertiary">{String(h.updated_at || '').slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tracking.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary mb-1">Value of implemented use cases</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-[9px] uppercase tracking-[0.14em] text-text-tertiary">
                  <th className="py-1 pr-2 font-semibold">Use case</th>
                  <th className="py-1 pr-2 font-semibold">KPI</th>
                  <th className="py-1 pr-2 font-semibold">Baseline</th>
                  <th className="py-1 pr-2 font-semibold">Now</th>
                  <th className="py-1 font-semibold">Change</th>
                </tr>
              </thead>
              <tbody>
                {tracking.map((t, i) => (
                  <tr key={`${t.use_case_key}-${i}`} className="border-t border-border align-top">
                    <td className="py-1 pr-2 text-text-primary">{t.title}</td>
                    <td className="py-1 pr-2 text-text-secondary">{t.kpi}</td>
                    <td className="py-1 pr-2 font-mono text-text-secondary">{valueText(t.baseline)}</td>
                    <td className="py-1 pr-2 font-mono text-text-secondary">
                      {t.status === 'measured' ? valueText(t.current) : t.status === 'query_only' ? 'Query only' : 'Unavailable'}
                    </td>
                    <td className="py-1 font-mono text-text-secondary">
                      {t.change != null && Number.isFinite(Number(t.change)) ? formatBaseline(t.change) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tracking.some((t) => t.status === 'query_only' && t.query) && (
            <div className="mt-2 space-y-1">
              <p className="text-[10px] text-text-tertiary">A Standard run never reads data. Run these queries to measure the KPIs now.</p>
              {tracking.filter((t) => t.status === 'query_only' && t.query).map((t, i) => (
                <details key={`${t.use_case_key}-q-${i}`} className="rounded border border-border bg-bg">
                  <summary className="cursor-pointer px-2 py-1 text-[10px] text-text-secondary">{t.title}: {t.kpi}</summary>
                  <pre className="overflow-x-auto px-2 pb-2 font-mono text-[10px] text-text-primary whitespace-pre-wrap">{t.query}</pre>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </InsightCard>
  );
}
