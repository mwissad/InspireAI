import { useState, useEffect } from 'react';

export default function ScrollProgressRing() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const el = document.documentElement;
      const scrollTop = el.scrollTop || document.body.scrollTop;
      const scrollHeight = el.scrollHeight - el.clientHeight;
      setProgress(scrollHeight > 0 ? scrollTop / scrollHeight : 0);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (progress < 0.02) return null;

  const r = 16;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress);

  return (
    <div className="fixed bottom-6 right-6 z-50 w-10 h-10" title={`${Math.round(progress * 100)}%`}>
      <svg viewBox="0 0 40 40" className="w-full h-full scroll-progress-ring">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--t-border)" strokeWidth="2" />
        <circle
          cx="20" cy="20" r={r}
          fill="none"
          stroke="#FF3621"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-db-red">
        {Math.round(progress * 100)}
      </span>
    </div>
  );
}
