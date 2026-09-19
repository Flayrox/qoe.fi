'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { ArticleAnnotatorView, type ArticleAnnotatorViewProps } from './ArticleAnnotatorView';
import { getArticleUrl } from '@qoe/config/routes';
import { cn } from '@qoe/utils';

import { ReaderToolbarProvider, useReaderToolbar } from './ReaderToolbarContext';
import { DockedReaderToolbar } from './DockedReaderToolbar';
import { TextToSpeechProvider } from '@qoe/ui/reader';
import { ProgressiveBlur } from '@qoe/ui';

export interface ArticleReaderDrawerProps {
  isOpen: boolean;
  article: ArticleAnnotatorViewProps['article'] | null;
  canonicalDocument?: ArticleAnnotatorViewProps['canonicalDocument'];
  onClose: () => void;
  initialSource?: 'feed' | 'subdomain' | 'public_profile' | 'direct';
  /** Passage à mettre en avant (deep-link citation → article). */
  spotlight?: ArticleAnnotatorViewProps['spotlight'];
}

export function ArticleReaderDrawer(props: ArticleReaderDrawerProps) {
  if (!props.isOpen && !props.article) return null;

  const authorName =
    props.article?.author?.name ||
    props.article?.author?.username ||
    props.article?.publication?.slug ||
    '';

  return (
    <ReaderToolbarProvider allowPublicAnnotations={props.article?.allowPublicAnnotations ?? true}>
      <TextToSpeechProvider
        initialMetadata={{
          title: props.article?.title || '',
          coverUrl: props.article?.imageUrl || null,
          authorName,
          contentSelector: '#article-content',
        }}
      >
        <ArticleReaderDrawerContent {...props} />
      </TextToSpeechProvider>
    </ReaderToolbarProvider>
  );
}

function ArticleReaderDrawerContent({
  isOpen,
  article,
  canonicalDocument,
  onClose,
  initialSource,
  spotlight,
}: ArticleReaderDrawerProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = React.useState(0);
  const [isScrolled, setIsScrolled] = React.useState(false);

  const toolbar = useReaderToolbar();
  const setIsDocked = toolbar?.setIsDocked;
  const authorToolbarRef = toolbar?.authorToolbarRef;
  const isDocked = toolbar?.isDocked ?? false;

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setIsScrolled(scrollTop > 45);
      const totalScroll = scrollHeight - clientHeight;
      if (totalScroll > 0) {
        setScrollProgress(Math.min(100, Math.max(0, (scrollTop / totalScroll) * 100)));
      }

      if (authorToolbarRef?.current && setIsDocked) {
        const rect = authorToolbarRef.current.getBoundingClientRect();
        // La barre flottante du drawer mesure h-11 (44px) + drag handle ~ 60px
        // Dès que le haut de la barre d'auteur atteint <= 65px, elle est touchée par la barre supérieure
        setIsDocked(rect.top <= 65);
      } else if (setIsDocked) {
        setIsDocked(scrollTop > 240);
      }
    }
  };

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setScrollProgress(0);
      setIsScrolled(false);
      setIsDocked?.(false);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, setIsDocked]);

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
        <div className="fixed top-[6px] bottom-0 md:bottom-[6px] left-0 md:left-[262px] right-0 md:right-[6px] z-50 flex flex-col pointer-events-auto select-text selection:bg-foreground selection:text-background">
          {/* Backdrop Click Area (No darkening overlay, strictly bounded to right stage, sidebar remains 100% uncovered) */}
          <div
            onClick={onClose}
            className="fixed top-0 bottom-0 left-0 md:left-[262px] right-0 cursor-pointer -z-10"
          />

          {/* Reader Panel aligned with sidebar */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative z-10 w-full h-full flex flex-col bg-white dark:bg-black text-black dark:text-white border border-border/40 rounded-t-3xl md:rounded-[18px] shadow-2xl overflow-hidden font-sans selection:bg-foreground selection:text-background"
          >
            {/* 1. Zenithal Progressive Blur & Theme Gradient Fade */}
            <ProgressiveBlur direction="top" className="h-32 z-20" />

            {/* 2. Floating Header Controls (Drag Handle + Dynamic Title on Scroll + Circular Buttons) */}
            <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none flex flex-col">
              {/* Drag Handle */}
              <div className="w-full pt-2.5 pb-1 flex items-center justify-center shrink-0">
                <div className="w-10 h-1 rounded-full bg-foreground/25 hover:bg-foreground/45 transition-colors cursor-grab pointer-events-auto" />
              </div>

              {/* Dynamic Header Row */}
              <div className="h-11 px-3.5 sm:px-6 flex items-center justify-between gap-2">
                {/* Title & Author Info: Appears only when scrolling down */}
                <div
                  className={cn(
                    'flex flex-col min-w-0 pr-2 transition-all duration-300 transform',
                    isScrolled
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 -translate-y-2 pointer-events-none',
                    isDocked
                      ? 'max-w-[120px] sm:max-w-xs md:max-w-md'
                      : 'max-w-xs sm:max-w-md md:max-w-xl'
                  )}
                >
                  <h3 className="text-sm font-semibold text-foreground truncate">
                    {article.title}
                  </h3>
                  {authorName && (
                    <span className="text-[11px] text-muted-foreground truncate">{authorName}</span>
                  )}
                </div>

                {/* Floating Action Buttons + Docked Toolbar */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pointer-events-auto ml-auto">
                  {isDocked && <DockedReaderToolbar articleTitle={article.title} />}

                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    suppressHydrationWarning
                    className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground bg-background/80 hover:bg-muted border border-border/20 shadow-xs backdrop-blur-sm transition-all cursor-pointer shrink-0"
                    title="Ouvrir dans une nouvelle page"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground bg-background/80 hover:bg-muted border border-border/20 shadow-xs backdrop-blur-sm transition-all outline-none cursor-pointer shrink-0"
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
                  canonicalDocument={canonicalDocument}
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
