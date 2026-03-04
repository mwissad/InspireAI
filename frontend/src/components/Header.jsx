import { Settings, ChevronRight } from 'lucide-react';
import DatabricksLogo from './DatabricksLogo';

const NAV_ITEMS = [
  { id: 'landing',  label: 'Home',      num: null },
  { id: 'config',   label: 'Configure',  num: '01' },
  { id: 'launch',   label: 'Launch',     num: '02' },
  { id: 'monitor',  label: 'Monitor',    num: '03' },
  { id: 'results',  label: 'Results',    num: '04' },
];

export default function Header({ page, setPage, onSettingsClick, canConfigure, canLaunch, canMonitor, canResults }) {
  const canNav = {
    landing: true,
    config: true,
    launch: canConfigure,
    monitor: canMonitor,
    results: canResults || true,
  };

  const activeIdx = NAV_ITEMS.findIndex(n => n.id === page);

  return (
    <header className="sticky top-0 z-50 bg-db-darkest/90 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">

          {/* ── Logo ── */}
          <button
            onClick={() => setPage('landing')}
            className="flex items-center gap-2.5 group"
          >
            <DatabricksLogo className="w-7 h-7 group-hover:scale-110 transition-transform" />
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-[15px] text-white tracking-tight">
                Inspire AI
              </span>
              <span className="text-[10px] font-mono text-db-red-light/60 bg-db-red/8 px-1.5 py-0.5 rounded-md border border-db-red/10">
                v4.1
              </span>
            </div>
          </button>

          {/* ── Navigation ── */}
          <nav className="hidden sm:flex items-center gap-0.5">
            {NAV_ITEMS.map((item, i) => {
              const isActive = page === item.id;
              const enabled = canNav[item.id];
              const isPast = i < activeIdx;

              return (
                <div key={item.id} className="flex items-center">
                  {i > 0 && (
                    <ChevronRight
                      size={11}
                      className={`mx-0.5 ${i <= activeIdx ? 'text-db-red/40' : 'text-white/8'}`}
                    />
                  )}
                  <button
                    onClick={() => enabled && setPage(item.id)}
                    disabled={!enabled}
                    className={`relative px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                      isActive
                        ? 'text-white'
                        : isPast && enabled
                          ? 'text-slate-400 hover:text-white'
                          : enabled
                            ? 'text-slate-500 hover:text-slate-300'
                            : 'text-white/15 cursor-not-allowed'
                    }`}
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <span className="absolute inset-0 bg-db-red/12 border border-db-red/20 rounded-lg" />
                    )}

                    <span className="relative flex items-center gap-1.5">
                      {item.num && (
                        <span className={`text-[9px] font-mono ${
                          isActive ? 'text-db-red-light' : isPast ? 'text-slate-500' : 'text-white/20'
                        }`}>
                          {item.num}
                        </span>
                      )}
                      {item.label}
                    </span>
                  </button>
                </div>
              );
            })}
          </nav>

          {/* ── Mobile nav (minimal) ── */}
          <nav className="flex sm:hidden items-center gap-0.5">
            {NAV_ITEMS.filter(i => i.id !== 'landing').map(item => {
              const isActive = page === item.id;
              const enabled = canNav[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => enabled && setPage(item.id)}
                  disabled={!enabled}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium ${
                    isActive
                      ? 'bg-db-red/12 text-white border border-db-red/20'
                      : enabled
                        ? 'text-slate-500 hover:text-white'
                        : 'text-white/15 cursor-not-allowed'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* ── Settings gear ── */}
          <button
            onClick={onSettingsClick}
            className="p-2 rounded-lg text-slate-500 hover:text-db-red-light hover:bg-db-red/5 transition-all duration-200"
          >
            <Settings size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
