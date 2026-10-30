const TONE = {
  success: 'text-success-fg border-success/35 bg-success-bg',
  warning: 'text-warning-fg border-warning/35 bg-warning-bg',
  error: 'text-error-fg border-error/30 bg-error-bg',
  busy: 'text-db-red-fg border-db-red/30 bg-db-red-50',
  idle: 'text-text-secondary border-border bg-bg-subtle',
};

export default function ImplementStatusBadge({ state, className = '' }) {
  if (!state?.label) return null;
  return (
    <span
      data-implement-status={state.group || ''}
      className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.14em] px-2 py-1 rounded-md border leading-none ${TONE[state.tone] || TONE.idle} ${className}`}
    >
      {state.tone === 'busy' && <span className="mr-1.5 w-1.5 h-1.5 rounded-full bg-db-red-fg motion-safe:animate-pulse" aria-hidden />}
      {state.label}
    </span>
  );
}
