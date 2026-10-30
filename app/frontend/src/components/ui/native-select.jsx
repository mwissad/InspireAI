import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

function NativeSelect({ className, wrapperClassName, children, ...props }) {
  return (
    <div className={cn('relative inline-flex', wrapperClassName)} data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        className={cn(
          'h-9 w-full appearance-none rounded-md border bg-card pl-3 pr-8 text-sm text-foreground shadow-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}

export { NativeSelect };
