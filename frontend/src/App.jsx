import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import SettingsPanel from './components/SettingsPanel';
import LandingPage from './pages/LandingPage';
import ConfigPage from './pages/ConfigPage';
import LaunchPage from './pages/LaunchPage';
import MonitorPage from './pages/MonitorPage';
import ResultsPage from './pages/ResultsPage';

export default function App() {
  const [page, setPage] = useState('landing');
  const [showSettings, setShowSettings] = useState(false);

  // Persisted settings
  const [settings, setSettings] = useState(() => ({
    token: localStorage.getItem('db_token') || '',
    notebookPath: localStorage.getItem('db_notebook_path') || '',
    warehouseId: localStorage.getItem('db_warehouse_id') || '',
    inspireDatabase: localStorage.getItem('db_inspire_database') || '',
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
    localStorage.setItem('db_token', settings.token);
    localStorage.setItem('db_notebook_path', settings.notebookPath);
    localStorage.setItem('db_warehouse_id', settings.warehouseId);
    localStorage.setItem('db_inspire_database', settings.inspireDatabase);
  }, [settings]);

  const nav = (p) => setPage(p);

  // Navigation guards
  const canConfigure = Boolean(settings.token);
  const canLaunch = Boolean(settings.token && settings.notebookPath && settings.warehouseId);
  const canMonitor = Boolean(sessionId || runId);
  const canResults = true;

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      {/* Header (hidden on landing) */}
      {page !== 'landing' && (
        <Header
          page={page}
          setPage={nav}
          onSettingsClick={() => setShowSettings(!showSettings)}
          canConfigure={canConfigure}
          canLaunch={canLaunch}
          canMonitor={canMonitor}
          canResults={canResults}
        />
      )}

      {/* Main content */}
      <main>
        {page === 'landing' && <LandingPage onStart={() => nav('config')} />}

        {page === 'config' && (
          <div className="max-w-4xl mx-auto px-6 py-8">
            <ConfigPage
              settings={settings}
              update={update}
              onConfigured={() => nav('launch')}
            />
          </div>
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
          <div className="max-w-5xl mx-auto px-6 py-8">
            <MonitorPage
              settings={settings}
              sessionId={sessionId}
              runId={runId}
              onComplete={() => nav('results')}
            />
          </div>
        )}

        {page === 'results' && (
          <div className="max-w-6xl mx-auto px-6 py-8">
            <ResultsPage settings={settings} sessionId={sessionId} />
          </div>
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
    </div>
  );
}
