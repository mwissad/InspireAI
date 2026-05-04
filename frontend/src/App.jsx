import { useState, useEffect, useCallback, Component } from 'react';
import { ThemeProvider } from './ThemeContext';
import Header from './components/Header';
import LandingPage from './pages/LandingPage';
import SetupWizard from './pages/SetupWizard';
import LaunchPage from './pages/LaunchPage';
import MonitorPage from './pages/MonitorPage';
import ResultsPage from './pages/ResultsPage';
import ChoosePage from './pages/ChoosePage';
import ScrollProgressRing from './components/ScrollProgressRing';
import ParticleField from './components/ParticleField';

/** Legacy Configure default pointed at a user folder that often does not exist; use shared publish path. */
const WORKSPACE_NOTEBOOK_SHARED = '/Shared/inspire_ai';
function migrateLegacyUserHomeInspirePath(nb) {
  const s = String(nb || '').trim();
  if (!s) return '';
  const base = s.replace(/\/$/, '');
  if (/^\/Users\/[^/]+\/inspire_ai$/i.test(base)) return WORKSPACE_NOTEBOOK_SHARED;
  return s;
}

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
  // Start in 'loading' — resolve backend config before rendering any page.
  const [page, setPage] = useState('loading');

  // Settings: server defaults (from /api/defaults) are the source of truth.
  // localStorage is just a cache for non-App mode (local dev with PAT).
  const [settings, setSettings] = useState({
    databricksHost: '',
    token: '',
    notebookPath: '',
    warehouseId: '',
    inspireDatabase: '',
    authMode: 'pat',
    spClientId: '',
    spClientSecret: '',
    spTenantId: '',
    /** True when server has DATABRICKS_TOKEN and/or SP OAuth (browser may omit PAT). */
    serverEnvHasPat: false,
  });

  // Session tracking
  const [sessionId, setSessionId] = useState(null);
  const [runId, setRunId] = useState(null);

  const update = useCallback((key, val) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
    try { localStorage.setItem(`db_${key.replace(/([A-Z])/g, '_$1').toLowerCase()}`, val); } catch {}
  }, []);

  // ── Bootstrap: fetch server config ONCE on mount, then show the app ──
  // This runs before any page renders. In Databricks App mode, the backend
  // provides everything via env vars + the proxy provides auth via
  // x-forwarded-access-token. No localStorage needed.
  useEffect(() => {
    (async () => {
      try {
        // 1. Fetch server-side defaults (always available, no auth needed)
        const defResp = await fetch('/api/defaults');
        const defaults = defResp.ok ? await defResp.json() : {};

        // 2. Build initial settings: server defaults > localStorage cache > empty
        const resolved = {
          databricksHost: defaults.databricksHost || localStorage.getItem('db_databricks_host') || '',
          token: localStorage.getItem('db_token') || '',
          notebookPath: migrateLegacyUserHomeInspirePath(
            defaults.notebookPath || localStorage.getItem('db_notebook_path') || '',
          ),
          warehouseId: defaults.warehouseId || localStorage.getItem('db_warehouse_id') || '',
          inspireDatabase: defaults.inspireDatabase || localStorage.getItem('db_inspire_database') || '',
          authMode: localStorage.getItem('db_auth_mode') || 'pat',
          spClientId: localStorage.getItem('db_sp_client_id') || '',
          spClientSecret: localStorage.getItem('db_sp_client_secret') || '',
          spTenantId: localStorage.getItem('db_sp_tenant_id') || '',
          serverEnvHasPat: !!(defaults.hasServerPlatformAuth ?? defaults.hasServiceToken),
        };

        // 3. Auto-detect warehouse if installer didn't set one
        if (!resolved.warehouseId) {
          try {
            const whResp = await fetch('/api/warehouses');
            if (whResp.ok) {
              const whs = (await whResp.json()).warehouses || [];
              const pick = whs.find(w => w.state === 'RUNNING' && w.enable_serverless_compute)
                || whs.find(w => w.state === 'RUNNING')
                || whs[0];
              if (pick) resolved.warehouseId = pick.id;
            }
          } catch {}
        }

        // 4. Auto-publish notebook if not already set
        if (!resolved.notebookPath) {
          try {
            const nbResp = await fetch('/api/notebook');
            if (nbResp.ok) {
              const nbData = await nbResp.json();
              if (nbData.path) resolved.notebookPath = migrateLegacyUserHomeInspirePath(nbData.path);
            }
          } catch {}
        }

        // 5. Apply all settings at once (single state update)
        setSettings(resolved);

        // 6. Persist to localStorage for next load
        for (const [key, val] of Object.entries(resolved)) {
          if (val) {
            try { localStorage.setItem(`db_${key.replace(/([A-Z])/g, '_$1').toLowerCase()}`, val); } catch {}
          }
        }

        console.log('[bootstrap] ready:', {
          host: resolved.databricksHost ? 'set' : 'MISSING',
          warehouse: resolved.warehouseId ? 'set' : 'MISSING',
          database: resolved.inspireDatabase ? 'set' : 'MISSING',
          notebook: resolved.notebookPath ? 'set' : 'MISSING',
          isDatabricksApp: defaults.isDatabricksApp,
        });

        // First-run: show Setup Wizard unless user finished it, or env/installer already supplied everything.
        const setupComplete = localStorage.getItem('db_setup_complete') === '1';
        const installerReady =
          defaults.isDatabricksApp &&
          defaults.autoSetup &&
          !!defaults.databricksHost &&
          !!defaults.warehouseId &&
          !!defaults.inspireDatabase;
        const localReady = !!(
          resolved.databricksHost &&
          (resolved.token || resolved.serverEnvHasPat) &&
          resolved.warehouseId &&
          resolved.inspireDatabase
        );
        const envSkipsSetupWizard = !!defaults.envSkipsSetupWizard;
        if (envSkipsSetupWizard) {
          try {
            localStorage.setItem('db_setup_complete', '1');
          } catch { /* ignore */ }
        }
        if (!setupComplete && !installerReady && !localReady && !envSkipsSetupWizard) {
          setPage('setup');
          return;
        }
      } catch (err) {
        console.error('[bootstrap] error:', err);
        setSettings({
          databricksHost: localStorage.getItem('db_databricks_host') || '',
          token: localStorage.getItem('db_token') || '',
          notebookPath: migrateLegacyUserHomeInspirePath(localStorage.getItem('db_notebook_path') || ''),
          warehouseId: localStorage.getItem('db_warehouse_id') || '',
          inspireDatabase: localStorage.getItem('db_inspire_database') || '',
          authMode: localStorage.getItem('db_auth_mode') || 'pat',
          spClientId: localStorage.getItem('db_sp_client_id') || '',
          spClientSecret: localStorage.getItem('db_sp_client_secret') || '',
          spTenantId: localStorage.getItem('db_sp_tenant_id') || '',
          serverEnvHasPat: false,
        });
        if (localStorage.getItem('db_setup_complete') !== '1') {
          const h = localStorage.getItem('db_databricks_host');
          const t = localStorage.getItem('db_token');
          const w = localStorage.getItem('db_warehouse_id');
          const d = localStorage.getItem('db_inspire_database');
          if (!(h && t && w && d)) {
            setPage('setup');
            return;
          }
        }
      }

      setPage('landing');
    })();
  }, []);

  // Auto-fetch SP token when in SP mode (local dev only)
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
      } catch {}
    })();
  }, [settings.authMode, settings.spClientId, settings.spClientSecret, settings.spTenantId, settings.databricksHost]); // eslint-disable-line react-hooks/exhaustive-deps

  const [transitioning, setTransitioning] = useState(false);
  const nav = useCallback((p) => {
    if (p === page) return;
    setTransitioning(true);
    setTimeout(() => {
      setPage(p);
      setTransitioning(false);
    }, 200);
  }, [page]);

  const finishSetup = useCallback(() => {
    try {
      localStorage.setItem('db_setup_complete', '1');
    } catch { /* ignore */ }
    nav('landing');
  }, [nav]);

  const canLaunch = true;
  const canMonitor = Boolean(sessionId || runId);
  const canResults = true;

  return (
    <ThemeProvider>
    <div className="min-h-screen bg-bg text-text-primary relative">
      <ParticleField count={40} />

      {page !== 'landing' && page !== 'loading' && page !== 'setup' && (
        <Header
          page={page}
          setPage={nav}
          canLaunch={canLaunch}
          canMonitor={canMonitor}
          canResults={canResults}
        />
      )}

      <main className={transitioning ? 'page-exit' : 'page-enter'} key={page}>
        {page === 'loading' && (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-10 h-10 border-2 border-db-red border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-text-secondary">Connecting to workspace...</p>
            </div>
          </div>
        )}

        {page === 'setup' && (
          <SetupWizard settings={settings} update={update} onComplete={finishSetup} />
        )}

        {page === 'landing' && (
          <LandingPage onStart={() => nav('choose')} onOpenSetup={() => nav('setup')} />
        )}

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
            onOpenResults={(sid) => {
              if (sid) setSessionId(sid);
              nav('results');
            }}
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
            <div className="max-w-6xl mx-auto px-6 py-4 sm:py-5">
              <ResultsPage
                settings={settings}
                update={update}
                sessionId={sessionId}
              />
            </div>
          </ErrorBoundary>
        )}
      </main>

      {page !== 'landing' && page !== 'setup' && <ScrollProgressRing />}
    </div>
    </ThemeProvider>
  );
}
