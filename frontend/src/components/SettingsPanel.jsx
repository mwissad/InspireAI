import { useState, useEffect, useRef, useCallback } from 'react';
import {
  KeyRound, Server, X, CircleCheck, AlertTriangle,
  Upload, CloudUpload, Loader2, FolderOpen, Rocket,
  FileUp, CheckCircle2, ExternalLink, GitBranch, Layers
} from 'lucide-react';

export default function SettingsPanel({ settings, onChange, onClose, apiFetch }) {
  const update = (key, value) => onChange({ ...settings, [key]: value });
  const hasToken = !!settings.databricksToken;
  const isPublished = settings.runMode === 'pipeline'
    ? !!settings.pipelinePublished
    : !!settings.notebookPublished;

  return (
    <div className="mb-6 mt-4 animate-fade-in-up">
      <div className="rounded-xl border border-white/10 bg-db-navy/40 backdrop-blur-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/[0.02]">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-db-red-light" />
            Connection & Notebook
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Step 1: Token */}
          <StepBlock
            number="1"
            title="Authenticate"
            done={hasToken}
          >
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
              Databricks Personal Access Token
              {hasToken ? (
                <CircleCheck className="w-3 h-3 text-db-teal" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-db-gold" />
              )}
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="password"
                value={settings.databricksToken}
                onChange={(e) => update('databricksToken', e.target.value)}
                placeholder="dapi..."
                className={`w-full pl-9 pr-4 py-2 rounded-lg bg-db-darkest/80 border text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-db-red/40 focus:border-db-red/40 transition-all ${
                  hasToken ? 'border-db-teal/30' : 'border-white/10'
                }`}
              />
            </div>
          </StepBlock>

          {/* Step 2: Run Mode */}
          <StepBlock
            number="2"
            title="Run Mode"
            done={hasToken}
            disabled={!hasToken}
          >
            {hasToken && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 mb-2">Choose how to run the Inspire pipeline:</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => update('runMode', 'pipeline')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      settings.runMode === 'pipeline'
                        ? 'border-db-red/50 bg-db-red/10 ring-1 ring-db-red/30'
                        : 'border-white/10 bg-db-darkest/50 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <GitBranch className={`w-4 h-4 ${settings.runMode === 'pipeline' ? 'text-db-red-light' : 'text-slate-500'}`} />
                      <span className={`text-xs font-semibold ${settings.runMode === 'pipeline' ? 'text-white' : 'text-slate-400'}`}>
                        Pipeline
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-db-teal/20 text-db-teal font-medium">
                        Recommended
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">8 independent notebooks in a Lakeflow DAG</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => update('runMode', 'single')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      settings.runMode === 'single'
                        ? 'border-db-red/50 bg-db-red/10 ring-1 ring-db-red/30'
                        : 'border-white/10 bg-db-darkest/50 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Layers className={`w-4 h-4 ${settings.runMode === 'single' ? 'text-db-red-light' : 'text-slate-500'}`} />
                      <span className={`text-xs font-semibold ${settings.runMode === 'single' ? 'text-white' : 'text-slate-400'}`}>
                        Single Notebook
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">Original monolithic DBC notebook</p>
                  </button>
                </div>
              </div>
            )}
          </StepBlock>

          {/* Step 3: Publish */}
          <StepBlock
            number="3"
            title={settings.runMode === 'pipeline' ? 'Publish Pipeline' : 'Publish Notebook'}
            done={isPublished}
            disabled={!hasToken}
          >
            {hasToken ? (
              settings.runMode === 'pipeline' ? (
                <PipelinePublishSection settings={settings} onChange={onChange} apiFetch={apiFetch} />
              ) : (
                <PublishSection settings={settings} onChange={onChange} apiFetch={apiFetch} />
              )
            ) : (
              <p className="text-xs text-slate-600">Enter your token above first.</p>
            )}
          </StepBlock>

          {/* Optional: Cluster ID */}
          <div className="pt-2 border-t border-white/5">
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
              Cluster ID <span className="text-slate-600">(optional — auto-assigned if empty)</span>
            </label>
            <div className="relative max-w-sm">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
              <input
                type="text"
                value={settings.clusterId}
                onChange={(e) => update('clusterId', e.target.value)}
                placeholder="0123-456789-abcdefgh"
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-db-darkest/80 border border-white/5 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-db-red/40 focus:border-db-red/40 transition-all"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed">
            Your token is only sent to the local backend proxy and is never stored.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Step block wrapper ─── */
