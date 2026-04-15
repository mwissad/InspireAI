import { useState, useEffect, useCallback, useRef, Component } from 'react';
import { ThemeProvider } from './ThemeContext';
import Header from './components/Header';
import LandingPage from './pages/LandingPage';
import ConfigPage from './pages/ConfigPage';
import LaunchPage from './pages/LaunchPage';
import MonitorPage from './pages/MonitorPage';
import ResultsPage from './pages/ResultsPage';
import ChoosePage from './pages/ChoosePage';
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
  // Start in a 'loading' state — resolve environment before showing any page.
  // This prevents the Setup Wizard from flashing on Databricks App deployments.
  const [page, setPage] = useState('loading');

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

  // ── Auto-configure on mount ──
  // Detects the environment FIRST, then decides which page to show.
  // Databricks App deployments with installer defaults skip straight to landing.
  useEffect(() => {
    (async () => {
      try {
        // 1. Fetch installer-injected defaults
        let defaults = {};
        try {
          const defResp = await fetch('/api/defaults');
          if (defResp.ok) {
            defaults = await defResp.json();
            if (defaults.databricksHost) update('databricksHost', defaults.databricksHost);
            if (defaults.warehouseId) update('warehouseId', defaults.warehouseId);
            if (defaults.inspireDatabase) update('inspireDatabase', defaults.inspireDatabase);
            if (defaults.notebookPath) update('notebookPath', defaults.notebookPath);
          }
        } catch {}

        const headers = { 'Content-Type': 'application/json' };
        const host = defaults.databricksHost || settings.databricksHost;
        if (host) headers['X-Databricks-Host'] = host;

        // 2. Auto-select first running warehouse if none set
        let resolvedWarehouse = defaults.warehouseId || settings.warehouseId;
        if (!resolvedWarehouse) {
          try {
            const whResp = await fetch('/api/warehouses', { headers });
            if (whResp.ok) {
              const whData = await whResp.json();
              const whs = whData.warehouses || [];
              const running = whs.find((w) => w.state === 'RUNNING' && w.enable_serverless_compute);
              const first = running || whs.find((w) => w.state === 'RUNNING') || whs[0];
              if (first) {
                update('warehouseId', first.id);
                resolvedWarehouse = first.id;
              }
            }
          } catch {}
        }

        // 3. Auto-publish notebook
        let resolvedNotebook = defaults.notebookPath || settings.notebookPath;
        if (!resolvedNotebook) {
          try {
            const nbResp = await fetch('/api/notebook', { headers });
            if (nbResp.ok) {
              const nbData = await nbResp.json();
              if (nbData.path) {
                update('notebookPath', nbData.path);
                resolvedNotebook = nbData.path;
              }
            }
          } catch {}
        }

        // 4. Decide which page to show
        const isDatabricksApp = defaults.isDatabricksApp || defaults.hasServiceToken;
        const resolvedDb = defaults.inspireDatabase || settings.inspireDatabase;

        if (isDatabricksApp && host && resolvedWarehouse && resolvedDb) {
          // Databricks App with full config — skip setup entirely
          localStorage.setItem('db_setup_complete', '1');
          setPage('landing');
        } else if (localStorage.getItem('db_setup_complete')) {
          // Previously completed setup
          setPage('landing');
        } else {
          // No Databricks App, no prior setup — show landing (settings panel available)
          setPage('landing');
        }
      } catch {
        // Fallback — go to landing, user can configure via Settings
        setPage('landing');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ThemeProvider>
    <div className="min-h-screen bg-bg text-text-primary relative">
      {/* Ambient particle field — visible on all pages */}
      <ParticleField count={40} />
      {/* Header (hidden on landing) */}
      {page !== 'landing' && page !== 'loading' && (
        <Header
          page={page}
          setPage={nav}
          canLaunch={canLaunch}
          canMonitor={canMonitor}
          canResults={canResults}
        />
      )}

      {/* Main content */}
      <main className={transitioning ? 'page-exit' : 'page-enter'} key={page}>
        {page === 'loading' && (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-10 h-10 border-2 border-db-red border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-text-secondary">Connecting to workspace...</p>
            </div>
          </div>
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

      {/* Scroll progress ring — bottom-right corner */}
      {page !== 'landing' && <ScrollProgressRing />}
    </div>
    </ThemeProvider>
  );
}
