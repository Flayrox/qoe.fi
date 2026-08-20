// =====================================================================
// 📰 Articles Repository — Couche d'accès typée
// =====================================================================
// 📖 Depuis le polymorphisme Publication, un article est attribué à une
//    publication (personnelle OU média) ET à un auteur humain (User).
//    Le slug est unique par publication : @@unique([publicationId, slug]).
// =====================================================================

import { prisma } from '../client';
import type { Article } from '@prisma/client';
import { syncOfficialAnnotationsFromHtml } from './highlights';
import {
  reconcileMediaAttachments,
  markMediaAsSoftDeleted,
  extractImageUrlsFromHtml,
} from './media';

const publicationSelect = {
  id: true,
  type: true,
  name: true,
  slug: true,
  subdomain: true,
  customDomain: true,
  logoUrl: true,
  heroText: true,
  isCertified: true,
  accentColor: true,
  allowIndexing: true,
} as const;

const authorSelect = {
  id: true,
  name: true,
  username: true,
  logoUrl: true,
  isCertified: true,
} as const;

/**
 * 📋 Liste les articles publiés d'une publication (tenant / feed).
 */
export async function findPublishedByPublication(
  publicationId: string,
  options?: { take?: number; skip?: number }
) {
  return prisma.article.findMany({
    where: { publicationId, published: true },
    orderBy: { createdAt: 'desc' },
    take: options?.take ?? 20,
    skip: options?.skip ?? 0,
    include: {
      publication: { select: publicationSelect },
      author: { select: authorSelect },
      category: { select: { name: true, slug: true } },
      _count: { select: { bookmarks: true, highlights: true } },
    },
  });
}

/**
 * 📋 Liste les articles publiés d'un auteur (humain).
 */
export async function findPublishedByAuthor(
  authorId: string,
  options?: { take?: number; skip?: number }
) {
  return prisma.article.findMany({
    where: { authorId, published: true },
    orderBy: { createdAt: 'desc' },
    take: options?.take ?? 20,
    skip: options?.skip ?? 0,
    include: {
      publication: { select: publicationSelect },
      author: { select: authorSelect },
      category: { select: { name: true, slug: true } },
      _count: { select: { bookmarks: true, highlights: true } },
    },
  });
}

/**
 * 🔍 Trouve un article par publication + slug (lecture publique tenant).
 */
export async function findByPublicationSlug(
  publicationId: string,
  slug: string,
  options?: { includeDrafts?: boolean }
) {
  const article = await prisma.article.findUnique({
    where: { publicationId_slug: { publicationId, slug } },
    include: {
      publication: { select: publicationSelect },
      author: { select: authorSelect },
      category: true,
    },
  });

  if (!article) return null;
  if (!options?.includeDrafts && !article.published) return null;
  return article;
}

/**
 * 🔍 Trouve un article par slug (publié), peu importe la publication.
 */
export async function findFirstBySlug(slug: string) {
  return prisma.article.findFirst({
    where: { slug, published: true },
    include: {
      publication: { select: publicationSelect },
      author: { select: authorSelect },
      category: true,
    },
  });
}

/**
 * 📰 Articles trending (les plus lus/signets récemment).
 */
export async function findTrending(limit: number = 9) {
  return prisma.article.findMany({
    where: {
      published: true,
      publication: { is: { allowIndexing: true } },
      author: { is: { isShadowbanned: false } },
    },
    orderBy: [{ bookmarks: { _count: 'desc' } }, { createdAt: 'desc' }],
    take: limit,
    include: {
      publication: { select: publicationSelect },
      author: { select: authorSelect },
      category: { select: { name: true } },
    },
  });
}

/**
 * ✍️ Crée un article (utilisé par le dashboard créateur / studio média).
 * publicationId = publication active (personnelle OU média).
 */
export async function create(data: {
  title: string;
  slug: string;
  content: string;
  authorId: string;
  publicationId: string;
  categoryId?: string;
  isPremium?: boolean;
}) {
  const article = await prisma.article.create({
    data: {
      ...data,
      readingTime: estimateReadingTime(data.content),
    },
  });

  // 🔗 Réconcilier les images dans le contenu HTML de l'article (DRAFT_ORPHAN -> ATTACHED)
  const htmlImageUrls = extractImageUrlsFromHtml(data.content);
  if (htmlImageUrls.length > 0) {
    void reconcileMediaAttachments(htmlImageUrls, article.id, 'ARTICLE_BODY').catch(() => {});
  }

  if (data.content && data.content.includes('data-annotation-note')) {
    await syncOfficialAnnotationsFromHtml(article.id, data.authorId, data.content);
  }

  return article;
}

/**
 * 🗑️ Supprime un article et met ses médias rattachés en corbeille (période de grâce 14j).
 */
export async function deleteArticleById(id: string) {
  const article = await prisma.article.delete({
    where: { id },
  });

  // 🗑️ Met en corbeille les médias attachés avec période de grâce de 14 jours
  void markMediaAsSoftDeleted(id, 14).catch(() => {});

  return article;
}

/**
 * ⏱️ Estime le temps de lecture d'un contenu.
 * Règle : 200 mots/minute (standard international).
 */
function estimateReadingTime(content: string): number {
  const text = content.replace(/<[^>]*>/g, ''); // strip HTML
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

/**
 * 🆔 Trouve un article par son ID unique.
 */
export async function findById(id: string) {
  return prisma.article.findUnique({
    where: { id },
    include: {
      publication: { select: publicationSelect },
      author: { select: authorSelect },
    },
  });
}

export type { Article };
