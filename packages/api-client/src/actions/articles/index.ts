'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { prisma, type Article, type Category, type Prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';
import { slugify, shortId } from '@qoe/utils';
import { publications, notifications, articleComments } from '@qoe/db';
import { canMedia, canEditMediaArticle, type MediaMemberContext } from '@qoe/auth';
import { eventBus } from '@qoe/workers/events';
import { safeAction } from '../utils/safe-action';

/** 📣 Publie l'événement de domaine article.published (newsletter + webhooks). */
async function emitArticlePublished(
  article: { id: string; publicationId: string; title: string; slug: string; visibility: string },
  authorId: string
) {
  try {
    await eventBus.publishArticlePublished({
      eventId: `article_published_${article.id}`,
      publicationId: article.publicationId,
      articleId: article.id,
      authorId,
      title: article.title,
      slug: article.slug,
      visibility: article.visibility as
        'PUBLIC' | 'MEMBERS_ONLY' | 'PAID_SUBSCRIBERS' | 'TIER_SPECIFIC',
      publishedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[emitArticlePublished]', err);
  }
}

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
async function getActivePublicationId(userId: string): Promise<string> {
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

/**
 * 🏢 Résout le contexte média d'un utilisateur pour une publication donnée.
 * Retourne { member, isMedia } — isMedia=true si la publication est un Média.
 */
async function getMediaMemberContext(
  userId: string,
  publicationId: string
): Promise<{ member: MediaMemberContext | null; isMedia: boolean }> {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    select: { type: true, media: { select: { id: true } } },
  });
  if (!publication || publication.type !== 'MEDIA' || !publication.media) {
    return { member: null, isMedia: false };
  }

  const membership = await prisma.mediaMember.findUnique({
    where: { mediaId_userId: { mediaId: publication.media.id, userId } },
    select: { role: true, permissions: true, status: true },
  });

  return { member: membership, isMedia: true };
}

/**
 * 🔔 Notifie les approbateurs (owner/editor) d'un Média qu'un article attend une revue.
 */
async function notifyReviewers(publicationId: string, articleId: string, submitterId: string) {
  try {
    const publication = await prisma.publication.findUnique({
      where: { id: publicationId },
      select: {
        media: {
          include: { members: { select: { userId: true, role: true, permissions: true } } },
        },
      },
    });
    const members = publication?.media?.members ?? [];
    const reviewers = members.filter((m) =>
      canMedia({ role: m.role, permissions: m.permissions }, 'media:review')
    );
    await Promise.allSettled(
      reviewers.map((r) =>
        notifications.createNotification({
          recipientId: r.userId,
          senderId: submitterId,
          type: 'MEDIA_ARTICLE_SUBMITTED',
          articleId,
          publicationId,
        })
      )
    );
  } catch {
    // Best-effort
  }
}

export const getArticlesAction = safeAction<
  void,
  Prisma.ArticleGetPayload<{ include: { category: true } }>[]
>(async () => {
  const user = await authenticateUser();
  const publicationId = await getActivePublicationId(user.id);
  return prisma.article.findMany({
    where: { publicationId },
    include: { category: true },
    orderBy: { createdAt: 'desc' },
  });
});

export const getArticleByIdAction = safeAction<
  string,
  Prisma.ArticleGetPayload<{ include: { category: true } }> | null
>(async (id) => {
  const user = await authenticateUser();
  const article = await prisma.article.findUnique({
    where: { id },
    include: { category: true },
  });
  if (!article) return null;
  // Auteur direct, OU membre de la publication active (média) qui porte l'article
  if (article.authorId === user.id) return article;
  const publicationId = await getActivePublicationId(user.id);
  if (article.publicationId === publicationId) return article;
  throw new Error("Vous n'êtes pas autorisé à accéder à cet article.");
});

export const saveArticleAction = safeAction<
  {
    id?: string;
    title: string;
    content: string;
    slug?: string;
    published?: boolean;
    status?: string;
    isPremium?: boolean;
    categoryId?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
  },
  Article
>(async (data) => {
  const user = await authenticateUser();
  const {
    id,
    title,
    content,
    slug,
    published = false,
    status,
    isPremium = false,
    categoryId = null,
    seoTitle = null,
    seoDescription = null,
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

  if (id) {
    const existing = await prisma.article.findUnique({ where: { id } });
    if (!existing) throw new Error('Article introuvable.');
    const activePublicationId = await getActivePublicationId(user.id);
    if (existing.authorId !== user.id && existing.publicationId !== activePublicationId) {
      throw new Error("Vous n'êtes pas autorisé à modifier cet article.");
    }

    // RBAC média : édition d'un article du Média
    const { member: mediaMember, isMedia } = await getMediaMemberContext(
      user.id,
      existing.publicationId
    );
    if (isMedia) {
      if (!mediaMember || !canEditMediaArticle(mediaMember, existing, user.id)) {
        throw new Error("Vous n'avez pas la permission de modifier cet article.");
      }
    }

    // Calcul de l'état de publication (workflow média)
    let effectivePublished = published;
    let effectiveStatus = status || existing.status || 'DRAFT';
    if (isMedia) {
      const canPublish = canMedia(mediaMember, 'media:publish:any');
      if (status === 'SUBMITTED') {
        if (existing.published) {
          throw new Error('Impossible de soumettre un article déjà publié.');
        }
        effectivePublished = false;
        effectiveStatus = 'SUBMITTED';
      } else if (existing.published) {
        // Un rédacteur éditant un article déjà publié ne peut pas changer son état
        effectivePublished = true;
        effectiveStatus = existing.status || 'PUBLISHED';
      } else if (status === 'PUBLISHED' || published) {
        if (!canPublish) {
          throw new Error(
            "Vous n'avez pas la permission de publier. Utilisez « Soumettre pour revue »."
          );
        }
        effectivePublished = true;
        effectiveStatus = 'PUBLISHED';
      } else {
        effectivePublished = false;
        effectiveStatus = 'DRAFT';
      }
    }

    const updated = await prisma.article.update({
      where: { id },
      data: {
        title,
        content,
        slug: finalSlug,
        published: effectivePublished,
        status: effectiveStatus,
        isPremium,
        readingTime,
        categoryId: categoryId || null,
        seoTitle,
        seoDescription,
      },
    });

    // 🔔 Fan-out aux abonnés du Média à la publication (transition draft→publié)
    if (effectivePublished && !existing.published) {
      notifications
        .notifyMediaArticlePublished(updated.publicationId, updated.id, user.id)
        .catch(() => undefined);
      await emitArticlePublished(updated, user.id);
    }

    revalidatePath('/articles');
    revalidatePath(`/articles/${id}`);
    return updated;
  } else {
    const publicationId = await getActivePublicationId(user.id);

    // RBAC média : création d'article
    const { member: mediaMember, isMedia } = await getMediaMemberContext(user.id, publicationId);
    let effectivePublished = published;
    let effectiveStatus = status || 'DRAFT';
    if (isMedia) {
      if (!mediaMember || !canMedia(mediaMember, 'media:create_articles')) {
        throw new Error("Vous n'avez pas la permission de créer des articles dans ce Média.");
      }
      const canPublish = canMedia(mediaMember, 'media:publish:any');
      if (published && !canPublish) {
        throw new Error(
          "Vous n'avez pas la permission de publier. Utilisez « Soumettre pour revue »."
        );
      }
      if (status === 'SUBMITTED') {
        effectivePublished = false;
        effectiveStatus = 'SUBMITTED';
      }
      if (effectiveStatus === 'PUBLISHED') {
        if (!canPublish) throw new Error("Vous n'avez pas la permission de publier.");
        effectivePublished = true;
      }
    }

    const created = await prisma.article.create({
      data: {
        title,
        content,
        slug: finalSlug,
        published: effectivePublished,
        status: effectiveStatus,
        isPremium,
        readingTime,
        authorId: user.id,
        publicationId,
        categoryId: categoryId || null,
        seoTitle,
        seoDescription,
      },
    });

    if (effectiveStatus === 'SUBMITTED') {
      await notifyReviewers(publicationId, created.id, user.id);
    } else if (effectivePublished) {
      notifications
        .notifyMediaArticlePublished(created.publicationId, created.id, user.id)
        .catch(() => undefined);
      await emitArticlePublished(created, user.id);
    }

    revalidatePath('/articles');
    return created;
  }
});

export const deleteArticleAction = safeAction<string, { success: boolean }>(async (id) => {
  const user = await authenticateUser();
  const existing = await prisma.article.findUnique({ where: { id } });
  if (!existing) throw new Error('Article introuvable.');
  const activePublicationId = await getActivePublicationId(user.id);
  if (existing.authorId !== user.id && existing.publicationId !== activePublicationId) {
    throw new Error("Vous n'êtes pas autorisé à supprimer cet article.");
  }

  // RBAC média : suppression
  const { member: mediaMember, isMedia } = await getMediaMemberContext(
    user.id,
    existing.publicationId
  );
  if (isMedia) {
    const isOwn = existing.authorId === user.id;
    if (!mediaMember || !canMedia(mediaMember, 'media:delete:any')) {
      if (!isOwn || !canMedia(mediaMember, 'media:edit_own')) {
        throw new Error("Vous n'avez pas la permission de supprimer cet article.");
      }
    }
  }

  await prisma.article.delete({ where: { id } });
  revalidatePath('/articles');
  return { success: true };
});

/**
 * 📋 Approuver ou rejeter un article soumis pour revue (workflow média).
 * RBAC : media:review.
 */
export const reviewArticleAction = safeAction<{ id: string; approve: boolean }, Article>(
  async (data) => {
    const user = await authenticateUser();
    const { id, approve } = data;

    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) throw new Error('Article introuvable.');
    if (article.status !== 'SUBMITTED') {
      throw new Error("Cet article n'est pas en attente de revue.");
    }

    const { member: mediaMember, isMedia } = await getMediaMemberContext(
      user.id,
      article.publicationId
    );
    if (!isMedia || !mediaMember || !canMedia(mediaMember, 'media:review')) {
      throw new Error("Vous n'avez pas la permission de revoir cet article.");
    }

    const updated = await prisma.article.update({
      where: { id },
      data: approve
        ? { status: 'PUBLISHED', published: true }
        : { status: 'DRAFT', published: false },
    });

    if (approve) {
      notifications
        .notifyMediaArticlePublished(article.publicationId, article.id, user.id)
        .catch(() => undefined);
      await emitArticlePublished(updated, user.id);
    }

    revalidatePath('/articles');
    return updated;
  }
);

export const getCategoriesAction = safeAction<
  void,
  Prisma.CategoryGetPayload<{ include: { _count: { select: { articles: true } } } }>[]
>(async () => {
  const user = await authenticateUser();
  const publicationId = await getActivePublicationId(user.id);
  return prisma.category.findMany({
    where: { publicationId },
    include: { _count: { select: { articles: true } } },
    orderBy: { name: 'asc' },
  });
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
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    select: {
      type: true,
      name: true,
      media: {
        select: {
          id: true,
          members: {
            where: { userId: user.id },
            select: { role: true, permissions: true, status: true },
          },
        },
      },
    },
  });

  if (!publication || publication.type !== 'MEDIA' || !publication.media) {
    return {
      isMedia: false,
      canPublish: true,
      canSubmit: false,
      canReview: false,
      role: null,
      workspaceName: publication?.name ?? null,
    };
  }

  const membership = publication.media.members[0] ?? null;
  const canPublish = canMedia(membership, 'media:publish:any');
  const canReview = canMedia(membership, 'media:review');
  const canCreate = canMedia(membership, 'media:create_articles');

  return {
    isMedia: true,
    canPublish,
    canSubmit: canCreate && !canPublish,
    canReview,
    role: membership?.role ?? null,
    workspaceName: publication.name,
  };
});

