'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@qoe/utils';

interface ReaderPageLayoutProps {
  giantTitle?: string;
  giantTitleSuffix?: string;
  headerWidgets?: React.ReactNode;
  hideHeader?: boolean;
  children: React.ReactNode;
}

export function ReaderPageLayout({
  giantTitle,
  giantTitleSuffix = '.',
  headerWidgets,
  hideHeader = false,
  children,
}: ReaderPageLayoutProps) {
  const pathname = usePathname();
  const isTimeline = pathname.endsWith('/home') || pathname.endsWith('/home/');

  return (
    <div className="relative min-h-screen bg-background text-foreground selection:bg-primary/10 selection:text-primary">
      {/* ── BACKGROUND FIXED HEADER REGION ── */}
      <div className="fixed top-0 left-0 md:left-[256px] right-0 z-0 h-[280px] sm:h-[320px] pointer-events-none flex flex-col justify-start">
        {/* Ambient Top Glow Layer */}
        <div className="absolute inset-0 bg-gradient-to-b from-card/80 via-background/40 to-transparent pointer-events-none" />

        {/* Static Background "Lire" giant title & manifesto header */}
        <AnimatePresence>
          {!hideHeader && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="max-w-2xl mx-auto px-4 sm:px-6 w-full space-y-3 pt-12 sm:pt-14 select-none"
            >
              {giantTitle && (
                <div className="flex items-center gap-2">
                  <span className="font-sans text-5xl sm:text-6xl font-extrabold text-primary tracking-tighter">
                    {giantTitle}
                    <span className="text-foreground">{giantTitleSuffix}</span>
                  </span>
                </div>
              )}

              <p className="text-sm sm:text-base text-muted-foreground font-normal leading-relaxed max-w-xl">
                Plateforme de lecture, d&apos;écriture et d&apos;échanges créateurs. Le flux
                glissant ci-dessous réunit articles longs et micro-posts en une expérience unifiée.
              </p>

              {headerWidgets && <div className="w-full pt-2">{headerWidgets}</div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── FOREGROUND SLIDING FEED SHEET (FULL STAGE WIDTH) ── */}
      <div className="relative z-10 w-full">
        <div className={cn('w-full px-0 sm:px-2 md:px-4', isTimeline ? 'pt-0' : 'pt-8')}>
          {children}
        </div>
      </div>
    </div>
  );
}
