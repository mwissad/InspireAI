import { Sun, Moon } from 'lucide-react';
import DatabricksLogo from './DatabricksLogo';
import { useTheme } from '../ThemeContext';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

const NAV = [
  { id: 'choose', label: 'Get Started', step: 1 },
  { id: 'monitor', label: 'Monitor', step: 2 },
  { id: 'results', label: 'Results', step: 3 },
];

export default function Header({
  page,
  setPage,
  canLaunch,
  canMonitor,
  canResults,
}) {
  const { theme, toggle } = useTheme();
  const enabled = {
    choose: true,
    monitor: canMonitor,
    results: canResults || true,
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-card/85 backdrop-blur-xl">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button
            onClick={() => setPage('landing')}
            className="flex items-center gap-2 justify-self-start rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <DatabricksLogo className="h-7 w-7" />
            <span className="text-base font-semibold tracking-tight text-foreground">Inspire AI</span>
          </button>

          <nav className="flex h-14 items-stretch gap-1 justify-self-center" aria-label="Steps">
            {NAV.map((item) => {
              const active = page === item.id;
              const can = enabled[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => can && setPage(item.id)}
                  disabled={!can}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative inline-flex items-center gap-1.5 px-3 text-sm font-medium outline-none transition-colors focus-visible:bg-muted',
                    active
                      ? 'text-foreground'
                      : can
                        ? 'text-muted-foreground hover:text-foreground'
                        : 'cursor-not-allowed text-text-disabled',
                  )}
                >
                  <span className={cn('font-mono text-xs tabular-nums', active ? 'text-accent' : 'opacity-60')}>
                    {String(item.step).padStart(2, '0')}
                  </span>
                  {item.label}
                  {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" aria-hidden />}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