function StepBlock({ number, title, done, disabled, children }) {
  return (
    <div className={`${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
          done ? 'bg-db-teal text-white' : 'bg-white/10 text-slate-400'
        }`}>
          {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : number}
        </div>
        <h3 className={`text-sm font-medium ${done ? 'text-db-teal' : 'text-white'}`}>{title}</h3>
      </div>
      <div className="ml-8">{children}</div>
    </div>
  );
}

/* ─── Publish section ─── */
function PublishSection({ settings, onChange, apiFetch }) {
  const [publishState, setPublishState] = useState('idle'); // idle | loading-user | ready | publishing | done | error
  const [username, setUsername] = useState('');
  const [destPath, setDestPath] = useState(settings.notebookPath || '');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [customFile, setCustomFile] = useState(null);
  const fileInputRef = useRef(null);

  // Fetch username to auto-suggest path
  useEffect(() => {
    if (!apiFetch) return;
    let cancelled = false;
    setPublishState('loading-user');
    apiFetch('/api/me')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.username) {
          setUsername(data.username);
          const suggested = `/Users/${data.username}/databricks_inspire_v38`;
          setDestPath(suggested);
        }
        setPublishState('ready');
      })
      .catch(() => {
        if (!cancelled) setPublishState('ready');
      });
    return () => { cancelled = true; };
  }, [apiFetch]);

  const handlePublish = async () => {
    setPublishState('publishing');
    setError('');
    try {
      let res;
      if (customFile) {
        // Upload custom file
        const formData = new FormData();
        formData.append('file', customFile);
        formData.append('destination_path', destPath);
        res = await fetch('/api/publish/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${settings.databricksToken}`,
          },
          body: formData,
        });
      } else {
        // Use bundled DBC
        res = await apiFetch('/api/publish', {
          method: 'POST',
          body: JSON.stringify({ destination_path: destPath }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish');

      // Backend returns the actual notebook path (inside the DBC folder)
      const resolvedPath = data.path || destPath;
      setPublishState('done');
      onChange({
        ...settings,
        notebookPath: resolvedPath,
        notebookPublished: true,
      });
    } catch (err) {
      setError(typeof err.message === 'string' ? err.message : JSON.stringify(err));
      setPublishState('error');
    }
  };

  // Drag & drop handlers
  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.dbc') || file.name.endsWith('.py') || file.name.endsWith('.ipynb'))) {
      setCustomFile(file);
    }
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) setCustomFile(file);
  };

  // Already published
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
          onClick={() => {
            setPublishState('ready');
            onChange({ ...settings, notebookPublished: false });
          }}
          className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          Re-publish or change path →
        </button>
      </div>
    );
  }

  // Loading user
  if (publishState === 'loading-user') {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Detecting workspace user...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 leading-relaxed">
        Publish the Inspire AI notebook to your Databricks workspace. It will be uploaded automatically.
      </p>

      {/* Destination path */}
      <div>
        <label className="text-xs font-medium text-slate-400 mb-1 block">Destination Path</label>
        <div className="relative">
          <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={destPath}
            onChange={(e) => setDestPath(e.target.value)}
            placeholder="/Users/you@company.com/databricks_inspire_v38"
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-db-darkest/80 border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-db-red/30 transition-all"
          />
        </div>
        {username && (
          <p className="text-[10px] text-slate-600 mt-1">
            Auto-detected user: <span className="text-slate-400">{username}</span>
          </p>
        )}
      </div>

      {/* Custom file drop zone (optional) */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-db-red/50 bg-db-red/5'
            : customFile
            ? 'border-db-teal/30 bg-db-teal/5'
            : 'border-white/10 hover:border-white/20 bg-db-darkest/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".dbc,.py,.ipynb"
          onChange={handleFileSelect}
          className="hidden"
        />
        {customFile ? (
          <div className="flex items-center justify-center gap-2">
            <FileUp className="w-4 h-4 text-db-teal" />
            <span className="text-xs text-db-teal font-medium">{customFile.name}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setCustomFile(null); }}
              className="text-slate-500 hover:text-white ml-1"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="py-1">
            <CloudUpload className="w-5 h-5 text-slate-500 mx-auto mb-1" />
            <p className="text-[11px] text-slate-500">
              <span className="text-slate-400 font-medium">Optional:</span> drop a custom <code className="text-slate-400">.dbc</code> file here
            </p>
            <p className="text-[10px] text-slate-600">or use the bundled Inspire v38 notebook</p>
          </div>
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
        disabled={!destPath.trim() || publishState === 'publishing'}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md shadow-db-red/15"
      >
        {publishState === 'publishing' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Publishing to workspace...
          </>
        ) : (
          <>
            <Rocket className="w-4 h-4" />
            Publish Notebook
          </>
        )}
      </button>
    </div>
  );
}

