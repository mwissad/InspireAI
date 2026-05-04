import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { stripAiDemoDisclaimerHtml } from '../lib/stripAiDisclaimer.js';

const MAX_NOTEBOOK_CELLS = 64;
const MAX_CELL_CHARS = 32000;
const MAX_OUTPUT_CHARS = 6000;

function tryParseIpynb(str) {
  const t = String(str || '').trim();
  if (!t.startsWith('{')) return null;
  try {
    const o = JSON.parse(t);
    if (o && Array.isArray(o.cells)) return o;
  } catch {
    /* ignore */
  }
  return null;
}

/** Databricks repo-sync / export: Python file with # MAGIC lines (innerText may drop #). */
function looksLikeDatabricksNotebookSource(s) {
  const t = String(s);
  if (/Databricks notebook source/i.test(t)) return true;
  if (/#[ \t]*MAGIC\b/m.test(t)) return true;
  if (/^\s*MAGIC\s+%/m.test(t)) return true;
  return false;
}

/**
 * @param {string} line
 * @returns {string|null} magic payload after prefix, or null if not a MAGIC line
 */
function extractMagicPayload(line) {
  const s = String(line).replace(/\r$/, '');
  const m1 = s.match(/^\s*#\s*MAGIC\s?(.*)$/);
  if (m1) return m1[1] ?? '';
  const m2 = s.match(/^\s*MAGIC\s+(.*)$/i);
  if (m2) return m2[1] ?? '';
  return null;
}

/**
 * Parse Databricks notebook-as-Python source into ipynb-shaped cells for the same renderer.
 * @returns {{ cells: object[], _databricks?: true } | null}
 */
function parseDatabricksMagicNotebook(text) {
  if (!looksLikeDatabricksNotebookSource(text)) return null;
  let t = String(text).replace(/\r\n/g, '\n');
  t = t.replace(/^#\s*Databricks notebook source\s*$/gim, '');
  t = t.replace(/^Databricks notebook source\s*$/gim, '');
  t = t.trimStart();

  const segments = t
    .split(/^#\s*COMMAND\s*-+\s*$/m)
    .map((x) => x.trim())
    .filter(Boolean);

  const cells = [];
  const knownLang = {
    sql: 'sql',
    python: 'python',
    py: 'python',
    scala: 'scala',
    r: 'r',
    sh: 'bash',
    fs: 'python',
    pip: 'python',
  };

  const pushMarkdown = (bodies) => {
    if (!bodies.length) return;
    const L0 = bodies[0].trim();
    const md = L0.match(/^%(?:md|markdown)\s*(.*)$/i);
    const firstRest = md ? md[1] ?? '' : L0;
    const src = [firstRest, ...bodies.slice(1)].join('\n');
    cells.push({ cell_type: 'markdown', source: src, _databricks: true });
  };

  const pushCode = (bodies, lang) => {
    cells.push({
      cell_type: 'code',
      source: bodies.join('\n'),
      _language: lang || 'python',
      _databricks: true,
    });
  };

  for (const seg of segments) {
    const lines = seg.split('\n');
    const bodies = [];
    for (const line of lines) {
      const p = extractMagicPayload(line);
      if (p !== null) {
        bodies.push(p);
        continue;
      }
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#') && !/MAGIC/i.test(trimmed)) {
        if (bodies.length) {
          bodies[bodies.length - 1] += `\n${line}`;
        }
      }
    }

    if (bodies.length === 0) continue;

    const L0 = bodies[0].trim();
    if (/^%(?:md|markdown)\b/i.test(L0)) {
      pushMarkdown(bodies);
      continue;
    }

    const pct = L0.match(/^%([a-zA-Z_]+)\s*(.*)$/);
    if (pct) {
      const cmd = pct[1].toLowerCase();
      const rest0 = pct[2] ?? '';
      if (knownLang[cmd]) {
        const parts = [];
        if (rest0.trim()) parts.push(rest0);
        parts.push(...bodies.slice(1));
        pushCode(parts, knownLang[cmd]);
        continue;
      }
      pushCode(bodies, 'python');
      continue;
    }

    pushCode(bodies, 'python');
  }

  if (cells.length === 0) return null;
  return { cells, _databricks: true };
}

/** Extract source string from a Jupyter cell. */
function cellSource(cell) {
  const s = cell?.source;
  if (Array.isArray(s)) return s.join('');
  return String(s ?? '');
}

/** Plain text from code cell outputs (stream + text/plain). */
function outputsPlainText(outputs) {
  if (!Array.isArray(outputs) || outputs.length === 0) return '';
  const parts = [];
  for (const o of outputs) {
    if (!o) continue;
    if (o.output_type === 'stream' && o.text != null) {
      parts.push(Array.isArray(o.text) ? o.text.join('') : String(o.text));
    } else if (o.output_type === 'execute_result' || o.output_type === 'display_data') {
      const d = o.data || {};
      const tp = d['text/plain'];
      if (tp != null) parts.push(Array.isArray(tp) ? tp.join('') : String(tp));
    } else if (o.output_type === 'error') {
      const en = o.ename || 'Error';
      const ev = o.evalue || '';
      const tb = Array.isArray(o.traceback) ? o.traceback.join('\n') : '';
      parts.push(`${en}: ${ev}${tb ? `\n${tb}` : ''}`);
    }
  }
  return parts.join('\n').trim();
}

const mdComponents = {
  h1: (props) => (
    <h1
      className="text-sm font-bold text-text-primary mt-3 mb-1.5 first:mt-0 border-b border-border pb-1"
      {...props}
    />
  ),
  h2: (props) => (
    <h2 className="text-[12px] font-bold text-db-red mt-2.5 mb-1 leading-snug" {...props} />
  ),
  h3: (props) => (
    <h3 className="text-[11px] font-semibold text-text-primary mt-2 mb-0.5 leading-snug" {...props} />
  ),
  h4: (props) => (
    <h4 className="text-[11px] font-semibold text-text-primary mt-1.5 mb-0.5" {...props} />
  ),
  h5: (props) => <h5 className="text-[10px] font-medium text-text-secondary mt-1.5 mb-0.5" {...props} />,
  h6: (props) => <h6 className="text-[10px] font-medium text-text-tertiary mt-1 mb-0.5" {...props} />,
  p: (props) => (
    <p className="text-[11px] text-text-secondary leading-relaxed mb-2 last:mb-0" {...props} />
  ),
  ul: (props) => (
    <ul className="list-disc pl-4 mb-2 space-y-0.5 text-[11px] text-text-secondary leading-relaxed" {...props} />
  ),
  ol: (props) => (
    <ol className="list-decimal pl-4 mb-2 space-y-0.5 text-[11px] text-text-secondary leading-relaxed" {...props} />
  ),
  li: (props) => <li className="leading-relaxed [&>p]:mb-1" {...props} />,
  strong: (props) => <strong className="font-semibold text-text-primary" {...props} />,
  em: (props) => <em className="italic text-text-secondary" {...props} />,
  a: ({ children, ...props }) => (
    <a
      className="text-db-red underline underline-offset-2 decoration-db-red/40 hover:decoration-db-red wrap-break-word"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: (props) => (
    <blockquote
      className="border-l-[3px] border-db-red/35 pl-2.5 my-2 text-[10px] text-text-tertiary italic bg-bg-subtle/40 py-0.5 rounded-r"
      {...props}
    />
  ),
  hr: (props) => <hr className="my-2 border-border" {...props} />,
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-1.5 rounded border border-border">
      <table className="min-w-full text-[10px] border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: (props) => <thead className="bg-bg-subtle border-b border-border" {...props} />,
  tbody: (props) => <tbody className="divide-y divide-border" {...props} />,
  tr: (props) => <tr className="hover:bg-bg-subtle/30" {...props} />,
  th: (props) => (
    <th
      className="px-2 py-1.5 text-left font-semibold text-text-primary text-[10px] whitespace-nowrap"
      {...props}
    />
  ),
  td: (props) => (
    <td className="px-2 py-1.5 text-text-secondary align-top border-t border-border/50 text-[10px]" {...props} />
  ),
  pre: (props) => (
    <pre
      className="rounded-md bg-bg-subtle border border-border p-2 my-1.5 overflow-x-auto text-[10px] font-mono leading-relaxed text-text-primary whitespace-pre-wrap wrap-break-word"
      {...props}
    />
  ),
  code(props) {
    const { className, children, ...rest } = props;
    const isFenced = /\blanguage-[\w-]+\b/.test(className || '');
    if (isFenced) {
      return (
        <code className={`${className || ''} text-[10px] font-mono`} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded px-1 py-0.5 text-[10px] font-mono text-db-red bg-db-red-50/80 dark:bg-db-red/10 border border-db-red/15 whitespace-pre-wrap wrap-break-word"
        {...rest}
      >
        {children}
      </code>
    );
  },
};

function cellTypeLabel(cell) {
  const t = cell?.cell_type || 'cell';
  if (t === 'markdown') return 'Markdown';
  if (t === 'code') return 'Code';
  if (t === 'raw') return 'Raw';
  return t;
}

function cellGutterClass(cell) {
  const t = cell?.cell_type;
  if (t === 'code') return 'bg-info/25';
  if (t === 'markdown') return 'bg-success/20';
  return 'bg-border';
}

/** One cell — Jupyter JSON or Databricks MAGIC-derived. */
function NotebookCell({ cell, index }) {
  const src = stripAiDemoDisclaimerHtml(cellSource(cell));
  const truncated = src.length > MAX_CELL_CHARS ? `${src.slice(0, MAX_CELL_CHARS)}…` : src;
  const out = cell?.cell_type === 'code' ? outputsPlainText(cell.outputs) : '';
  const outTrunc =
    out.length > MAX_OUTPUT_CHARS ? `${out.slice(0, MAX_OUTPUT_CHARS)}…` : out;
  const exec = cell?.execution_count;
  const label = cellTypeLabel(cell);
  const lang = cell?._language;

  return (
    <article className="flex border-b border-border/90 last:border-b-0 bg-surface">
      <div className={`w-1 shrink-0 self-stretch ${cellGutterClass(cell)}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-1 bg-bg-subtle/90 border-b border-border/60 text-[9px] font-mono text-text-tertiary">
          <span className="font-semibold uppercase tracking-wide text-text-secondary">{label}</span>
          {cell?.cell_type === 'code' && lang && (
            <>
              <span className="text-border">·</span>
              <span className="text-warning font-semibold uppercase">{lang}</span>
            </>
          )}
          <span className="text-border">·</span>
          <span>Cell {index + 1}</span>
          {cell?.cell_type === 'code' && (
            <>
              <span className="text-border">·</span>
              <span className="text-info">In [{exec ?? ' '}]</span>
            </>
          )}
        </header>
        <div className="px-3 py-2.5">
          {cell?.cell_type === 'code' ? (
            <pre className="rounded-md bg-[#1e1e24] text-[#d4d4d8] border border-border p-3 overflow-x-auto text-[10px] font-mono leading-relaxed whitespace-pre-wrap wrap-break-word dark:bg-[#0d0d10]">
              {truncated || <span className="text-text-tertiary italic">(empty code cell)</span>}
            </pre>
          ) : cell?.cell_type === 'raw' ? (
            <pre className="rounded-md bg-bg-subtle border border-border p-2.5 text-[10px] font-mono text-text-secondary whitespace-pre-wrap wrap-break-word">
              {truncated}
            </pre>
          ) : (
            <div className="notebook-md prose-notebook text-[11px] leading-relaxed [&>*:first-child]:mt-0 [&_h1]:mt-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {truncated || '*Empty markdown cell*'}
              </ReactMarkdown>
            </div>
          )}
          {outTrunc ? (
            <div className="mt-2 rounded-md border border-border bg-bg/80">
              <div className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-tertiary border-b border-border/60 bg-bg-subtle/50">
                Output
              </div>
              <pre className="p-2.5 text-[10px] font-mono text-text-secondary whitespace-pre-wrap wrap-break-word max-h-48 overflow-y-auto">
                {outTrunc}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** Stacked cells — Jupyter .ipynb or Databricks # MAGIC source. */
function IpynbPreview({ notebook, variant = 'jupyter' }) {
  const cells = notebook.cells || [];
  const total = cells.length;
  const slice = cells.slice(0, MAX_NOTEBOOK_CELLS);
  const hidden = total - slice.length;
  const title = variant === 'databricks' ? 'Databricks notebook' : 'Notebook';
  const hint =
    variant === 'databricks'
      ? 'Parsed from # MAGIC / # COMMAND cells (export preview).'
      : 'Jupyter (.ipynb) cell preview.';

  return (
    <div className="rounded-lg border border-border overflow-hidden shadow-sm">
      <div
        className="px-2.5 py-1.5 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 bg-bg-subtle border-b border-border text-[10px] text-text-tertiary"
        title={hint}
      >
        <span className="font-semibold text-text-secondary uppercase tracking-wide">{title}</span>
        <span className="font-mono">
          {total} cell{total === 1 ? '' : 's'}
          {hidden > 0 ? ` · showing first ${slice.length}` : ''}
        </span>
      </div>
      <div className="max-h-[min(520px,70vh)] overflow-y-auto overflow-x-hidden bg-bg">
        {slice.map((cell, i) => (
          <NotebookCell key={i} cell={cell} index={i} />
        ))}
      </div>
      {hidden > 0 && (
        <div className="px-3 py-2 text-[10px] text-text-tertiary bg-bg-subtle/80 border-t border-border text-center">
          {hidden} more cell{hidden === 1 ? '' : 's'} — open in Workspace to see the full notebook.
        </div>
      )}
    </div>
  );
}

/**
 * Genie markdown, Jupyter .ipynb JSON, or Databricks `# MAGIC` notebook source — each with an appropriate preview.
 */
export default function GenieMarkdownPreview({ content }) {
  const raw = stripAiDemoDisclaimerHtml(String(content ?? '').trim());
  if (!raw) return null;

  const magicNb = parseDatabricksMagicNotebook(raw);
  if (magicNb) {
    return <IpynbPreview notebook={magicNb} variant="databricks" />;
  }

  const nb = tryParseIpynb(raw);
  if (nb) {
    return <IpynbPreview notebook={nb} variant="jupyter" />;
  }

  return (
    <div className="genie-md-preview text-text-secondary [&_>*:first-child]:mt-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {raw}
      </ReactMarkdown>
    </div>
  );
}
