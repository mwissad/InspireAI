import { useState, useEffect } from 'react';
import { X, Key, FolderOpen, Server, Database, Globe, RefreshCw, ChevronDown, Shield, User } from 'lucide-react';
import DatabricksLogo from './DatabricksLogo';
import { normalizeDatabricksHost } from '../lib/normalizeDatabricksHost';

const HOST_FIELD = { key: 'databricksHost', label: 'Databricks Host URL', icon: Globe, type: 'text', placeholder: 'https://adb-xxx.xx.azuredatabricks.net' };
const DB_FIELD = { key: 'inspireDatabase', label: 'Inspire Database', icon: Database, type: 'text', placeholder: 'catalog._inspire' };
const PAT_FIELDS = [
  { key: 'token', label: 'Access Token', icon: Key, type: 'password', placeholder: 'dapi...' },
];
const SP_FIELDS = [
  { key: 'spClientId', label: 'Client ID', icon: Shield, type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
  { key: 'spClientSecret', label: 'Client Secret', icon: Key, type: 'password', placeholder: 'Service principal secret' },
  { key: 'spTenantId', label: 'Tenant ID', icon: Globe, type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
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
          {/* Databricks Host */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              <HOST_FIELD.icon size={12} />
              {HOST_FIELD.label}
            </label>
            <input
              type={HOST_FIELD.type}
              value={settings[HOST_FIELD.key] || ''}
              onChange={(e) => update(HOST_FIELD.key, normalizeDatabricksHost(e.target.value))}
              placeholder={HOST_FIELD.placeholder}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth font-mono"
            />
          </div>

          {/* Auth Mode Toggle */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              <Shield size={12} />
              Authentication Mode
            </label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => update('authMode', 'pat')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-smooth border ${
                  settings.authMode !== 'sp'
                    ? 'border-db-red/30 bg-db-red-50 text-db-red'
                    : 'border-border text-text-secondary hover:border-border-strong'
                }`}
              >
                <User size={12} />
                PAT Token
              </button>
              <button
                type="button"
                onClick={() => update('authMode', 'sp')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-smooth border ${
                  settings.authMode === 'sp'
                    ? 'border-db-red/30 bg-db-red-50 text-db-red'
                    : 'border-border text-text-secondary hover:border-border-strong'
                }`}
              >
                <Shield size={12} />
                Service Principal
              </button>
            </div>
          </div>

          {/* Auth fields based on mode */}
          {settings.authMode === 'sp' ? (
            <>
              {SP_FIELDS.map(({ key, label, icon: Icon, type, placeholder }) => (
                <div key={key}>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                    <Icon size={12} />
                    {label}
                  </label>
                  <input
                    type={type}
                    value={settings[key] || ''}
                    onChange={(e) => update(key, e.target.value)}
                    placeholder={placeholder}
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth font-mono"
                  />
                </div>
              ))}
              <div className="p-2.5 bg-info-bg border border-info/20 rounded-md">
                <p className="text-[10px] text-text-secondary leading-relaxed">
                  <span className="font-semibold text-info">Required SP permissions:</span> Volume & UC access, Job creation & execution, SQL Warehouse usage.
                </p>
              </div>
            </>
          ) : (
            PAT_FIELDS.map(({ key, label, icon: Icon, type, placeholder }) => (
              <div key={key}>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                  <Icon size={12} />
                  {label}
                </label>
                <input
                  type={type}
                  value={settings[key] || ''}
                  onChange={(e) => update(key, e.target.value)}
                  placeholder={placeholder}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth font-mono"
                />
              </div>
            ))
          )}

          {/* Inspire Database */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              <DB_FIELD.icon size={12} />
              {DB_FIELD.label}
            </label>
            <input
              type={DB_FIELD.type}
              value={settings[DB_FIELD.key] || ''}
              onChange={(e) => update(DB_FIELD.key, e.target.value)}
              placeholder={DB_FIELD.placeholder}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth font-mono"
            />
          </div>

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
              <div className="flex items-center gap-2">
                <span>Notebook: {settings.notebookPath || 'Not set'}</span>
                {settings.notebookPath && settings.token && (
                  <button
                    onClick={async () => {
                      try {
                        const headers = { Authorization: `Bearer ${settings.token}`, 'X-DB-PAT-Token': settings.token };
                        if (settings.databricksHost) headers['X-Databricks-Host'] = settings.databricksHost;
                        const resp = await fetch('/api/notebook?force=true', { headers });
                        if (resp.ok) {
                          const data = await resp.json();
                          if (data.path) update('notebookPath', data.path);
                          alert('Notebook re-published successfully!');
                        } else {
                          alert('Failed to re-publish notebook.');
                        }
                      } catch { alert('Error re-publishing notebook.'); }
                    }}
                    className="text-[10px] text-db-red hover:underline font-medium"
                    title="Force re-upload the latest DBC to your workspace"
                  >
                    Re-publish
                  </button>
                )}
              </div>
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
