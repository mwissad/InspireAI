import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink, ArrowRight, Loader2, RefreshCw } from 'lucide-react';

/** Turn [1], [2,3,4] citation markers into in-page anchor links. */
export function linkifyDiscoverCitations(markdown, sourceCount = 0) {
  if (!markdown || !sourceCount) return markdown || '';
  return String(markdown).replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (full, inner) => {
    const ranks = inner
      .split(',')
      .map((n) => parseInt(String(n).trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= sourceCount);
    if (!ranks.length) return full;
    return ranks.map((r) => `[${r}](#discover-source-${r})`).join('');
  });
}

const chatMdComponents = {
  h1: (props) => (
    <h1 className="text-base font-bold text-text-primary mt-4 mb-2 first:mt-0 border-b border-border pb-2" {...props} />
  ),
  h2: (props) => (
    <h2 className="text-sm font-bold text-db-red mt-4 mb-2 leading-snug" {...props} />
  ),
  h3: (props) => (
    <h3 className="text-sm font-semibold text-text-primary mt-3 mb-1.5 leading-snug" {...props} />
  ),
  p: (props) => (
    <p className="text-sm text-text-secondary leading-relaxed mb-2.5 last:mb-0" {...props} />
  ),
  ul: (props) => (
    <ul className="list-disc pl-5 mb-3 space-y-1.5 text-sm text-text-secondary leading-relaxed" {...props} />
  ),
  ol: (props) => (
    <ol className="list-decimal pl-5 mb-3 space-y-1.5 text-sm text-text-secondary leading-relaxed" {...props} />
  ),
  li: (props) => <li className="leading-relaxed [&>p]:mb-1" {...props} />,
  strong: (props) => <strong className="font-semibold text-text-primary" {...props} />,
  em: (props) => <em className="italic text-text-secondary" {...props} />,
  a: ({ href, children, ...props }) => {
    const isCitation = href?.startsWith('#discover-source-');
    return (
      <a
        href={href}
        className={
          isCitation
            ? 'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-md text-[11px] font-semibold text-db-red bg-db-red/10 border border-db-red/20 hover:bg-db-red/20 no-underline align-middle mx-0.5'
            : 'text-db-red underline underline-offset-2 decoration-db-red/40 hover:decoration-db-red'
        }
        {...(isCitation ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
        {...props}
      >
        {children}
      </a>
    );
  },
  hr: (props) => <hr className="my-4 border-border" {...props} />,
  blockquote: (props) => (
    <blockquote
      className="border-l-4 border-db-red/40 pl-3 my-3 text-sm text-text-secondary italic bg-db-red-50/30 py-1 rounded-r"
      {...props}
    />
  ),
};

function buildSqlEditorUrl(databricksHost, warehouseId, inspireDatabase, sessionId, usecaseId) {
  if (!databricksHost || !inspireDatabase) return null;
  const host = String(databricksHost).replace(/\/$/, '');
  const [catalog, schema] = inspireDatabase.split('.');
  if (!catalog || !schema) return null;
  const q = `SELECT * FROM \`${catalog}\`.\`${schema}\`.\`__inspire_usecases\` WHERE session_id = ${sessionId} AND id = '${String(usecaseId || '').replace(/'/g, "''")}' LIMIT 1`;
  const params = new URLSearchParams();
  if (warehouseId) params.set('warehouseId', warehouseId);
  params.set('sql', q);
  return `${host}/sql/editor?${params.toString()}`;
}

export function DiscoverSourcesPanel({
  sources,
  settings,
  onViewSession,
}) {
  if (!sources?.length) return null;

  const inspireDb = settings?.inspireDatabase || '';
  const warehouseId = settings?.warehouseId || '';
  const host = settings?.databricksHost || '';

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-3">Sources</p>
      <ul className="space-y-2">
        {sources.map((s) => {
          const title =
            s.title ||
            s.preview?.split('\n').find((l) => l.startsWith('Use case:'))?.replace(/^Use case:\s*/, '') ||
            s.preview?.split('\n').find((l) => l.startsWith('Title:'))?.replace(/^Title:\s*/, '') ||
            'Use case';
          const domain = s.business_domain || 'General';
          const sqlUrl = buildSqlEditorUrl(host, warehouseId, inspireDb, s.session_id, s.usecase_id);
          return (
            <li
              key={`${s.session_id}-${s.usecase_id}-${s.rank}`}
              id={`discover-source-${s.rank}`}
              className="scroll-mt-4 rounded-xl border border-border bg-surface p-3 hover:border-db-red/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-lg bg-db-red/10 text-db-red text-xs font-bold flex items-center justify-center">
                  {s.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-primary leading-snug">{title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-bg-subtle border border-border text-text-secondary font-medium">
                      {domain}
                    </span>
                    {s.business_name && (
                      <span className="text-[10px] text-text-tertiary truncate max-w-[12rem]">
                        {s.business_name}
                      </span>
                    )}
                    {s.score != null && (
                      <span className="text-[10px] text-text-tertiary tabular-nums">
                        match {(s.score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-text-tertiary mt-1 font-mono">
                    session {s.session_id}
                    {s.usecase_id ? ` · ${s.usecase_id}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {onViewSession && s.session_id && (
                      <button
                        type="button"
                        onClick={() => onViewSession(String(s.session_id))}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-db-red hover:underline"
                      >
                        View in Results
                        <ArrowRight size={12} />
                      </button>
                    )}
                    {sqlUrl && (
                      <a
                        href={sqlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-db-red"
                      >
                        Open in SQL editor
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function DiscoverChatMessage({
  content,
  sources,
  settings,
  onViewSession,
  showSync,
  syncing,
  onSync,
  syncJobUrl,
}) {
  const linked = linkifyDiscoverCitations(content, sources?.length || 0);
  return (
    <div className="discover-chat-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatMdComponents}>
        {linked}
      </ReactMarkdown>
      {showSync && onSync && (
        <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg bg-db-red text-white hover:opacity-90 disabled:opacity-60"
          >
            {syncing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Syncing index…
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                Sync index now
              </>
            )}
          </button>
          {syncJobUrl && (
            <a
              href={syncJobUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-db-red underline"
            >
              Open Databricks job run
            </a>
          )}
        </div>
      )}
      {sources?.length > 0 && (
        <DiscoverSourcesPanel sources={sources} settings={settings} onViewSession={onViewSession} />
      )}
    </div>
  );
}
