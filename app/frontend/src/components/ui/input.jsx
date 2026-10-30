import { cn } from '../../lib/utils';

function Input({ className, type = 'text', ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border bg-card px-3 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-subtle-foreground focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
