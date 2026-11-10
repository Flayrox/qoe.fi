// =====================================================================
// 🧩 overlay-state — la logique pure de la surcouche d'article
// =====================================================================
// 📖 Tout ce qui décide QUEL article ouvrir, QUELLE URL pousser et ce
//    qu'on affiche en attendant le réseau. Rien ici ne touche au DOM : la
//    mécanique d'historique, de focus et de scroll reste dans le provider.
//
// 🎯 C'est ce qui rend la surcouche testable en environnement `node`,
//    comme le reste de `apps/core` (pas de jsdom dans ce package).
// =====================================================================

import { getArticleUrl } from '@qoe/config/routes';
import type { ArticleAnnotatorViewProps } from '@/components/social/ArticleAnnotatorView';

export type OverlayArticle = ArticleAnnotatorViewProps['article'];
export type OverlaySource = 'feed' | 'subdomain' | 'public_profile' | 'direct';
export type OverlayUserProfile = ArticleAnnotatorViewProps['currentUserProfile'];

/** Passage cité résolu par le serveur (citation → article). */
export interface OverlayQuoteContext {
  before: string;
  highlight: string;
  after: string;
  start: number;
  end: number;
  sha: string;
}

/**
 * Ce qu'une carte sait de l'article au moment du clic. Tout est optionnel
 * sauf le slug : la coquille s'affiche immédiatement avec ce qu'on a, et le
 * thread complet arrive derrière.
 */
export type OpenArticleInput = Omit<Partial<OverlayArticle>, 'content'> & {
  slug: string;
  /** Les cartes du feed portent `content: string | null` : on l'accepte tel quel. */
  content?: string | null;
  quoteContext?: OverlayQuoteContext | null;
};

// ─── Historique ──────────────────────────────────────────────────────
// Une clé préfixée : l'état d'historique est partagé avec Next (scroll
// restoration) et avec les posts du feed, on ne veut pas les confondre.
export const HISTORY_KEY = '__qoeArticleOverlay';

export interface OverlayHistoryState {
  [HISTORY_KEY]: true;
  slug: string;
}

export function isOverlayState(state: unknown): state is OverlayHistoryState {
  return Boolean(
    state &&
    typeof state === 'object' &&
    (state as Record<string, unknown>)[HISTORY_KEY] === true &&
    typeof (state as Record<string, unknown>).slug === 'string'
  );
}

// ─── Cache du thread ────────────────────────────────────────────────
// Le survol d'un lien précharge l'article : l'ouverture est alors
// instantanée au lieu de montrer une coquille. TTL court : un article peut
// être corrigé ou republié, on ne sert pas une version d'il y a une heure.
const THREAD_TTL_MS = 60_000;
const threadCache = new Map<string, { at: number; article: OverlayArticle }>();

export function rememberArticle(slug: string, article: OverlayArticle, now = Date.now()): void {
  threadCache.set(slug, { at: now, article });
}

export function readCachedArticle(slug: string, now = Date.now()): OverlayArticle | null {
  const hit = threadCache.get(slug);
  if (!hit) return null;
  if (now - hit.at > THREAD_TTL_MS) {
    threadCache.delete(slug);
    return null;
  }
  return hit.article;
}

/** L'URL canonique in-app : jamais le domaine tenant depuis le cœur. */
export function buildArticleUrl(input: OpenArticleInput, slug: string): string {
  try {
    return getArticleUrl({ ...input, slug }, { preferTenant: false });
  } catch {
    return `/${encodeURIComponent(slug)}`;
  }
}

/** Coquille affichée pendant le fetch : même forme que l'article attendu. */
export function buildPlaceholder(input: OpenArticleInput): OverlayArticle {
  const isFollowed = input.isFollowed ?? input.author?.isFollowed ?? false;
  const author = {
    ...(input.author ?? {}),
    id: input.author?.id ?? 'loading',
    name: input.author?.name ?? null,
    username: input.author?.username ?? null,
    logoUrl: input.author?.logoUrl ?? null,
    isFollowed,
  };

  return {
    id: input.id ?? input.slug,
    title: input.title ?? '',
    slug: input.slug,
    content: input.content ?? '',
    imageUrl: input.imageUrl ?? null,
    readingTime: input.readingTime ?? 3,
    createdAt: input.createdAt ?? new Date(),
    isPremium: input.isPremium ?? false,
    accessGranted: input.accessGranted,
    category: input.category ?? null,
    tags: input.tags,
    publisher: input.publisher ?? null,
    allowPublicAnnotations: input.allowPublicAnnotations,
    isLoading: true,
    isError: false,
    author: author as OverlayArticle['author'],
    isBookmarked: input.isBookmarked ?? false,
    isFollowed,
  };
}
