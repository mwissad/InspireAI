import { useId, useLayoutEffect, useRef } from 'react';
import { VIBES_MAX, partOf, vibesLabel, vibesLength, vibesProblem } from '../lib/implementWizard';

const PLACEHOLDERS = {
  notebook: 'For example: score the baseline and every model on the same held-out rows, and print each one\'s hit rate',
  dashboard: 'For example: put the weekly trend first and show the 20 rows to act on today',
  genie_space: 'For example: answer in plain words and always say which rows you counted',
  app: 'For example: one page, with the decision list on the left and the row detail on the right',
  alert: 'For example: only email me when a row to act on is new since the last run',
  app_page: 'For example: put the rows to act on first and add a filter by region',
  dashboard_chart: 'For example: make it a weekly bar chart and label each bar with its count',
  ai_reasoning: 'For example: explain each decision in one sentence that names the two columns behind it',
  value_formula: 'For example: price each row at its open order value times the chance it is lost',
};

const EXAMPLE_MAX_ROWS = 8;
export const VIBES_ROWS = 8;

function heightOfText(el, text) {
  const probe = el.cloneNode(false);
  probe.removeAttribute('id');
  probe.value = text;
  probe.rows = 1;
  Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', height: 'auto', minHeight: '0', width: `${el.offsetWidth}px` });
  el.parentNode.appendChild(probe);
  const need = probe.scrollHeight + probe.offsetHeight - probe.clientHeight;
  probe.value = '';
  probe.rows = EXAMPLE_MAX_ROWS;
  const most = probe.offsetHeight;
  probe.remove();
  return Math.min(need, most);
}

export default function VibesEditor({ id, value, onChange, autoFocus = false, label = '', heading = '', disabled = false, placeholder = '' }) {
  const hint = useId();
  const box = useId();
  const ref = useRef(null);
  const problem = vibesProblem(id, value, label);
  const example = placeholder || PLACEHOLDERS[partOf(id)?.kind || id];
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !example) return undefined;
    let frame = 0;
    const fit = () => {
      if (el.offsetWidth) el.style.minHeight = `${heightOfText(el, example)}px`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    watch.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
    };
  }, [example]);
  return (
    <div className="space-y-1">
      {heading && <label htmlFor={box} className="block text-[13px] font-semibold text-text-primary">{heading}</label>}
      <textarea
        ref={ref}
        id={box}
        aria-label={heading ? undefined : label ? `Vibes for the ${label}` : vibesLabel(id)}
        aria-describedby={hint}
        aria-invalid={problem ? 'true' : undefined}
        autoFocus={autoFocus}
        disabled={disabled}
        rows={VIBES_ROWS}
        value={value}
        placeholder={example}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-2.5 py-2 text-sm leading-snug border rounded-md bg-surface text-text-primary glow-focus resize-y max-h-[60vh] disabled:opacity-60 ${problem ? 'border-error' : 'border-border'}`}
      />
      <div className="flex items-start justify-between gap-3 text-[11px]">
        <p id={hint} className="text-error-fg">{problem}</p>
        <span data-vibes-count="" className={`shrink-0 tabular-nums ${problem ? 'font-semibold text-error-fg' : 'text-text-secondary'}`}>
          {vibesLength(value)}/{VIBES_MAX}
        </span>
      </div>
    </div>
  );
}