/* ─── Pipeline Publish section (multi-notebook) ─── */
function PipelinePublishSection({ settings, onChange, apiFetch }) {
  const [publishState, setPublishState] = useState('idle');
  const [username, setUsername] = useState('');
  const [destPath, setDestPath] = useState(settings.pipelineBasePath || '');
  const [error, setError] = useState('');
  const [pipelineInfo, setPipelineInfo] = useState(null);
  const [publishProgress, setPublishProgress] = useState(null);

  // Fetch pipeline info + username
  useEffect(() => {
    if (!apiFetch) return;
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
  }, [apiFetch]);

  const handlePublish = async () => {
    setPublishState('publishing');
    setError('');
    setPublishProgress(null);
    try {
      const res = await apiFetch('/api/publish/pipeline', {
        method: 'POST',
        body: JSON.stringify({ destination_path: destPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish pipeline');

      setPublishProgress(data);
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
            <p className="text-xs font-medium text-db-teal">Pipeline published! ({pipelineInfo?.task_count || 8} notebooks)</p>
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
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Detecting workspace user...
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
        <div className="rounded-lg border border-white/5 bg-db-darkest/50 p-3">
          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-2">Pipeline Tasks</p>
          <div className="space-y-1">
            {pipelineInfo.tasks.map((t, i) => (
              <div key={t.task_key} className="flex items-center gap-2 text-[11px]">
                <span className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[9px] text-slate-500 font-mono">
                  {i + 1}
                </span>
                <span className="text-slate-400 flex-1 truncate">{t.description || t.task_key}</span>
                {t.depends_on?.length > 0 && (
                  <span className="text-[9px] text-slate-600">← {t.depends_on[0]}</span>
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
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-db-darkest/80 border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-db-red/30 transition-all"
          />
        </div>
        {username && (
          <p className="text-[10px] text-slate-600 mt-1">
            User: <span className="text-slate-400">{username}</span>
          </p>
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
        disabled={!destPath.trim() || publishState === 'publishing'}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md shadow-db-red/15"
      >
        {publishState === 'publishing' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Publishing {pipelineInfo?.notebooks?.length || 9} notebooks...
          </>
        ) : (
          <>
            <GitBranch className="w-4 h-4" />
            Publish Pipeline Notebooks
          </>
        )}
      </button>

      {!pipelineInfo?.available && (
        <p className="text-[10px] text-db-gold flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Pipeline notebooks not found. Run <code>python3 split_notebook.py</code> first.
        </p>
      )}
    </div>
  );
}