export const saveCategoryAction = safeAction<
  { id?: string; name: string; slug?: string; description?: string | null },
  Category
>(async (data) => {
  const user = await authenticateUser();
  const { id, name, slug, description = null } = data;

  if (!name.trim()) throw new Error('Le nom de la catégorie est requis.');

  let finalSlug = slugify(slug || name);
  if (!finalSlug) finalSlug = `cat-${shortId()}`;

  const publicationId = await getActivePublicationId(user.id);
  const existingWithSlug = await prisma.category.findFirst({
    where: {
      publicationId,
      slug: finalSlug,
      NOT: id ? { id } : undefined,
    },
  });

  if (existingWithSlug) {
    throw new Error(`Le slug "${finalSlug}" est déjà utilisé par une autre de vos catégories.`);
  }

  if (id) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new Error('Catégorie introuvable.');
    if (existing.publicationId !== publicationId) {
      throw new Error("Vous n'êtes pas autorisé à modifier cette catégorie.");
    }

    const updated = await prisma.category.update({
      where: { id },
      data: { name, slug: finalSlug, description },
    });
    revalidatePath('/articles');
    return updated;
  } else {
    const created = await prisma.category.create({
      data: { name, slug: finalSlug, description, publicationId },
    });
    revalidatePath('/articles');
    return created;
  }
});

