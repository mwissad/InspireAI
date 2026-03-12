import { useState, useEffect } from 'react';
import { X, Key, FolderOpen, Server, Database, Globe, RefreshCw, ChevronDown } from 'lucide-react';
import DatabricksLogo from './DatabricksLogo';

const TEXT_FIELDS = [
  { key: 'databricksHost', label: 'Databricks Host URL', icon: Globe, type: 'text', placeholder: 'https://adb-xxx.xx.azuredatabricks.net' },
  { key: 'token', label: 'Access Token', icon: Key, type: 'password', placeholder: 'dapi...' },
  { key: 'inspireDatabase', label: 'Inspire Database', icon: Database, type: 'text', placeholder: 'catalog._inspire' },
];

const STATE_COLORS = {
  RUNNING: 'bg-emerald-500',
  STARTING: 'bg-amber-400 animate-pulse',
  STOPPING: 'bg-amber-400 animate-pulse',
  STOPPED: 'bg-zinc-400',
  DELETED: 'bg-red-500',
  DELETING: 'bg-red-400 animate-pulse',
};

function WarehouseSelector({ settings, update }) {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchWarehouses = async () => {
    setLoading(true);
    setError('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (settings.token) {
        headers['Authorization'] = `Bearer ${settings.token}`;
        headers['X-DB-PAT-Token'] = settings.token;
      }
      if (settings.databricksHost) headers['X-Databricks-Host'] = settings.databricksHost;

      const resp = await fetch('/api/warehouses', { headers });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setWarehouses(data.warehouses || []);
    } catch (e) {
      setError(e.message);
      setWarehouses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
  }, [settings.databricksHost, settings.token]);

  const selected = warehouses.find(w => w.id === settings.warehouseId);

  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
        <Server size={12} />
        SQL Warehouse
      </label>

      <div className="relative">
        <select
          value={settings.warehouseId || ''}
          onChange={(e) => update('warehouseId', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary glow-focus transition-smooth font-mono appearance-none pr-8"
        >
          <option value="">— Select a warehouse —</option>
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.state}) — {w.cluster_size}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
      </div>

      {/* Status badge + refresh */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {selected && (
            <>
              <span className={`inline-block w-2 h-2 rounded-full ${STATE_COLORS[selected.state] || 'bg-zinc-400'}`} />
              <span className="text-xs text-text-secondary">
                {selected.name} — <span className="font-semibold">{selected.state}</span> — {selected.cluster_size}
              </span>
            </>
          )}
          {!selected && settings.warehouseId && (
            <span className="text-xs text-text-tertiary font-mono">{settings.warehouseId}</span>
          )}
          {!selected && !settings.warehouseId && (
            <span className="text-xs text-text-tertiary">No warehouse selected</span>
          )}
        </div>
        <button
          onClick={fetchWarehouses}
          disabled={loading}
          className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-subtle transition-smooth disabled:opacity-50"
          title="Refresh warehouses"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}

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
          {TEXT_FIELDS.map(({ key, label, icon: Icon, type, placeholder }) => (
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

          {/* Warehouse selector with live status */}
          <WarehouseSelector settings={settings} update={update} />

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
