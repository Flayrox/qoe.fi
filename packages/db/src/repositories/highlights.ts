// =====================================================================
// 📦 Highlights & Annotations Repository — packages/db/src/repositories/highlights.ts
// =====================================================================

import { prisma } from '../client';

export interface CreateHighlightInput {
  articleId: string;
  readerId: string;
  text: string;
  note?: string | null;
  isPublic?: boolean;
  isOfficial?: boolean;
}

/**
 * 🖍️ Crée un surlignage ou une annotation (privée, publique ou officielle d'auteur).
 */
export async function createHighlight(input: CreateHighlightInput) {
  const { articleId, readerId, text, note = null, isPublic = false, isOfficial = false } = input;

  // Fetch article author & permission toggles
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      authorId: true,
      allowPublicAnnotations: true,
      publication: {
        select: { allowPublicAnnotations: true },
      },
    },
  });

  if (!article) {
    throw new Error('Article introuvable.');
  }

  // SECURITY RULE 1: Only the primary author of the article can EVER set isOfficial: true
  const safeIsOfficial = isOfficial && article.authorId === readerId;

  // SECURITY RULE 2: Check creator permission if requesting a public annotation
  if (isPublic) {
    const isPublicAllowed =
      (article.allowPublicAnnotations ?? true) &&
      (article.publication?.allowPublicAnnotations ?? true);
    if (!isPublicAllowed) {
      throw new Error('Le créateur a désactivé les annotations publiques sur cet espace.');
    }
  }

  return prisma.highlight.create({
    data: {
      articleId,
      readerId,
      text,
      note,
      isPublic,
      isOfficial: safeIsOfficial,
    },
    include: {
      reader: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
        },
      },
    },
  });
}

/**
 * 🔒 Bascule la confidentialité d'une annotation (Privé <-> Public).
 * Vérifie les autorisations de l'auteur de l'article avant d'autoriser le passage en public.
 */
export async function toggleHighlightPrivacy(
  highlightId: string,
  readerId: string,
  isPublic: boolean
) {
  if (!readerId || typeof readerId !== 'string' || !readerId.trim()) {
    throw new Error('Action non autorisée : identifiant utilisateur invalide.');
  }

  const existing = await prisma.highlight.findUnique({
    where: { id: highlightId },
    include: {
      article: {
        select: {
          authorId: true,
          allowPublicAnnotations: true,
          publication: { select: { allowPublicAnnotations: true } },
        },
      },
    },
  });

  if (!existing) {
    throw new Error('Annotation introuvable.');
  }

  const cleanReaderId = readerId.trim();
  const isOwner = Boolean(existing.readerId && existing.readerId === cleanReaderId);
  const isArticleCreator = Boolean(
    existing.article?.authorId && existing.article.authorId === cleanReaderId
  );

  if (!isOwner && !isArticleCreator) {
    throw new Error('Action non autorisée.');
  }

  if (isPublic) {
    const isPublicAllowed =
      (existing.article?.allowPublicAnnotations ?? true) &&
      (existing.article?.publication?.allowPublicAnnotations ?? true);
    if (!isPublicAllowed) {
      throw new Error('Le créateur de cet article a désactivé le passage en annotation publique.');
    }
  }

  return prisma.highlight.update({
    where: { id: highlightId },
    data: { isPublic },
  });
}

/**
 * ✏️ Modifie le contenu textuel de la note d'une annotation.
 */
export async function updateHighlightNote(
  highlightId: string,
  readerId: string,
  note: string | null
) {
  if (!readerId || typeof readerId !== 'string' || !readerId.trim()) {
    throw new Error('Action non autorisée : identifiant utilisateur invalide.');
  }

  const existing = await prisma.highlight.findUnique({
    where: { id: highlightId },
  });

  const cleanReaderId = readerId.trim();
  const isOwner = Boolean(existing?.readerId && existing.readerId === cleanReaderId);

  if (!existing || !isOwner) {
    throw new Error('Action non autorisée.');
  }

  return prisma.highlight.update({
    where: { id: highlightId },
    data: {
      note,
    },
  });
}

/**
 * 👍 Bascule l'upvote (toggle) d'une annotation publique par un utilisateur.
 */
export async function upvoteHighlight(highlightId: string, userId: string) {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Action non autorisée.');
  }

  const cleanUserId = userId.trim();
  const existingUpvote = await prisma.annotationUpvote.findUnique({
    where: {
      highlightId_userId: {
        highlightId,
        userId: cleanUserId,
      },
    },
  });

  if (existingUpvote) {
    // Already upvoted -> Remove upvote
    await prisma.annotationUpvote.delete({
      where: { id: existingUpvote.id },
    });

    const updated = await prisma.highlight.update({
      where: { id: highlightId },
      data: {
        upvotesCount: {
          decrement: 1,
        },
      },
    });

    return { upvotesCount: Math.max(0, updated.upvotesCount), hasUpvoted: false };
  } else {
    // Add upvote
    await prisma.annotationUpvote.create({
      data: {
        highlightId,
        userId: cleanUserId,
      },
    });

    const updated = await prisma.highlight.update({
      where: { id: highlightId },
      data: {
        upvotesCount: {
          increment: 1,
        },
      },
    });

    return { upvotesCount: updated.upvotesCount, hasUpvoted: true };
  }
}

