import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export function ScoreChip({ score }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex min-w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-lg border bg-card px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground leading-none">Inspire</span>
          <span className="mt-1.5 text-xl font-semibold leading-none tracking-tight text-accent tabular-nums">
            {score.toFixed(1)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left">Inspire composite score</TooltipContent>
    </Tooltip>
  );
}
