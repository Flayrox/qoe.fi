// =====================================================================
// 📦 Article Comments Repository — packages/db/src/repositories/articleComments.ts
// =====================================================================

import { prisma } from "../client"

export interface CreateArticleCommentInput {
  articleId: string
  authorId: string
  content: string
  parentId?: string | null
}

/**
 * 💬 Crée un commentaire ou une réponse sous un article.
 */
export async function createArticleComment(input: CreateArticleCommentInput) {
  const { articleId, authorId, content, parentId = null } = input

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      allowComments: true,
      author: {
        select: { allowComments: true }
      }
    }
  })

  const isCommentsAllowed = (article?.allowComments ?? true) && (article?.author?.allowComments ?? true)
  if (!isCommentsAllowed) {
    throw new Error("Le créateur a désactivé les commentaires sur cet écrit.")
  }

  return prisma.articleComment.create({
    data: {
      articleId,
      authorId,
      content,
      parentId
    },
    include: {
      author: {
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
 * 💬 Récupère les commentaires d'un article avec réponses imbriquées.
 */
export async function getArticleComments(articleId: string) {
  return prisma.articleComment.findMany({
    where: {
      articleId,
      parentId: null, // Top-level comments
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          subdomain: true,
        }
      },
      replies: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              username: true,
              logoUrl: true,
              subdomain: true,
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  })
}

/**
 * ❌ Supprime un commentaire d'article.
 */
export async function deleteArticleComment(commentId: string, authorId: string) {
  const existing = await prisma.articleComment.findUnique({
    where: { id: commentId }
  })

  if (!existing) {
    throw new Error("Commentaire introuvable.")
  }

  if (existing.authorId !== authorId) {
    throw new Error("Action non autorisée.")
  }

  return prisma.articleComment.delete({
    where: { id: commentId }
  })
}
