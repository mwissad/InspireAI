import { useState, useCallback } from 'react';
import { Settings, Rocket, Activity, Home, Sparkles } from 'lucide-react';
import DatabricksLogo from './components/DatabricksLogo';
import LandingPage from './pages/LandingPage';
import ConfigPage from './pages/ConfigPage';
import LaunchPage from './pages/LaunchPage';
import MonitorPage from './pages/MonitorPage';
import ResultsPage from './pages/ResultsPage';

function apiHeaders(token) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const PAGES = [
  { id: 'config',  label: 'Config',  icon: Settings },
  { id: 'launch',  label: 'Launch',  icon: Rocket },
  { id: 'monitor', label: 'Monitor', icon: Activity },
  { id: 'results', label: 'Results', icon: Sparkles },
];

export default function App() {
  const [page, setPage] = useState('landing');
  const [settings, setSettings] = useState({
    databricksToken: '',
    notebookPath: '',
    notebookPublished: false,
    clusterId: '',
  });
  const [runId, setRunId] = useState(null);
  const [lastJobParams, setLastJobParams] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const isConnected = !!settings.databricksToken;
  const isReady = isConnected && !!settings.notebookPath;

  const apiFetch = useCallback(
    (url, options = {}) =>
      fetch(url, {
        ...options,
        headers: {
          ...apiHeaders(settings.databricksToken),
          ...options.headers,
        },
      }),
    [settings.databricksToken]
  );

  const handleSubmit = async (params) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // v41: single notebook run
      const res = await apiFetch('/api/run', {
        method: 'POST',
        body: JSON.stringify({
          params,
          cluster_id: settings.clusterId || undefined,
          notebook_path: settings.notebookPath || undefined,
        }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server returned invalid response (HTTP ${res.status}). Is the backend running?`);
      }
      if (!res.ok) throw new Error(data.error || `Failed to submit (HTTP ${res.status})`);
      setRunId(data.run_id);
      setLastJobParams(params);
      setPage('monitor');
    } catch (err) {
      const msg = err.message === 'Failed to fetch'
        ? 'Could not connect to backend. Make sure it is running on port 3001.'
        : err.message;
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewRun = () => {
    setRunId(null);
    setLastJobParams(null);
    setSubmitError(null);
    setPage('launch');
  };

  // Determine which pages are accessible
  const canLaunch = isReady;
  const canMonitor = !!runId;

  // ─── Landing page (full-screen, no nav) ───
  if (page === 'landing') {
    return <LandingPage onGetStarted={() => setPage('config')} />;
  }

  return (
    <div className="min-h-screen bg-db-darkest">
      {/* Ambient background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-db-red/4 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-db-orange/3 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-db-navy/20 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10">
        {/* ─── Top navigation bar ─── */}
        <nav className="sticky top-0 z-50 backdrop-blur-xl bg-db-darkest/80 border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-14 gap-4">
              {/* Logo — click to go home */}
              <button
                onClick={() => setPage('landing')}
                className="flex items-center gap-2.5 mr-4 hover:opacity-80 transition-opacity"
                title="Back to Home"
              >
                <DatabricksLogo className="w-6 h-6" />
                <span className="text-sm font-bold text-white tracking-tight">
                  Inspire <span className="text-db-red">AI</span>
                </span>
              </button>

              {/* Page tabs */}
              <div className="flex items-center gap-1 flex-1">
                <button
                  onClick={() => setPage('landing')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all text-slate-400 hover:text-white hover:bg-white/5`}
                >
                  <Home className="w-3.5 h-3.5" />
                  Home
                </button>
                {PAGES.map((p) => {
                  const Icon = p.icon;
                  const active = page === p.id;
                  const disabled = (p.id === 'launch' && !canLaunch) || (p.id === 'monitor' && !canMonitor) || (p.id === 'results' && !isConnected);
                  return (
                    <button
                      key={p.id}
                      onClick={() => !disabled && setPage(p.id)}
                      disabled={disabled}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        active
                          ? 'bg-db-red/15 text-db-red-light border border-db-red/30'
                          : disabled
                          ? 'text-slate-600 cursor-not-allowed'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {p.label}
                      {p.id === 'monitor' && runId && (
                        <span className="w-1.5 h-1.5 rounded-full bg-db-orange animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Status indicator */}
              <div className="flex items-center gap-2">
                {isReady && (
                  <span className="flex items-center gap-1.5 text-[10px] text-db-teal font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-db-teal" />
                    Connected
                  </span>
                )}
              </div>
            </div>
          </div>
        </nav>

        {/* ─── Page content ─── */}
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16">
          {page === 'config' && (
            <ConfigPage
              settings={settings}
              onChange={setSettings}
              apiFetch={isConnected ? apiFetch : null}
              onReady={() => setPage('launch')}
            />
          )}

          {page === 'launch' && canLaunch && (
            <LaunchPage
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              submitError={submitError}
              apiFetch={apiFetch}
            />
          )}

          {page === 'monitor' && canMonitor && (
            <MonitorPage
              runId={runId}
              inspireDatabase={lastJobParams?.['02_inspire_database'] || ''}
              onNewRun={handleNewRun}
              onBack={handleNewRun}
              apiFetch={apiFetch}
            />
          )}

          {page === 'results' && isConnected && (
            <ResultsPage
              apiFetch={apiFetch}
              inspireDatabase={lastJobParams?.['02_inspire_database'] || ''}
            />
          )}

          {/* Redirect if page not available */}
          {page === 'launch' && !canLaunch && (
            <div className="text-center py-12">
              <Settings className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Complete the configuration first.</p>
              <button onClick={() => setPage('config')} className="mt-3 text-db-red-light text-sm font-medium hover:text-db-red transition-colors">
                Go to Config →
              </button>
            </div>
          )}

          {page === 'monitor' && !canMonitor && (
            <div className="text-center py-12">
              <Activity className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No active run to monitor.</p>
              <button onClick={() => setPage(canLaunch ? 'launch' : 'config')} className="mt-3 text-db-red-light text-sm font-medium hover:text-db-red transition-colors">
                {canLaunch ? 'Launch a job →' : 'Go to Config →'}
        </button>
            </div>
          )}

          {/* Footer */}
          <footer className="mt-16 pt-6 border-t border-white/5 flex items-center justify-center gap-2 text-[11px] text-slate-600">
            <DatabricksLogo className="w-3.5 h-3.5 opacity-30" />
            <span>Powered by Databricks Inspire AI</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
