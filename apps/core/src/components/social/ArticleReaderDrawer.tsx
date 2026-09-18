'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { ArticleAnnotatorView, type ArticleAnnotatorViewProps } from './ArticleAnnotatorView';
import { getArticleUrl } from '@qoe/config/routes';
import { cn } from '@qoe/utils';

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
  const [isScrolled, setIsScrolled] = React.useState(false);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setIsScrolled(scrollTop > 45);
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
      setIsScrolled(false);
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

  const externalUrl = getArticleUrl(article, { preferTenant: true });
  const authorName =
    article.author?.name || article.author?.username || article.publication?.slug || '';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed top-[6px] bottom-0 md:bottom-[6px] left-0 md:left-[262px] right-0 md:right-[6px] z-50 flex flex-col pointer-events-auto select-text">
          {/* Backdrop Click Area (No darkening overlay, background remains untouched) */}
          <div onClick={onClose} className="fixed inset-0 cursor-pointer -z-10" />

          {/* Reader Panel aligned with sidebar */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative z-10 w-full h-full flex flex-col bg-white dark:bg-black text-black dark:text-white border border-border/40 rounded-t-3xl md:rounded-[18px] shadow-2xl overflow-hidden font-sans"
          >
            {/* 1. Zenithal Progressive Blur & Theme Gradient Fade (Part du bas normal vers le flou/blanc sans aucun rectangle) */}
            <div className="pointer-events-none absolute top-0 left-0 right-0 h-32 z-20 overflow-hidden">
              {/* Couche 1 : micro-flou 1px (transition douce en bas) */}
              <div
                className="absolute inset-0 backdrop-blur-[1px]"
                style={{
                  WebkitMaskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 75%, rgba(0,0,0,0) 100%)',
                  maskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 75%, rgba(0,0,0,0) 100%)',
                }}
              />
              {/* Couche 2 : flou léger 2px */}
              <div
                className="absolute inset-0 backdrop-blur-[2px]"
                style={{
                  WebkitMaskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0) 85%)',
                  maskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0) 85%)',
                }}
              />
              {/* Couche 3 : flou moyen 4px */}
              <div
                className="absolute inset-0 backdrop-blur-[4px]"
                style={{
                  WebkitMaskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 45%, rgba(0,0,0,0) 70%)',
                  maskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 45%, rgba(0,0,0,0) 70%)',
                }}
              />
              {/* Couche 4 : flou prononcé 8px */}
              <div
                className="absolute inset-0 backdrop-blur-[8px]"
                style={{
                  WebkitMaskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 55%)',
                  maskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 55%)',
                }}
              />
              {/* Couche 5 : flou maximal 16px en haut */}
              <div
                className="absolute inset-0 backdrop-blur-[16px]"
                style={{
                  WebkitMaskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 15%, rgba(0,0,0,0) 40%)',
                  maskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 15%, rgba(0,0,0,0) 40%)',
                }}
              />
              {/* Fondu de couleur progressif vers le fond du thème (blanc en clair, noir en sombre) */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(to bottom, var(--background) 0%, color-mix(in srgb, var(--background) 92%, transparent) 25%, color-mix(in srgb, var(--background) 65%, transparent) 50%, color-mix(in srgb, var(--background) 25%, transparent) 75%, transparent 100%)',
                }}
              />
            </div>

            {/* 2. Floating Header Controls (Drag Handle + Dynamic Title on Scroll + Circular Buttons) */}
            <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none flex flex-col">
              {/* Drag Handle */}
              <div className="w-full pt-2.5 pb-1 flex items-center justify-center shrink-0">
                <div className="w-10 h-1 rounded-full bg-foreground/25 hover:bg-foreground/45 transition-colors cursor-grab pointer-events-auto" />
              </div>

              {/* Dynamic Header Row */}
              <div className="h-11 px-5 sm:px-6 flex items-center justify-between">
                {/* Title & Author Info: Appears only when scrolling down */}
                <div
                  className={cn(
                    'flex flex-col min-w-0 pr-4 transition-all duration-300 transform',
                    isScrolled
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 -translate-y-2 pointer-events-none'
                  )}
                >
                  <h3 className="text-sm font-semibold text-foreground truncate max-w-sm sm:max-w-md md:max-w-xl">
                    {article.title}
                  </h3>
                  {authorName && (
                    <span className="text-[11px] text-muted-foreground truncate">{authorName}</span>
                  )}
                </div>

                {/* Circular Floating Action Buttons (always clickable, frosted glass) */}
                <div className="flex items-center gap-2 shrink-0 pointer-events-auto ml-auto">
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground bg-background/80 hover:bg-muted border border-border/20 shadow-xs backdrop-blur-sm transition-all cursor-pointer"
                    title="Ouvrir dans une nouvelle page"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground bg-background/80 hover:bg-muted border border-border/20 shadow-xs backdrop-blur-sm transition-all outline-none cursor-pointer"
                    title="Fermer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Sleek Reading Scroll Progress Line (1.5px) */}
              <div
                className={cn(
                  'w-full h-[1.5px] bg-border/15 overflow-hidden transition-opacity duration-300',
                  isScrolled ? 'opacity-100' : 'opacity-0'
                )}
              >
                <div
                  className="h-full bg-foreground dark:bg-white transition-all duration-100 ease-out"
                  style={{ width: `${scrollProgress}%` }}
                />
              </div>
            </div>

            {/* 3. Drawer Scroll Container */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="relative flex-1 overflow-y-auto overflow-x-hidden pt-16 sm:pt-20 pb-16 px-4 sm:px-6 scroll-smooth bg-white dark:bg-black"
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
