import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  bestOfBestLabel,
  dataSignalLine,
  feedbackLabel,
  kpiSource,
  kpiText,
  matchRateText,
  priorityMatches,
} from '../lib/v130UseCase';

function Section({ title, tone, children }) {
  return (
    <div>
      <h4 className={`text-[10px] font-bold ${tone} uppercase tracking-[0.18em] mb-1`}>{title}</h4>
      {children}
    </div>
  );
}

const SIGNAL_TONES = { passed: 'text-success-fg', warning: 'text-warning-fg', neutral: 'text-text-tertiary' };

function Bullets({ items }) {
  return (
    <ul className="list-disc pl-4 space-y-0.5 text-sm text-text-secondary leading-relaxed">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

export function StrategyChip({ info }) {
  if (!info?.hasStrategyData) return null;
  if (!info.paths.length) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-bg text-text-tertiary font-medium">Not aligned</span>
    );
  }
  const extra = info.paths.length - 1;
  return (
    <span
      className="max-w-[22rem] truncate text-[10px] px-2 py-0.5 rounded-full border border-db-red/20 bg-db-red-50 text-db-red-fg font-medium"
      title={info.paths.join('\n')}
    >
      {info.paths[0]}{extra > 0 ? ` +${extra}` : ''}
    </span>
  );
}

export function FeedbackChip({ status }) {
  const label = feedbackLabel(status);
  if (!label) return null;
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full border border-success/30 bg-success-bg text-success-fg font-medium">{label}</span>
  );
}

export function BestOfBestDetail({ info }) {
  const star = info?.bestOfBest;
  if (!star && !info?.notStarredReason) return null;
  return (
    <div className={`rounded-lg border p-4 ${star ? 'border-warning/30 bg-warning-bg' : 'border-border bg-bg'}`}>
      <Section title={star ? bestOfBestLabel(star) : 'Not starred as Best of Best'} tone={star ? 'text-warning-fg' : 'text-text-tertiary'}>
        <p className="text-sm text-text-secondary leading-relaxed">{star ? star.reason || 'Passed every elite test.' : info.notStarredReason}</p>
      </Section>
    </div>
  );
}

