export const PANEL_CLASS = 'bg-surface border border-border/70 rounded-xl shadow-elevated overflow-hidden';

const CHIP_TONE = {
  red: 'bg-db-red/10 ring-db-red/20 text-db-red-fg',
  success: 'bg-success/10 ring-success/20 text-success-fg',
  warning: 'bg-warning/10 ring-warning/25 text-warning-fg',
  error: 'bg-error/10 ring-error/20 text-error-fg',
  idle: 'bg-bg-subtle ring-border text-text-tertiary',
};

const CHIP_SIZE = {
  sm: { box: 'h-6 w-6 rounded-md', icon: 12 },
  md: { box: 'h-8 w-8 rounded-lg', icon: 15 },
  lg: { box: 'h-10 w-10 rounded-xl', icon: 18 },
};

export function IconChip({ icon, tone = 'red', size = 'md' }) {
  const Icon = icon;
  const look = CHIP_SIZE[size] || CHIP_SIZE.md;
  return (
    <span className={`flex shrink-0 items-center justify-center ring-1 ring-inset ${look.box} ${CHIP_TONE[tone] || CHIP_TONE.idle}`} aria-hidden>
      <Icon size={look.icon} />
    </span>
  );
}

export function SectionTitle({ icon, title, hint, right, as = 'h3' }) {
  const Heading = as;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-gradient-to-r from-db-red-50 to-surface">
      <div className="flex items-center gap-2.5 min-w-0">
        <IconChip icon={icon} size="sm" />
        <div className="min-w-0">
          <Heading className="text-[11px] font-semibold uppercase tracking-[0.18em] text-db-red-fg">{title}</Heading>
          {hint && <p className="text-[11px] text-text-secondary">{hint}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

const COUNTER_TONE = { plain: 'text-text-primary', red: 'text-db-red-fg', success: 'text-success-fg', error: 'text-error-fg' };

export function Counter({ value, label, tone = 'plain' }) {
  return (
    <div className="text-center px-1">
      <div className={`text-2xl font-bold tabular-nums tracking-tight ${COUNTER_TONE[tone] || COUNTER_TONE.plain}`}>{value}</div>
      <div className="text-[9px] text-text-tertiary uppercase tracking-[0.18em] font-semibold whitespace-nowrap">{label}</div>
    </div>
  );
}

export function CounterDivider() {
  return <div className="w-px h-9 bg-border" aria-hidden />;
}
