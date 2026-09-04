'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { ArticleAnnotatorView, type ArticleAnnotatorViewProps } from './ArticleAnnotatorView';
import { routes } from '@qoe/config/routes';

export interface ArticleReaderDrawerProps {
  isOpen: boolean;
  article: ArticleAnnotatorViewProps['article'] | null;
  onClose: () => void;
  initialSource?: 'feed' | 'subdomain' | 'public_profile' | 'direct';
  /** Passage à mettre en avant (deep-link citation → article). */
  spotlight?: ArticleAnnotatorViewProps['spotlight'];
}

export function ArticleReaderDrawer({
  isOpen,
  article,
  onClose,
  initialSource,
  spotlight,
}: ArticleReaderDrawerProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = React.useState(0);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const totalScroll = scrollHeight - clientHeight;
      if (totalScroll > 0) {
        setScrollProgress(Math.min(100, Math.max(0, (scrollTop / totalScroll) * 100)));
      }
    }
  };

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setScrollProgress(0);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!article) return null;

  const subdomain = article.author?.subdomain;
  const externalUrl = subdomain
    ? routes.tenant.article(subdomain, article.slug)
    : routes.feed.article(article.slug);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-y-0 right-0 left-0 md:left-[256px] z-50 flex flex-col justify-end pointer-events-auto select-text">
          {/* Backdrop Blur Overlay (Bounded right of sidebar) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-xs cursor-pointer"
          />

          {/* Bottom Sheet Drawer Panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative z-10 w-full h-[94vh] max-h-[94vh] flex flex-col bg-background text-foreground border-t border-l border-border/50 rounded-t-3xl shadow-2xl overflow-hidden font-sans"
          >
            {/* Top Drag Handle Bar */}
            <div className="w-full py-2 flex items-center justify-center shrink-0 bg-background cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
            </div>

            {/* Sticky Drawer Header */}
            <div className="flex items-center justify-between px-6 py-2.5 border-b border-border/40 shrink-0 bg-background/95 backdrop-blur-md z-20">
              <div className="flex items-center gap-3 min-w-0 pr-4">
                <span className="px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                  Lecture & Annotation
                </span>
                <h3 className="text-sm font-semibold text-foreground truncate">{article.title}</h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted/60 transition-colors cursor-pointer"
                  title="Ouvrir dans une nouvelle page"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted/60 transition-colors outline-none cursor-pointer"
                  title="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 2026 Reading Scroll Progress Line */}
            <div className="w-full h-1 bg-muted/20 overflow-hidden shrink-0">
              <div
                className="h-full bg-gradient-to-r from-highlight via-primary to-success transition-all duration-100 ease-out"
                style={{ width: `${scrollProgress}%` }}
              />
            </div>

            {/* Drawer Scroll Container */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-6 scroll-smooth"
            >
              <div className="max-w-6xl mx-auto">
                <ArticleAnnotatorView
                  article={article}
                  onClose={onClose}
                  initialSource={initialSource}
                  spotlight={spotlight}
                />
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
