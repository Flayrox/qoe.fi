'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReadingProgressBarProps {
  /** Passe à false pour désactiver (ex: pas dans un article) */
  active?: boolean;
  /** Container à observer — si null, observe window */
  containerRef?: React.RefObject<HTMLElement>;
}

export function ReadingProgressBar({ active = true, containerRef }: ReadingProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      setVisible(false);
      return;
    }

    const updateProgress = () => {
      const container = containerRef?.current;
      if (container) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const total = scrollHeight - clientHeight;
        const current = total > 0 ? (scrollTop / total) * 100 : 0;
        setProgress(Math.min(100, Math.max(0, current)));
        setVisible(scrollTop > 80);
      } else {
        const total = document.documentElement.scrollHeight - window.innerHeight;
        const current = total > 0 ? (window.scrollY / total) * 100 : 0;
        setProgress(Math.min(100, Math.max(0, current)));
        setVisible(window.scrollY > 80);
      }
    };

    const target = containerRef?.current || window;
    target.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();

    return () => target.removeEventListener('scroll', updateProgress);
  }, [active, containerRef]);

  return (
    <AnimatePresence>
      {visible && active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed top-0 left-0 right-0 z-[100] pointer-events-none"
          aria-hidden="true"
        >
          <div className="w-full h-[2px] bg-[var(--border-subtle)]">
            <motion.div
              className="h-full origin-left"
              style={{
                background: 'var(--qoe-vermillion)',
                boxShadow: '0 0 8px var(--qoe-vermillion-glow)',
                scaleX: progress / 100,
              }}
              transition={{ duration: 0.1, ease: 'linear' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
