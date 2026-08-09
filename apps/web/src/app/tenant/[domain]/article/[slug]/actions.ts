"use server"

import { follows, bookmarks, highlights, articleComments, articles, posts, wallet } from "@qoe/db"
import { createClient } from "@qoe/supabase/server"

/**
 * ⚡ Bascule l'état de suivi d'un créateur.
 */
export async function toggleFollowCreator(creatorId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    const res = await follows.toggleFollow(user.id, creatorId)
    return { success: true, followed: res.followed }
  } catch (error) {
    console.error("Error in toggleFollowCreator:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

/**
 * 🔖 Bascule l'état de mise en favori d'un article.
 */
export async function toggleBookmarkArticle(articleId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    const res = await bookmarks.toggleBookmark(user.id, articleId)
    return { success: true, bookmarked: res.bookmarked }
  } catch (error) {
    console.error("Error in toggleBookmarkArticle:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

/**
 * 🖍️ Crée un surlignage ou une annotation sur un article.
 */
export async function createHighlight(articleId: string, text: string, note?: string, isPublic: boolean = false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    const highlight = await highlights.createHighlight({
      articleId,
      readerId: user.id,
      text,
      note,
      isPublic,
    })
    return { success: true, highlight }
  } catch (error: any) {
    console.error("Error in createHighlight:", error)
    if (error?.message?.includes("désactivé")) {
      return { success: false, error: "PUBLIC_ANNOTATIONS_DISABLED" }
    }
    return { success: false, error: "DATABASE_ERROR" }
  }
}

/**
 * 🔒 Bascule la confidentialité d'une annotation (Privé <-> Public).
 */
export async function toggleHighlightPrivacyAction(highlightId: string, isPublic: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    const updated = await highlights.toggleHighlightPrivacy(highlightId, user.id, isPublic)
    return { success: true, highlight: updated }
  } catch (error: any) {
    console.error("Error in toggleHighlightPrivacyAction:", error)
    if (error?.message?.includes("introuvable") || error?.message?.includes("non autorisée")) {
      return { success: false, error: "FORBIDDEN" }
    }
    if (error?.message?.includes("désactivé")) {
      return { success: false, error: "PUBLIC_ANNOTATIONS_DISABLED" }
    }
    return { success: false, error: "DATABASE_ERROR" }
  }
}

/**
 * 👍 Upvote une annotation publique.
 */
export async function upvoteHighlightAction(highlightId: string) {
  try {
    const updated = await highlights.upvoteHighlight(highlightId)
    return { success: true, upvotesCount: updated.upvotesCount }
  } catch (error) {
    console.error("Error in upvoteHighlightAction:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

/**
 * 💬 Commente une annotation publique.
 */
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
    const comment = await highlights.createAnnotationComment(highlightId, user.id, content.trim())
    return { success: true, comment }
  } catch (error) {
    console.error("Error in createAnnotationCommentAction:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

/**
 * 📌 Cite un passage d'article vers le flux (Thought).
 */
export async function quotePassageToFeedAction(articleId: string, text: string, commentary?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    const article = await articles.findById(articleId)

    if (!article) {
      return { success: false, error: "ARTICLE_NOT_FOUND" }
    }

    const host = article.author.subdomain ? `${article.author.subdomain}.qoe.fi` : "qoe.fi"
    const articleUrl = `https://${host}/article/${article.slug}`
    const formattedContent = `« ${text.trim()} »\n\n${commentary ? commentary.trim() + "\n\n" : ""}📌 Extrait de "${article.title}" — ${articleUrl}`

    const thought = await posts.createThought({
      authorId: user.id,
      content: formattedContent,
    })

    return { success: true, thought }
  } catch (error) {
    console.error("Error in quotePassageToFeedAction:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

/**
 * 💳 Déverrouille un article avec le portefeuille virtuel.
 */
export async function unlockArticleWithWallet(creatorId: string, costCents: number = 200) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  return wallet.unlockArticleWithWallet(user.id, creatorId, costCents)
}

/**
 * 💳 Récupère les données de portefeuille de l'utilisateur actif.
 */
export async function getCurrentUserWallet() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  return wallet.getUserWallet(user.id)
}

export async function getCurrentUser() {
  return getCurrentUserWallet()
}

/**
 * 💬 Publie un commentaire sous un article.
 */
export async function postArticleCommentAction(articleId: string, content: string, parentId?: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  if (!content || !content.trim()) {
    return { success: false, error: "EMPTY_CONTENT" }
  }

  try {
    const comment = await articleComments.createArticleComment({
      articleId,
      authorId: user.id,
      content: content.trim(),
      parentId: parentId || null,
    })

    return { success: true, comment }
  } catch (error) {
    console.error("Error in postArticleCommentAction:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

/**
 * ❌ Supprime un commentaire d'article.
 */
export async function deleteArticleCommentAction(commentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    await articleComments.deleteArticleComment(commentId, user.id)
    return { success: true }
  } catch (error: any) {
    console.error("Error in deleteArticleCommentAction:", error)
    if (error?.message?.includes("introuvable") || error?.message?.includes("non autorisée")) {
      return { success: false, error: "FORBIDDEN" }
    }
    return { success: false, error: "DATABASE_ERROR" }
  }
}

/**
 * 📖 Récupère les commentaires d'un article.
 */
export async function getArticleCommentsAction(articleId: string) {
  try {
    const comments = await articleComments.getArticleComments(articleId)
    return { success: true, comments }
  } catch (error) {
    console.error("Error in getArticleCommentsAction:", error)
    return { success: false, comments: [] }
  }
}
