import { useState, useEffect } from 'react';
import {
  KeyRound, Upload, CheckCircle2, AlertCircle, Loader2,
  Server, Database, ChevronRight, Shield, RefreshCw, Eye, EyeOff, Zap
} from 'lucide-react';
import DatabricksLogo from '../components/DatabricksLogo';

export default function ConfigPage({ settings, update, apiFetch, onNext }) {
  // ── Token state ──
  const [tokenStatus, setTokenStatus] = useState('idle');
  const [tokenError, setTokenError] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [username, setUsername] = useState('');

  // ── Warehouse state ──
  const [warehouses, setWarehouses] = useState([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);

  // ── Publish state ──
  const [destPath, setDestPath] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState('idle');
  const [publishError, setPublishError] = useState('');
  const [publishedNotebookPath, setPublishedNotebookPath] = useState('');

  // ── DBC info ──
  const [dbcInfo, setDbcInfo] = useState(null);

  useEffect(() => {
    fetch('/api/dbc/info')
      .then(r => r.json())
      .then(data => setDbcInfo(data))
      .catch(() => {});
  }, []);

  const testConnection = async () => {
    if (!settings.databricksToken) return;
    setTokenStatus('testing');
    setTokenError('');
    try {
      const res = await apiFetch('/api/me');
      if (!res.ok) {
        setTokenStatus('error');
        setTokenError(`Connection failed (${res.status}). Check your token.`);
        return;
      }
      const data = await res.json();
      if (data.username) {
        setTokenStatus('ok');
        setUsername(data.username);
        if (!destPath) setDestPath(`/Users/${data.username}/databricks_inspire_v41`);
      } else {
        setTokenStatus('error');
        setTokenError('Token accepted but no username returned.');
      }
    } catch {
      setTokenStatus('error');
      setTokenError('Network error. Is the backend running?');
    }
  };

  useEffect(() => {
    if (tokenStatus !== 'ok') return;
    setLoadingWarehouses(true);
    apiFetch('/api/warehouses')
      .then(r => r.json())
      .then(data => {
        setWarehouses(data.warehouses || []);
        if (!settings.warehouseId && data.warehouses?.length > 0)
          update('warehouseId', data.warehouses[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingWarehouses(false));
  }, [tokenStatus]);

  const publishNotebook = async () => {
    if (!destPath) return;
    setPublishing(true);
    setPublishStatus('idle');
    setPublishError('');
    try {
      const res = await apiFetch('/api/publish', {
        method: 'POST',
        body: JSON.stringify({ destination_path: destPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPublishStatus('error');
        setPublishError(data.error || 'Publish failed.');
        return;
      }
      setPublishStatus('ok');
      setPublishedNotebookPath(data.path);
      update('notebookPath', data.path);
      update('publishedFolder', data.folder_path || destPath);
    } catch (err) {
      setPublishStatus('error');
      setPublishError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  const refreshWarehouses = () => {
    setLoadingWarehouses(true);
    apiFetch('/api/warehouses')
      .then(r => r.json())
      .then(data => setWarehouses(data.warehouses || []))
      .catch(() => {})
      .finally(() => setLoadingWarehouses(false));
  };

  const tokenPreview = settings.databricksToken
    ? `${settings.databricksToken.slice(0, 4)}...${settings.databricksToken.slice(-4)} (${settings.databricksToken.length} chars)`
    : '';
  const tokenLooksValid = settings.databricksToken?.startsWith('dapi');
  const isConnected = tokenStatus === 'ok';
  const hasWarehouse = !!settings.warehouseId;
  const isPublished = publishStatus === 'ok' || !!settings.notebookPath;
  const canProceed = isConnected && hasWarehouse && isPublished;

  return (
    <div className="min-h-screen bg-db-darkest relative">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] bg-db-red/3 rounded-full blur-[180px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-db-orange/3 rounded-full blur-[150px]" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,54,33,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,54,33,0.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Hero header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="h-px w-10 bg-gradient-to-r from-transparent to-db-red/60" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-db-red-light flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Setup
            </span>
            <span className="h-px w-10 bg-gradient-to-l from-transparent to-db-red/60" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">
            Configure{' '}
            <span className="bg-gradient-to-r from-db-red via-db-orange to-db-gold bg-clip-text text-transparent">
              Inspire AI
            </span>
          </h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Connect your Databricks workspace, select a SQL warehouse, and publish the notebook
          </p>
        </div>

        {/* Progress line */}
        <div className="flex items-center justify-center gap-0 mb-10">
          {[
            { done: isConnected, label: 'Connect' },
            { done: hasWarehouse, label: 'Warehouse' },
            { done: isPublished, label: 'Publish' },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center">
              {i > 0 && (
                <div className={`w-12 sm:w-20 h-px ${step.done ? 'bg-db-teal' : 'bg-white/8'}`} />
              )}
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  step.done
                    ? 'bg-db-teal/15 border-db-teal text-db-teal'
                    : 'bg-db-navy/30 border-white/10 text-slate-500'
                }`}>
                  {step.done ? <CheckCircle2 size={16} /> : i + 1}
                </div>
                <span className={`text-[10px] font-semibold ${step.done ? 'text-db-teal' : 'text-slate-600'}`}>
                  {step.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ═══ Step 1: Token ═══ */}
        <section className="mb-6 rounded-2xl border border-white/5 bg-db-navy/15 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-db-navy/30">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg ${
              isConnected
                ? 'bg-gradient-to-br from-db-teal to-emerald-600'
                : 'bg-gradient-to-br from-db-red to-db-orange'
            }`}>
              {isConnected ? <CheckCircle2 className="w-4 h-4 text-white" /> : <KeyRound className="w-4 h-4 text-white" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Databricks Connection</h2>
              <p className="text-[11px] text-slate-500">Personal Access Token (PAT)</p>
            </div>
            {isConnected && (
              <span className="ml-auto text-[10px] font-semibold text-db-teal bg-db-teal/10 px-2.5 py-1 rounded-full border border-db-teal/20">
                Connected as {username}
              </span>
            )}
          </div>

          <div className="p-6 space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1 group">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-db-red-light transition-colors" size={14} />
                <input
                  type={showToken ? 'text' : 'password'}
                  className="w-full bg-db-darkest/60 border border-white/8 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-db-red/40 focus:ring-1 focus:ring-db-red/20 transition-all"
                  placeholder="dapi..."
                  value={settings.databricksToken}
                  onChange={e => {
                    update('databricksToken', e.target.value);
                    setTokenStatus('idle');
                    setTokenError('');
                  }}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                onClick={testConnection}
                disabled={!settings.databricksToken || tokenStatus === 'testing'}
                className="px-5 py-2.5 bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap shadow-lg shadow-db-red/15 hover:shadow-db-red/25 disabled:shadow-none"
              >
                {tokenStatus === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                Test
              </button>
            </div>

            {settings.databricksToken && (
              <div className="text-[11px] text-slate-500">
                Token: <span className="font-mono">{tokenPreview}</span>
                {!tokenLooksValid && (
                  <span className="ml-2 text-db-gold">⚠ Does not start with "dapi"</span>
                )}
              </div>
            )}

            {tokenStatus === 'error' && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/8 p-3 rounded-xl border border-red-500/15">
                <AlertCircle size={14} /> <span>{tokenError}</span>
              </div>
            )}
          </div>
        </section>

        {/* ═══ Step 2: SQL Warehouse ═══ */}
        <section className={`mb-6 rounded-2xl border border-white/5 bg-db-navy/15 backdrop-blur-sm overflow-hidden transition-all duration-300 ${!isConnected ? 'opacity-30 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-db-navy/30">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg ${
              hasWarehouse
                ? 'bg-gradient-to-br from-db-teal to-emerald-600'
                : 'bg-gradient-to-br from-purple-500 to-blue-500'
            }`}>
              {hasWarehouse ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Server className="w-4 h-4 text-white" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">SQL Warehouse</h2>
              <p className="text-[11px] text-slate-500">For tracking pipeline progress & querying results</p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {loadingWarehouses ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                <Loader2 size={14} className="animate-spin" /> Loading warehouses...
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {warehouses.map(w => {
                    const selected = settings.warehouseId === w.id;
                    const isRunning = w.state === 'RUNNING';
                    return (
                      <button
                        key={w.id}
                        onClick={() => update('warehouseId', w.id)}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex items-center gap-3 ${
                          selected
                            ? 'bg-db-teal/8 border-db-teal/25 shadow-sm'
                            : 'bg-db-darkest/40 border-white/5 hover:border-white/10 hover:bg-db-navy/20'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
                          selected ? 'border-db-teal bg-db-teal' : 'border-slate-600'
                        }`}>
                          {selected && <div className="w-1 h-1 rounded-full bg-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-medium ${selected ? 'text-white' : 'text-slate-300'}`}>
                            {w.name}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-2">{w.cluster_size}</span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                          isRunning
                            ? 'bg-db-teal/10 text-db-teal border-db-teal/20'
                            : 'bg-slate-700/30 text-slate-500 border-slate-600/30'
                        }`}>
                          {w.state}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {warehouses.length === 0 && isConnected && (
                  <p className="text-sm text-db-gold py-2">No SQL Warehouses found. Create one in Databricks first.</p>
                )}

                <button
                  onClick={refreshWarehouses}
                  className="text-xs text-slate-500 hover:text-db-red-light flex items-center gap-1 transition-colors"
                >
                  <RefreshCw size={11} /> Refresh
                </button>
              </>
            )}
          </div>
        </section>

        {/* ═══ Step 3: Publish ═══ */}
        <section className={`mb-8 rounded-2xl border border-white/5 bg-db-navy/15 backdrop-blur-sm overflow-hidden transition-all duration-300 ${!isConnected || !hasWarehouse ? 'opacity-30 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-db-navy/30">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg ${
              isPublished
                ? 'bg-gradient-to-br from-db-teal to-emerald-600'
                : 'bg-gradient-to-br from-db-gold to-amber-500'
            }`}>
              {isPublished ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Upload className="w-4 h-4 text-white" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Publish Notebook</h2>
              <p className="text-[11px] text-slate-500">Upload Inspire AI v41 to your workspace</p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {dbcInfo && (
              <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-db-darkest/40 rounded-lg px-3 py-2 border border-white/5">
                <Database size={12} className="text-db-orange" />
                <span>
                  <span className="text-slate-400 font-medium">{dbcInfo.file}</span>
                  <span className="text-slate-600 mx-1">·</span>
                  {(dbcInfo.size / 1024).toFixed(0)} KB
                  {dbcInfo.notebooks?.length > 0 && (
                    <><span className="text-slate-600 mx-1">·</span>{dbcInfo.notebooks[0].command_count} commands</>
                  )}
                </span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Destination Path
              </label>
              <div className="relative group">
                <Upload className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-db-red-light transition-colors" size={14} />
                <input
                  type="text"
                  className="w-full bg-db-darkest/60 border border-white/8 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-db-red/40 focus:ring-1 focus:ring-db-red/20 transition-all font-mono"
                  placeholder={`/Users/${username || 'you@company.com'}/databricks_inspire_v41`}
                  value={destPath}
                  onChange={e => setDestPath(e.target.value)}
                />
              </div>
            </div>

            <button
              onClick={publishNotebook}
              disabled={publishing || !destPath}
              className="w-full py-3 bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-db-red/15 hover:shadow-db-red/25 disabled:shadow-none"
            >
              {publishing ? (
                <><Loader2 size={16} className="animate-spin" /> Publishing...</>
              ) : (
                <><Upload size={16} /> Publish Inspire v41 Notebook</>
              )}
            </button>

            {publishStatus === 'ok' && (
              <div className="flex items-center gap-2 text-db-teal text-sm bg-db-teal/8 p-3 rounded-xl border border-db-teal/15">
                <CheckCircle2 size={14} />
                <span>Published! <code className="text-[11px] bg-db-darkest/50 px-1.5 py-0.5 rounded font-mono">{publishedNotebookPath || settings.notebookPath}</code></span>
              </div>
            )}
            {publishStatus === 'error' && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/8 p-3 rounded-xl border border-red-500/15">
                <AlertCircle size={14} /> <span>{publishError}</span>
              </div>
            )}
          </div>
        </section>

        {/* ═══ Continue ═══ */}
        <div className="flex justify-center">
          <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-db-navy/40 to-db-darkest p-8 text-center overflow-hidden w-full max-w-md">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[150px] bg-db-teal/5 rounded-full blur-[80px]" />
            <div className="relative z-10">
              <DatabricksLogo className="w-10 h-10 mx-auto mb-3 opacity-70" />
              <button
                onClick={onNext}
                disabled={!canProceed}
                className="px-8 py-3.5 bg-gradient-to-r from-db-teal to-emerald-500 hover:from-db-teal hover:to-emerald-400 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 rounded-xl font-bold text-sm transition-all flex items-center gap-2 mx-auto shadow-lg shadow-db-teal/20 hover:shadow-db-teal/30 disabled:shadow-none hover:scale-[1.02] active:scale-[0.98]"
              >
                Continue to Launch <ChevronRight size={16} />
              </button>
              {!canProceed && (
                <p className="text-[10px] text-slate-600 mt-3">Complete all three steps above to continue</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
