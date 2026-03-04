import { useState, useEffect, useCallback } from 'react';
import {
  Key,
  Server,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Package,
  XCircle,
} from 'lucide-react';

export default function ConfigPage({ settings, update, onConfigured }) {
  const { token, notebookPath, warehouseId } = settings;

  const [tokenStatus, setTokenStatus] = useState(null); // null | 'loading' | 'valid' | 'invalid'
  const [username, setUsername] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [publishStatus, setPublishStatus] = useState(null); // null | 'loading' | 'done' | 'error'
  const [publishMessage, setPublishMessage] = useState('');
  const [dbcInfo, setDbcInfo] = useState(null);

  const apiFetch = useCallback(
    async (url, opts = {}) => {
      const resp = await fetch(url, {
        ...opts,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...opts.headers,
        },
      });
      if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
      return resp.json();
    },
    [token]
  );

  // Test connection
  const testConnection = async () => {
    if (!token) return;
    setTokenStatus('loading');
    try {
      const data = await apiFetch('/api/me');
      setUsername(data.username || data.displayName || '');
      setTokenStatus('valid');
    } catch {
      setTokenStatus('invalid');
      setUsername('');
    }
  };

  // Auto-test on mount if token exists
  useEffect(() => {
    if (token && !tokenStatus) testConnection();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load warehouses once validated
  useEffect(() => {
    if (tokenStatus !== 'valid') return;
    setWarehouseLoading(true);
    apiFetch('/api/warehouses')
      .then((d) => setWarehouses(d.warehouses || []))
      .catch(() => {})
      .finally(() => setWarehouseLoading(false));

    fetch('/api/dbc/info')
      .then((r) => r.json())
      .then(setDbcInfo)
      .catch(() => {});
  }, [tokenStatus, apiFetch]);

  // Publish DBC
  const publish = async () => {
    const destPath = `/Users/${username}/inspire_v41`;
    if (!destPath) return;
    setPublishStatus('loading');
    setPublishMessage('');
    try {
      const data = await apiFetch('/api/publish', {
        method: 'POST',
        body: JSON.stringify({ destination_path: destPath }),
      });
      update('notebookPath', data.path || destPath);
      setPublishStatus('done');
      setPublishMessage(`Published to ${data.path || destPath}`);
    } catch (e) {
      setPublishStatus('error');
      setPublishMessage(e.message);
    }
  };

  const isReady = tokenStatus === 'valid' && warehouseId && notebookPath;

  // Step status
  const step1Done = tokenStatus === 'valid';
  const step2Done = step1Done && Boolean(warehouseId);
  const step3Done = step2Done && Boolean(notebookPath);

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Configure</h1>
        <p className="text-sm text-text-secondary mt-1">
          Connect to your Databricks workspace and set up the Inspire AI notebook.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-6">
        {/* Step 1: Token */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-panel">
            <StepBadge step={1} done={step1Done} />
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Authentication</h2>
              <p className="text-xs text-text-secondary">Databricks Personal Access Token</p>
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input
                  type="password"
                  value={token}
                  onChange={(e) => {
                    update('token', e.target.value);
                    setTokenStatus(null);
                  }}
                  placeholder="dapi..."
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
                />
              </div>
              <button
                onClick={testConnection}
                disabled={!token || tokenStatus === 'loading'}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border text-text-primary hover:bg-bg-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-smooth flex items-center gap-2"
              >
                {tokenStatus === 'loading' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Key size={14} />
                )}
                Test Connection
              </button>
            </div>

            {/* Status */}
            {tokenStatus === 'valid' && (
              <div className="flex items-center gap-2 mt-3 p-2.5 bg-success-bg rounded-md">
                <CheckCircle2 size={14} className="text-success" />
                <span className="text-sm text-success">
                  Connected as <span className="font-medium">{username}</span>
                </span>
              </div>
            )}
            {tokenStatus === 'invalid' && (
              <div className="flex items-center gap-2 mt-3 p-2.5 bg-error-bg rounded-md">
                <XCircle size={14} className="text-error" />
                <span className="text-sm text-error">
                  Authentication failed. Check your token.
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Step 2: SQL Warehouse */}
        <section className={`bg-surface border border-border rounded-lg overflow-hidden transition-smooth ${!step1Done ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-panel">
            <StepBadge step={2} done={step2Done} />
            <div>
              <h2 className="text-sm font-semibold text-text-primary">SQL Warehouse</h2>
              <p className="text-xs text-text-secondary">Select a warehouse for query execution</p>
            </div>
          </div>
          <div className="px-5 py-4">
            {warehouseLoading ? (
              <div className="flex items-center gap-2 text-sm text-text-secondary py-4">
                <Loader2 size={14} className="animate-spin" />
                Loading warehouses...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {warehouses.map((w) => {
                  const selected = warehouseId === w.id;
                  const running = w.state === 'RUNNING';
                  return (
                    <button
                      key={w.id}
                      onClick={() => update('warehouseId', w.id)}
                      className={`
                        flex items-start gap-3 p-3 rounded-lg border text-left transition-smooth
                        ${selected
                          ? 'border-db-red/30 bg-db-red-50 glow-active'
                          : 'border-border hover:border-border-strong glow-hover'
                        }
                      `}
                    >
                      <Server
                        size={16}
                        className={`mt-0.5 ${selected ? 'text-db-red' : 'text-text-tertiary'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">
                          {w.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`inline-flex items-center gap-1 text-xs ${running ? 'text-success' : 'text-text-tertiary'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-success' : 'bg-text-tertiary'}`} />
                            {w.state}
                          </span>
                          <span className="text-xs text-text-tertiary">{w.cluster_size}</span>
                        </div>
                      </div>
                      {selected && <CheckCircle2 size={16} className="text-db-red mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Step 3: Publish */}
        <section className={`bg-surface border border-border rounded-lg overflow-hidden transition-smooth ${!step2Done ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-panel">
            <StepBadge step={3} done={step3Done} />
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Publish Notebook</h2>
              <p className="text-xs text-text-secondary">Deploy the Inspire AI notebook to your workspace</p>
            </div>
          </div>
          <div className="px-5 py-4">
            {/* DBC info */}
            {dbcInfo && (
              <div className="flex items-center gap-2 p-2.5 bg-bg rounded-md mb-4 text-xs text-text-secondary">
                <Package size={14} className="text-db-red" />
                <span>{dbcInfo.file}</span>
                <span className="text-text-tertiary">
                  ({(dbcInfo.size / 1024).toFixed(0)} KB, {dbcInfo.notebooks?.length || 0} notebook{dbcInfo.notebooks?.length !== 1 ? 's' : ''})
                </span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Upload size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input
                  type="text"
                  value={notebookPath ? notebookPath : username ? `/Users/${username}/inspire_v41` : ''}
                  readOnly
                  className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-bg text-text-secondary"
                  placeholder="Destination path"
                />
              </div>
              <button
                onClick={publish}
                disabled={publishStatus === 'loading' || !username}
                className="px-4 py-2 text-sm font-medium rounded-md bg-db-red text-white hover:bg-db-red-hover disabled:opacity-50 disabled:cursor-not-allowed transition-smooth flex items-center gap-2"
              >
                {publishStatus === 'loading' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                Publish
              </button>
            </div>

            {/* Publish status */}
            {publishStatus === 'done' && (
              <div className="flex items-center gap-2 mt-3 p-2.5 bg-success-bg rounded-md">
                <CheckCircle2 size={14} className="text-success" />
                <span className="text-sm text-success">{publishMessage}</span>
              </div>
            )}
            {publishStatus === 'error' && (
              <div className="flex items-center gap-2 mt-3 p-2.5 bg-error-bg rounded-md">
                <AlertCircle size={14} className="text-error" />
                <span className="text-sm text-error">{publishMessage}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Continue button */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={onConfigured}
          disabled={!isReady}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-db-red text-white text-sm font-semibold rounded-lg hover:bg-db-red-hover disabled:opacity-40 disabled:cursor-not-allowed transition-smooth shadow-sm"
        >
          Continue to Launch
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// Step badge component
function StepBadge({ step, done }) {
  if (done) {
    return (
      <div className="w-7 h-7 rounded-full bg-success flex items-center justify-center">
        <CheckCircle2 size={14} className="text-white" />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full border-2 border-border flex items-center justify-center">
      <span className="text-xs font-semibold text-text-secondary">{step}</span>
    </div>
  );
}
