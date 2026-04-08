import { useState, useEffect, useCallback, useRef, Component } from 'react';
import { ThemeProvider } from './ThemeContext';
import Header from './components/Header';
import SettingsPanel from './components/SettingsPanel';
import LandingPage from './pages/LandingPage';
import ConfigPage from './pages/ConfigPage';
import LaunchPage from './pages/LaunchPage';
import MonitorPage from './pages/MonitorPage';
import ResultsPage from './pages/ResultsPage';
import ChoosePage from './pages/ChoosePage';
import SetupWizard from './pages/SetupWizard';
import ScrollProgressRing from './components/ScrollProgressRing';
import ParticleField from './components/ParticleField';

// Error Boundary to catch rendering crashes and display useful info
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace' }}>
          <h2 style={{ color: '#DC2626' }}>Component Crash</h2>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#FEF2F2', padding: 16, borderRadius: 8 }}>
            {this.state.error?.toString()}
          </pre>
          <details>
            <summary>Stack trace</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>
              {this.state.info?.componentStack}
            </pre>
          </details>
          <button
            onClick={() => this.setState({ hasError: false, error: null, info: null })}
            style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  // Detect if first-run setup is needed
  const needsSetup = !localStorage.getItem('db_setup_complete');
  const [page, setPage] = useState(needsSetup ? 'setup' : 'landing');
  const [showSettings, setShowSettings] = useState(false);

  // Persisted settings
  const [settings, setSettings] = useState(() => ({
    databricksHost: localStorage.getItem('db_databricks_host') || '',
    token: localStorage.getItem('db_token') || '',
    notebookPath: localStorage.getItem('db_notebook_path') || '',
    warehouseId: localStorage.getItem('db_warehouse_id') || '',
    inspireDatabase: localStorage.getItem('db_inspire_database') || '',
    authMode: localStorage.getItem('db_auth_mode') || 'pat',
    spClientId: localStorage.getItem('db_sp_client_id') || '',
    spClientSecret: localStorage.getItem('db_sp_client_secret') || '',
    spTenantId: localStorage.getItem('db_sp_tenant_id') || '',
  }));

  // Session tracking
  const [sessionId, setSessionId] = useState(null);
  const [runId, setRunId] = useState(null);

  const update = useCallback((key, val) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: val };
      localStorage.setItem(
        `db_${key.replace(/([A-Z])/g, '_$1').toLowerCase()}`,
        val
      );
      return next;
    });
  }, []);

  // Persist all settings
  useEffect(() => {
    localStorage.setItem('db_databricks_host', settings.databricksHost);
    localStorage.setItem('db_token', settings.token);
    localStorage.setItem('db_notebook_path', settings.notebookPath);
    localStorage.setItem('db_warehouse_id', settings.warehouseId);
    localStorage.setItem('db_inspire_database', settings.inspireDatabase);
    localStorage.setItem('db_auth_mode', settings.authMode);
    localStorage.setItem('db_sp_client_id', settings.spClientId);
    localStorage.setItem('db_sp_client_secret', settings.spClientSecret);
    localStorage.setItem('db_sp_tenant_id', settings.spTenantId);
  }, [settings]);

  // Auto-fetch SP token when in SP mode
  useEffect(() => {
    if (settings.authMode !== 'sp' || !settings.spClientId || !settings.spClientSecret || !settings.spTenantId || !settings.databricksHost) return;
    (async () => {
      try {
        const resp = await fetch('/api/auth/sp-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: settings.spClientId,
            client_secret: settings.spClientSecret,
            tenant_id: settings.spTenantId,
            databricks_host: settings.databricksHost,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.access_token) update('token', data.access_token);
        }
      } catch { /* silent */ }
    })();
  }, [settings.authMode, settings.spClientId, settings.spClientSecret, settings.spTenantId, settings.databricksHost]); // eslint-disable-line react-hooks/exhaustive-deps

  const [transitioning, setTransitioning] = useState(false);
  const [prevPage, setPrevPage] = useState(null);
  const nav = useCallback((p) => {
    if (p === page) return;
    setTransitioning(true);
    setPrevPage(page);
    setTimeout(() => {
      setPage(p);
      setTransitioning(false);
    }, 200);
  }, [page]);

  // Navigation guards
  const canLaunch = true;
  const canMonitor = Boolean(sessionId || runId);
  const canResults = true;

  // ── Auto-configure on mount (silent) ──
  useEffect(() => {
    (async () => {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (settings.token) {
          headers['Authorization'] = `Bearer ${settings.token}`;
          headers['X-DB-PAT-Token'] = settings.token;
        }
        if (settings.databricksHost) headers['X-Databricks-Host'] = settings.databricksHost;

        // 1. Auto-select first running warehouse if none set
        if (!settings.warehouseId) {
          const whResp = await fetch('/api/warehouses', { headers });
          if (whResp.ok) {
            const whData = await whResp.json();
            const running = (whData.warehouses || []).find((w) => w.state === 'RUNNING');
            const first = running || (whData.warehouses || [])[0];
            if (first) update('warehouseId', first.id);
          }
        }

        // 2. Auto-publish notebook (backend handles location seamlessly)
        if (!settings.notebookPath) {
          const nbResp = await fetch('/api/notebook', { headers });
          if (nbResp.ok) {
            const nbData = await nbResp.json();
            if (nbData.path) update('notebookPath', nbData.path);
          }
        }
      } catch { /* silent — user can configure manually via Settings */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ThemeProvider>
    <div className="min-h-screen bg-bg text-text-primary relative">
      {/* Ambient particle field — visible on all pages */}
      <ParticleField count={40} />
      {/* Header (hidden on landing) */}
      {page !== 'landing' && (
        <Header
          page={page}
          setPage={nav}
          onSettingsClick={() => setShowSettings(!showSettings)}
          canLaunch={canLaunch}
          canMonitor={canMonitor}
          canResults={canResults}
        />
      )}

      {/* Main content */}
      <main className={transitioning ? 'page-exit' : 'page-enter'} key={page}>
        {page === 'setup' && (
          <SetupWizard
            settings={settings}
            update={update}
            onComplete={() => {
              localStorage.setItem('db_setup_complete', '1');
              nav('landing');
            }}
          />
        )}

        {page === 'landing' && <LandingPage onStart={() => nav('choose')} />}

        {page === 'choose' && (
          <ChoosePage
            settings={settings}
            onNewExperiment={() => nav('launch')}
            onViewResults={(sid) => {
              if (sid) setSessionId(sid);
              nav('results');
            }}
          />
        )}

        {page === 'launch' && (
          <LaunchPage
            settings={settings}
            update={update}
            onLaunched={(sid, rid) => {
              setSessionId(sid);
              setRunId(rid);
              nav('monitor');
            }}
          />
        )}

        {page === 'monitor' && (
          <div className="max-w-7xl mx-auto px-6 py-8">
            <MonitorPage
              settings={settings}
              update={update}
              sessionId={sessionId}
              runId={runId}
              onComplete={() => nav('results')}
            />
          </div>
        )}

        {page === 'results' && (
          <ErrorBoundary key="results">
            <div className="max-w-6xl mx-auto px-6 py-8">
              <ResultsPage settings={settings} update={update} sessionId={sessionId} />
            </div>
          </ErrorBoundary>
        )}
      </main>

      {/* Settings panel */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          update={update}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Scroll progress ring — bottom-right corner */}
      {page !== 'landing' && <ScrollProgressRing />}
    </div>
    </ThemeProvider>
  );
}
