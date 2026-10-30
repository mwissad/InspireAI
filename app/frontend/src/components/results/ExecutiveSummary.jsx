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
    <Card id="executive-summary" className="scroll-mt-20 p-6">
      <div className="flex items-center gap-2">
        <FileText size={16} strokeWidth={1.75} className="text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Executive summary</h2>
      </div>

      {summary && (
        <div className="mt-4 max-w-[70ch]">
          <p
            className={`whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground ${
              collapsible && !expanded ? 'line-clamp-3' : ''
            }`}
          >
            {summary}
          </p>
          {collapsible && (
            <Button
              variant="link"
              size="sm"
              className="mt-2 text-foreground"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show less' : 'Read more'}
            </Button>
          )}
        </div>
      )}

      {opportunities.length > 0 && !expanded && (
        <div className="mt-5 max-w-[70ch]">
          <h3 className="text-xs font-medium text-muted-foreground">Key opportunities</h3>
          <ul className="mt-2 space-y-2">
            {opportunities.map((o) => (
              <li key={o} className="flex gap-3 text-sm leading-6 text-foreground">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-subtle-foreground" aria-hidden />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {domainOverview && (
        <details className="group mt-5 border-t pt-4">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight size={16} className="shrink-0 transition-transform duration-200 group-open:rotate-90" aria-hidden />
            Domain overview
          </summary>
          <p className="mt-3 max-w-[70ch] text-sm leading-7 text-muted-foreground">{domainOverview}</p>
        </details>
      )}
    </Card>
  );
}
