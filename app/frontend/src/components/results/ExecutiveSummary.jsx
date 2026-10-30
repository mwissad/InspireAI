import { useMemo, useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';

const COLLAPSE_THRESHOLD = 320;
const MAX_OPPORTUNITIES = 4;

/** Sentences of the summary that name one of the generated use cases. */
function keyOpportunities(summary, names) {
  const sentences = summary.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
  const needles = names.filter((n) => n && n.length >= 12);
  if (!needles.length) return [];
  return sentences
    .map((s) => s.trim())
    .filter((s) => needles.some((n) => s.includes(n)))
    .slice(0, MAX_OPPORTUNITIES);
}

export function ExecutiveSummary({ summary, domainOverview, useCaseNames = [] }) {
  const [expanded, setExpanded] = useState(false);
  const opportunities = useMemo(() => keyOpportunities(summary || '', useCaseNames), [summary, useCaseNames]);
  if (!summary && !domainOverview) return null;
  const collapsible = (summary || '').length > COLLAPSE_THRESHOLD;

  return (
    <Card id="executive-summary" className="scroll-mt-20 p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <FileText size={22} strokeWidth={1.75} className="text-foreground" aria-hidden />
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Executive summary</h2>
      </div>

      {summary && (
        <div className="mt-5 max-w-[70ch]">
          <p
            className={`whitespace-pre-wrap text-base leading-7 text-foreground ${
              collapsible && !expanded ? 'line-clamp-3' : ''
            }`}
          >
            {summary}
          </p>
          {collapsible && (
            <Button
              variant="link"
              className="mt-2 h-auto px-0 text-sm font-medium text-foreground"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show less' : 'Read more'}
            </Button>
          )}
        </div>
      )}

      {opportunities.length > 0 && !expanded && (
        <div className="mt-6 max-w-[70ch]">
          <h3 className="text-base font-semibold text-foreground">Key opportunities</h3>
          <ul className="mt-3 space-y-2.5">
            {opportunities.map((o) => (
              <li key={o} className="flex gap-3 text-[15px] leading-7 text-foreground">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-foreground" aria-hidden />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {domainOverview && (
        <details className="group mt-6 border-t pt-5">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-base font-semibold text-foreground transition-colors hover:text-foreground/80 [&::-webkit-details-marker]:hidden">
            <ChevronRight size={18} className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90" aria-hidden />
            Domain overview
          </summary>
          <p className="mt-3 max-w-[70ch] text-[15px] leading-7 text-foreground">{domainOverview}</p>
        </details>
      )}
    </Card>
  );
}
