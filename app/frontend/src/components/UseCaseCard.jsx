import { Heart, Star } from 'lucide-react';
import ImplementCardActions from './ImplementCardActions';
import InspireScoreBadge from './InspireScoreBadge';
import UseCaseDetailBody from './UseCaseDetailBody';
import { FeedbackChip, StrategyChip } from './UseCaseStrategyDetail';
import { bestOfBestLabel } from '../lib/v130UseCase';
import {
  belowBarLabelFromUseCase,
  cardTitlesOfUseCase,
  fieldOf,
  inspireScoreFromUc,
  isNumericPriorityString,
  priorityPillClass,
} from '../lib/useCaseFields';

const s = (v) => (v == null ? '' : String(v));

export default function UseCaseCard({
  uc,
  index,
  expanded,
  onToggle,
  isFavorite,
  onToggleFavorite,
  implementStatus = null,
  onImplement,
  onOpenMvp,
  notebookUrl = '',
  v130 = null,
  feedbackCurrent,
  ...detailProps
}) {
  const card = uc && typeof uc === 'object' ? uc : null;
  if (!card) return null;
  const u = card;
  const { title: titlePlain, subtitle: subtitleText } = cardTitlesOfUseCase(u, index);
  const domain = s(u._domain || u['Business Domain'] || u.domain);
  const subdomain = s(u.Subdomain);
  const ucType = s(u.type);
  const technique = s(fieldOf(u, 'Analytics Technique', 'analytics_technique'));
  const priority = s(u.Priority || u.priority);
  const inspireScoreNum = inspireScoreFromUc(u);
  const showPriorityPill = !!(priority && inspireScoreNum == null && !isNumericPriorityString(priority));
  const belowBar = belowBarLabelFromUseCase(u);

  return (
    <div className="bg-surface border border-border/70 rounded-xl overflow-hidden shadow-elevated lift-on-hover hover:border-db-red/25">
      <div className="flex items-center gap-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`pl-3 pr-1 py-4 shrink-0 transition-smooth ${isFavorite ? 'text-db-red-fg' : 'text-text-disabled hover:text-db-red-fg'}`}
          aria-pressed={isFavorite}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart size={16} className={isFavorite ? 'fill-current' : ''} />
        </button>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse use case details' : 'Expand use case details'}
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
          className="flex-1 flex items-center gap-3 px-3 py-4 text-left hover:bg-bg-subtle transition-smooth cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-db-red/25"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h3 className="text-lg sm:text-xl font-bold text-text-primary leading-snug">
                    {titlePlain}
                  </h3>
                  {v130?.bestOfBest && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-md border shrink-0 leading-none text-warning-fg border-warning/35 bg-warning-bg"
                      title={bestOfBestLabel(v130.bestOfBest)}
                    >
                      <Star size={11} className="fill-current text-warning-fg" />
                      Best of Best{v130.bestOfBest.rank ? ` #${v130.bestOfBest.rank}` : ''}
                    </span>
                  )}
                  {belowBar && (
                    <span
                      className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-md border shrink-0 leading-none text-warning-fg border-warning/35 bg-warning-bg"
                      title={belowBar}
                    >
                      Below bar
                    </span>
                  )}
                </div>
                {subtitleText && (
                  <p className="text-xs sm:text-sm text-text-secondary mt-1.5 leading-snug line-clamp-2">
                    {subtitleText}
                  </p>
                )}
              </div>
              <InspireScoreBadge score={inspireScoreNum} />
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <StrategyChip info={v130} />
              <FeedbackChip status={feedbackCurrent?.status || v130?.feedbackStatus} />
              {showPriorityPill && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${priorityPillClass(priority)}`}>
                  {priority}
                </span>
              )}
            </div>
            <div className="text-[10px] text-text-tertiary mt-1.5 leading-snug">
              {[domain || 'Unknown', subdomain, technique || ucType || '—'].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
      </div>

      <ImplementCardActions status={implementStatus} onImplement={onImplement} onOpen={onOpenMvp} notebookUrl={notebookUrl} />

      {expanded && (
        <UseCaseDetailBody
          uc={u}
          active
          className="border-t border-border px-5 py-5 bg-panel space-y-4"
          v130={v130}
          feedbackCurrent={feedbackCurrent}
          {...detailProps}
        />
      )}
    </div>
  );
}