/**
 * ❌ Supprime un surlignage / une annotation.
 * Seul l'auteur de l'annotation, le créateur de l'article ou un superadmin peut la supprimer.
 */
export async function deleteHighlight(highlightId: string, userId: string) {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Action non autorisée : vous devez être connecté.');
  }

  const existing = await prisma.highlight.findUnique({
    where: { id: highlightId },
    include: {
      article: { select: { authorId: true } },
    },
  });

  if (!existing) {
    throw new Error('Annotation introuvable.');
  }

  const cleanUserId = userId.trim();

  // Fetch requesting user's role to check for superadmin platform moderation
  const user = await prisma.user.findUnique({
    where: { id: cleanUserId },
    select: { role: true },
  });

  const isHighlightAuthor = Boolean(existing.readerId && existing.readerId === cleanUserId);
  const isArticleCreator = Boolean(
    existing.article?.authorId && existing.article.authorId === cleanUserId
  );
  const isSuperadmin = user?.role === 'superadmin';

  if (!isHighlightAuthor && !isArticleCreator && !isSuperadmin) {
    throw new Error(
      "Action non autorisée : vous n'êtes ni l'auteur de cette annotation, ni le créateur de cet écrit."
    );
  }

  return prisma.highlight.delete({
    where: { id: highlightId },
  });
}

/**
 * 📖 Récupère tous les surlignages et annotations d'un article :
 * - Annotations officielles d'auteur (`isOfficial: true`)
 * - Annotations publiques de la communauté (`isPublic: true`)
 * - Annotations privées du lecteur actif (`readerId === activeUserId`)
 */
export async function getArticleHighlights(articleId: string, activeUserId?: string | null) {
  const highlights = await prisma.highlight.findMany({
    where: {
      articleId,
      OR: [
        { isOfficial: true },
        { isPublic: true },
        ...(activeUserId ? [{ readerId: activeUserId }] : []),
      ],
    },
    include: {
      reader: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
        },
      },
      comments: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              username: true,
              logoUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      upvotes: activeUserId
        ? {
            where: { userId: activeUserId },
            select: { id: true },
          }
        : false,
    },
    orderBy: { createdAt: 'desc' },
  });

  return highlights.map((hl) => {
    const upvotes = (hl as { upvotes?: Array<{ id: string }> }).upvotes;
    return {
      ...hl,
      hasUpvoted: Array.isArray(upvotes) && upvotes.length > 0,
    };
  });
}

/**
 * 💬 Ajoute un commentaire sur une annotation publique.
 */
export async function createAnnotationComment(
  highlightId: string,
  authorId: string,
  content: string
) {
  const highlight = await prisma.highlight.findUnique({
    where: { id: highlightId },
  });

  if (!highlight || (!highlight.isPublic && !highlight.isOfficial)) {
    throw new Error('Commentaire non autorisé sur une note privée.');
  }

  return prisma.annotationComment.create({
    data: {
      highlightId,
      authorId,
      content,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
        },
      },
    },
  });
}

/**
 * 🔄 Synchronise les annotations officielles d'auteur extraites du HTML dans la table Highlight.
 */
export async function syncOfficialAnnotationsFromHtml(
  articleId: string,
  authorId: string,
  htmlContent: string
) {
  if (!htmlContent || !htmlContent.includes('data-annotation-note')) return;

  // Regex matching <mark... data-annotation-note="NOTE"...>TEXT</mark> or attributes in any order
  const markRegex = /<mark[^>]*data-annotation-note=["']([^"']+)["'][^>]*>([\s\S]*?)<\/mark>/gi;
  let match: RegExpExecArray | null;

  const foundOfficialAnnotations: { text: string; note: string }[] = [];

  while ((match = markRegex.exec(htmlContent)) !== null) {
    const rawNote = match[1];
    const rawText = match[2].replace(/<[^>]*>?/gm, '').trim(); // strip inner tags if any

    if (rawNote && rawText) {
      foundOfficialAnnotations.push({
        note: rawNote.trim(),
        text: rawText,
      });
    }
  }

  // Create or update corresponding official highlights in DB
  for (const item of foundOfficialAnnotations) {
    const existing = await prisma.highlight.findFirst({
      where: {
        articleId,
        readerId: authorId,
        isOfficial: true,
        text: item.text,
      },
    });

    if (existing) {
      if (existing.note !== item.note) {
        await prisma.highlight.update({
          where: { id: existing.id },
          data: { note: item.note, isPublic: true },
        });
      }
    } else {
      await prisma.highlight.create({
        data: {
          articleId,
          readerId: authorId,
          text: item.text,
          note: item.note,
          isOfficial: true,
          isPublic: true,
        },
      });
    }
  }
}
