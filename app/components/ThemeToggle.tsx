'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'day' | 'night'>('night');

  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('theme')) as 'day' | 'night' | null;
    const initial = saved === 'day' || saved === 'night' ? saved : 'night';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function applyTheme(next: 'day' | 'night') {
    const root = document.documentElement;
    root.classList.remove('theme-day', 'theme-night');
    root.classList.add(next === 'day' ? 'theme-day' : 'theme-night');
    localStorage.setItem('theme', next);
  }
  function toggle() {
    const next = theme === 'day' ? 'night' : 'day';
    setTheme(next);
    applyTheme(next);
  }

  const isDay = theme === 'day';

  return (
    <>
      <button
        onClick={toggle}
        aria-label={isDay ? 'Switch to nightlight mode' : 'Switch to daylight mode'}
        title={isDay ? 'Nightlight mode' : 'Daylight mode'}
        className="theme-toggle"
      >
        {isDay ? (
          <svg viewBox="0 0 24 24" className="icon" aria-hidden><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 1 0 9.79 9.79Z" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="icon sun" aria-hidden><path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0 4a1 1 0 0 1-1-1v-1a1 1 0 1 1 2 0v1a1 1 0 0 1-1 1ZM12 4a1 1 0 0 0 1-1V2a1 1 0 1 0-2 0v1a1 1 0 0 0 1 1Zm8 8a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2h-1a1 1 0 0 1-1-1ZM3 12a1 1 0 0 0-1-1H1a1 1 0 1 0 0 2h1a1 1 0 0 0 1-1Zm14.95 6.95a1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a1 1 0 0 1-1.41 0ZM4.93 6.34a1 1 0 0 0 1.41 0l.71-.71A1 1 0 0 0 5.64 4.22l-.71.71a1 1 0 0 0 0 1.41Zm13.08-2.12a1 1 0 0 1 1.41 1.41l-.71.71a1 1 0 1 1-1.41-1.41l.71-.71ZM6.34 19.07a1 1 0 0 0 0-1.41l-.71-.71a1 1 0 0 0-1.41 1.41l.71.71a1 1 0 0 0 1.41 0Z" /></svg>
        )}
      </button>

      <style jsx global>{`
        .theme-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px; height: 36px;
          border-radius: 999px;
          border: 2px solid #00f0ff;
          background: #0a0f1c;
          color: #cfeeff;
          box-shadow: 0 0 8px rgba(0, 240, 255, 0.35);
          cursor: pointer;
        }
        .theme-toggle .icon { width: 18px; height: 18px; fill: currentColor; }
        .theme-toggle .icon.sun { color: #ffd24a; }

        /* Day-mode basics (kept minimal) */
        html.theme-day body { background: #eef5ff !important; color: #0b1424 !important; }
        html.theme-day .card { background: #ffffff !important; border-color: rgba(0,0,0,0.12) !important; }
        html.theme-day .btn.primary { background: linear-gradient(180deg, #68e1c9, #23b996) !important; color: #08322a !important; border-color: #23b996 !important; }
        html.theme-day .btn.ghost { background: #f3f7ff !important; color: #0b1424 !important; border-color: rgba(0,0,0,0.12) !important; }
        html.theme-day .game { background: linear-gradient(180deg, #f5f9ff, #eaf1ff) !important; border-color: rgba(0,0,0,0.12) !important; }
        html.theme-day .tab { background: #f0f6ff !important; border-color: rgba(0,0,0,0.12) !important; color: #0b1424 !important; }
        html.theme-day .muted { color: #3a4a60 !important; }
      `}</style>
    </>
  );
}
