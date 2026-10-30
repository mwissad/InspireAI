import { cn } from '../lib/utils';

export function PageShell({ children, className }) {
  return <div className={cn('mx-auto max-w-[1200px] px-6 py-8', className)}>{children}</div>;
}

export function PageHeader({ icon: Icon, title, subtitle, actions, className }) {
  return (
    <div className={cn('mb-8 flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon && (
          <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card">
            <Icon size={18} className="text-muted-foreground" strokeWidth={1.75} aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground break-words">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
