export function SkeletonLine({ width = '100%', height = '12px', className = '' }) {
  return <div className={`skeleton ${className}`} style={{ width, height }} />;
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`rounded-xl border border-border p-5 space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="skeleton w-10 h-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="60%" height="14px" />
          <SkeletonLine width="40%" height="10px" />
        </div>
      </div>
      <SkeletonLine width="100%" height="8px" />
      <SkeletonLine width="85%" height="8px" />
      <SkeletonLine width="70%" height="8px" />
    </div>
  );
}

const STAT_GRID_SM = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
};

export function SkeletonStats({ count = 4, className = '' }) {
  const smGrid = STAT_GRID_SM[count] || STAT_GRID_SM[4];
  return (
    <div className={`grid grid-cols-2 ${smGrid} gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border p-4 space-y-2">
          <SkeletonLine width="50%" height="10px" />
          <SkeletonLine width="30%" height="24px" />
        </div>
      ))}
    </div>
  );
}
