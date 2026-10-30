import { cn } from '../../lib/utils';

function Card({ className, ...props }) {
  return (
    <div
      data-slot="card"
      className={cn('rounded-xl border bg-card text-card-foreground shadow-elevated', className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }) {
  return <div data-slot="card-header" className={cn('flex items-start justify-between gap-4 p-5 pb-0', className)} {...props} />;
}

function CardTitle({ className, ...props }) {
  return <h3 data-slot="card-title" className={cn('text-sm font-semibold leading-none text-foreground', className)} {...props} />;
}

function CardDescription({ className, ...props }) {
  return <p data-slot="card-description" className={cn('text-xs text-muted-foreground', className)} {...props} />;
}

function CardContent({ className, ...props }) {
  return <div data-slot="card-content" className={cn('p-5', className)} {...props} />;
}

function CardFooter({ className, ...props }) {
  return <div data-slot="card-footer" className={cn('flex items-center gap-2 px-5 pb-5', className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
