import { ArrowRight, Eye, X } from 'lucide-react';
import { SHOWCASE_NOTE } from '../lib/showcase';

export default function ShowcaseBar({ showcase, onGetStarted, onLeave }) {
  return (
    <section role="region" aria-label="Demo" className="border-b border-border bg-info-bg/60">
      <div className="max-w-screen-xl mx-auto px-6 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-info/15 px-2.5 py-0.5 text-[11px] font-semibold text-info-fg">
          <Eye size={12} aria-hidden="true" />
          Demo
        </span>
        <p className="flex-1 min-w-[16rem] text-xs text-text-secondary leading-relaxed">
          <span className="font-semibold text-text-primary">{showcase.title}</span>
          {showcase.summary ? <span>. {showcase.summary}</span> : null}
          <span className="block">{SHOWCASE_NOTE}</span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGetStarted}
            className="inline-flex items-center gap-1.5 rounded-lg bg-db-red-solid px-3 py-1.5 text-xs font-semibold text-white hover:bg-db-red-solid-hover transition-smooth"
          >
            Get Started
            <ArrowRight size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-smooth"
          >
            <X size={12} aria-hidden="true" />
            Leave demo
          </button>
        </div>
      </div>
    </section>
  );
}
