'use client';

import { useEffect, useState } from 'react';
import { useReadingPreferences } from './ReadingPreferencesContext';

export function ReadingRuler() {
  const { preferences } = useReadingPreferences();
  const [mouseY, setMouseY] = useState<number | null>(null);

  useEffect(() => {
    if (!preferences.readingRuler) return;

    function handleMouseMove(e: MouseEvent) {
      setMouseY(e.clientY);
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [preferences.readingRuler]);

  if (!preferences.readingRuler || mouseY === null) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-30 transition-opacity duration-200"
      aria-hidden="true"
    >
      {/* Top overlay shadow */}
      <div
        className="absolute inset-x-0 top-0 bg-black/15 dark:bg-black/35 backdrop-blur-[0.5px]"
        style={{ height: Math.max(0, mouseY - 28) }}
      />

      {/* Clear focus reading line with hairline borders */}
      <div
        className="absolute inset-x-0 border-y border-primary/40 bg-primary/5 shadow-xs"
        style={{
          top: Math.max(0, mouseY - 28),
          height: 56,
        }}
      />

      {/* Bottom overlay shadow */}
      <div
        className="absolute inset-x-0 bottom-0 bg-black/15 dark:bg-black/35 backdrop-blur-[0.5px]"
        style={{ top: mouseY + 28 }}
      />
    </div>
  );
}
