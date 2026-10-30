import { ArrowRight, ExternalLink, Sparkles } from 'lucide-react';
import ImplementStatusBadge from './ImplementStatusBadge';
import { START_MVP_LABEL } from '../lib/implementWizard';

const PRIMARY = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-db-red-solid hover:bg-db-red-solid-hover shadow-sm shadow-db-red/20 transition-smooth';
const OUTLINE = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-surface text-text-primary hover:bg-bg-subtle transition-smooth';

export default function ImplementCardActions({ status = null, onImplement, onOpen, notebookUrl = '', className = 'px-5 pb-3', showStatus = true }) {
  const open = status?.kind === 'mvp' && typeof onOpen === 'function';
  const canStart = !open && typeof onImplement === 'function';
  const notebook = status?.kind === 'notebook' && status.group === 'ready' && notebookUrl ? notebookUrl : '';
  if (!open && !canStart && !notebook && !(showStatus && status?.label)) return null;
  return (
    <div className={`${className} flex flex-wrap items-center gap-2`} data-implement-actions="">
      {open && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} className={PRIMARY}>
          <ArrowRight size={13} /> Open MVP
        </button>
      )}
      {canStart && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onImplement(); }} className={PRIMARY}>
          <Sparkles size={13} />
          {START_MVP_LABEL}
        </button>
      )}
      {notebook && (
        <a href={notebook} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={OUTLINE}>
          Open notebook <ExternalLink size={12} />
        </a>
      )}
      {showStatus && <ImplementStatusBadge state={status} />}
    </div>
  );
}
