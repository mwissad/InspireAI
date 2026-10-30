import { useMemo, useState } from 'react';
import ImplementWizard from '../../src/pages/ImplementWizard';
import ImplementPage from '../../src/pages/ImplementPage';
import ResultsPage from '../../src/pages/ResultsPage';
import ImplementCardActions from '../../src/components/ImplementCardActions';
import Header from '../../src/components/Header';
import LandingPage from '../../src/pages/LandingPage';
import App from '../../src/App';
import { RESULTS_FRAME } from '../../src/lib/layout';
import { ThemeProvider } from '../../src/ThemeContext';
import { makeApiFetch, makeApiPostJson } from '../../src/lib/apiClient';
import { caseIdOf, implementState, notebookStatus } from '../../src/lib/implementWizard';
import { HARNESS_USE_CASE, HARNESS_SETTINGS, HARNESS_SESSION_ID } from './implementFixtures.js';

const AUTH = { token: 'tok', databricksHost: 'https://workspace.example.com' };
const SETTINGS = { ...HARNESS_SETTINGS, ...AUTH };

export default function HarnessApp({ open, nest, discoveryType }) {
  const content = <HarnessContent open={open} discoveryType={discoveryType} />;
  if (!nest) return content;
  return (
    <>
      <header data-harness-header="" className="sticky top-0 z-40 h-16 bg-surface border-b border-border">App header</header>
      <main className="page-enter">
        <div style={{ transform: 'translateZ(0)' }}>
          <div style={{ height: 2400 }}>A long results page</div>
          {content}
        </div>
      </main>
    </>
  );
}

function HarnessContent({ open, discoveryType }) {
  if (open === 'app') return <App />;
  if (open === 'card') return <CardHarness />;
  if (open === 'results') return <ResultsHarness />;
  if (open === 'landing') {
    return (
      <ThemeProvider>
        <LandingPage onStart={() => {}} onOpenSetup={() => {}} />
      </ThemeProvider>
    );
  }
  if (open === 'header') {
    return (
      <ThemeProvider>
        <Header page="results" setPage={() => {}} canMonitor canResults canImplement={false} />
      </ThemeProvider>
    );
  }
  return <PageHarness open={open} discoveryType={discoveryType} />;
}

function CardHarness() {
  const [clicks, setClicks] = useState([]);
  const push = (what) => setClicks((prev) => [...prev, what]);
  const cards = [
    ['not-started', implementState(null, null), true],
    ['running', implementState({ status: 'filling' }, null), true],
    ['notebook', implementState(null, notebookStatus({ has_genie_code: 'Y' }, null)), true],
    ['no-session', implementState({ status: 'ready' }, null), false],
    ['uninstalled', implementState({ status: 'uninstalled' }, null), true],
  ];
  return (
    <div className="p-6 space-y-3">
      {cards.map(([id, status, canStart]) => (
        <div key={id} data-card={id} onClick={() => push(`card:${id}`)} className="border border-border rounded-lg py-3">
          <ImplementCardActions status={status} onImplement={canStart ? () => push(`start:${id}`) : undefined}
            onOpen={canStart ? () => push(`open:${id}`) : undefined} notebookUrl={canStart ? `https://workspace.example.com/#workspace/nb/${id}` : ''} />
        </div>
      ))}
      <output aria-label="Clicks">{clicks.join(',')}</output>
    </div>
  );
}

function ResultsHarness() {
  const [opened, setOpened] = useState('');
  return (
    <div className={RESULTS_FRAME}>
      <ResultsPage
        settings={SETTINGS}
        update={() => {}}
        sessionId={HARNESS_SESSION_ID}
        onOpenImplement={(sid, id) => setOpened(`${sid}:${id}`)}
      />
      <output aria-label="Opened in Implement">{opened}</output>
    </div>
  );
}

function PageHarness({ open, discoveryType }) {
  const [implemented, setImplemented] = useState(open === 'implement' ? caseIdOf(HARNESS_USE_CASE) : null);
  if (implemented) return <ImplementPage settings={SETTINGS} sessionId={HARNESS_SESSION_ID} focusId={implemented} />;
  return <WizardOnly discoveryType={discoveryType} onImplemented={(data) => setImplemented(data.use_case_id)} />;
}

function WizardOnly({ discoveryType, onImplemented }) {
  const apiFetch = useMemo(() => makeApiFetch(AUTH), []);
  const apiPostJson = useMemo(() => makeApiPostJson(AUTH), []);
  const [closed, setClosed] = useState(false);
  if (closed) return <p>The wizard is closed.</p>;
  return (
    <ImplementWizard
      uc={HARNESS_USE_CASE}
      sessionId={HARNESS_SESSION_ID}
      settings={SETTINGS}
      discoveryType={discoveryType}
      apiFetch={apiFetch}
      apiPostJson={apiPostJson}
      focus={null}
      onClose={() => setClosed(true)}
      onImplemented={onImplemented}
      onOpenBuild={(useCaseId) => onImplemented({ use_case_id: useCaseId })}
    />
  );
}