export function UseCaseStrategyDetail({ info, knownPriorities, foundationsById }) {
  if (!info || (!info.hasStrategyData && !info.hasValue && !info.dataEvidence && !info.foundations.length)) return null;
  const priorities = priorityMatches(info.priorityText, knownPriorities);
  const evidenceTables = info.dataEvidence ? Object.entries(info.dataEvidence.tables) : [];
  const evidenceJoins = info.dataEvidence ? info.dataEvidence.joins : [];
  const signal = info.dataEvidence ? dataSignalLine(info.dataEvidence.signal) : null;
  return (
    <div className="space-y-4 rounded-lg border border-border bg-bg p-4">
      {info.hasStrategyData && (
        <Section title="Strategy alignment" tone="text-db-red-fg">
          {info.alignments.length > 0 ? (
            <div className="space-y-1.5">
              {info.alignments.map((a) => (
                <div key={a.id || a.path}>
                  <p className="text-sm font-semibold text-text-primary">{a.path}</p>
                  {a.evidence && <p className="text-xs text-text-secondary leading-relaxed">{a.evidence}</p>}
                </div>
              ))}
            </div>
          ) : info.paths.length > 0 ? (
            <Bullets items={info.paths} />
          ) : (
            <p className="text-sm text-text-tertiary">
              Not aligned to any strategy entry. It was found in your data and stays in the catalog on its own merit.
            </p>
          )}
          {priorities.length > 0 && (
            <p className="mt-1.5 text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">Business priorities:</span> {priorities.join('; ')}
            </p>
          )}
        </Section>
      )}
      {info.kpis.length > 0 && (
        <Section title="KPIs" tone="text-info-fg">
          <ul className="space-y-1.5">
            {info.kpis.map((k, i) => (
              <li key={`${k.name}-${i}`}>
                <span className="text-sm text-text-primary">{kpiText(k)}</span>
                {kpiSource(k) && <span className="block font-mono text-[10px] text-text-tertiary">{kpiSource(k)}</span>}
                {!k.baseline && k.computable && (
                  <span className="block text-[10px] text-text-tertiary">No baseline measured yet. The query measures it.</span>
                )}
                {k.query && (
                  <details className="mt-0.5">
                    <summary className="cursor-pointer text-[10px] text-text-tertiary hover:text-db-red-fg">KPI query</summary>
                    <pre className="mt-1 overflow-x-auto rounded border border-border bg-panel p-2 font-mono text-[10px] text-text-primary whitespace-pre-wrap">{k.query}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {info.keyResults.length > 0 && (
        <Section title="Expected key results" tone="text-success-fg">
          <ul className="space-y-1">
            {info.keyResults.map((kr, i) => (
              <li key={`${kr.id || 'p'}-${i}`} className="text-sm text-text-secondary leading-relaxed">
                {kr.statement}{' '}
                <span className="ml-1 rounded border border-border px-1.5 py-0.5 align-middle text-[9px] font-semibold text-text-tertiary">
                  {kr.source === 'strategy' ? 'From your strategy' : 'Proposed'}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {info.measures.length > 0 && (
        <Section title="Measures of success" tone="text-warning-fg">
          <Bullets items={info.measures} />
        </Section>
      )}
      {(info.financial.length > 0 || info.nonFinancial.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {info.financial.length > 0 && (
            <Section title="Financial benefits" tone="text-success-fg"><Bullets items={info.financial} /></Section>
          )}
          {info.nonFinancial.length > 0 && (
            <Section title="Non-financial benefits" tone="text-info-fg"><Bullets items={info.nonFinancial} /></Section>
          )}
        </div>
      )}
      {info.dataEvidence && (
        <Section title="Data evidence" tone="text-text-secondary">
          {signal && (
            <p data-testid="data-signal" className="mb-1 text-xs leading-relaxed text-text-secondary">
              <span className={`font-semibold ${SIGNAL_TONES[signal.tone]}`}>{signal.label}</span>
              {signal.text && `: ${signal.text}`}
            </p>
          )}
          <ul className="space-y-0.5 text-[11px] text-text-secondary">
            {evidenceTables.map(([table, t]) => (
              <li key={table}>
                <span className="font-mono">{table}</span>
                {t?.rows != null && `: ${Number(t.rows).toLocaleString('en-US')} rows${t.sampled ? ' (sampled)' : ''}`}
                {Object.entries(t?.date_ranges || {}).map(([column, range]) => (
                  <span key={column} className="block pl-3 text-[10px] text-text-tertiary">
                    {column}: {range.min} to {range.max}
                  </span>
                ))}
              </li>
            ))}
            {evidenceJoins.map((j, i) => (
              <li key={`j-${i}`} className="font-mono text-[10px]">
                {j.child_table}.{j.child_column} → {j.parent_table}.{j.parent_column}
                {matchRateText(j.rate) && <span className="font-sans">: {matchRateText(j.rate)} of rows match</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {info.foundations.length > 0 && (
        <Section title="Data foundations" tone="text-text-secondary">
          <div className="flex flex-wrap gap-1.5">
            {info.foundations.map((id) => {
              const f = foundationsById?.get(id);
              return (
                <span key={id} title={(f?.tables || []).join(', ')} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] text-text-secondary">
                  {id}{f?.name ? ` · ${f.name}` : ''}
                </span>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

const FEEDBACK_BUTTONS = ['accepted', 'planned', 'implemented'];

export function FeedbackControls({ useCaseKey, available, current, busy, error, onSubmit }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  if (!useCaseKey || available !== true) return null;
  const status = String(current?.status || '').toLowerCase();
  const pill = (active) =>
    `px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-smooth disabled:opacity-50 ${
      active ? 'border-db-red/30 bg-db-red-50 text-db-red-fg' : 'border-border bg-surface text-text-secondary hover:border-border-strong'
    }`;
  return (
    <div className="rounded-lg border border-border bg-bg p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Your feedback</span>
        {FEEDBACK_BUTTONS.map((s) => (
          <button key={s} type="button" disabled={busy} onClick={() => onSubmit(s, '')} className={pill(status === s)}>
            {feedbackLabel(s)}
          </button>
        ))}
        <button type="button" disabled={busy} onClick={() => setRejecting((r) => !r)} className={pill(status === 'rejected' || rejecting)}>
          Reject
        </button>
        {busy && <Loader2 size={13} className="animate-spin text-text-tertiary" aria-hidden />}
        {current && (
          <span className="text-[10px] text-text-tertiary">
            Last: {feedbackLabel(status)}
            {current.updated_at ? ` on ${String(current.updated_at).slice(0, 10)}` : ''}
            {current.updated_by ? ` by ${current.updated_by}` : ''}
          </span>
        )}
      </div>
      {rejecting && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            type="text"
            value={reason}
            maxLength={2000}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this not useful? (optional)"
            className="min-w-[14rem] flex-1 px-2.5 py-1.5 text-xs border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-db-red/30"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onSubmit('rejected', reason);
              setRejecting(false);
              setReason('');
            }}
            className={pill(true)}
          >
            Reject use case
          </button>
        </div>
      )}
      <p className="mt-2 text-[10px] text-text-tertiary leading-snug">
        A rejected use case is left out of this business&apos;s next runs. For an implemented one, the next run tracks its KPIs against the baseline.
      </p>
      {error && <p className="mt-1 text-[11px] text-error-fg">{error}</p>}
    </div>
  );
}
