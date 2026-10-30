import { AlertTriangle, Check, CheckCircle2, Circle, Loader2, Minus, X, XCircle } from 'lucide-react';
import GenieLogo from './GenieLogo';
import { IconChip, PANEL_CLASS, SectionTitle } from './BuildUi';
import { stagesRecorded } from '../lib/mvpProgress';

const STAGE_LOOK = {
  done: { Icon: Check, node: 'bg-success-bg text-success-fg ring-1 ring-inset ring-success/40', words: 'done' },
  warning: { Icon: AlertTriangle, node: 'bg-warning-bg text-warning-fg ring-1 ring-inset ring-warning/40', words: 'done with warnings' },
  error: { Icon: X, node: 'bg-error-solid text-white', words: 'failed' },
  running: { Icon: Loader2, node: 'bg-db-red-solid text-white', words: 'in progress', live: true },
  next: { Icon: Loader2, node: 'bg-db-red-solid text-white', words: 'starting', live: true },
  waiting: { Icon: Circle, node: 'bg-bg-subtle text-text-tertiary ring-1 ring-inset ring-border', words: 'not started' },
  not_reached: { Icon: Circle, node: 'bg-bg-subtle text-text-tertiary ring-1 ring-inset ring-border', words: 'not reached' },
  skipped: { Icon: Minus, node: 'bg-transparent text-text-tertiary border border-dashed border-border-strong', words: 'not needed this version' },
};

const BAR_TONE = {
  busy: 'bg-gradient-to-r from-db-red-solid to-db-red',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  idle: 'bg-text-tertiary',
};

const STATUS_CHIP = {
  success: { icon: CheckCircle2, tone: 'success' },
  warning: { icon: AlertTriangle, tone: 'warning' },
  error: { icon: XCircle, tone: 'error' },
};

function StatusMark({ active, tone }) {
  if (active) {
    return (
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-db-red/30 motion-safe:animate-ping" aria-hidden />
        <span className="relative h-10 w-10 rounded-full bg-db-red-50 ring-1 ring-inset ring-db-red/30 text-db-red-fg flex items-center justify-center" aria-hidden>
          <GenieLogo size={20} />
        </span>
      </span>
    );
  }
  const look = STATUS_CHIP[tone] || { icon: GenieLogo, tone: 'idle' };
  return <IconChip icon={look.icon} tone={look.tone} size="lg" />;
}

function StageNodes({ stages }) {
  return (
    <ol aria-label="Build stages" className="flex items-start w-full">
      {stages.map((stage, i) => {
        const look = STAGE_LOOK[stage.state] || STAGE_LOOK.waiting;
        const { Icon } = look;
        const settled = stage.state === 'done' || stage.state === 'warning';
        return (
          <li key={stage.id} data-stage-state={stage.state} className="relative flex-1 min-w-0 flex flex-col items-center">
            {i < stages.length - 1 && (
              <span className={`absolute top-4 left-1/2 w-full h-0.5 ${settled ? 'bg-success/70' : 'bg-border'}`} aria-hidden />
            )}
            <span className="relative z-10 flex items-center justify-center" aria-hidden>
              {look.live && <span className="absolute inset-0 rounded-full bg-db-red/40 motion-safe:animate-ping" />}
              <span className={`relative h-8 w-8 rounded-full flex items-center justify-center ${look.node}`}>
                <Icon size={14} className={look.live ? 'motion-safe:animate-spin' : ''} />
              </span>
            </span>
            <span className={`mt-2 px-1 text-center text-[11px] font-semibold leading-tight ${look.live ? 'text-db-red-fg' : 'text-text-secondary'}`}>
              {stage.label}
            </span>
            {stage.elapsed && <span className="text-[10px] tabular-nums text-text-tertiary">{stage.elapsed}</span>}
            <span className="sr-only">: {look.words}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function MvpProgress({ stages, summary, chip, reason, toneClass, version, children }) {
  const percent = chip?.tone === 'success' || chip?.tone === 'warning' ? 100 : summary.percent;
  const bar = BAR_TONE[chip?.tone] || BAR_TONE.idle;
  const headline = summary.headline || chip?.label || '';
  return (
    <section aria-label="MVP progress" className={PANEL_CLASS} data-mvp-progress="">
      <SectionTitle
        icon={GenieLogo}
        title={`Live build${version ? ` · v${version}` : ''}`}
        hint="Genie Code builds every piece, Inspire checks each one"
        right={(
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums text-text-primary leading-none">{percent}%</div>
            {summary.span && <div className="mt-1 text-[10px] tabular-nums text-text-secondary">{summary.span}</div>}
          </div>
        )}
      />
      <div className="px-5 py-4 space-y-4 border-b border-border">
        <div className="flex items-center gap-3">
          <StatusMark active={summary.active} tone={chip?.tone} />
          <div className="min-w-0">
            {summary.headline && chip?.label && (
              <p className="text-[11px] font-semibold text-db-red-fg">{chip.label}</p>
            )}
            <p className={`text-[15px] font-semibold ${summary.headline ? 'text-text-primary' : toneClass(chip?.tone)}`}>{headline}</p>
            {summary.detail && <p className="text-[12px] text-text-secondary">{summary.detail}</p>}
            {reason && <p className={`text-[12px] ${toneClass(chip?.tone)}`}>{reason}</p>}
          </div>
        </div>
        <div
          className="relative h-2.5 rounded-full bg-bg-subtle overflow-hidden"
          role="progressbar"
          aria-label="Build progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className={`relative h-full rounded-full overflow-hidden ${bar} transition-[width] duration-700 ease-out`}
            style={{ width: `${Math.max(percent, summary.active ? 4 : 0)}%` }}
          >
            {summary.active && (
              <span
                className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent motion-safe:animate-[shimmer_1.8s_ease-in-out_infinite]"
                aria-hidden
              />
            )}
          </div>
        </div>
        {stagesRecorded(stages) && (
          <div className="pt-1">
            <StageNodes stages={stages} />
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
