"use server"

import { prisma } from "@qoe/db/client"
import { createClient } from "@qoe/supabase/server"
import { revalidatePath } from "next/cache"

export async function toggleFollowCreator(creatorId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    const existing = await prisma.follows.findUnique({
      where: {
        readerId_creatorId: {
          readerId: user.id,
          creatorId
        }
      }
    })

    if (existing) {
      await prisma.follows.delete({
        where: { id: existing.id }
      })
      return { success: true, followed: false }
    } else {
      await prisma.follows.create({
        data: {
          readerId: user.id,
          creatorId
        }
      })
      return { success: true, followed: true }
    }
  } catch (error) {
    console.error("Error in toggleFollowCreator:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function toggleBookmarkArticle(articleId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    const existing = await prisma.bookmark.findUnique({
      where: {
        readerId_articleId: {
          readerId: user.id,
          articleId
        }
      }
    })

    if (existing) {
      await prisma.bookmark.delete({
        where: { id: existing.id }
      })
      return { success: true, bookmarked: false }
    } else {
      await prisma.bookmark.create({
        data: {
          readerId: user.id,
          articleId
        }
      })
      return { success: true, bookmarked: true }
    }
  } catch (error) {
    console.error("Error in toggleBookmarkArticle:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function createHighlight(articleId: string, text: string, note?: string, isPublic: boolean = false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    if (isPublic) {
      const article = await (prisma as any).article.findUnique({
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
        return { success: false, error: "PUBLIC_ANNOTATIONS_DISABLED" }
      }
    }

    const highlight = await (prisma as any).highlight.create({
      data: {
        readerId: user.id,
        articleId,
        text,
        note: note || null,
        isPublic
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
    return { success: true, highlight }
  } catch (error) {
    console.error("Error in createHighlight:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function toggleHighlightPrivacyAction(highlightId: string, isPublic: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    const existing = await (prisma as any).highlight.findUnique({
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

    if (!existing || existing.readerId !== user.id) {
      return { success: false, error: "FORBIDDEN" }
    }

    if (isPublic) {
      const isPublicAllowed = (existing.article?.allowPublicAnnotations ?? true) && (existing.article?.author?.allowPublicAnnotations ?? true)
      if (!isPublicAllowed) {
        return { success: false, error: "PUBLIC_ANNOTATIONS_DISABLED" }
      }
    }

    const updated = await (prisma as any).highlight.update({
      where: { id: highlightId },
      data: { isPublic }
    })

    return { success: true, highlight: updated }
  } catch (error) {
    console.error("Error in toggleHighlightPrivacyAction:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function upvoteHighlightAction(highlightId: string) {
  try {
    const updated = await (prisma as any).highlight.update({
      where: { id: highlightId },
      data: {
        upvotesCount: { increment: 1 }
      }
    })
    return { success: true, upvotesCount: updated.upvotesCount }
  } catch (error) {
    console.error("Error in upvoteHighlightAction:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function createAnnotationCommentAction(highlightId: string, content: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  if (!content || !content.trim()) {
    return { success: false, error: "EMPTY_CONTENT" }
  }

  try {
    const comment = await (prisma as any).annotationComment.create({
      data: {
        highlightId,
        authorId: user.id,
        content: content.trim()
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
    return { success: true, comment }
  } catch (error) {
    console.error("Error in createAnnotationCommentAction:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function quotePassageToFeedAction(articleId: string, text: string, commentary?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: {
        author: {
          select: { subdomain: true }
        }
      }
    })

    if (!article) {
      return { success: false, error: "ARTICLE_NOT_FOUND" }
    }

    const host = article.author.subdomain ? `${article.author.subdomain}.qoe.fi` : "qoe.fi"
    const articleUrl = `https://${host}/article/${article.slug}`
    const formattedContent = `« ${text.trim()} »\n\n${commentary ? commentary.trim() + "\n\n" : ""}📌 Extrait de "${article.title}" — ${articleUrl}`

    const thought = await (prisma as any).thought.create({
      data: {
        authorId: user.id,
        content: formattedContent
      }
    })

    return { success: true, thought }
  } catch (error) {
    console.error("Error in quotePassageToFeedAction:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function unlockArticleWithWallet(creatorId: string, costCents: number = 200) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const dbUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { walletBalanceCents: true, email: true }
      })

      if (!dbUser) {
        throw new Error("USER_NOT_FOUND")
      }

      if (dbUser.walletBalanceCents < costCents) {
        return { success: false, error: "INSUFFICIENT_FUNDS" }
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          walletBalanceCents: {
            decrement: costCents
          }
        }
      })

      await tx.walletTransaction.create({
        data: {
          userId: user.id,
          amountCents: -costCents,
          type: "PAYWALL_UNLOCK",
          description: `Déverrouillage d'article créateur (${creatorId})`
        } as any
      })

      await tx.user.update({
        where: { id: creatorId },
        data: {
          walletBalanceCents: {
            increment: costCents
          }
        }
      })

      return { success: true }
    })

    return result
  } catch (error) {
    console.error("Error in unlockArticleWithWallet:", error)
    return { success: false, error: "TRANSACTION_FAILED" }
  }
}

export async function getCurrentUserWallet() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      subdomain: true,
      customDomain: true,
      walletBalanceCents: true,
    }
  })
  return dbUser
}

export async function getCurrentUser() {
  return getCurrentUserWallet()
}

export async function postArticleCommentAction(articleId: string, content: string, parentId?: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  if (!content || !content.trim()) {
    return { success: false, error: "EMPTY_CONTENT" }
  }

  if (!(prisma as any).articleComment) {
    return { success: false, error: "MODEL_NOT_READY" }
  }

  try {
    const comment = await (prisma as any).articleComment.create({
      data: {
        articleId,
        authorId: user.id,
        content: content.trim(),
        parentId: parentId || null,
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

    return { success: true, comment }
  } catch (error) {
    console.error("Error in postArticleCommentAction:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function deleteArticleCommentAction(commentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  if (!(prisma as any).articleComment) {
    return { success: false, error: "MODEL_NOT_READY" }
  }

  try {
    const existing = await (prisma as any).articleComment.findUnique({
      where: { id: commentId }
    })

    if (!existing || existing.authorId !== user.id) {
      return { success: false, error: "FORBIDDEN" }
    }

    await (prisma as any).articleComment.delete({
      where: { id: commentId }
    })

    return { success: true }
  } catch (error) {
    console.error("Error in deleteArticleCommentAction:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function getArticleCommentsAction(articleId: string) {
  if (!(prisma as any).articleComment) {
    return { success: true, comments: [] }
  }

  try {
    const comments = await (prisma as any).articleComment.findMany({
      where: {
        articleId,
        parentId: null,
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

    return { success: true, comments }
  } catch (error) {
    console.error("Error in getArticleCommentsAction:", error)
    return { success: false, comments: [] }
  }
}