export const deleteCategoryAction = safeAction<string, { success: boolean }>(async (id) => {
  const user = await authenticateUser();
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new Error('Catégorie introuvable.');
  const publicationId = await getActivePublicationId(user.id);
  if (existing.publicationId !== publicationId) {
    throw new Error("Vous n'êtes pas autorisé à supprimer cette catégorie.");
  }

  await prisma.category.delete({ where: { id } });
  revalidatePath('/articles');
  return { success: true };
});

export const postArticleCommentAction = safeAction<
  { articleId: string; content: string; parentId?: string | null },
  Prisma.ArticleCommentGetPayload<{
    include: {
      author: {
        select: { id: true; name: true; username: true; logoUrl: true; isCertified: true };
      };
    };
  }>
>(async (data, user) => {
  const { articleId, content, parentId } = data;
  const comment = await articleComments.createArticleComment({
    articleId,
    authorId: user.id,
    content,
    parentId: parentId || null,
  });
  return comment;
});

export const deleteArticleCommentAction = safeAction<string, { success: boolean }>(
  async (commentId, user) => {
    const comment = await prisma.articleComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new Error('COMMENT_NOT_FOUND');
    if (comment.authorId !== user.id) throw new Error('UNAUTHORIZED');

    await prisma.articleComment.delete({ where: { id: commentId } });
    return { success: true };
  }
);

export const getArticleCommentsAction = safeAction<
  string,
  Prisma.ArticleCommentGetPayload<{
    include: {
      author: {
        select: { id: true; name: true; username: true; logoUrl: true; isCertified: true };
      };
    };
  }>[]
>(
  async (articleId) => {
    return prisma.articleComment.findMany({
      where: { articleId },
      include: {
        author: {
          select: { id: true, name: true, username: true, logoUrl: true, isCertified: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  },
  { requireAuth: false }
);
