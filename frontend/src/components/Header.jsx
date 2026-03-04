import { Settings, CircleCheck } from 'lucide-react';
import DatabricksLogo from './DatabricksLogo';

export default function Header({ showSettings, onToggleSettings, isConnected }) {
  return (
    <header className="border-b border-white/10 backdrop-blur-md bg-db-darkest/80 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DatabricksLogo className="w-9 h-9" />
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Inspire AI
            </h1>
            <p className="text-[11px] text-slate-500 -mt-0.5">
              Powered by <span className="text-db-red font-semibold">Databricks</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isConnected && (
            <div className="flex items-center gap-1.5 text-xs text-db-teal">
              <CircleCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Connected</span>
            </div>
          )}
          <button
            onClick={onToggleSettings}
            className={`p-2 rounded-lg transition-all duration-200 ${
              showSettings
                ? 'bg-db-red/15 text-db-red-light ring-1 ring-db-red/30'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
            title="Connection Settings"
          >
            <Settings className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
