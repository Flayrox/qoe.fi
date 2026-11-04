'use client';

// =====================================================================
// 🧵 ThoughtOverlayProvider — le fil s'ouvre par-dessus, pas à la place
// =====================================================================
// 📖 Même contrat que la surcouche d'article : un seul propriétaire (le
//    layout `(reader)`), l'URL comme vérité, et une page dessous qui n'est
//    jamais démontée. Ouvrir un fil depuis un profil, une recherche ou une
//    citation ne quitte donc plus la page — on revient exactement où
//    l'on était.
//
// 🎯 Deux surcouches coexistent et s'empilent dans l'ordre du produit :
//    le fil de pensée (z-40) et l'article (z-50). Un article cité dans un
//    fil s'ouvre donc AU-DESSUS du fil, et le refermer rend le fil intact.
//    L'empilement est déclaré, pas deviné : `overlayClassName="z-40"`
//    place le voile du fil sous celui de l'article, quel que soit l'ordre
//    de montage des portails.
// =====================================================================

import React from 'react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { t } from '@lingui/core/macro';
import { useAuthModal, ProgressiveBlur } from '@qoe/ui';
import { routes } from '@qoe/config/routes';
import { ThoughtThreadView } from '@/app/(reader)/home/components/ThoughtThreadView';
import type { DbUser } from '@/app/(reader)/home/components/ThoughtComposer';
import { useArticleOverlay } from '@/components/article-overlay/ArticleOverlayProvider';
import { captureBase, restorePosition, type BasePosition } from '@/components/overlay/position';
import {
  ThoughtOverlayContext,
  type ThoughtOverlayApi,
} from '@/components/thought-overlay/context';

const HISTORY_KEY = '__qoeThoughtOverlay';

interface ThoughtHistoryState {
  [HISTORY_KEY]: true;
  postId: string;
}

function isThoughtState(state: unknown): state is ThoughtHistoryState {
  return Boolean(
    state &&
    typeof state === 'object' &&
    (state as Record<string, unknown>)[HISTORY_KEY] === true &&
    typeof (state as Record<string, unknown>).postId === 'string'
  );
}

export { useThoughtOverlay } from './context';
export type { ThoughtOverlayApi } from './context';

export function ThoughtOverlayProvider({
  children,
  dbUser,
}: {
  children: React.ReactNode;
  dbUser: DbUser | null;
}) {
  const router = useRouter();
  const articleOverlay = useArticleOverlay();
  const { openAuthModal } = useAuthModal();

  const [activePostId, setActivePostId] = React.useState<string | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);

  const baseRef = React.useRef<BasePosition | null>(null);
  const postIdRef = React.useRef<string | null>(null);
  const openRef = React.useRef(false);
  const pushedRef = React.useRef(false);
  const focusRef = React.useRef<HTMLElement | null>(null);

  const teardown = React.useCallback(() => {
    if (!openRef.current) return;

    const base = baseRef.current;
    openRef.current = false;
    pushedRef.current = false;
    postIdRef.current = null;
    setIsOpen(false);
    window.setTimeout(() => {
      if (!openRef.current) setActivePostId(null);
    }, 320);

    if (base) restorePosition(base);

    const origin = focusRef.current;
    focusRef.current = null;
    if (origin && typeof origin.focus === 'function') {
      origin.focus({ preventScroll: true });
    }
  }, []);

  const openThought = React.useCallback((postId: string, authorHandle?: string) => {
    if (!postId) return;
    if (openRef.current && postIdRef.current === postId) return;

    const wasOpen = openRef.current;
    if (!wasOpen) {
      focusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      baseRef.current = captureBase();
    }

    const handle = authorHandle || 'auteur';
    const url = routes.feed.thought(handle, postId);
    const state: ThoughtHistoryState = { [HISTORY_KEY]: true, postId };

    if (wasOpen) {
      window.history.replaceState(state, '', url);
    } else {
      window.history.pushState(state, '', url);
      pushedRef.current = true;
    }

    openRef.current = true;
    postIdRef.current = postId;
    setActivePostId(postId);
    setIsOpen(true);
  }, []);

  const closeThought = React.useCallback(() => {
    if (pushedRef.current && isThoughtState(window.history.state)) {
      window.history.back();
      return;
    }
    const base = baseRef.current;
    if (base) window.history.replaceState(null, '', base.path);
    teardown();
  }, [teardown]);

  // Retour navigateur : on referme comme le bouton, sans rechargement.
  React.useEffect(() => {
    const onPopState = () => {
      const state = window.history.state;
      if (isThoughtState(state)) {
        if (state.postId !== postIdRef.current) {
          openThought(state.postId);
        }
        return;
      }
      teardown();
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [openThought, teardown]);

  const value = React.useMemo<ThoughtOverlayApi>(
    () => ({ openThought, closeThought, isOpen, activePostId }),
    [openThought, closeThought, isOpen, activePostId]
  );

  // Lock body scroll when drawer is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ESC key listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeThought();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeThought]);

  return (
    <ThoughtOverlayContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {isOpen && (
          <div
            data-testid="thought-drawer"
            className="fixed top-[6px] bottom-0 md:bottom-[6px] left-0 md:left-[262px] right-0 md:right-[6px] z-40 flex flex-col pointer-events-auto select-text"
          >
            {/* Backdrop Click Area (No darkening overlay, strictly bounded to right stage, sidebar remains 100% uncovered) */}
            <div
              onClick={closeThought}
              className="fixed top-0 bottom-0 left-0 md:left-[262px] right-0 cursor-pointer -z-10"
            />

            {/* Stage Panel aligned with sidebar */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="relative z-10 w-full h-full flex flex-col bg-background text-foreground border border-border/40 rounded-t-3xl md:rounded-[18px] shadow-2xl overflow-hidden font-sans"
            >
              {/* 1. Zenithal Progressive Blur */}
              <ProgressiveBlur direction="top" className="h-28 z-20 pointer-events-none" />

              {/* 2. Floating Header Controls (Drag Handle + Circular Close Button) */}
              <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none flex flex-col">
                {/* Drag Handle */}
                <div className="w-full pt-2.5 pb-1 flex items-center justify-center shrink-0">
                  <div className="w-10 h-1 rounded-full bg-foreground/25 hover:bg-foreground/45 transition-colors cursor-grab pointer-events-auto" />
                </div>

                {/* Header Row with Close Button */}
                <div className="h-11 px-3.5 sm:px-6 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={closeThought}
                    aria-label={t`Fermer le fil`}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground bg-background/80 hover:bg-muted border border-border/20 shadow-xs backdrop-blur-sm transition-all outline-none cursor-pointer shrink-0 pointer-events-auto"
                    title={t`Fermer le fil`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 3. Scroll Container */}
              <div
                className="relative flex-1 overflow-y-auto overflow-x-hidden pt-14 pb-16 px-4 sm:px-6 scroll-smooth bg-white dark:bg-black"
                data-testid="thought-overlay"
              >
                <div className="max-w-3xl mx-auto">
                  {activePostId && (
                    <ThoughtThreadView
                      postId={activePostId}
                      currentUserId={dbUser?.id ?? null}
                      dbUser={dbUser}
                      standalone
                      onClose={closeThought}
                      onOpenArticle={(article) => {
                        articleOverlay?.openArticle(
                          { id: article.id, slug: article.slug, title: article.title },
                          { source: 'feed' }
                        );
                      }}
                      onOpenProfile={(username) => router.push(routes.feed.profile(username))}
                      onLoginRequired={() => openAuthModal({ mode: 'login' })}
                    />
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ThoughtOverlayContext.Provider>
  );
}
