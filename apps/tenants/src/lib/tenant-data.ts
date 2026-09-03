'use server';

// =====================================================================
// 🏗️ tenant-data — couche de données des pages tenant (Go-only, Phase 3)
// =====================================================================
// Remplace les reads Prisma des pages tenant par les endpoints Go :
//   - GET /v1/publications/by-domain/{domain}          (home + header + layout)
//   - GET /v1/publications/by-domain/{domain}/article/{slug} (article bundle)
//   - GET /v1/articles/{id}/highlights                 (publics + les siens)
//   - GET /v1/highlights/{id}/comments                 (commentaires d'annotation)
//   - GET /v1/home/onboarding                          (données du modal)
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import type { AnnotationItem, HighlightItem } from '@qoe/ui/annotations';
import type { CanonicalDocument } from '@qoe/ui/annotations/canonical-document';

export interface TenantNavItem {
  id: string;
  label: string;
  url: string;
  order: number;
  isExternal: boolean;
  publicationId: string;
  parentId: string | null;
}

export interface TenantSocialLink {
  id: string;
  platform: string;
  url: string;
  order: number;
  publicationId: string;
}

export interface TenantCategory {
  id: string;
  name: string;
  slug: string;
}

export interface TenantArticleSummary {
  id: string;
  title: string;
  slug: string;
  content: string;
  published: boolean;
  isPremium: boolean;
  visibility: string;
  readingTime: number;
  createdAt: string;
  categoryId?: string | null;
  category?: TenantCategory | null;
}

export interface TenantPublication {
  id: string;
  type: string;
  name: string;
  slug: string;
  bio: string | null;
  logoUrl: string | null;
  isCertified: boolean;
  subdomain: string | null;
  customDomain: string | null;
  umamiWebsiteId: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  heroText: string | null;
  headerImageUrl: string | null;
  footerText: string | null;
  themeMode: string | null;
  layoutStyle: string | null;
  allowIndexing: boolean;
  allowPublicAnnotations: boolean;
  allowComments: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  supportUrl: string | null;
  stripeAccountId: string | null;
  navigation: TenantNavItem[];
  socialLinks: TenantSocialLink[];
  categories: TenantCategory[];
  articles?: TenantArticleSummary[];
  user: { id: string; username: string | null } | null;
}

export interface TenantArticleAuthor {
  id: string;
  name?: string | null;
  username?: string | null;
  logoUrl?: string | null;
}

export interface TenantArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  published: boolean;
  status: string;
  isPremium: boolean;
  visibility: string;
  readingTime: number;
  allowPublicAnnotations: boolean;
  allowComments: boolean;
  createdAt: string;
  authorId: string;
  category?: TenantCategory | null;
  author?: TenantArticleAuthor | null;
}

export interface TenantArticleBundle {
  publication: TenantPublication;
  article: TenantArticle;
  entitlements: { isMember: boolean; isPaidSubscriber: boolean; tierId?: string };
  bookmarked: boolean;
  followed: boolean;
  isViaAttribution: boolean;
  attributionCategorySlug?: string | null;
}

interface GoHighlight {
  id: string;
  text: string;
  note: string | null;
  isPublic: boolean;
  isOfficial: boolean;
  upvotesCount: number;
  viewerUpvoted: boolean;
  commentsCount: number;
  createdAt: string;
  /** Ancres canoniques (offsets code points dans le document de l'article). */
  canonicalStart?: number;
  canonicalEnd?: number;
  contentSha?: string;
  reader: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
  };
}

interface GoAnnotationComment {
  id: string;
  content: string;
  createdAt: string;
  highlightId: string;
  author: {
    id: string;
    name?: string | null;
    username?: string | null;
    logoUrl?: string | null;
  };
}

/** Publication tenant (home + header + metadata). Retourne null sur 404. */
export async function fetchTenantPublication(domain: string): Promise<TenantPublication | null> {
  try {
    return await goFetch<TenantPublication>(
      `/v1/publications/by-domain/${encodeURIComponent(domain)}`
    );
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

/** Article bundle tenant (article + publication + entitlements + interactions). */
export async function fetchTenantArticle(
  domain: string,
  slug: string
): Promise<TenantArticleBundle | null> {
  try {
    return await goFetch<TenantArticleBundle>(
      `/v1/publications/by-domain/${encodeURIComponent(domain)}/article/${encodeURIComponent(slug)}`
    );
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

/**
 * Document canonique d'un article (blocs + texte plat + offsets).
 * GET /v1/articles/{id}/document — base des ancres des surlignages.
 * null si indisponible (contenu vide, erreur) → repli sur le moteur hérité.
 */
export async function fetchCanonicalDocument(articleId: string): Promise<CanonicalDocument | null> {
  try {
    const doc = await goFetch<CanonicalDocument>(
      `/v1/articles/${encodeURIComponent(articleId)}/document`
    );
    if (!doc || !Array.isArray(doc.blocks) || !doc.text) return null;
    return doc;
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    console.error('[tenant-data] fetchCanonicalDocument:', err);
    return null;
  }
}

/**
 * Surlignages d'un article : publics + les siens (privés) + commentaires.
 * GET /v1/articles/{id}/highlights puis GET /v1/highlights/{id}/comments.
 */
export async function fetchArticleHighlights(articleId: string): Promise<{
  publicHighlights: AnnotationItem[];
  myPrivateHighlights: HighlightItem[];
}> {
  try {
    const highlights = await goFetch<GoHighlight[]>(
      `/v1/articles/${encodeURIComponent(articleId)}/highlights`
    );
    const items: AnnotationItem[] = await Promise.all(
      highlights.map(async (h) => {
        let comments: GoAnnotationComment[] = [];
        if (h.commentsCount > 0) {
          try {
            comments = await goFetch<GoAnnotationComment[]>(
              `/v1/highlights/${encodeURIComponent(h.id)}/comments`
            );
          } catch {
            comments = [];
          }
        }
        return {
          id: h.id,
          text: h.text,
          note: h.note,
          isPublic: h.isPublic,
          isOfficial: h.isOfficial,
          upvotesCount: h.upvotesCount,
          hasUpvoted: h.viewerUpvoted,
          createdAt: h.createdAt,
          canonicalStart: h.canonicalStart,
          canonicalEnd: h.canonicalEnd,
          contentSha: h.contentSha,
          reader: {
            id: h.reader.id,
            name: h.reader.name,
            username: h.reader.username,
            logoUrl: h.reader.logoUrl,
          },
          comments: comments as unknown as AnnotationItem['comments'],
        };
      })
    );

    // Publics (officiels ou publics) pour l'annotation Genius ; les siens
    // (privés, non officiels) pour le carnet personnel.
    const publicHighlights = items.filter((h) => h.isOfficial || h.isPublic);
    const myPrivateHighlights = items
      .filter((h) => !h.isPublic && !h.isOfficial)
      .map((h) => ({
        id: h.id,
        text: h.text,
        note: h.note ?? null,
        isPublic: false,
        isOfficial: false,
        upvotesCount: h.upvotesCount,
        createdAt: h.createdAt,
        canonicalStart: h.canonicalStart,
        canonicalEnd: h.canonicalEnd,
        contentSha: h.contentSha,
      }));
    return { publicHighlights, myPrivateHighlights };
  } catch (err) {
    console.error('[tenant-data] fetchArticleHighlights:', err);
    return { publicHighlights: [], myPrivateHighlights: [] };
  }
}
