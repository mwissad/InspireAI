import { useState, useEffect, useRef, useCallback } from 'react';
import {
  KeyRound, Server, CircleCheck, AlertTriangle,
  Upload, CloudUpload, Loader2, FolderOpen, Rocket,
  FileUp, CheckCircle2, X, Shield, Plug, BookOpen,
  GitBranch, Layers
} from 'lucide-react';
import DatabricksLogo from '../components/DatabricksLogo';

export default function ConfigPage({ settings, onChange, apiFetch, onReady }) {
  const update = (key, value) => onChange({ ...settings, [key]: value });
  const hasToken = !!settings.databricksToken;
  const isPipeline = settings.runMode === 'pipeline';
  const isPublished = isPipeline
    ? !!settings.pipelinePublished
    : !!settings.notebookPublished;
  const isReady = hasToken && isPublished;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="text-center pt-2 pb-4">
        <div className="w-14 h-14 rounded-2xl bg-db-navy/60 border border-white/10 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-7 h-7 text-db-red-light" />
        </div>
        <h1 className="text-xl font-bold text-white">Configuration</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
          Connect to your Databricks workspace and publish the Inspire notebook.
        </p>
      </div>

      {/* Step 1: Token */}
      <StepCard
        number="1"
        title="Authenticate"
        description="Enter your Databricks Personal Access Token"
        done={hasToken}
        icon={KeyRound}
      >
        <div className="relative">
          <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="password"
            value={settings.databricksToken}
            onChange={(e) => update('databricksToken', e.target.value)}
            placeholder="dapi..."
            className={`w-full pl-11 pr-4 py-3 rounded-lg bg-db-darkest/80 border text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-db-red/40 focus:border-db-red/40 transition-all ${
              hasToken ? 'border-db-teal/30' : 'border-white/10'
            }`}
          />
          {hasToken && <CircleCheck className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-db-teal" />}
        </div>
        <p className="text-[11px] text-slate-600 mt-2">
          Your token is only sent to the local backend and is never stored.
        </p>
      </StepCard>

      {/* Step 2: Run Mode */}
      <StepCard
        number="2"
        title="Run Mode"
        description="Choose how to execute the Inspire pipeline"
        done={hasToken}
        disabled={!hasToken}
        icon={GitBranch}
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => update('runMode', 'pipeline')}
            className={`p-4 rounded-xl border text-left transition-all ${
              isPipeline
                ? 'border-db-red/50 bg-db-red/10 ring-1 ring-db-red/30'
                : 'border-white/10 bg-db-darkest/50 hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <GitBranch className={`w-4 h-4 ${isPipeline ? 'text-db-red-light' : 'text-slate-500'}`} />
              <span className={`text-sm font-semibold ${isPipeline ? 'text-white' : 'text-slate-400'}`}>
                Pipeline
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              8 independent notebooks in a Lakeflow DAG with per-task monitoring.
            </p>
            <span className="inline-block mt-2 text-[9px] px-2 py-0.5 rounded-full bg-db-teal/20 text-db-teal font-semibold uppercase tracking-wider">
              Recommended
            </span>
          </button>

          <button
            type="button"
            onClick={() => update('runMode', 'single')}
            className={`p-4 rounded-xl border text-left transition-all ${
              !isPipeline
                ? 'border-db-red/50 bg-db-red/10 ring-1 ring-db-red/30'
                : 'border-white/10 bg-db-darkest/50 hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Layers className={`w-4 h-4 ${!isPipeline ? 'text-db-red-light' : 'text-slate-500'}`} />
              <span className={`text-sm font-semibold ${!isPipeline ? 'text-white' : 'text-slate-400'}`}>
                Single Notebook
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Original monolithic DBC notebook in one task.
            </p>
          </button>
        </div>
      </StepCard>

      {/* Step 3: Publish */}
      <StepCard
        number="3"
        title={isPipeline ? 'Publish Pipeline' : 'Publish Notebook'}
        description={isPipeline
          ? 'Upload the split notebooks to your workspace'
          : 'Upload the Inspire notebook to your workspace'
        }
        done={isPublished}
        disabled={!hasToken}
        icon={BookOpen}
      >
        {hasToken ? (
          isPipeline ? (
            <PipelinePublishSection settings={settings} onChange={onChange} apiFetch={apiFetch} />
          ) : (
            <SinglePublishSection settings={settings} onChange={onChange} apiFetch={apiFetch} />
          )
        ) : (
          <p className="text-xs text-slate-600 py-2">Enter your token above first.</p>
        )}
      </StepCard>

      {/* Step 4: Cluster (optional) */}
      <StepCard
        number="4"
        title="Compute (Optional)"
        description="Specify an existing cluster or leave empty for auto-assignment"
        done={!!settings.clusterId}
        icon={Server}
        optional
      >
        <div className="relative">
          <Server className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={settings.clusterId}
            onChange={(e) => update('clusterId', e.target.value)}
            placeholder="0123-456789-abcdefgh (auto-assigned if empty)"
            className="w-full pl-11 pr-4 py-3 rounded-lg bg-db-darkest/80 border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-db-red/40 focus:border-db-red/40 transition-all"
          />
        </div>
      </StepCard>

      {/* Ready banner + Go button */}
      {isReady && (
        <div className="animate-fade-in-up">
          <div className="rounded-2xl border border-db-teal/30 bg-db-teal/5 p-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-db-teal mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">You're all set!</h3>
            <p className="text-sm text-slate-400 mb-1">
              Configuration is complete. Start configuring your Inspire AI job.
            </p>
            <p className="text-xs text-slate-500 mb-5">
              Mode: <span className="text-slate-300 font-medium">{isPipeline ? 'Pipeline (8 tasks)' : 'Single Notebook'}</span>
            </p>
            <button
              onClick={onReady}
              className="inline-flex items-center gap-2.5 px-8 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange transition-all shadow-lg shadow-db-red/25 hover:shadow-db-red/40 active:scale-[0.97]"
            >
              <Rocket className="w-5 h-5" />
              Go to Launch
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Step Card ─── */
function StepCard({ number, title, description, done, disabled, icon: Icon, optional, children }) {
  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${
      disabled ? 'opacity-40 pointer-events-none border-white/5 bg-db-navy/20' :
      done ? 'border-db-teal/20 bg-db-teal/[0.03]' : 'border-white/10 bg-db-navy/40'
    }`}>
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/5">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          done ? 'bg-db-teal text-white' : 'bg-white/10 text-slate-400'
        }`}>
          {done ? <CheckCircle2 className="w-4 h-4" /> : number}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-semibold ${done ? 'text-db-teal' : 'text-white'}`}>
            {title}
            {optional && <span className="ml-2 text-[10px] text-slate-500 font-normal">Optional</span>}
          </h3>
          <p className="text-[11px] text-slate-500">{description}</p>
        </div>
        <Icon className={`w-4 h-4 flex-shrink-0 ${done ? 'text-db-teal/60' : 'text-slate-600'}`} />
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/* ─── Single Notebook Publish Section ─── */
function SinglePublishSection({ settings, onChange, apiFetch }) {
  const [publishState, setPublishState] = useState(
    settings.notebookPublished ? 'done' : 'idle'
  );
  const [username, setUsername] = useState('');
  const [destPath, setDestPath] = useState(settings.notebookPath || '');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [customFile, setCustomFile] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!apiFetch || settings.notebookPublished) return;
    let cancelled = false;
    setPublishState('loading-user');
    apiFetch('/api/me')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.username) {
          setUsername(data.username);
          if (!destPath) setDestPath(`/Users/${data.username}/databricks_inspire_v38`);
        }
        setPublishState('ready');
      })
      .catch(() => { if (!cancelled) setPublishState('ready'); });
    return () => { cancelled = true; };
  }, [apiFetch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePublish = async () => {
    setPublishState('publishing');
    setError('');
    try {
      let res;
      if (customFile) {
        const formData = new FormData();
        formData.append('file', customFile);
        formData.append('destination_path', destPath);
        res = await fetch('/api/publish/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${settings.databricksToken}` },
          body: formData,
        });
      } else {
        res = await apiFetch('/api/publish', {
          method: 'POST',
          body: JSON.stringify({ destination_path: destPath }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish');
      const resolvedPath = data.path || destPath;
      setPublishState('done');
      onChange({ ...settings, notebookPath: resolvedPath, notebookPublished: true });
    } catch (err) {
      setError(typeof err.message === 'string' ? err.message : JSON.stringify(err));
      setPublishState('error');
    }
  };

  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && /\.(dbc|py|ipynb)$/i.test(file.name)) setCustomFile(file);
  }, []);

  if (settings.notebookPublished || publishState === 'done') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-db-teal/10 border border-db-teal/30">
          <CheckCircle2 className="w-4 h-4 text-db-teal flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-db-teal">Notebook published!</p>
            <p className="text-[11px] text-slate-400 font-mono truncate">{settings.notebookPath}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setPublishState('ready'); onChange({ ...settings, notebookPublished: false }); }}
          className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          Re-publish or change path →
        </button>
      </div>
    );
  }

  if (publishState === 'loading-user') {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Detecting workspace user...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-slate-400 mb-1 block">Destination Path</label>
        <div className="relative">
          <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={destPath}
            onChange={(e) => setDestPath(e.target.value)}
            placeholder="/Users/you@company.com/databricks_inspire_v38"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-db-darkest/80 border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-db-red/30 transition-all"
          />
        </div>
        {username && (
          <p className="text-[10px] text-slate-600 mt-1">Auto-detected: <span className="text-slate-400">{username}</span></p>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-all ${
          dragOver ? 'border-db-red/50 bg-db-red/5'
            : customFile ? 'border-db-teal/30 bg-db-teal/5'
            : 'border-white/10 hover:border-white/20 bg-db-darkest/30'
        }`}
      >
        <input ref={fileInputRef} type="file" accept=".dbc,.py,.ipynb" onChange={(e) => { if (e.target.files?.[0]) setCustomFile(e.target.files[0]); }} className="hidden" />
        {customFile ? (
          <div className="flex items-center justify-center gap-2">
            <FileUp className="w-4 h-4 text-db-teal" />
            <span className="text-xs text-db-teal font-medium">{customFile.name}</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); setCustomFile(null); }} className="text-slate-500 hover:text-white ml-1"><X className="w-3 h-3" /></button>
          </div>
        ) : (
          <div className="py-1">
            <CloudUpload className="w-5 h-5 text-slate-500 mx-auto mb-1" />
            <p className="text-[11px] text-slate-500"><span className="text-slate-400 font-medium">Optional:</span> drop a custom <code className="text-slate-400">.dbc</code> file</p>
            <p className="text-[10px] text-slate-600">or use the bundled Inspire v38 notebook</p>
          </div>
        )}
      </div>

      {error && <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>}

      <button
        type="button"
        onClick={handlePublish}
        disabled={!destPath.trim() || publishState === 'publishing'}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md shadow-db-red/15"
      >
        {publishState === 'publishing' ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Publishing...</>
        ) : (
          <><Rocket className="w-4 h-4" /> Publish Notebook</>
        )}
      </button>
    </div>
  );
}

/* ─── Pipeline Publish Section (multi-notebook) ─── */
function PipelinePublishSection({ settings, onChange, apiFetch }) {
  const [publishState, setPublishState] = useState(
    settings.pipelinePublished ? 'done' : 'idle'
  );
  const [username, setUsername] = useState('');
  const [destPath, setDestPath] = useState(settings.pipelineBasePath || '');
  const [error, setError] = useState('');
  const [pipelineInfo, setPipelineInfo] = useState(null);

  // Fetch pipeline info + username
  useEffect(() => {
    if (!apiFetch || settings.pipelinePublished) return;
    let cancelled = false;
    setPublishState('loading-user');

    Promise.all([
      apiFetch('/api/me').then(r => r.json()).catch(() => ({})),
      fetch('/api/pipeline/info').then(r => r.json()).catch(() => ({})),
    ]).then(([userData, pInfo]) => {
      if (cancelled) return;
      if (userData.username) {
        setUsername(userData.username);
        if (!destPath) {
          setDestPath(`/Users/${userData.username}/inspire_pipeline`);
        }
      }
      setPipelineInfo(pInfo);
      setPublishState('ready');
    });
    return () => { cancelled = true; };
  }, [apiFetch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePublish = async () => {
    setPublishState('publishing');
    setError('');
    try {
      const res = await apiFetch('/api/publish/pipeline', {
        method: 'POST',
        body: JSON.stringify({ destination_path: destPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish pipeline');

      if (data.errors?.length > 0) {
        setError(`${data.errors.length} notebook(s) failed to publish`);
        setPublishState('error');
      } else {
        setPublishState('done');
        onChange({
          ...settings,
          pipelineBasePath: data.base_path || destPath,
          pipelinePublished: true,
        });
      }
    } catch (err) {
      setError(err.message);
      setPublishState('error');
    }
  };

  // Already published
  if (settings.pipelinePublished || publishState === 'done') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-db-teal/10 border border-db-teal/30">
          <CheckCircle2 className="w-4 h-4 text-db-teal flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-db-teal">
              Pipeline published! ({pipelineInfo?.task_count || 8} notebooks)
            </p>
            <p className="text-[11px] text-slate-400 font-mono truncate">{settings.pipelineBasePath}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setPublishState('ready');
            onChange({ ...settings, pipelinePublished: false });
          }}
          className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          Re-publish or change path →
        </button>
      </div>
    );
  }

  if (publishState === 'loading-user') {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Detecting workspace & pipeline info...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 leading-relaxed">
        Publish <strong className="text-slate-300">{pipelineInfo?.notebooks?.length || 9} independent notebooks</strong> to
        your workspace. They will run as a Lakeflow DAG with sequential dependencies.
      </p>

      {/* Pipeline tasks preview */}
      {pipelineInfo?.tasks?.length > 0 && (
        <div className="rounded-lg border border-white/5 bg-db-darkest/50 p-3 max-h-48 overflow-y-auto">
          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-2">Pipeline Tasks</p>
          <div className="space-y-1">
            {pipelineInfo.tasks.map((t, i) => (
              <div key={t.task_key} className="flex items-center gap-2 text-[11px]">
                <span className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[9px] text-slate-500 font-mono flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-slate-400 flex-1 truncate">{t.description || t.task_key}</span>
                {t.depends_on?.length > 0 && (
                  <span className="text-[9px] text-slate-600 flex-shrink-0">← {t.depends_on[0]}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Destination path */}
      <div>
        <label className="text-xs font-medium text-slate-400 mb-1 block">Destination Folder</label>
        <div className="relative">
          <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={destPath}
            onChange={(e) => setDestPath(e.target.value)}
            placeholder="/Users/you@company.com/inspire_pipeline"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-db-darkest/80 border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-db-red/30 transition-all"
          />
        </div>
        {username && (
          <p className="text-[10px] text-slate-600 mt-1">User: <span className="text-slate-400">{username}</span></p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Publish button */}
      <button
        type="button"
        onClick={handlePublish}
        disabled={!destPath.trim() || publishState === 'publishing' || !pipelineInfo?.available}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md shadow-db-red/15"
      >
        {publishState === 'publishing' ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Publishing {pipelineInfo?.notebooks?.length || 9} notebooks...</>
        ) : (
          <><GitBranch className="w-4 h-4" /> Publish Pipeline Notebooks</>
        )}
      </button>

      {!pipelineInfo?.available && (
        <p className="text-[10px] text-db-gold flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Pipeline notebooks not found. Run <code className="text-slate-400 bg-db-darkest/80 px-1 py-0.5 rounded">python3 split_notebook.py</code> first.
        </p>
      )}
    </div>
  );
}
