import { useEffect } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Heart, Star } from 'lucide-react';
import DrawerShell from './DrawerShell';
import ImplementStatusBadge from './ImplementStatusBadge';
import { FeedbackChip, StrategyChip } from './UseCaseStrategyDetail';
import { bestOfBestLabel } from '../lib/v130UseCase';
import { belowBarLabelFromUseCase, priorityPillClass, subtitleOfUseCase } from '../lib/useCaseFields';

const typingTarget = (el) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

function ScoreTile({ label, value, hint }) {
  const shown = typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : value || '—';
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2 min-w-0" title={hint || label}>
      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-text-tertiary truncate">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-text-primary truncate">{shown}</div>
    </div>
  );
}

export default function UseCaseDrawer({
  row,
  position = 0,
  total = 0,
  onClose,
  onPrev,
  onNext,
  onToggleFavorite,
  onOpenImplement,
  actions = null,
  children,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (typingTarget(e.target)) return;
      if ((e.key === 'ArrowDown' || e.key === 'j') && onNext) {
        e.preventDefault();
        onNext();
      } else if ((e.key === 'ArrowUp' || e.key === 'k') && onPrev) {
        e.preventDefault();
        onPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, onPrev]);

  if (!row) return null;
  const uc = row.uc || {};
  const v130 = uc._v130 || null;
  const belowBar = belowBarLabelFromUseCase(uc);
  const subtitle = subtitleOfUseCase(uc, row.title);
  const eyebrow = [row.id, row.domain, row.subdomain].filter(Boolean);

  return (
    <DrawerShell
      data-use-case-drawer=""
      label={`Use case details: ${row.title}`}
      closeLabel="Close use case details"
      focusKey={row.key}
      onClose={onClose}
      title={(
        <>
          {eyebrow.length > 0 && (
            <p className="text-[11px] text-text-tertiary truncate">
              {eyebrow.map((part, i) => (
                <span key={part + i} className={i === 0 && row.id ? 'font-mono font-semibold text-text-secondary' : ''}>
                  {i > 0 ? ' · ' : ''}{part}
                </span>
              ))}
            </p>
          )}
          <h2 className="mt-1 text-xl font-bold leading-snug text-text-primary">{row.title}</h2>
          {subtitle && <p className="mt-1 text-sm text-text-secondary leading-snug">{subtitle}</p>}
        </>
      )}
      actions={(
        <>
          {(onPrev || onNext) && total > 1 && (
            <>
              <span className="mr-1 text-[11px] tabular-nums text-text-tertiary">{position + 1} of {total}</span>
              <button type="button" onClick={onPrev} disabled={!onPrev} className="rounded-md p-1.5 text-text-secondary hover:bg-bg-subtle disabled:opacity-40" aria-label="Previous use case" title="Previous (↑)">
                <ChevronUp size={16} />
              </button>
              <button type="button" onClick={onNext} disabled={!onNext} className="rounded-md p-1.5 text-text-secondary hover:bg-bg-subtle disabled:opacity-40" aria-label="Next use case" title="Next (↓)">
                <ChevronDown size={16} />
              </button>
            </>
          )}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-pressed={row.favorite}
              className={`rounded-md p-1.5 hover:bg-bg-subtle ${row.favorite ? 'text-db-red-fg' : 'text-text-tertiary'}`}
              title={row.favorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart size={16} className={row.favorite ? 'fill-current' : ''} />
            </button>
          )}
        </>
      )}
      below={(
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {row.bob && (
              <span className="inline-flex items-center gap-1 rounded-md border border-warning/35 bg-warning-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-warning-fg" title={bestOfBestLabel(row.bob)}>
                <Star size={11} className="fill-current text-warning-fg" />
                Best of Best{row.bob.rank ? ` #${row.bob.rank}` : ''}
              </span>
            )}
            {belowBar && (
              <span className="rounded-md border border-warning/35 bg-warning-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-warning-fg" title={belowBar}>Below bar</span>
            )}
            {row.priority && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityPillClass(row.priority)}`}>{row.priority}</span>
            )}
            {row.technique && (
              <span className="rounded-full border border-border bg-bg-subtle px-2 py-0.5 text-[10px] font-medium text-text-secondary">{row.technique}</span>
            )}
            <span className="rounded-full border border-border bg-bg-subtle px-2 py-0.5 text-[10px] font-medium text-text-secondary">{row.genie}</span>
            <StrategyChip info={v130} />
            <FeedbackChip status={row.feedbackStatus} />
            <ImplementStatusBadge state={row.status} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ScoreTile label="Inspire score" value={row.inspire} hint="Inspire composite score" />
            <ScoreTile label="Value" value={row.value} />
            <ScoreTile label="Feasibility" value={row.feasibility} />
            <ScoreTile label="Quality" value={row.quality} />
          </div>
        </>
      )}
      footer={(actions || (onOpenImplement && row.status?.label)) && (
        <>
          {onOpenImplement && row.status?.label && (
            <button
              type="button"
              onClick={onOpenImplement}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-primary hover:bg-bg-subtle"
            >
              <ExternalLink size={13} />
              Open in Build
            </button>
          )}
          {actions}
        </>
      )}
    >
      {children}
    </DrawerShell>
  );
}
