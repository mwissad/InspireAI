import { useRef, useCallback } from 'react';

export default function GlassCard({ children, className = '', tilt = true, ...props }) {
  const ref = useRef(null);

  const handleMove = useCallback((e) => {
    if (!tilt || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    ref.current.style.setProperty('--rx', `${-y * 6}deg`);
    ref.current.style.setProperty('--ry', `${x * 6}deg`);
  }, [tilt]);

  const handleLeave = useCallback(() => {
    if (!ref.current) return;
    ref.current.style.setProperty('--rx', '0deg');
    ref.current.style.setProperty('--ry', '0deg');
  }, []);

  return (
    <div
      ref={ref}
      className={`glass tilt-card rounded-2xl shadow-lg ${className}`}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      {...props}
    >
      {children}
    </div>
  );
}
