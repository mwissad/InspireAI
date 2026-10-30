import { Search, X } from 'lucide-react';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';

export function FilterToolbar({ searchValue, onSearchChange, searchPlaceholder, actions, leading, children, footer, sticky = false }) {
  return (
    <div className={sticky ? 'sticky top-14 z-20 -mt-3 bg-background pt-3' : ''}>
      <Card className="shadow-none">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="pl-9"
            />
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {(leading || children) && (
          <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
            {leading}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>
          </div>
        )}
        {footer}
      </Card>
    </div>
  );
}

export function ToolbarGroup({ children, label }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 rounded-md border bg-card p-0.5">
      {children}
    </div>
  );
}

export function ToggleChip({ pressed, onClick, title, children, size = 'default', className }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&_svg]:shrink-0',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm',
        pressed
          ? 'border-foreground bg-foreground text-background'
          : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SegmentButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-[5px] px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
        active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function FilterChip({ children, onRemove }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border bg-card pl-2 pr-1 text-xs font-medium text-foreground">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove filter"
        className="inline-flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X size={12} />
      </button>
    </span>
  );
}
