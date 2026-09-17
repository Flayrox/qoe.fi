'use client';

import { useEffect, useState } from 'react';

interface ReadingProgressBarProps {
  containerId?: string;
  className?: string;
}

export function ReadingProgressBar({ containerId, className = '' }: ReadingProgressBarProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function handleScroll() {
      if (containerId) {
        const container = document.getElementById(containerId);
        if (container) {
          const { scrollTop, scrollHeight, clientHeight } = container;
          const maxScroll = scrollHeight - clientHeight;
          const pct = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
          setProgress(Math.min(100, Math.max(0, pct)));
          return;
        }
      }

      // Default to window scroll
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const maxScroll = scrollHeight - clientHeight;
      const pct = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
      setProgress(Math.min(100, Math.max(0, pct)));
    }

    if (containerId) {
      const container = document.getElementById(containerId);
      if (container) {
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [containerId]);

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 h-[2.5px] bg-transparent pointer-events-none ${className}`}
    >
      <div
        className="h-full transition-all duration-150 ease-out"
        style={{
          width: `${progress}%`,
          backgroundColor: 'var(--tenant-accent, hsl(var(--primary)))',
        }}
      />
    </div>
  );
}
