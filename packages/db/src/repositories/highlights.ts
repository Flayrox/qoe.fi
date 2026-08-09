// =====================================================================
// 📦 Highlights & Annotations Repository — packages/db/src/repositories/highlights.ts
// =====================================================================

import { prisma } from "../client"

export interface CreateHighlightInput {
  articleId: string
  readerId: string
  text: string
  note?: string | null
  isPublic?: boolean
  isOfficial?: boolean
}

/**
 * 🖍️ Crée un surlignage ou une annotation (privée, publique ou officielle d'auteur).
 */
export async function createHighlight(input: CreateHighlightInput) {
  const { articleId, readerId, text, note = null, isPublic = false, isOfficial = false } = input

  // Check creator permission if requesting a public annotation
  if (isPublic) {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        allowPublicAnnotations: true,
        author: {
          select: { allowPublicAnnotations: true }
        }
      }
    })

    const isPublicAllowed = (article?.allowPublicAnnotations ?? true) && (article?.author?.allowPublicAnnotations ?? true)
    if (!isPublicAllowed) {
      throw new Error("Le créateur a désactivé les annotations publiques sur cet espace.")
    }
  }

  return prisma.highlight.create({
    data: {
      articleId,
      readerId,
      text,
      note,
      isPublic,
      isOfficial,
    },
    include: {
      reader: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          subdomain: true,
        }
      }
    }
  })
}

/**
 * 🔒 Bascule la confidentialité d'une annotation (Privé <-> Public).
 * Vérifie les autorisations de l'auteur de l'article avant d'autoriser le passage en public.
 */
export async function toggleHighlightPrivacy(highlightId: string, readerId: string, isPublic: boolean) {
  const existing = await prisma.highlight.findUnique({
    where: { id: highlightId },
    include: {
      article: {
        select: {
          allowPublicAnnotations: true,
          author: { select: { allowPublicAnnotations: true } }
        }
      }
    }
  })

  if (!existing) {
    throw new Error("Annotation introuvable.")
  }

  if (existing.readerId !== readerId) {
    throw new Error("Action non autorisée.")
  }

  if (isPublic) {
    const isPublicAllowed = (existing.article?.allowPublicAnnotations ?? true) && (existing.article?.author?.allowPublicAnnotations ?? true)
    if (!isPublicAllowed) {
      throw new Error("Le créateur de cet article a désactivé le passage en annotation publique.")
    }
  }

  return prisma.highlight.update({
    where: { id: highlightId },
    data: { isPublic }
  })
}

/**
 * 👍 Ingréments le compteur de votes d'une annotation publique.
 */
export async function upvoteHighlight(highlightId: string) {
  return prisma.highlight.update({
    where: { id: highlightId },
    data: {
      upvotesCount: {
        increment: 1
      }
    }
  })
}

/**
 * ❌ Supprime un surlignage / une annotation.
 */
export async function deleteHighlight(highlightId: string, userId: string) {
  const existing = await prisma.highlight.findUnique({
    where: { id: highlightId },
    include: {
      article: { select: { authorId: true } }
    }
  })

  if (!existing) {
    throw new Error("Annotation introuvable.")
  }

  // Author of article OR reader who created the highlight can delete
  const isAllowed = existing.readerId === userId || existing.article.authorId === userId
  if (!isAllowed) {
    throw new Error("Action non autorisée.")
  }

  return prisma.highlight.delete({
    where: { id: highlightId }
  })
}

/**
 * 📖 Récupère tous les surlignages et annotations d'un article :
 * - Annotations officielles d'auteur (`isOfficial: true`)
 * - Annotations publiques de la communauté (`isPublic: true`)
 * - Annotations privées du lecteur actif (`readerId === activeUserId`)
 */
export async function getArticleHighlights(articleId: string, activeUserId?: string | null) {
  return prisma.highlight.findMany({
    where: {
      articleId,
      OR: [
        { isOfficial: true },
        { isPublic: true },
        ...(activeUserId ? [{ readerId: activeUserId }] : [])
      ]
    },
    include: {
      reader: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          subdomain: true,
        }
      },
      comments: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              username: true,
              logoUrl: true,
            }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: { createdAt: "desc" }
  })
}

/**
 * 💬 Ajoute un commentaire sur une annotation publique.
 */
export async function createAnnotationComment(highlightId: string, authorId: string, content: string) {
  const highlight = await prisma.highlight.findUnique({
    where: { id: highlightId }
  })

  if (!highlight || (!highlight.isPublic && !highlight.isOfficial)) {
    throw new Error("Commentaire non autorisé sur une note privée.")
  }

  return prisma.annotationComment.create({
    data: {
      highlightId,
      authorId,
      content
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
        }
      }
    }
  })
}
