'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { prisma, type Article, type Category, type Prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';
import { slugify, shortId } from '@qoe/utils';
import { publications } from '@qoe/db';
import { safeAction } from '../utils/safe-action';

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

    const updated = await prisma.article.update({
      where: { id },
      data: {
        title,
        content,
        slug: finalSlug,
        published,
        isPremium,
        readingTime,
        categoryId: categoryId || null,
        seoTitle,
        seoDescription,
      },
    });

    revalidatePath('/articles');
    revalidatePath(`/articles/${id}`);
    return updated;
  } else {
    const publicationId = await getActivePublicationId(user.id);
    const created = await prisma.article.create({
      data: {
        title,
        content,
        slug: finalSlug,
        published,
        isPremium,
        readingTime,
        authorId: user.id,
        publicationId,
        categoryId: categoryId || null,
        seoTitle,
        seoDescription,
      },
    });

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

  await prisma.article.delete({ where: { id } });
  revalidatePath('/articles');
  return { success: true };
});

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
  const comment = await prisma.articleComment.create({
    data: {
      articleId,
      authorId: user.id,
      content,
      parentId: parentId || null,
    },
    include: {
      author: {
        select: { id: true, name: true, username: true, logoUrl: true, isCertified: true },
      },
    },
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
