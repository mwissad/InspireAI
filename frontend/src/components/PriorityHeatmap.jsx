import { useState } from 'react';

const PRIORITIES = ['Ultra High', 'Very High', 'High', 'Medium', 'Low'];
const PRIORITY_COLORS = { 'Ultra High': '#DC2626', 'Very High': '#EA580C', 'High': '#D97706', 'Medium': '#2563EB', 'Low': '#6B7280' };

export default function PriorityHeatmap({ useCases = [], domains = [] }) {
  const [hovered, setHovered] = useState(null);
  if (!useCases.length || !domains.length) return null;

  const domainNames = domains.map(d => d.domain_name || d).filter(Boolean);

  // Build grid: domain × priority → count
  const grid = {};
  let maxCount = 0;
  for (const d of domainNames) {
    grid[d] = {};
    for (const p of PRIORITIES) {
      const count = useCases.filter(uc =>
        (uc['Business Domain'] || uc._domain || uc.domain) === d &&
        (uc.Priority || uc.priority) === p
      ).length;
      grid[d][p] = count;
      if (count > maxCount) maxCount = count;
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="text-[9px] text-text-tertiary font-medium px-2 py-1.5 text-left" />
            {PRIORITIES.map(p => (
              <th key={p} className="text-[9px] text-text-secondary font-semibold px-2 py-1.5 text-center whitespace-nowrap">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {domainNames.map(d => (
            <tr key={d}>
              <td className="text-[10px] text-text-primary font-medium px-2 py-1 whitespace-nowrap max-w-[120px] truncate">{d}</td>
              {PRIORITIES.map(p => {
                const count = grid[d]?.[p] || 0;
                const intensity = maxCount > 0 ? count / maxCount : 0;
                const color = PRIORITY_COLORS[p];
                const key = `${d}-${p}`;
                return (
                  <td key={p} className="p-0.5">
                    <div
                      className="heatmap-cell w-10 h-8 rounded-md flex items-center justify-center cursor-default relative"
                      style={{
                        backgroundColor: count > 0 ? `${color}${Math.round(intensity * 180 + 20).toString(16).padStart(2, '0')}` : 'var(--t-bg-subtle)',
                        '--cell-color': color,
                      }}
                      onMouseEnter={() => setHovered(key)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {count > 0 && (
                        <span className="text-[10px] font-bold" style={{ color: intensity > 0.5 ? '#fff' : color }}>
                          {count}
                        </span>
                      )}
                      {hovered === key && count > 0 && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 glass rounded-md px-2 py-1 text-[9px] text-text-primary font-medium whitespace-nowrap z-20 shadow-md">
                          {d}: {count} {p}
                        </div>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
