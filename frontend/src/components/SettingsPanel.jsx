import { X, Key, FolderOpen, Server, Database, Globe } from 'lucide-react';
import DatabricksLogo from './DatabricksLogo';

const FIELDS = [
  { key: 'databricksHost', label: 'Databricks Host URL', icon: Globe, type: 'text', placeholder: 'https://adb-xxx.xx.azuredatabricks.net' },
  { key: 'token', label: 'Access Token', icon: Key, type: 'password', placeholder: 'dapi...' },
  { key: 'notebookPath', label: 'Notebook Path', icon: FolderOpen, type: 'text', placeholder: '/Users/you/inspire_ai' },
  { key: 'warehouseId', label: 'SQL Warehouse ID', icon: Server, type: 'text', placeholder: '' },
  { key: 'inspireDatabase', label: 'Inspire Database', icon: Database, type: 'text', placeholder: 'catalog._inspire' },
];

export default function SettingsPanel({ settings, update, onClose }) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-96 bg-surface border-l border-border shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <DatabricksLogo className="w-5 h-5" />
            <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-subtle transition-smooth"
          >
            <X size={16} />
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {FIELDS.map(({ key, label, icon: Icon, type, placeholder }) => (
            <div key={key}>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                <Icon size={12} />
                {label}
            </label>
              <input
                type={type}
                value={settings[key] || ''}
                onChange={(e) => update(key, e.target.value)}
                placeholder={placeholder || ''}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth font-mono"
              />
            </div>
          ))}

          {/* Debug info */}
          <div className="mt-6 p-3 bg-bg rounded-md border border-border">
            <h4 className="text-xs font-semibold text-text-secondary mb-2">
              Debug Information
            </h4>
            <div className="space-y-1 text-xs text-text-tertiary font-mono">
              <div>Host: {settings.databricksHost || 'Not set (using server default)'}</div>
              <div>
                Token:{' '}
                {settings.token
                  ? `${settings.token.slice(0, 4)}***${settings.token.slice(-4)} (${settings.token.length} chars)`
                  : 'Not set'}
              </div>
              <div>Warehouse: {settings.warehouseId || 'Not set'}</div>
              <div>Database: {settings.inspireDatabase || 'Not set'}</div>
              <div>Notebook: {settings.notebookPath || 'Not set'}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border">
        <button
            onClick={onClose}
            className="w-full py-2 text-sm font-medium border border-border rounded-md text-text-primary hover:bg-bg-subtle transition-smooth"
          >
            Close
        </button>
        </div>
      </div>
    </>
  );
}
