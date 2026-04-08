const DOMAIN_COLORS = ['#FF3621', '#3B82F6', '#22C55E', '#EAB308', '#8B5CF6', '#EC4899'];

export default function SessionSparkline({ session, width = 80, height = 28 }) {
  const rj = session?.results_json;
  if (!rj) return null;

  // Extract domain counts
  const domainCounts = [];
  if (Array.isArray(rj.domains)) {
    for (const d of rj.domains) {
      domainCounts.push(d.use_cases?.length || 0);
    }
  }
  if (domainCounts.length === 0) return null;

  const max = Math.max(...domainCounts, 1);
  const barW = Math.min(8, (width - 2) / domainCounts.length - 1);
  const gap = 1;
  const totalW = domainCounts.length * (barW + gap) - gap;
  const offsetX = (width - totalW) / 2;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="shrink-0">
      {domainCounts.map((count, i) => {
        const barH = (count / max) * (height - 4);
        return (
          <rect
            key={i}
            x={offsetX + i * (barW + gap)}
            y={height - 2 - barH}
            width={barW}
            height={barH}
            rx={1}
            fill={DOMAIN_COLORS[i % DOMAIN_COLORS.length]}
            opacity={0.7}
          >
            <animate attributeName="height" from="0" to={barH} dur="0.6s" begin={`${i * 0.08}s`} fill="freeze" />
            <animate attributeName="y" from={height - 2} to={height - 2 - barH} dur="0.6s" begin={`${i * 0.08}s`} fill="freeze" />
          </rect>
        );
      })}
    </svg>
  );
}
