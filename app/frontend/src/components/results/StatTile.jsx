import AnimatedCounter from '../AnimatedCounter';
import { Card } from '../ui/card';
import { cn } from '../../lib/utils';

export function StatTile({ label, value, icon: Icon, renderValue, accent = false }) {
  return (
    <Card className="flex flex-col gap-3 p-5 shadow-none">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon size={16} strokeWidth={1.75} className="shrink-0 text-subtle-foreground" aria-hidden />}
      </div>
      <div className={cn('text-2xl font-semibold leading-none tracking-tight tabular-nums', accent ? 'text-accent' : 'text-foreground')}>
        {renderValue != null ? renderValue : <AnimatedCounter value={Number(value) || 0} />}
      </div>
    </Card>
  );
}

export function KpiRow({ children }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{children}</div>;
}
