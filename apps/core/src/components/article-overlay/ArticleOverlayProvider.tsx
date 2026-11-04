'use client';

// =====================================================================
// 🪟 ArticleOverlayProvider — une seule surcouche pour toute l'app
// =====================================================================
// 📖 Pourquoi ici et pas dans une page : un article doit pouvoir s'ouvrir
//    PAR-DESSUS n'importe quelle page (feed, profil, recherche, historique,
//    bibliothèque) sans la démonter. Tant que le drawer appartenait au feed,
//    ouvrir un article depuis un profil était une navigation complète — donc
//    un feed rechargé au retour.
//
// 🎯 Le contrat tient en trois idées :
//    1. UN propriétaire. Ce provider rend le drawer une seule fois, dans le
//       layout `(reader)`. Les pages déclarent qu'elles ouvrent un article,
//       elles ne possèdent pas la surcouche.
//    2. L'URL reste la vérité. On pousse l'URL canonique de l'article dans
//       l'historique : partage, retour navigateur et rechargement continuent
//       de fonctionner. `popstate` referme la surcouche.
//    3. On ne restaure pas le scroll, on le préserve. La page dessous n'est
//       jamais démontée : `window.scrollY` ne bouge pas. On capture malgré
//       tout une ancre (l'élément marqué `data-overlay-anchor` en haut de
//       viewport) pour rattraper les cas où le verrou de scroll du drawer ou
//       une revalidation décalent le contenu.
// =====================================================================

import React from 'react';
import { getArticleThreadAction as getArticleThread } from '@qoe/sdk/actions/feed';
import type { CanonicalDocument, SpotlightRange } from '@qoe/ui/annotations';
import { ArticleReaderDrawer } from '@/components/social/ArticleReaderDrawer';
import { captureBase, restorePosition, type BasePosition } from '@/components/overlay/position';
import {
  HISTORY_KEY,
  buildArticleUrl,
  buildPlaceholder,
  isOverlayState,
  readCachedArticle,
  rememberArticle,
  type OpenArticleInput,
  type OverlayArticle,
  type OverlayHistoryState,
  type OverlaySource,
  type OverlayUserProfile,
} from './overlay-state';

export type {
  OpenArticleInput,
  OverlayArticle,
  OverlayQuoteContext,
  OverlaySource,
  OverlayUserProfile,
} from './overlay-state';

export interface OpenArticleOptions {
  source?: OverlaySource;
  spotlight?: SpotlightRange | null;
  canonicalDocument?: CanonicalDocument | null;
  /** Remplace l'entrée d'historique courante au lieu d'en empiler une. */
  replace?: boolean;
}

export interface ArticleOverlayApi {
  openArticle: (input: OpenArticleInput, options?: OpenArticleOptions) => void;
  closeArticle: () => void;
  isOpen: boolean;
  activeSlug: string | null;
}

const ArticleOverlayContext = React.createContext<ArticleOverlayApi | null>(null);

/**
 * API de la surcouche. `null` hors provider : une carte rendue isolément
 * (test, vitrine) doit pouvoir retomber sur une navigation classique au lieu
 * de planter.
 */
export function useArticleOverlay(): ArticleOverlayApi | null {
  return React.useContext(ArticleOverlayContext);
}

