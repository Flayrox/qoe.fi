'use server';

// =====================================================================
// 📰 actions/articles — Server Actions du studio créateur (web uniquement)
// =====================================================================
// CRUD articles + catégories + commentaires, avec workflow média
// (soumission/revue) et RBAC `@qoe/auth` (canMedia), délégué au Go.
// - Workspace actif résolu via le cookie `qoe_active_workspace`
//   (getActivePublicationId) : personnel OU média.
// - Attribution/co-auteurs : consentement géré en base (jamais fabriqué
//   par le client), invitations + notifications de collaboration.
// - Publication : fan-out newsletter + webhooks entièrement gérés par le Go.
// 🔗 Go-only : CRUD articles/catégories/commentaires délégués à
//    l'API Go (apps/api/internal/modules/articles).
// ⚠️ Fichier serveur : non exposé au mobile (le mobile lira les articles
//    via l'API Go /v1/articles publiques).
// =====================================================================

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { prisma, type Article, type Category, type Prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';
import { normalizeArticleAttributions, type ArticleAttributionInput } from '@qoe/utils';
import { slugify, shortId } from '@qoe/utils';
import { publications } from '@qoe/db';
import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';
import type { SimilarArticle } from '../../types';

async function authenticateUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}

/**
 * 🎛️ Résout la publication active (personnelle OU média) depuis le cookie du workspace.
 * Le dashboard opère sur le workspace sélectionné sans changer de compte.
 */
export async function getActivePublicationId(userId: string): Promise<string> {
  let saved: { type?: string; id?: string } | null = null;
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('qoe_active_workspace')?.value;
    if (raw) saved = JSON.parse(decodeURIComponent(raw));
  } catch {
    saved = null;
  }

  if (saved?.type === 'MEDIA' && saved.id) {
    const membership = await prisma.mediaMember.findUnique({
      where: { mediaId_userId: { mediaId: saved.id, userId } },
      include: { media: { include: { publication: { select: { id: true } } } } },
    });
    if (membership) return membership.media.publication.id;
  }

  const personal = await publications.getOrCreatePersonalPublication(userId);
  return personal.id;
}

export const getArticlesAction = safeAction<
  void,
  Prisma.ArticleGetPayload<{ include: { category: true } }>[]
>(async () => {
  const user = await authenticateUser();
  const publicationId = await getActivePublicationId(user.id);
  return goFetch<Prisma.ArticleGetPayload<{ include: { category: true } }>[]>(
    `/v1/articles?publicationId=${publicationId}`
  );
});

type ArticleEditorPayload = Prisma.ArticleGetPayload<{
  include: {
    category: true;
    author: {
      select: { id: true; name: true; username: true; logoUrl: true; isCertified: true };
    };
    coAuthors: {
      select: { id: true; name: true; username: true; logoUrl: true; isCertified: true };
    };
    attributions: {
      orderBy: { order: 'asc' };
      include: {
        user: {
          select: { id: true; name: true; username: true; logoUrl: true; isCertified: true };
        };
      };
    };
  };
}>;

export const getArticleByIdAction = safeAction<string, ArticleEditorPayload | null>(async (id) => {
  // ✅ Go-only : l'auth (auteur / membre de la publication) est vérifiée côté Go.
  return goFetch<ArticleEditorPayload>(`/v1/articles/by-id/${id}`);
});

export const saveArticleAction = safeAction<
  {
    id?: string;
    title: string;
    content: string;
    imageUrl?: string | null;
    slug?: string;
    published?: boolean;
    status?: string;
    isPremium?: boolean;
    categoryId?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    attributions?: ArticleAttributionInput[];
  },
  Article
>(async (data) => {
  const user = await authenticateUser();
  const {
    id,
    title,
    content,
    imageUrl = null,
    slug,
    published = false,
    status,
    isPremium = false,
    categoryId = null,
    seoTitle = null,
    seoDescription = null,
    attributions,
  } = data;

  if (!title.trim()) {
    throw new Error("Le titre de l'article est requis.");
  }

  let finalSlug = slugify(slug || title);
  if (!finalSlug) {
    finalSlug = `article-${shortId()}`;
  }

  const isSlugTaken = await prisma.article.findFirst({
    where: {
      slug: finalSlug,
      NOT: id ? { id } : undefined,
    },
  });

  if (isSlugTaken) {
    finalSlug = `${finalSlug}-${shortId(4)}`;
  }

  const wordCount = content
    .replace(/<[^>]*>/g, '')
    .split(/\s+/)
    .filter(Boolean).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  // ✅ Go-only : le Go gère RBAC média, attributions, workflow et slug unique.
  if (id) {
    const activePublicationId = await getActivePublicationId(user.id);
    return goFetch<Article>(`/v1/articles/${id}`, {
      method: 'PATCH',
      body: {
        title,
        content,
        imageUrl,
        slug: finalSlug,
        published,
        status,
        isPremium,
        categoryId,
        seoTitle,
        seoDescription,
        readingTime,
        attributions: normalizeArticleAttributions(attributions, user.id),
        activePublicationId,
      },
    });
  }
  const publicationId = await getActivePublicationId(user.id);
  return goFetch<Article>(`/v1/articles`, {
    method: 'POST',
    body: {
      publicationId,
      title,
      content,
      imageUrl,
      slug: finalSlug,
      published,
      status,
      isPremium,
      categoryId,
      seoTitle,
      seoDescription,
      readingTime,
      attributions: normalizeArticleAttributions(attributions, user.id),
    },
  });
});

