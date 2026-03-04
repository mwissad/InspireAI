import { X, KeyRound, Database, Server, FileText, Eye, EyeOff, Folder } from 'lucide-react';
import { useState } from 'react';
import DatabricksLogo from './DatabricksLogo';

export default function SettingsPanel({ settings, update, onClose }) {
  const [showToken, setShowToken] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md h-full bg-db-darkest border-l border-white/5 shadow-2xl overflow-y-auto">
        <div className="p-6 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <DatabricksLogo className="w-6 h-6" />
              <h2 className="text-base font-bold text-white">Settings</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* ── Token ── */}
          <SettingsSection
            icon={<KeyRound size={13} className="text-db-red-light" />}
            title="Databricks Token"
          >
            <div className="relative group">
              <input
                type={showToken ? 'text' : 'password'}
                className="w-full bg-db-darkest/60 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white pr-10 placeholder:text-slate-600 focus:outline-none focus:border-db-red/40 focus:ring-1 focus:ring-db-red/20 transition-all"
                placeholder="dapi..."
                value={settings.databricksToken}
                onChange={e => update('databricksToken', e.target.value)}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            {settings.databricksToken && (
              <p className="text-[10px] text-slate-600 font-mono mt-1.5">
                {settings.databricksToken.slice(0, 4)}...{settings.databricksToken.slice(-4)} ({settings.databricksToken.length} chars)
              </p>
            )}
          </SettingsSection>

          {/* ── Notebook Path ── */}
          <SettingsSection
            icon={<FileText size={13} className="text-db-orange" />}
            title="Notebook Path"
          >
            <input
              type="text"
              className="w-full bg-db-darkest/60 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-db-red/40 focus:ring-1 focus:ring-db-red/20 transition-all font-mono"
              placeholder="/Users/you@company.com/databricks_inspire_v41"
              value={settings.notebookPath}
              onChange={e => update('notebookPath', e.target.value)}
            />
            <p className="text-[10px] text-slate-600 mt-1.5">Set by publishing, or enter manually</p>
          </SettingsSection>

          {/* ── Warehouse ID ── */}
          <SettingsSection
            icon={<Server size={13} className="text-purple-400" />}
            title="SQL Warehouse ID"
          >
            <input
              type="text"
              className="w-full bg-db-darkest/60 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-db-red/40 focus:ring-1 focus:ring-db-red/20 transition-all font-mono"
              placeholder="Warehouse ID"
              value={settings.warehouseId}
              onChange={e => update('warehouseId', e.target.value)}
            />
          </SettingsSection>

          {/* ── Inspire Database ── */}
          <SettingsSection
            icon={<Database size={13} className="text-db-teal" />}
            title="Inspire Database"
          >
            <input
              type="text"
              className="w-full bg-db-darkest/60 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-db-teal/40 focus:ring-1 focus:ring-db-teal/20 transition-all font-mono"
              placeholder="catalog._inspire"
              value={settings.inspireDatabase}
              onChange={e => update('inspireDatabase', e.target.value)}
            />
            <p className="text-[10px] text-slate-600 mt-1.5">catalog.schema for Inspire tracking tables</p>
          </SettingsSection>

          {/* ── Debug Info ── */}
          <div className="pt-4 border-t border-white/5">
            <h3 className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.15em] mb-3">Debug Info</h3>
            <div className="text-[10px] text-slate-600 space-y-1.5 font-mono bg-db-navy/15 rounded-xl p-3 border border-white/3">
              <DebugRow label="Token" value={settings.databricksToken ? `${settings.databricksToken.length} chars` : null} />
              <DebugRow label="Notebook" value={settings.notebookPath} />
              <DebugRow label="Folder" value={settings.publishedFolder} />
              <DebugRow label="Warehouse" value={settings.warehouseId} />
              <DebugRow label="Database" value={settings.inspireDatabase} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ icon, title, children }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
        {icon} {title}
      </label>
      {children}
    </div>
  );
}

function DebugRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}:</span>
      <span className={value ? 'text-slate-400 truncate max-w-[200px]' : 'text-slate-700 italic'}>
        {value || 'Not set'}
      </span>
    </div>
  );
}
