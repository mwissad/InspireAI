const PRIORITY_MAP = {
  'Ultra High': { score: 95, color: '#DC2626' },
  'Very High': { score: 80, color: '#EA580C' },
  'High': { score: 65, color: '#D97706' },
  'Medium': { score: 45, color: '#2563EB' },
  'Low': { score: 25, color: '#6B7280' },
  'Very Low': { score: 10, color: '#9CA3AF' },
};

export default function ScoreGauge({ priority, size = 36 }) {
  const { score, color } = PRIORITY_MAP[priority] || PRIORITY_MAP['Medium'];
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="relative gauge-glow" style={{ width: size, height: size, '--gauge-color': color }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--t-border)" strokeWidth="3" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference}
          className="gauge-arc"
          style={{ '--gauge-circumference': circumference, '--gauge-offset': offset }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}
