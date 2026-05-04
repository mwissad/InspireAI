import { useEffect, useRef } from 'react';

export default function Celebration({ trigger }) {
  const fired = useRef(false);

  useEffect(() => {
    if (!trigger || fired.current) return;
    fired.current = true;

    // Load canvas-confetti from CDN
    const fire = async () => {
      if (!window.confetti) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      // Burst from center
      const defaults = { origin: { y: 0.6 }, zIndex: 9999 };
      window.confetti({ ...defaults, spread: 80, particleCount: 50, colors: ['#FF3621', '#FF8A6B', '#3B82F6', '#22C55E', '#EAB308'] });
      setTimeout(() => {
        window.confetti({ ...defaults, spread: 100, particleCount: 30, origin: { x: 0.3, y: 0.5 } });
      }, 200);
      setTimeout(() => {
        window.confetti({ ...defaults, spread: 100, particleCount: 30, origin: { x: 0.7, y: 0.5 } });
      }, 400);
    };
    fire().catch(() => {});
  }, [trigger]);

  return null;
}