export function ArticleOverlayProvider({
  children,
  currentUserProfile,
}: {
  children: React.ReactNode;
  currentUserProfile: OverlayUserProfile;
}) {
  const [article, setArticle] = React.useState<OverlayArticle | null>(null);
  const [canonicalDocument, setCanonicalDocument] = React.useState<CanonicalDocument | null>(null);
  const [spotlight, setSpotlight] = React.useState<SpotlightRange | null>(null);
  const [source, setSource] = React.useState<OverlaySource | undefined>(undefined);
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeSlug, setActiveSlug] = React.useState<string | null>(null);

  const baseRef = React.useRef<BasePosition | null>(null);
  const slugRef = React.useRef<string | null>(null);
  const openRef = React.useRef(false);
  // Vrai seulement si l'entrée d'historique courante est la nôtre. Une
  // ouverture en `replace` (deep-link) n'a rien à dépiler : fermer doit
  // réécrire l'URL de base, pas remonter dans l'historique de l'app.
  const pushedRef = React.useRef(false);
  const requestRef = React.useRef(0);
  const focusRef = React.useRef<HTMLElement | null>(null);
  const prefetchingRef = React.useRef<Set<string>>(new Set());

  /**
   * Précharge un article sans l'ouvrir : le clic suivant n'attend plus le
   * réseau. Dédupliqué par slug, et silencieux en cas d'échec — un prefetch
   * qui rate ne doit jamais produire d'erreur visible.
   */
  const prefetchArticle = React.useCallback((slug: string) => {
    if (!slug || readCachedArticle(slug) || prefetchingRef.current.has(slug)) return;
    prefetchingRef.current.add(slug);
    void getArticleThread(slug)
      .then((res) => {
        if (res.ok && res.data?.article) {
          rememberArticle(slug, res.data.article as unknown as OverlayArticle);
        }
      })
      .catch(() => {
        /* silencieux : le prefetch est un bonus */
      })
      .finally(() => prefetchingRef.current.delete(slug));
  }, []);

  const teardown = React.useCallback(() => {
    if (!openRef.current) return;

    const base = baseRef.current;
    openRef.current = false;
    pushedRef.current = false;
    slugRef.current = null;
    setActiveSlug(null);
    setIsOpen(false);
    setSpotlight(null);
    setCanonicalDocument(null);
    // On garde l'article le temps que l'animation de sortie se joue — sauf
    // si une nouvelle ouverture a eu lieu entre-temps.
    window.setTimeout(() => {
      if (!openRef.current) setArticle(null);
    }, 320);

    if (base) restorePosition(base);

    const origin = focusRef.current;
    focusRef.current = null;
    if (origin && typeof origin.focus === 'function') {
      origin.focus({ preventScroll: true });
    }
  }, []);

  const openArticle = React.useCallback(
    (input: OpenArticleInput, options: OpenArticleOptions = {}) => {
      const slug = (input.slug ?? '').trim();
      if (!slug) return;

      // Déjà à l'écran : on ne refetch pas et on n'empile pas une deuxième
      // entrée d'historique (le clic peut venir d'un lien ET de son handler).
      if (openRef.current && slugRef.current === slug) return;

      const wasOpen = openRef.current;
      if (!wasOpen) {
        focusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        baseRef.current = captureBase();
      }

      const url = buildArticleUrl(input, slug);
      const state: OverlayHistoryState = { [HISTORY_KEY]: true, slug };
      if (options.replace || wasOpen) {
        window.history.replaceState(state, '', url);
      } else {
        window.history.pushState(state, '', url);
        pushedRef.current = true;
      }

      openRef.current = true;
      slugRef.current = slug;
      setActiveSlug(slug);

      const quote = input.quoteContext;
      setSpotlight(
        options.spotlight ?? (quote ? { start: quote.start, end: quote.end, sha: quote.sha } : null)
      );
      setSource(options.source ?? 'feed');
      setCanonicalDocument(options.canonicalDocument ?? null);
      setIsOpen(true);
      // Un article préchargé s'ouvre avec son contenu, pas avec une coquille.
      const cached = readCachedArticle(slug);
      setArticle((prev) =>
        prev && prev.slug === slug && prev.content ? prev : (cached ?? buildPlaceholder(input))
      );

      const token = ++requestRef.current;
      void getArticleThread(slug)
        .then((res) => {
          if (token !== requestRef.current) return;
          if (res.ok && res.data?.article) {
            const article = res.data.article as unknown as OverlayArticle;
            setArticle(article);
            rememberArticle(slug, article);
            return;
          }
          throw new Error('article-introuvable');
        })
        .catch(() => {
          if (token !== requestRef.current) return;
          // Panne ou article introuvable : on rend la main à la navigation
          // réelle plutôt que d'afficher un tiroir vide.
          window.location.assign(url);
        });
    },
    []
  );

  const closeArticle = React.useCallback(() => {
    if (pushedRef.current && isOverlayState(window.history.state)) {
      // Notre entrée est courante : on la dépile, `popstate` termine le
      // travail (et gère aussi le bouton retour du navigateur).
      window.history.back();
      return;
    }
    const base = baseRef.current;
    if (base) window.history.replaceState(null, '', base.path);
    teardown();
  }, [teardown]);

  // ─── Retour navigateur / rechargement d'état ───────────────────────
  React.useEffect(() => {
    const onPopState = () => {
      const state = window.history.state;
      if (isOverlayState(state)) {
        if (state.slug !== slugRef.current) {
          openArticle({ slug: state.slug }, { replace: true, source: 'direct' });
        }
        return;
      }
      teardown();
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [openArticle, teardown]);

  // ─── Délégation : les liens qui ne portent pas de handler React ────
  // Les cartes câblées appellent l'API directement ; ceci couvre les liens
  // rendus côté serveur (historique, articles similaires, bibliothèque) et
  // évite d'avoir à réécrire chaque liste.
  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as Element | null;
      const link = target?.closest?.('a[data-article-link]');
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.hasAttribute('download')) return;

      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin) return;

      const slug =
        link.dataset.articleSlug ||
        decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
      if (!slug) return;

      event.preventDefault();
      openArticle({
        slug,
        title: link.dataset.articleTitle || undefined,
      });
    };

    // Phase capture : `next/link` appelle `preventDefault` puis `router.push`
    // depuis son propre onClick (phase bulle). En capture, on voit le clic
    // avant lui ; il voit ensuite `defaultPrevented` et renonce à naviguer.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [openArticle]);

  // ─── Prefetch à l'intention ───────────────────────────────────────
  // Survol : on attend 120 ms (survoler en passant ne déclenche rien).
  // Focus clavier : immédiat, l'intention est explicite.
  React.useEffect(() => {
    let timer: number | undefined;

    const slugFrom = (target: EventTarget | null): string | null => {
      const link = (target as Element | null)?.closest?.('a[data-article-link]');
      if (!(link instanceof HTMLAnchorElement)) return null;
      return link.dataset.articleSlug || null;
    };

    const onPointerOver = (event: PointerEvent) => {
      const slug = slugFrom(event.target);
      if (!slug) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => prefetchArticle(slug), 120);
    };

    const onPointerOut = () => window.clearTimeout(timer);

    const onFocusIn = (event: FocusEvent) => {
      const slug = slugFrom(event.target);
      if (slug) prefetchArticle(slug);
    };

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [prefetchArticle]);

  // ─── Focus : on entre dans la surcouche, pas dans la page ─────────
  React.useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      const panel = document.querySelector<HTMLElement>('[data-testid="article-drawer"]');
      if (!panel) return;
      if (!panel.hasAttribute('tabindex')) panel.tabIndex = -1;
      panel.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const value = React.useMemo<ArticleOverlayApi>(
    () => ({ openArticle, closeArticle, isOpen, activeSlug }),
    [openArticle, closeArticle, isOpen, activeSlug]
  );

  return (
    <ArticleOverlayContext.Provider value={value}>
      {children}
      <ArticleReaderDrawer
        isOpen={isOpen}
        article={article}
        canonicalDocument={canonicalDocument}
        onClose={closeArticle}
        initialSource={source}
        spotlight={spotlight}
        currentUserProfile={currentUserProfile}
      />
    </ArticleOverlayContext.Provider>
  );
}
