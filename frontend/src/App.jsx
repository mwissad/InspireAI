import { useState, useCallback } from 'react';
import LandingPage from './pages/LandingPage';
import ConfigPage from './pages/ConfigPage';
import LaunchPage from './pages/LaunchPage';
import MonitorPage from './pages/MonitorPage';
import ResultsPage from './pages/ResultsPage';
import Header from './components/Header';
import SettingsPanel from './components/SettingsPanel';

export default function App() {
  const [page, setPage] = useState('landing');
  const [settings, setSettings] = useState({
    databricksToken: '',
    notebookPath: '',
    publishedFolder: '',
    warehouseId: '',
    inspireDatabase: '',
  });
  const [runId, setRunId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const update = useCallback((key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  }, []);

  const apiFetch = useCallback(async (url, options = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.databricksToken}`,
        ...options.headers,
      },
    });
  }, [settings.databricksToken]);

  const nav = useCallback((p) => setPage(p), []);

  const canConfigure = !!settings.databricksToken;
  const canLaunch = canConfigure && !!settings.notebookPath && !!settings.warehouseId;
  const canMonitor = canLaunch && !!runId;
  const canResults = canConfigure && !!settings.warehouseId && !!settings.inspireDatabase;

  const isLanding = page === 'landing';

  return (
    <div className="min-h-screen bg-db-darkest text-white">
      {/* Header — hidden on landing page */}
      {!isLanding && (
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

      {/* Page content — landing is full-bleed, others get container */}
      {isLanding ? (
        <LandingPage onStart={() => nav('config')} />
      ) : (
        <main>
          {page === 'config' && (
            <ConfigPage
              settings={settings}
              update={update}
              apiFetch={apiFetch}
              onNext={() => nav('launch')}
            />
          )}

          {page === 'launch' && (
            <LaunchPage
              settings={settings}
              update={update}
              apiFetch={apiFetch}
              onRun={(rid, sid) => {
                setRunId(rid);
                setSessionId(sid);
                nav('monitor');
              }}
            />
          )}

          {page === 'monitor' && (
            <MonitorPage
              settings={settings}
              apiFetch={apiFetch}
              runId={runId}
              sessionId={sessionId}
              onViewResults={() => nav('results')}
            />
          )}

          {page === 'results' && (
            <ResultsPage
              settings={settings}
              update={update}
              apiFetch={apiFetch}
            />
          )}
        </main>
      )}

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
