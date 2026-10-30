import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export function SidebarSection({ title, subtitle, icon: Icon, count, open, onToggle, activeFilter, activeFilterTitle, children }) {
  return (
    <section className="border-b last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted outline-none focus-visible:bg-muted"
      >
        {Icon && <Icon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {count != null && (
              <span className="rounded bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
            )}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          {!open && activeFilter && (
            <p className="mt-1 truncate text-xs font-medium text-foreground" title={activeFilterTitle || activeFilter}>
              Filter: {activeFilter}
            </p>
          )}
        </div>
        <ChevronRight
          size={16}
          className={cn('mt-0.5 shrink-0 text-subtle-foreground transition-transform duration-200', open && 'rotate-90')}
          aria-hidden
        />
      </button>
      {open && <div className="space-y-0.5 px-2 pb-3">{children}</div>}
    </section>
  );
}

export function SidebarItem({ active, onClick, label, meta, count, title, depth = 0, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      style={depth ? { paddingLeft: `${0.5 + depth * 0.75}rem` } : undefined}
      className={cn(
        'relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        className,
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-foreground" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', active ? 'font-medium' : '')}>{label}</span>
        {meta && <span className="mt-0.5 block truncate text-xs text-subtle-foreground">{meta}</span>}
      </span>
      {count != null && <span className="shrink-0 text-xs tabular-nums text-subtle-foreground">{count}</span>}
    </button>
  );
}
