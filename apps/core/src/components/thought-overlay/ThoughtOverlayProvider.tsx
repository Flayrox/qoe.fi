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
import { t } from '@lingui/core/macro';
import { useAuthModal } from '@qoe/ui';
import { Button } from '@qoe/ui/button';
import { Drawer, DrawerContent } from '@qoe/ui/drawer';
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
    setActivePostId(null);

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

  return (
    <ThoughtOverlayContext.Provider value={value}>
      {children}

      {/* 🚪 Panneau modal du contrat : react-aria fournit le piège à focus,
          Échap, le clic extérieur et le retrait de l'arrière-plan de l'ordre
          de tabulation. Rien de tout ça n'est réécrit ici. */}
      <Drawer
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) closeThought();
        }}
        width="xl"
      >
        <DrawerContent aria-label={t`Fil de pensée`} overlayClassName="z-40" className="bg-card">
          <div className="relative flex h-full min-h-0 flex-col">
            <Button
              variant="ghost"
              shape="icon"
              size="xs"
              onClick={closeThought}
              className="absolute right-3 top-3 z-10 text-muted-foreground hover:text-foreground"
              aria-label={t`Fermer le fil`}
            >
              <X className="size-4" aria-hidden />
            </Button>

            <div
              className="flex-1 overflow-y-auto px-4 pb-8 pt-8 sm:px-6"
              data-testid="thought-overlay"
            >
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
        </DrawerContent>
      </Drawer>
    </ThoughtOverlayContext.Provider>
  );
}