export const searchArticleContributorsAction = safeAction<
  { query: string; excludeIds?: string[] },
  Array<{
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified: boolean;
  }>
>(async ({ query, excludeIds = [] }) => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];

  return prisma.user.findMany({
    where: {
      id: { notIn: excludeIds },
      isSuspended: false,
      isShadowbanned: false,
      OR: [
        { name: { contains: normalizedQuery, mode: 'insensitive' } },
        { username: { contains: normalizedQuery, mode: 'insensitive' } },
        { email: { contains: normalizedQuery, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, username: true, logoUrl: true, isCertified: true },
    orderBy: { name: 'asc' },
    take: 8,
  });
});

export const deleteArticleAction = safeAction<string, { success: boolean }>(async (id) => {
  const user = await authenticateUser();
  const activePublicationId = await getActivePublicationId(user.id);
  await goFetch(
    `/v1/articles/${id}?activePublicationId=${encodeURIComponent(activePublicationId)}`,
    { method: 'DELETE' }
  );
  revalidatePath('/articles');
  return { success: true };
});

/**
 * 📋 Approuver ou rejeter un article soumis pour revue (workflow média).
 * RBAC : media:review.
 */
export const reviewArticleAction = safeAction<{ id: string; approve: boolean }, Article>(
  async (data) => {
    const res = await goFetch<Article>(`/v1/articles/${data.id}/review`, {
      method: 'POST',
      body: { approve: data.approve },
    });
    revalidatePath('/articles');
    return res;
  }
);

export const getCategoriesAction = safeAction<
  void,
  Prisma.CategoryGetPayload<{ include: { _count: { select: { articles: true } } } }>[]
>(async () => {
  const user = await authenticateUser();
  const publicationId = await getActivePublicationId(user.id);
  const res = await goFetch<{
    data: Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      articlesCount: number;
    }>;
  }>(`/v1/categories?publicationId=${publicationId}`);
  return res.data.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    publicationId,
    parentId: null,
    _count: { articles: c.articlesCount },
  })) as Prisma.CategoryGetPayload<{ include: { _count: { select: { articles: true } } } }>[];
});

export interface EditorCapabilities {
  isMedia: boolean;
  canPublish: boolean;
  canSubmit: boolean;
  canReview: boolean;
  role: string | null;
  workspaceName: string | null;
}

/**
 * 🎛️ Capacités d'édition de l'utilisateur dans le workspace actif.
 * Utilisé par l'éditeur pour adapter les actions (Publier vs Soumettre).
 */
export const getEditorCapabilitiesAction = safeAction<void, EditorCapabilities>(async (_, user) => {
  const publicationId = await getActivePublicationId(user.id);
  return goFetch<EditorCapabilities>(`/v1/articles/capabilities?publicationId=${publicationId}`);
});

export const saveCategoryAction = safeAction<
  { id?: string; name: string; slug?: string; description?: string | null },
  Category
>(async (data) => {
  const user = await authenticateUser();
  const { id, name, slug, description = null } = data;

  if (!name.trim()) throw new Error('Le nom de la catégorie est requis.');

  if (id) {
    const res = await goFetch<Category>(`/v1/categories/${id}`, {
      method: 'PATCH',
      body: { name, slug, description },
    });
    revalidatePath('/articles');
    return res;
  }
  const publicationId = await getActivePublicationId(user.id);
  const res = await goFetch<Category>(`/v1/categories`, {
    method: 'POST',
    body: { publicationId, name, slug, description },
  });
  revalidatePath('/articles');
  return res;
});

export const deleteCategoryAction = safeAction<string, { success: boolean }>(async (id) => {
  await goFetch(`/v1/categories/${id}`, { method: 'DELETE' });
  revalidatePath('/articles');
  return { success: true };
});

type ArticleCommentPayload = Prisma.ArticleCommentGetPayload<{
  include: {
    author: {
      select: { id: true; name: true; username: true; logoUrl: true; isCertified: true };
    };
  };
}>;

export const postArticleCommentAction = safeAction<
  { articleId: string; content: string; parentId?: string | null },
  ArticleCommentPayload
>(async (data) => {
  const { articleId, content, parentId } = data;
  // 🔗 Proxy Go : création + notification COMMENT déléguées au backend Go.
  return goFetch<ArticleCommentPayload>(`/v1/articles/${articleId}/comments`, {
    method: 'POST',
    body: { content, parentId: parentId || null },
  });
});

export const deleteArticleCommentAction = safeAction<string, { success: boolean }>(
  async (commentId) => {
    await goFetch<{ success: boolean }>(`/v1/articles/comments/${commentId}`, {
      method: 'DELETE',
    });
    return { success: true };
  }
);

export const getArticleCommentsAction = safeAction<string, ArticleCommentPayload[]>(
  async (articleId) => {
    return goFetch<ArticleCommentPayload[]>(`/v1/articles/${articleId}/comments`);
  },
  { requireAuth: false }
);

/**
 * 🧠 Articles similaires — recommandations sémantiques (pgvector, API Go).
 * Retourne une liste vide tant que le worker d'embedding n'a pas indexé.
 */
export const getSimilarArticlesAction = safeAction<
  { articleId: string; limit?: number },
  SimilarArticle[]
>(
  async ({ articleId, limit = 6 }) => {
    const res = await goFetch<{ items: SimilarArticle[] }>(
      `/v1/articles/${encodeURIComponent(articleId)}/similar?limit=${limit}`
    );
    return (res as { items?: SimilarArticle[] })?.items ?? [];
  },
  { requireAuth: false }
);
