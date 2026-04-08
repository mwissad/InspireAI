import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, XCircle, Loader2, ArrowRight, ArrowLeft,
  Globe2, Key, Database, Server, FileCode, Sparkles, RefreshCw,
} from 'lucide-react';
import DatabricksLogo from '../components/DatabricksLogo';

const STEPS = [
  { id: 'connect', label: 'Connect', icon: Globe2, desc: 'Connect to your Databricks workspace' },
  { id: 'auth', label: 'Authenticate', icon: Key, desc: 'Provide authentication credentials' },
  { id: 'warehouse', label: 'Warehouse', icon: Server, desc: 'Select a SQL warehouse' },
  { id: 'database', label: 'Database', icon: Database, desc: 'Choose or create the Inspire database' },
  { id: 'verify', label: 'Verify', icon: FileCode, desc: 'Verify permissions and publish notebook' },
];

function StatusIcon({ status, size = 16 }) {
  if (status === 'ok') return <CheckCircle2 size={size} className="text-success" />;
  if (status === 'error') return <XCircle size={size} className="text-error" />;
  if (status === 'loading') return <Loader2 size={size} className="animate-spin text-info" />;
  return <div className="w-4 h-4 rounded-full border-2 border-border" />;
}

export default function SetupWizard({ settings, update, onComplete }) {
  const [step, setStep] = useState(0);
  const [warehouses, setWarehouses] = useState([]);
  const [catalogs, setCatalogs] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [creatingDb, setCreatingDb] = useState(false);

  const { databricksHost, token, warehouseId, inspireDatabase, authMode } = settings;

  const headers = useCallback(() => {
    const h = { 'Content-Type': 'application/json' };
    if (token) { h['Authorization'] = `Bearer ${token}`; h['X-DB-PAT-Token'] = token; }
    if (databricksHost) h['X-Databricks-Host'] = databricksHost;
    return h;
  }, [token, databricksHost]);

  // Auto-detect host from environment
  useEffect(() => {
    if (!databricksHost) {
      fetch('/api/health').then(r => r.json()).then(data => {
        if (data.hostConfigured && data.host) {
          // Health returns truncated host — try to get full from env
          fetch('/api/health').then(r => r.json()).then(d => {
            if (d.hostConfigured) {
              // The backend knows the host from env
            }
          });
        }
      }).catch(() => {});
    }
  }, [databricksHost]);

  // Load warehouses when auth is ready
  useEffect(() => {
    if (!token || !databricksHost || step < 2) return;
    fetch('/api/warehouses', { headers: headers() })
      .then(r => r.json())
      .then(data => {
        const whs = data.warehouses || [];
        setWarehouses(whs);
        // Auto-select first running serverless warehouse
        if (!warehouseId && whs.length > 0) {
          const running = whs.find(w => w.state === 'RUNNING' && w.enable_serverless_compute);
          const first = running || whs.find(w => w.state === 'RUNNING') || whs[0];
          if (first) update('warehouseId', first.id);
        }
      })
      .catch(() => {});
  }, [token, databricksHost, step]);

  // Load catalogs when warehouse is ready
  useEffect(() => {
    if (!token || !databricksHost || step < 3) return;
    fetch('/api/catalogs', { headers: headers() })
      .then(r => r.json())
      .then(data => setCatalogs(data.catalogs || []))
      .catch(() => {});
  }, [token, databricksHost, step]);

  // Load schemas when catalog selected
  const selectedCatalog = inspireDatabase?.split('.')[0] || '';
  useEffect(() => {
    if (!selectedCatalog || !token || !databricksHost) return;
    fetch(`/api/catalogs/${encodeURIComponent(selectedCatalog)}/schemas`, { headers: headers() })
      .then(r => r.json())
      .then(data => setSchemas(data.schemas || []))
      .catch(() => {});
  }, [selectedCatalog, token, databricksHost]);

  // Run verification
  const runVerification = async () => {
    setVerifying(true);
    setVerification(null);
    try {
      const resp = await fetch('/api/setup/verify', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ warehouse_id: warehouseId, inspire_database: inspireDatabase }),
      });
      const data = await resp.json();
      setVerification(data);
    } catch (err) {
      setVerification({ ok: false, checks: { error: { ok: false, message: err.message } } });
    }
    setVerifying(false);
  };

  // Publish notebook
  const publishNotebook = async () => {
    setPublishing(true);
    try {
      const resp = await fetch('/api/notebook?force=true', { headers: headers() });
      const data = await resp.json();
      if (data.path) {
        update('notebookPath', data.path);
        setPublishResult({ ok: true, path: data.path });
      } else {
        setPublishResult({ ok: false, message: data.error || 'Failed to publish' });
      }
    } catch (err) {
      setPublishResult({ ok: false, message: err.message });
    }
    setPublishing(false);
  };

  // Create database
  const createDatabase = async () => {
    setCreatingDb(true);
    try {
      const resp = await fetch('/api/setup/create-database', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ inspire_database: inspireDatabase, warehouse_id: warehouseId }),
      });
      const data = await resp.json();
      if (data.ok) {
        setCreatingDb(false);
        return true;
      }
    } catch {}
    setCreatingDb(false);
    return false;
  };

  const canProceed = () => {
    switch (step) {
      case 0: return !!databricksHost;
      case 1: return !!token;
      case 2: return !!warehouseId;
      case 3: return !!inspireDatabase && inspireDatabase.includes('.');
      case 4: return verification?.ok;
      default: return false;
    }
  };

  const handleNext = async () => {
    if (step === 3 && inspireDatabase) {
      await createDatabase();
    }
    if (step === 4 && verification?.ok) {
      // Publish notebook if not done
      if (!publishResult?.ok) await publishNotebook();
      onComplete();
      return;
    }
    if (step === 4 && !verification) {
      await runVerification();
      return;
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-6 py-12">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <DatabricksLogo className="w-10 h-10" />
            <h1 className="text-2xl font-bold text-text-primary">Inspire AI Setup</h1>
          </div>
          <p className="text-sm text-text-secondary">Let's get your workspace connected in under 2 minutes.</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                  i === step ? 'bg-db-red text-white' :
                  i < step ? 'bg-success/10 text-success cursor-pointer hover:bg-success/20' :
                  'bg-bg-subtle text-text-tertiary'
                }`}
              >
                {i < step ? <CheckCircle2 size={12} /> : <s.icon size={12} />}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <div className={`w-6 h-px mx-1 ${i < step ? 'bg-success' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="glass rounded-2xl p-8 shadow-xl page-enter" key={step}>
          <h2 className="text-lg font-bold text-text-primary mb-1">{STEPS[step].desc}</h2>
          <p className="text-xs text-text-tertiary mb-6">Step {step + 1} of {STEPS.length}</p>

          {/* Step 0: Connect */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">Databricks Workspace URL</label>
                <input
                  type="text"
                  value={databricksHost}
                  onChange={(e) => update('databricksHost', e.target.value.replace(/\/+$/, ''))}
                  placeholder="https://adb-xxxx.xx.azuredatabricks.net"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-text-primary text-sm focus:border-db-red focus:ring-1 focus:ring-db-red/20 outline-none transition-all"
                />
                <p className="text-[10px] text-text-tertiary mt-1.5">
                  Find this in your browser address bar when logged into Databricks, or in Workspace Settings.
                </p>
              </div>
              {databricksHost && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success-bg text-success text-xs">
                  <CheckCircle2 size={14} /> Workspace URL configured
                </div>
              )}
            </div>
          )}

          {/* Step 1: Authenticate */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex gap-2 mb-4">
                {['pat', 'sp'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => update('authMode', mode)}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                      authMode === mode ? 'border-db-red bg-db-red-50 text-db-red' : 'border-border text-text-secondary hover:border-border-strong'
                    }`}
                  >
                    {mode === 'pat' ? 'Personal Access Token' : 'Service Principal'}
                  </button>
                ))}
              </div>

              {authMode === 'pat' ? (
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1.5 block">Personal Access Token (PAT)</label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => update('token', e.target.value)}
                    placeholder="dapi..."
                    className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-text-primary text-sm font-mono focus:border-db-red focus:ring-1 focus:ring-db-red/20 outline-none transition-all"
                  />
                  <p className="text-[10px] text-text-tertiary mt-1.5">
                    Generate at: Databricks &rarr; User Settings &rarr; Developer &rarr; Access Tokens &rarr; Generate New Token
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-text-secondary mb-1 block">Client ID</label>
                    <input type="text" value={settings.spClientId} onChange={(e) => update('spClientId', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-text-primary text-sm font-mono focus:border-db-red outline-none" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-secondary mb-1 block">Client Secret</label>
                    <input type="password" value={settings.spClientSecret} onChange={(e) => update('spClientSecret', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-text-primary text-sm font-mono focus:border-db-red outline-none" placeholder="dose..." />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-secondary mb-1 block">Tenant ID (Azure)</label>
                    <input type="text" value={settings.spTenantId} onChange={(e) => update('spTenantId', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-text-primary text-sm font-mono focus:border-db-red outline-none" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                  </div>
                </div>
              )}

              {token && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success-bg text-success text-xs">
                  <CheckCircle2 size={14} /> Token configured ({token.slice(0, 6)}...{token.slice(-4)})
                </div>
              )}
            </div>
          )}

          {/* Step 2: Warehouse */}
          {step === 2 && (
            <div className="space-y-3">
              {warehouses.length === 0 ? (
                <div className="flex items-center gap-2 py-8 justify-center text-text-tertiary text-sm">
                  <Loader2 size={16} className="animate-spin" /> Loading warehouses...
                </div>
              ) : (
                <>
                  <p className="text-xs text-text-secondary mb-2">Select a SQL warehouse for executing queries:</p>
                  {warehouses.map(wh => (
                    <button
                      key={wh.id}
                      onClick={() => update('warehouseId', wh.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                        warehouseId === wh.id ? 'border-db-red bg-db-red-50' : 'border-border hover:border-border-strong bg-surface'
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full ${wh.state === 'RUNNING' ? 'bg-success' : wh.state === 'STOPPED' ? 'bg-text-disabled' : 'bg-warning'}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-text-primary">{wh.name}</p>
                        <p className="text-[10px] text-text-tertiary">{wh.id} · {wh.state}{wh.enable_serverless_compute ? ' · Serverless' : ''}</p>
                      </div>
                      {warehouseId === wh.id && <CheckCircle2 size={16} className="text-db-red" />}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Step 3: Database */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-xs text-text-secondary">Inspire AI stores session data and results in a Unity Catalog schema.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1 block">Catalog</label>
                  <select
                    value={selectedCatalog}
                    onChange={(e) => {
                      const schema = inspireDatabase?.split('.')[1] || 'inspire';
                      update('inspireDatabase', `${e.target.value}.${schema}`);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-text-primary text-sm focus:border-db-red outline-none"
                  >
                    <option value="">Select catalog...</option>
                    {catalogs.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1 block">Schema</label>
                  <input
                    type="text"
                    value={inspireDatabase?.split('.')[1] || ''}
                    onChange={(e) => update('inspireDatabase', `${selectedCatalog}.${e.target.value}`)}
                    placeholder="inspire"
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-text-primary text-sm focus:border-db-red outline-none"
                    list="schema-options"
                  />
                  <datalist id="schema-options">
                    {schemas.map(s => <option key={s.name} value={s.name} />)}
                  </datalist>
                </div>
              </div>
              {inspireDatabase && inspireDatabase.includes('.') && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-info-bg text-info text-xs">
                  <Database size={14} /> Will use <span className="font-mono font-bold">{inspireDatabase}</span>
                  {creatingDb && <Loader2 size={12} className="animate-spin ml-1" />}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Verify */}
          {step === 4 && (
            <div className="space-y-4">
              {!verification && !verifying && (
                <div className="text-center py-6">
                  <p className="text-sm text-text-secondary mb-4">Ready to verify your configuration.</p>
                  <button
                    onClick={runVerification}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-db-red text-white text-sm font-semibold rounded-xl hover:bg-db-red-hover transition-colors"
                  >
                    <Sparkles size={16} /> Run Verification
                  </button>
                </div>
              )}

              {verifying && (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <Loader2 size={20} className="animate-spin text-db-red" />
                  <span className="text-sm text-text-secondary">Checking all prerequisites...</span>
                </div>
              )}

              {verification && (
                <div className="space-y-2">
                  {Object.entries(verification.checks).map(([key, check]) => (
                    <div key={key} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${check.ok ? 'border-success/20 bg-success-bg' : 'border-error/20 bg-error-bg'}`}>
                      <StatusIcon status={check.ok ? 'ok' : 'error'} />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-text-primary capitalize">{key}</p>
                        <p className="text-[10px] text-text-secondary">{check.message}</p>
                      </div>
                    </div>
                  ))}

                  {verification.ok && !publishResult && (
                    <button
                      onClick={publishNotebook}
                      disabled={publishing}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 mt-4 bg-db-red text-white text-sm font-semibold rounded-xl hover:bg-db-red-hover transition-colors disabled:opacity-50"
                    >
                      {publishing ? <><Loader2 size={14} className="animate-spin" /> Publishing notebook...</> : <><FileCode size={14} /> Publish Notebook to Workspace</>}
                    </button>
                  )}

                  {publishResult?.ok && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-success/20 bg-success-bg">
                      <CheckCircle2 size={16} className="text-success" />
                      <div>
                        <p className="text-xs font-semibold text-success">Notebook published!</p>
                        <p className="text-[10px] text-text-secondary font-mono">{publishResult.path}</p>
                      </div>
                    </div>
                  )}

                  {!verification.ok && (
                    <button onClick={runVerification} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 mt-2 border border-border text-text-secondary text-xs rounded-xl hover:bg-bg-subtle transition-colors">
                      <RefreshCw size={12} /> Re-check after fixing
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={onComplete}
                className="text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Skip setup
              </button>
              <button
                onClick={handleNext}
                disabled={!canProceed() && step < 4}
                className="flex items-center gap-2 px-6 py-2.5 bg-db-red text-white text-sm font-semibold rounded-xl hover:bg-db-red-hover disabled:opacity-30 transition-all"
              >
                {step === 4 ? (verification?.ok ? 'Launch Inspire AI' : 'Verify') : 'Continue'} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
