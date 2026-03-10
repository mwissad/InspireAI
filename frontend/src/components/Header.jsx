import { Settings } from 'lucide-react';
import DatabricksLogo from './DatabricksLogo';

const NAV = [
  { id: 'config',  label: 'Configure', step: 1 },
  { id: 'launch',  label: 'Launch',    step: 2 },
  { id: 'monitor', label: 'Monitor',   step: 3 },
  { id: 'results', label: 'Results',   step: 4 },
];

export default function Header({
  page,
  setPage,
  onSettingsClick,
  canConfigure,
  canLaunch,
  canMonitor,
  canResults,
}) {
  const enabled = {
    config: true,
    launch: canLaunch || canConfigure,
    monitor: canMonitor,
    results: canResults || true,
  };

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-40">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          {/* Brand */}
          <button
            onClick={() => setPage('landing')}
            className="flex items-center gap-2.5 group"
          >
            <DatabricksLogo className="w-7 h-7" />
            <span className="text-text-primary font-semibold text-[15px] tracking-tight">
              Inspire AI
            </span>
            <span className="text-[10px] font-medium text-text-tertiary border border-border rounded px-1.5 py-0.5 ml-0.5">
              v4.3
            </span>
          </button>

          {/* Navigation */}
          <nav className="flex items-center gap-0.5">
            {NAV.map((item) => {
              const active = page === item.id;
              const can = enabled[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => can && setPage(item.id)}
                  disabled={!can}
                  className={`
                    relative px-4 py-2 text-sm font-medium rounded-md transition-smooth
                    ${active
                      ? 'text-db-red bg-db-red-50'
                      : can
                        ? 'text-text-secondary hover:text-text-primary hover:bg-bg-subtle'
                        : 'text-text-disabled cursor-not-allowed'
                    }
                  `}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`text-xs font-mono ${active ? 'text-db-red' : 'opacity-50'}`}>
                      {String(item.step).padStart(2, '0')}
                    </span>
                    {item.label}
                  </span>
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-db-red rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Settings */}
          <button
            onClick={onSettingsClick}
            className="p-2 rounded-md text-text-secondary hover:text-db-red hover:bg-db-red-50 transition-smooth"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
