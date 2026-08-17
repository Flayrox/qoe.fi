'use server';

// =====================================================================
// 📰 actions/articles — Server Actions du studio créateur (web uniquement)
// =====================================================================
// CRUD articles + catégories + commentaires, avec workflow média
// (soumission/revue) et RBAC `@qoe/auth` (canMedia).
// - Workspace actif résolu via le cookie `qoe_active_workspace`
//   (getActivePublicationId) : personnel OU média.
// - Attribution/co-auteurs : consentement géré en base (jamais fabriqué
//   par le client), invitations + notifications de collaboration.
// - Publication : fan-out newsletter + webhooks via emitArticlePublished
//   (proxy Go → /internal/events/article-published, sinon eventBus BullMQ).
// 🔗 Proxy Go : CRUD articles/catégories/commentaires délégués quand
//    QOE_API_GO_URL est défini (apps/api-go/internal/modules/articles).
// ⚠️ Fichier serveur : non exposé au mobile (le mobile lira les articles
//    via l'API Go /v1/articles publiques).
// =====================================================================

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { prisma, type Article, type Category, type Prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';
import { normalizeArticleAttributions, type ArticleAttributionInput } from '@qoe/utils';
import { slugify, shortId } from '@qoe/utils';
import { publications, notifications, articleComments } from '@qoe/db';
import { canMedia, canEditMediaArticle, type MediaMemberContext } from '@qoe/auth';
import { eventBus } from '@qoe/workers/events';
import { safeAction } from '../utils/safe-action';
import { GO_API_URL, isGoEnabled, goFetch } from '../utils/go-client';
import type { SimilarArticle } from '../../types';

/** 📣 Publie l'événement de domaine article.published (newsletter + webhooks). */
async function emitArticlePublished(
  article: { id: string; publicationId: string; title: string; slug: string; visibility: string },
  authorId: string
) {
  const payload = {
    eventId: `article_published_${article.id}`,
    publicationId: article.publicationId,
    articleId: article.id,
    authorId,
    title: article.title,
    slug: article.slug,
    visibility: article.visibility as
      'PUBLIC' | 'MEMBERS_ONLY' | 'PAID_SUBSCRIBERS' | 'TIER_SPECIFIC',
    publishedAt: new Date().toISOString(),
  };

  // 🔗 Proxy Go : l'événement est enqueue dans asynq (webhooks + newsletter Go).
  if (isGoEnabled()) {
    try {
      await fetch(`${GO_API_URL}/internal/events/article-published`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-qoe-internal-secret': process.env.QOE_INTERNAL_SECRET ?? '',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
    } catch (err) {
      console.error('[emitArticlePublished:go]', err);
    }
    return;
  }

  try {
    await eventBus.publishArticlePublished(payload);
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
  if (isGoEnabled()) {
    return goFetch<Prisma.ArticleGetPayload<{ include: { category: true } }>[]>(
      `/v1/articles/?publicationId=${publicationId}`
    );
  }
  return prisma.article.findMany({
    where: { publicationId },
    include: { category: true },
    orderBy: { createdAt: 'desc' },
  });
});

const articleEditorInclude = {
  category: true,
  author: {
    select: { id: true, name: true, username: true, logoUrl: true, isCertified: true },
  },
  coAuthors: {
    select: { id: true, name: true, username: true, logoUrl: true, isCertified: true },
  },
  attributions: {
    orderBy: { order: 'asc' as const },
    include: {
      user: {
        select: { id: true, name: true, username: true, logoUrl: true, isCertified: true },
      },
    },
  },
} as const;

type ArticleEditorPayload = Prisma.ArticleGetPayload<{ include: typeof articleEditorInclude }>;

export const getArticleByIdAction = safeAction<string, ArticleEditorPayload | null>(async (id) => {
  const user = await authenticateUser();
  if (isGoEnabled()) {
    return goFetch<ArticleEditorPayload>(`/v1/articles/by-id/${id}`);
  }
  const article = await prisma.article.findUnique({
    where: { id },
    include: articleEditorInclude,
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

  const validateAttributions = async (entries: ReturnType<typeof normalizeArticleAttributions>) => {
    const users = await prisma.user.findMany({
      where: {
        id: { in: entries.map((entry) => entry.userId) },
        isSuspended: false,
        isShadowbanned: false,
      },
      select: { id: true, settings: { select: { allowCollaborationInvites: true } } },
    });
    if (users.length !== entries.length) {
      throw new Error('Un ou plusieurs contributeurs sont introuvables ou indisponibles.');
    }
    const blocked = users.filter((candidate) => {
      const entry = entries.find((item) => item.userId === candidate.id);
      return (
        entry?.consentStatus === 'PENDING' &&
        candidate.settings?.allowCollaborationInvites === false
      );
    });
    if (blocked.length > 0) {
      throw new Error('Un contributeur a désactivé les invitations de collaboration.');
    }
  };

  type ExistingAttribution = {
    userId: string;
    consentStatus: string;
    isVisible: boolean;
  };
  type ExistingRequest = { inviteeId: string; status: string };

  // Le client peut proposer une byline, mais il ne peut jamais fabriquer un consentement.
  // Seul un consentement déjà accepté en base (ou l'auteur principal) reste public.
  const prepareAttributions = (
    entries: ReturnType<typeof normalizeArticleAttributions>,
    primaryAuthorId: string,
    existingAttributions: ExistingAttribution[],
    existingRequests: ExistingRequest[]
  ) => {
    const existingByUserId = new Map(existingAttributions.map((entry) => [entry.userId, entry]));
    const acceptedIds = new Set(
      existingAttributions
        .filter((entry) => entry.consentStatus === 'ACCEPTED')
        .map((entry) => entry.userId)
    );
    for (const request of existingRequests) {
      if (request.status === 'ACCEPTED') acceptedIds.add(request.inviteeId);
    }

    return entries.map((entry) => {
      const isPrimary = entry.userId === primaryAuthorId;
      const accepted = isPrimary || acceptedIds.has(entry.userId);
      return {
        ...entry,
        consentStatus: accepted ? 'ACCEPTED' : 'PENDING',
        // La visibilité d'un contributeur accepté est son choix, pas celui de l'éditeur.
        isVisible: isPrimary
          ? true
          : accepted
            ? (existingByUserId.get(entry.userId)?.isVisible ?? true)
            : false,
      };
    });
  };

  const requestPendingContributors = async (
    articleId: string,
    inviterId: string,
    entries: ReturnType<typeof prepareAttributions>
  ) => {
    await Promise.allSettled(
      entries
        .filter((entry) => entry.consentStatus === 'PENDING' && entry.userId !== inviterId)
        .map(async (entry) => {
          await prisma.collaborationRequest.upsert({
            where: { articleId_inviteeId: { articleId, inviteeId: entry.userId } },
            update: {
              inviterId,
              status: 'PENDING',
              requestedRole: entry.role,
              requestedOrder: entry.order,
              showOnPublicProfile: false,
              acceptedAt: null,
            },
            create: {
              articleId,
              inviterId,
              inviteeId: entry.userId,
              status: 'PENDING',
              requestedRole: entry.role,
              requestedOrder: entry.order,
              showOnPublicProfile: false,
            },
          });
          await notifications.createNotification({
            recipientId: entry.userId,
            senderId: inviterId,
            type: 'ARTICLE_CONTRIBUTOR_INVITED',
            articleId,
          });
        })
    );
  };

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

  if (isGoEnabled()) {
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
    return goFetch<Article>(`/v1/articles/`, {
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
  }

  if (id) {
    const existing = await prisma.article.findUnique({
      where: { id },
      include: { attributions: true, collaborationRequests: true },
    });
    if (!existing) throw new Error('Article introuvable.');
    const activePublicationId = await getActivePublicationId(user.id);
    if (existing.authorId !== user.id && existing.publicationId !== activePublicationId) {
      throw new Error("Vous n'êtes pas autorisé à modifier cet article.");
    }

    const normalizedAttributions = normalizeArticleAttributions(attributions, existing.authorId);
    await validateAttributions(normalizedAttributions);
    const preparedAttributions = prepareAttributions(
      normalizedAttributions,
      existing.authorId,
      existing.attributions,
      existing.collaborationRequests
    ).map((entry) => ({
      ...entry,
      consentStatus: entry.userId === existing.authorId ? 'ACCEPTED' : entry.consentStatus,
    }));
    const legacyCoAuthorIds = preparedAttributions
      .filter((entry) => entry.userId !== existing.authorId && entry.consentStatus === 'ACCEPTED')
      .map((entry) => entry.userId);

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
        imageUrl,
        slug: finalSlug,
        published: effectivePublished,
        status: effectiveStatus,
        isPremium,
        readingTime,
        categoryId: categoryId || null,
        seoTitle,
        seoDescription,
        coAuthors: { set: legacyCoAuthorIds.map((id) => ({ id })) },
      },
    });

    await prisma.$transaction([
      prisma.articleAttribution.deleteMany({ where: { articleId: updated.id } }),
      prisma.articleAttribution.createMany({
        data: preparedAttributions.map((entry) => ({ articleId: updated.id, ...entry })),
      }),
    ]);

    await requestPendingContributors(updated.id, user.id, preparedAttributions);

    const nextContributorIds = new Set(
      preparedAttributions
        .filter((entry) => entry.consentStatus === 'ACCEPTED')
        .map((entry) => entry.userId)
    );
    const removedContributorIds = existing.attributions
      .filter(
        (entry) =>
          entry.userId !== existing.authorId &&
          entry.consentStatus === 'ACCEPTED' &&
          !nextContributorIds.has(entry.userId)
      )
      .map((entry) => entry.userId);
    await Promise.allSettled(
      removedContributorIds.map(async (contributorId) => {
        await prisma.collaborationRequest.updateMany({
          where: { articleId: updated.id, inviteeId: contributorId },
          data: { status: 'REVOKED', showOnPublicProfile: false },
        });
        await notifications.createNotification({
          recipientId: contributorId,
          senderId: user.id,
          type: 'ARTICLE_CONTRIBUTOR_REMOVED',
          articleId: updated.id,
        });
      })
    );

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

    const normalizedAttributions = normalizeArticleAttributions(attributions, user.id);
    await validateAttributions(normalizedAttributions);
    const preparedAttributions = prepareAttributions(normalizedAttributions, user.id, [], []).map(
      (entry) => ({
        ...entry,
        consentStatus: entry.userId === user.id ? 'ACCEPTED' : 'PENDING',
        isVisible: entry.userId === user.id,
      })
    );
    const legacyCoAuthorIds = preparedAttributions
      .filter((entry) => entry.userId !== user.id && entry.consentStatus === 'ACCEPTED')
      .map((entry) => entry.userId);

    const created = await prisma.article.create({
      data: {
        title,
        content,
        imageUrl,
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
        coAuthors: { connect: legacyCoAuthorIds.map((id) => ({ id })) },
      },
    });

    await prisma.articleAttribution.createMany({
      data: preparedAttributions.map((entry) => ({ articleId: created.id, ...entry })),
    });

    await requestPendingContributors(created.id, user.id, preparedAttributions);

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
  if (isGoEnabled()) {
    const activePublicationId = await getActivePublicationId(user.id);
    await goFetch(
      `/v1/articles/${id}?activePublicationId=${encodeURIComponent(activePublicationId)}`,
      { method: 'DELETE' }
    );
    revalidatePath('/articles');
    return { success: true };
  }
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
    if (isGoEnabled()) {
      const res = await goFetch<Article>(`/v1/articles/${data.id}/review`, {
        method: 'POST',
        body: { approve: data.approve },
      });
      revalidatePath('/articles');
      return res;
    }
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
  if (isGoEnabled()) {
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
  }
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
  if (isGoEnabled()) {
    const publicationId = await getActivePublicationId(user.id);
    return goFetch<EditorCapabilities>(`/v1/articles/capabilities?publicationId=${publicationId}`);
  }
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

  if (isGoEnabled()) {
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
  }

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
  if (isGoEnabled()) {
    await goFetch(`/v1/categories/${id}`, { method: 'DELETE' });
    revalidatePath('/articles');
    return { success: true };
  }
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
>(async (data, user) => {
  const { articleId, content, parentId } = data;
  // 🔗 Proxy Go : création + notification COMMENT déléguées au backend Go.
  if (isGoEnabled()) {
    return goFetch<ArticleCommentPayload>(`/v1/articles/${articleId}/comments`, {
      method: 'POST',
      body: { content, parentId: parentId || null },
    });
  }
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
    if (isGoEnabled()) {
      await goFetch<{ success: boolean }>(`/v1/articles/comments/${commentId}`, {
        method: 'DELETE',
      });
      return { success: true };
    }
    const comment = await prisma.articleComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new Error('COMMENT_NOT_FOUND');
    if (comment.authorId !== user.id) throw new Error('UNAUTHORIZED');

    await prisma.articleComment.delete({ where: { id: commentId } });
    return { success: true };
  }
);

export const getArticleCommentsAction = safeAction<string, ArticleCommentPayload[]>(
  async (articleId) => {
    if (isGoEnabled()) {
      return goFetch<ArticleCommentPayload[]>(`/v1/articles/${articleId}/comments`);
    }
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

/**
 * 🧠 Articles similaires — recommandations sémantiques (pgvector, API Go).
 * Retourne une liste vide tant que le worker d'embedding n'a pas indexé.
 * Fallback Prisma (sans Go) : articles publiés de la même catégorie, récents.
 */
export const getSimilarArticlesAction = safeAction<
  { articleId: string; limit?: number },
  SimilarArticle[]
>(
  async ({ articleId, limit = 6 }) => {
    if (isGoEnabled()) {
      const res = await goFetch<{ items: SimilarArticle[] }>(
        `/v1/articles/${encodeURIComponent(articleId)}/similar?limit=${limit}`
      );
      return (res as { items?: SimilarArticle[] })?.items ?? [];
    }

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { categoryId: true },
    });
    if (!article) return [];

    const fallback = await prisma.article.findMany({
      where: {
        published: true,
        id: { not: articleId },
        ...(article.categoryId ? { categoryId: article.categoryId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        publication: {
          select: { id: true, name: true, slug: true, subdomain: true, logoUrl: true },
        },
        author: { select: { id: true, name: true, username: true, logoUrl: true } },
      },
    });

    return fallback.map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      isPremium: a.isPremium,
      readingTime: a.readingTime,
      createdAt: a.createdAt.toISOString(),
      publicationId: a.publicationId,
      authorId: a.author.id,
      authorName: a.author.name,
      authorUsername: a.author.username,
      authorLogo: a.author.logoUrl,
      publicationName: a.publication.name,
      score: 0,
    }));
  },
  { requireAuth: false }
);
