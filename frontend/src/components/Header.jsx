import { Settings, Sun, Moon } from 'lucide-react';
import DatabricksLogo from './DatabricksLogo';
import { useTheme } from '../ThemeContext';

const NAV = [
  { id: 'launch',  label: 'Launch',  step: 1 },
  { id: 'monitor', label: 'Monitor', step: 2 },
  { id: 'results', label: 'Results', step: 3 },
];

export default function Header({
  page,
  setPage,
  onSettingsClick,
  canLaunch,
  canMonitor,
  canResults,
}) {
  const { theme, toggle } = useTheme();
  const enabled = {
    launch: true,
    monitor: canMonitor,
    results: canResults || true,
  };

  return (
    <header className="bg-surface/80 backdrop-blur-xl border-b border-border sticky top-0 z-40">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          {/* Brand */}
          <button
            onClick={() => setPage('landing')}
            className="flex items-center gap-2.5 group"
          >
            <DatabricksLogo className="w-7 h-7" />
            <span className="text-text-primary font-bold text-xl tracking-tight">
              Inspire AI
            </span>
            <span className="text-[10px] font-semibold text-db-red border border-db-red/30 bg-db-red-50 rounded-full px-2 py-0.5 ml-0.5">
              v4.7
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
                    {item.step && (
                      <span className={`text-xs font-mono ${active ? 'text-db-red' : 'opacity-50'}`}>
                        {String(item.step).padStart(2, '0')}
                      </span>
                    )}
                    {item.label}
                  </span>
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-db-red rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Theme toggle + Settings */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggle}
              className="p-2 rounded-md text-text-secondary hover:text-db-red hover:bg-db-red-50 transition-smooth"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={onSettingsClick}
              className="p-2 rounded-md text-text-secondary hover:text-db-red hover:bg-db-red-50 transition-smooth"
              title="Settings"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
