export default function InspireScoreBadge({ score }) {
  if (score == null) return null;
  return (
    <div
      className="shrink-0 flex flex-col items-center justify-center rounded-2xl px-3.5 py-2 min-w-[4.25rem] bg-db-red-50 border border-db-red/20 shadow-sm"
      title="Inspire composite score"
    >
      <span className="text-[8px] font-semibold text-db-red-fg uppercase tracking-[0.18em] leading-none">
        Inspire
      </span>
      <span className="text-2xl font-extrabold text-db-red-fg tabular-nums tracking-tight leading-none mt-1.5">
        {score.toFixed(1)}
      </span>
    </div>
  );
}
