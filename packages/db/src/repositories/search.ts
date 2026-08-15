// =====================================================================
// 🔍 Search & Trends Repository — Moteur de Recherche Full-Text & Hashtags
// =====================================================================

import { prisma } from '../client';
import { POST_VISIBILITY } from '@qoe/config';
import { logger } from '@qoe/observability';

/**
 * 🔎 Recherche des pensées (Thoughts) par contenu texte ou hashtag.
 */
export async function searchThoughts(query: string, limit = 20, cursor?: string) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return { thoughts: [], nextCursor: null };

  const isHashtag = cleanQuery.startsWith('#');
  const searchTerm = isHashtag ? cleanQuery : cleanQuery.replace(/^#/, '');

  const thoughts = await prisma.thought.findMany({
    where: {
      isDraft: false,
      deletedAt: null,
      visibility: { in: [POST_VISIBILITY.PUBLIC] },
      author: { isShadowbanned: false, isSuspended: false },
      OR: [
        { content: { contains: searchTerm, mode: 'insensitive' } },
        { tags: { has: searchTerm.toLowerCase() } },
        { tags: { has: `#${searchTerm.toLowerCase()}` } },
      ],
    },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          isCertified: true,
        },
      },
      attachments: { orderBy: { order: 'asc' } },
      _count: { select: { likes: true, replies: true, reposts: true } },
    },
  });

  let nextCursor: string | null = null;
  if (thoughts.length > limit) {
    const nextItem = thoughts.pop();
    nextCursor = nextItem?.id || null;
  }

  return { thoughts, nextCursor };
}

/**
 * 👥 Recherche de publications (créateurs PERSONAL + médias MEDIA) par nom/slug/domaine.
 */
export async function searchUsers(query: string, limit = 15) {
  const cleanQuery = query.trim().replace(/^@/, '');
  if (!cleanQuery) return [];

  return prisma.publication.findMany({
    where: {
      user: { is: { isShadowbanned: false, isSuspended: false } },
      OR: [
        { name: { contains: cleanQuery, mode: 'insensitive' } },
        { slug: { contains: cleanQuery, mode: 'insensitive' } },
        { subdomain: { contains: cleanQuery, mode: 'insensitive' } },
      ],
    },
    take: limit,
    select: {
      id: true,
      type: true,
      name: true,
      slug: true,
      subdomain: true,
      customDomain: true,
      logoUrl: true,
      heroText: true,
      isCertified: true,
      _count: {
        select: {
          followers: true,
        },
      },
    },
  });
}

/**
 * 📖 Recherche d'articles publiés (avec publication brand + auteur humain).
 * Si `publicationId` est fourni, restreint aux articles de cette publication
 * (scope "mes articles" du dashboard créateur).
 */
export async function searchArticles(query: string, limit = 10, publicationId?: string) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  return prisma.article.findMany({
    where: {
      published: true,
      ...(publicationId ? { publicationId } : {}),
      OR: [
        { title: { contains: cleanQuery, mode: 'insensitive' } },
        { content: { contains: cleanQuery, mode: 'insensitive' } },
        { semanticTags: { has: cleanQuery.toLowerCase() } },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      publication: {
        select: {
          id: true,
          type: true,
          name: true,
          slug: true,
          subdomain: true,
          customDomain: true,
          logoUrl: true,
          heroText: true,
          isCertified: true,
        },
      },
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          isCertified: true,
        },
      },
    },
  });
}

/**
 * 🔥 Enregistre ou incrémente le compteur de hashtags populaires.
 */
export async function recordHashtags(tags: string[]) {
  if (!tags || tags.length === 0) return;

  const cleanTags = Array.from(
    new Set(tags.map((t) => t.replace(/^#/, '').toLowerCase().trim()).filter(Boolean))
  );

  for (const tag of cleanTags) {
    try {
      await prisma.trend.upsert({
        where: { hashtag: tag },
        create: { hashtag: tag, count: 1 },
        update: { count: { increment: 1 } },
      });
    } catch (error) {
      logger.error('Erreur enregistrement trend hashtag', { tag, err: error });
    }
  }
}

/**
 * 📈 Récupère la liste des hashtags tendances (Trends).
 */
export async function getTrendingHashtags(limit = 10) {
  return prisma.trend.findMany({
    take: limit,
    orderBy: [{ count: 'desc' }, { updatedAt: 'desc' }],
  });
}
