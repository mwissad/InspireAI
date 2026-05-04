import { useState } from 'react';

const DOMAIN_COLORS = ['#FF3621', '#3B82F6', '#22C55E', '#EAB308', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

export default function DomainSunburst({ domains = [], businessName = '', size = 280 }) {
  const [hovered, setHovered] = useState(null);
  if (!domains.length) return null;

  const cx = size / 2;
  const cy = size / 2;
  const totalUc = domains.reduce((s, d) => s + (d.use_cases?.length || 0), 0);

  // Build sectors
  let startAngle = -Math.PI / 2;
  const sectors = domains.map((d, i) => {
    const count = d.use_cases?.length || 0;
    const angle = totalUc > 0 ? (count / totalUc) * Math.PI * 2 : 0;
    const sector = { ...d, color: DOMAIN_COLORS[i % DOMAIN_COLORS.length], start: startAngle, angle, count, index: i };
    startAngle += angle;
    return sector;
  });

  const arc = (cx, cy, r, startAngle, endAngle) => {
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const large = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
  };

  const r1 = size * 0.18; // inner ring
  const r2 = size * 0.35; // domain ring
  const r3 = size * 0.47; // use case ring

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
        {/* Domain ring */}
        {sectors.map((s) => (
          <path
            key={s.domain_name}
            d={arc(cx, cy, r2, s.start, s.start + s.angle)}
            fill={s.color}
            opacity={hovered === null || hovered === s.index ? 0.7 : 0.2}
            className="sunburst-sector cursor-pointer"
            onMouseEnter={() => setHovered(s.index)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}

        {/* Use case outer ring — subdivided per domain */}
        {sectors.map((s) => {
          const ucs = s.use_cases || [];
          if (ucs.length === 0) return null;
          const ucAngle = s.angle / ucs.length;
          return ucs.map((uc, j) => (
            <path
              key={`${s.index}-${j}`}
              d={arc(cx, cy, r3, s.start + j * ucAngle, s.start + (j + 1) * ucAngle)}
              fill={s.color}
              opacity={hovered === null || hovered === s.index ? 0.35 : 0.08}
              className="sunburst-sector"
              onMouseEnter={() => setHovered(s.index)}
              onMouseLeave={() => setHovered(null)}
            />
          ));
        })}

        {/* Inner circle cutout */}
        <circle cx={cx} cy={cy} r={r1} fill="var(--t-bg)" />

        {/* Center text */}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--t-text-primary)" fontSize="11" fontWeight="700">
          {totalUc}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="var(--t-text-secondary)" fontSize="7">
          use cases
        </text>
      </svg>

      {/* Hover tooltip */}
      {hovered !== null && sectors[hovered] && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-8 glass rounded-lg px-3 py-2 text-center z-10 whitespace-nowrap shadow-lg">
          <p className="text-[11px] font-bold" style={{ color: sectors[hovered].color }}>{sectors[hovered].domain_name}</p>
          <p className="text-[10px] text-text-secondary">{sectors[hovered].count} use cases</p>
        </div>
      )}
    </div>
  );
}
