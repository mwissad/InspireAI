import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, Loader2, MessageCircle, Sparkles, RefreshCw } from 'lucide-react';
import MagneticButton from '../components/MagneticButton';
import DiscoverChatMessage from '../components/DiscoverChatMessage';

function authHeaders(settings) {
  const headers = { 'Content-Type': 'application/json' };
  if (settings.token) {
    headers.Authorization = `Bearer ${settings.token}`;
    headers['X-DB-PAT-Token'] = settings.token;
  }
  if (settings.databricksHost) headers['X-Databricks-Host'] = settings.databricksHost;
  return headers;
}

function sessionDisplayName(session) {
  const name =
    session.widget_values?.business ||
    session.widget_values?.['00_business_name'] ||
    session.business_name ||
    '';
  const mode =
    session.widget_values?.operation_mode ||
    session.widget_values?.['15_operation'] ||
    session.widget_values?.['02_operation_mode'] ||
    session.operation_mode ||
    '';
  const base = name.trim() || `Session ${session.session_id}`;
  return mode ? `${base} · ${mode}` : base;
}

function formatSessionDate(raw) {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function DiscoverChatPage({
  settings,
  onBack,
  onViewResults,
  sessionId: initialSessionId,
}) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Ask about use cases in your Inspire tracking tables — by domain, priority, business value, or tables involved. Answers cite indexed use cases with links to Results and SQL.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [indexStatus, setIndexStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncJobUrl, setSyncJobUrl] = useState('');
  const [scopeSession, setScopeSession] = useState(initialSessionId ? String(initialSessionId) : '');
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const bottomRef = useRef(null);

  const SAMPLE_PROMPTS = [
    'What are the highest-priority use cases by domain?',
    'Which use cases involve customer churn or retention?',
    'What fraud or risk analytics use cases do we have?',
  ];

  const inspireDb = settings.inspireDatabase || '';
  const warehouseId = settings.warehouseId || '';

  const checkIndex = useCallback(async () => {
    if (!inspireDb || !warehouseId) return;
    try {
      const q = new URLSearchParams({ inspire_database: inspireDb, warehouse_id: warehouseId });
      const resp = await fetch(`/api/discover/status?${q}`, { headers: authHeaders(settings) });
      const data = resp.ok ? await resp.json() : null;
      setIndexStatus(data);
    } catch {
      setIndexStatus({ ready: false });
    }
  }, [inspireDb, warehouseId, settings]);

  useEffect(() => {
    checkIndex();
  }, [checkIndex]);

  useEffect(() => {
    if (!inspireDb || !warehouseId) return;
    let cancelled = false;
    (async () => {
      setSessionsLoading(true);
      try {
        const q = new URLSearchParams({ inspire_database: inspireDb, warehouse_id: warehouseId });
        const resp = await fetch(`/api/inspire/sessions?${q}`, { headers: authHeaders(settings) });
        if (!cancelled && resp.ok) {
          const data = await resp.json();
          setSessions(data.sessions || []);
        }
      } catch {
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inspireDb, warehouseId, settings]);

  useEffect(() => {
    if (initialSessionId) setScopeSession(String(initialSessionId));
  }, [initialSessionId]);

  useEffect(() => {
    if (!syncing) return undefined;
    const id = setInterval(checkIndex, 8000);
    return () => clearInterval(id);
  }, [syncing, checkIndex]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const buildIndex = async () => {
    if (!inspireDb || !warehouseId || syncing) return;
    setSyncing(true);
    setSyncJobUrl('');
    try {
      const resp = await fetch('/api/discover/sync', {
        method: 'POST',
        headers: authHeaders(settings),
        body: JSON.stringify({ inspire_database: inspireDb, warehouse_id: warehouseId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || resp.statusText);
      if (data.job_url) setSyncJobUrl(data.job_url);
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content:
            'Building search index from your use cases (this can take several minutes for large catalogs). I will refresh status automatically.',
        },
      ]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Could not start index job: ${e.message}` }]);
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (syncing && indexStatus?.ready) setSyncing(false);
  }, [syncing, indexStatus?.ready]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!inspireDb || !warehouseId) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Configure Inspire database and warehouse in Setup first.' },
      ]);
      return;
    }

    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const resp = await fetch('/api/discover/chat', {
        method: 'POST',
        headers: authHeaders(settings),
        body: JSON.stringify({
          message: text,
          inspire_database: inspireDb,
          warehouse_id: warehouseId,
          session_id: scopeSession || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || resp.statusText);
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: data.answer || '',
          sources: data.sources || [],
          needsSync: !!data.needs_sync,
        },
      ]);
      if (data.needs_sync) {
        setIndexStatus((prev) => ({ ...prev, ready: false, indexed_usecases: 0 }));
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleViewSession = (sid) => {
    if (onViewResults) onViewResults(sid);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-db-red mb-6"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-db-red/10 flex items-center justify-center">
          <MessageCircle size={20} className="text-db-red" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Discover chat</h1>
          <p className="text-sm text-text-secondary">Semantic search over indexed Inspire use cases</p>
        </div>
      </div>

      {indexStatus && !indexStatus.ready && (
        <div className="mb-4 rounded-lg border border-db-red/25 bg-db-red-50/50 p-4 text-sm text-text-secondary space-y-3">
          <div>
            <p className="font-semibold text-db-red mb-1">
              {syncing ? 'Building search index…' : 'Index not ready'}
            </p>
            <p>
              {syncing
                ? 'Embedding use cases into __inspire_usecase_search. Large catalogs can take 10–20 minutes.'
                : 'Build the index once from your __inspire_usecases table, then chat over it.'}
            </p>
          </div>
          {!syncing && (
            <button
              type="button"
              onClick={buildIndex}
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg bg-db-red text-white hover:opacity-90"
            >
              <RefreshCw size={14} />
              Sync index now
            </button>
          )}
          {syncing && (
            <div className="flex items-center gap-2 text-db-red">
              <Loader2 size={14} className="animate-spin" />
              <span>Checking every few seconds…</span>
            </div>
          )}
          {syncJobUrl && (
            <a
              href={syncJobUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs text-db-red underline"
            >
              Open Databricks job run
            </a>
          )}
        </div>
      )}

      {indexStatus?.ready && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <p className="text-xs text-text-tertiary">
            {indexStatus.indexed_usecases} row(s) indexed · {inspireDb}
          </p>
          <button
            type="button"
            onClick={buildIndex}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-db-red hover:underline disabled:opacity-50"
          >
            {syncing ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Syncing…
              </>
            ) : (
              <>
                <RefreshCw size={12} />
                Re-sync index
              </>
            )}
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
        <label htmlFor="discover-session-scope" className="text-text-secondary shrink-0 font-medium">
          Limit to experiment (optional)
        </label>
        <select
          id="discover-session-scope"
          value={scopeSession}
          onChange={(e) => setScopeSession(e.target.value)}
          disabled={sessionsLoading}
          className="flex-1 min-w-0 max-w-xl px-3 py-2 border border-border rounded-lg bg-surface text-text-primary text-xs focus:outline-none focus:ring-2 focus:ring-db-red/30 focus:border-db-red/50"
        >
          <option value="">All experiments — search every indexed use case</option>
          {sessions.map((s) => {
            const sid = String(s.session_id);
            const label = sessionDisplayName(s);
            const date = formatSessionDate(s.completed_on || s.create_at);
            const pct =
              s.completed_percent >= 100
                ? 'Complete'
                : s.completed_percent > 0
                  ? `${Math.round(s.completed_percent)}%`
                  : 'New';
            const overview = s.usecase_overview;
            const ucHint =
              overview?.total > 0 ? ` · ${overview.total} use case${overview.total === 1 ? '' : 's'}` : '';
            return (
              <option key={sid} value={sid}>
                {label}
                {date ? ` — ${date}` : ''} ({pct}
                {ucHint})
              </option>
            );
          })}
        </select>
        {sessionsLoading && (
          <span className="text-text-tertiary flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" />
            Loading experiments…
          </span>
        )}
        {!sessionsLoading && sessions.length === 0 && inspireDb && (
          <span className="text-text-tertiary">No past experiments yet</span>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm min-h-[360px] max-h-[min(62vh,32rem)] overflow-y-auto p-4 space-y-5 mb-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'user' ? (
              <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-db-red text-white leading-relaxed">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-full w-full rounded-2xl px-4 py-3 text-sm bg-bg-subtle text-text-primary border border-border leading-relaxed">
                <DiscoverChatMessage
                  content={msg.content}
                  sources={msg.sources}
                  settings={settings}
                  onViewSession={handleViewSession}
                  showSync={!!msg.needsSync}
                  syncing={syncing}
                  onSync={buildIndex}
                  syncJobUrl={syncJobUrl}
                />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 size={16} className="animate-spin text-db-red" />
            Searching use cases…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {indexStatus?.ready && (
        <div className="mb-3 flex flex-wrap gap-2">
          {SAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setInput(p)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-bg-subtle text-text-secondary hover:border-db-red/40 hover:text-text-primary"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="e.g. What high-priority sales use cases do we have?"
          className="flex-1 px-4 py-3 text-sm border border-border rounded-xl bg-surface glow-focus"
          disabled={loading || syncing}
        />
        <MagneticButton
          type="button"
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-3 rounded-xl bg-db-red text-white disabled:opacity-50"
        >
          <Send size={18} />
        </MagneticButton>
      </div>

      <p className="mt-4 text-[11px] text-text-tertiary flex items-center gap-1">
        <Sparkles size={12} className="text-db-red" />
        Powered by embeddings on `{inspireDb || 'catalog._inspire'}` and Databricks Foundation Models.
      </p>
    </div>
  );
}
