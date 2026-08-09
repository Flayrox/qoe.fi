"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MessageSquare, Send, Reply, Trash2, Loader2, User } from "lucide-react"
import { postArticleCommentAction, deleteArticleCommentAction } from "./actions"
import { cn } from "@qoe/utils"
import { useRequireAuth } from "@qoe/ui"

export interface CommentAuthor {
  id: string
  name: string | null
  username: string | null
  logoUrl: string | null
  subdomain: string | null
}

export interface CommentReplyItem {
  id: string
  content: string
  createdAt: Date | string
  author: CommentAuthor
}

export interface CommentItem {
  id: string
  content: string
  createdAt: Date | string
  author: CommentAuthor
  replies: CommentReplyItem[]
}

interface ArticleCommentsSectionProps {
  articleId: string
  initialComments: CommentItem[]
  isAuthenticated: boolean
  currentUserId?: string | null
  allowComments?: boolean
  mainAppUrl: string
  isBrutalist?: boolean
}

export function ArticleCommentsSection({
  articleId,
  initialComments,
  isAuthenticated,
  currentUserId,
  allowComments = true,
  mainAppUrl,
  isBrutalist = false
}: ArticleCommentsSectionProps) {
  const { openAuthModal } = useRequireAuth()
  const [comments, setComments] = useState<CommentItem[]>(initialComments)
  const [newCommentText, setNewCommentText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [submittingReply, setSubmittingReply] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleLoginRedirect = () => {
    openAuthModal({ mode: "signup", actionContext: "comment" })
  }

  // Handle top-level comment submission
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAuthenticated) {
      handleLoginRedirect()
      return
    }

    if (!newCommentText.trim()) return

    setSubmitting(true)
    try {
      const res = await postArticleCommentAction(articleId, newCommentText)
      if (res.success && res.comment) {
        const formattedComment: CommentItem = {
          id: res.comment.id,
          content: res.comment.content,
          createdAt: res.comment.createdAt,
          author: res.comment.author,
          replies: []
        }
        setComments(prev => [formattedComment, ...prev])
        setNewCommentText("")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle nested reply submission
  const handleSubmitReply = async (parentId: string) => {
    if (!isAuthenticated) {
      handleLoginRedirect()
      return
    }

    if (!replyText.trim()) return

    setSubmittingReply(true)
    try {
      const res = await postArticleCommentAction(articleId, replyText, parentId)
      if (res.success && res.comment) {
        const formattedReply: CommentReplyItem = {
          id: res.comment.id,
          content: res.comment.content,
          createdAt: res.comment.createdAt,
          author: res.comment.author
        }

        setComments(prev =>
          prev.map(c => {
            if (c.id === parentId) {
              return {
                ...c,
                replies: [...c.replies, formattedReply]
              }
            }
            return c
          })
        )
        setReplyText("")
        setReplyingToId(null)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSubmittingReply(false)
    }
  }

  // Handle comment deletion
  const handleDeleteComment = async (commentId: string, parentId?: string) => {
    if (!confirm("Voulez-vous vraiment supprimer ce commentaire ?")) return

    setDeletingId(commentId)
    try {
      const res = await deleteArticleCommentAction(commentId)
      if (res.success) {
        if (parentId) {
          setComments(prev =>
            prev.map(c => {
              if (c.id === parentId) {
                return {
                  ...c,
                  replies: c.replies.filter(r => r.id !== commentId)
                }
              }
              return c
            })
          )
        } else {
          setComments(prev => prev.filter(c => c.id !== commentId))
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingId(null)
    }
  }

  const totalCount = comments.reduce((acc, c) => acc + 1 + c.replies.length, 0)

  return (
    <section id="comments" className="mt-16 pt-12 border-t border-border/40 space-y-8 select-text">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[var(--tenant-accent)]/10 text-[var(--tenant-accent)]">
            <MessageSquare className="w-5 h-5 stroke-[1.5]" />
          </div>
          <h3 className={`text-2xl ${isBrutalist ? 'font-black uppercase' : 'font-bold text-foreground'}`}>
            Commentaires
          </h3>
          <span className="px-2.5 py-0.5 rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {totalCount}
          </span>
        </div>
      </div>

      {/* Write Comment Form or Disabled Notice */}
      {allowComments ? (
        <form onSubmit={handleSubmitComment} className="space-y-3">
          <div className={`p-4 rounded-2xl ${isBrutalist ? 'border-4 border-foreground bg-card' : 'bg-card border border-border/40 shadow-xs'}`}>
            <textarea
              rows={3}
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              onClick={() => {
                if (!isAuthenticated) handleLoginRedirect()
              }}
              placeholder={
                isAuthenticated
                  ? "Partagez votre réflexion sur cet écrit..."
                  : "Connectez-vous pour laisser un commentaire..."
              }
              className="w-full bg-transparent border-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-none leading-relaxed font-sans"
            />
            <div className="flex items-center justify-between pt-3 border-t border-border/30">
              <span className="text-xs text-muted-foreground">
                {!isAuthenticated && "Rejoignez la discussion"}
              </span>

              <button
                type="submit"
                disabled={submitting || (!isAuthenticated ? false : !newCommentText.trim())}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1.5 cursor-pointer",
                  isBrutalist ? "border-2 border-foreground uppercase bg-foreground" : "bg-[var(--tenant-accent)] hover:opacity-90 shadow-sm"
                )}
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Publier</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/30 text-center text-xs text-muted-foreground font-medium italic font-sans">
          Les commentaires ont été désactivés par l'auteur sur cet écrit.
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-6">
        {comments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm border border-dashed border-border/40 rounded-2xl">
            Aucun commentaire pour le moment. Soyez le premier à réagir !
          </div>
        ) : (
          comments.map((comment) => (
            <motion.div
              key={comment.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-5 rounded-2xl space-y-4 ${isBrutalist ? 'border-2 border-foreground bg-card' : 'bg-card/60 border border-border/30'}`}
            >
              {/* Comment Author Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-muted border border-border/40 flex items-center justify-center overflow-hidden shrink-0">
                    {comment.author.logoUrl ? (
                      <img src={comment.author.logoUrl} alt={comment.author.name || "Auteur"} className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-bold text-xs uppercase text-muted-foreground">
                        {(comment.author.name || comment.author.username || "A")[0]}
                      </span>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      {comment.author.name || comment.author.username || "Lecteur"}
                    </h4>
                    <span className="text-[11px] text-muted-foreground font-sans">
                      {new Date(comment.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric"
                      })}
                    </span>
                  </div>
                </div>

                {currentUserId === comment.author.id && (
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    disabled={deletingId === comment.id}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    title="Supprimer"
                  >
                    {deletingId === comment.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3 stroke-[1.5]" />
                    )}
                  </button>
                )}
              </div>

              {/* Comment Content */}
              <p className="text-sm text-foreground leading-relaxed pl-12 whitespace-pre-line font-sans">
                {comment.content}
              </p>

              {/* Reply Trigger */}
              <div className="pl-12 flex items-center gap-4 text-xs font-semibold text-muted-foreground">
                <button
                  onClick={() => {
                    if (!isAuthenticated) {
                      handleLoginRedirect()
                    } else {
                      setReplyingToId(replyingToId === comment.id ? null : comment.id)
                    }
                  }}
                  className="hover:text-[var(--tenant-accent)] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Reply className="w-3.5 h-3.5" />
                  <span>Répondre</span>
                </button>
              </div>

              {/* Inline Reply Input */}
              {replyingToId === comment.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="pl-12 pt-2 space-y-2"
                >
                  <textarea
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Répondre à ${comment.author.name || "ce lecteur"}...`}
                    className="w-full p-3 rounded-xl bg-muted/40 border border-border/40 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--tenant-accent)] resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setReplyingToId(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={submittingReply || !replyText.trim()}
                      onClick={() => handleSubmitReply(comment.id)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--tenant-accent)] text-white text-xs font-bold hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      {submittingReply ? <Loader2 className="w-3 h-3 animate-spin" /> : "Envoyer"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Nested Replies List */}
              {comment.replies.length > 0 && (
                <div className="pl-8 pt-3 space-y-3 border-l-2 border-border/30 ml-4">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="p-3 rounded-xl bg-muted/30 border border-border/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-bold uppercase text-muted-foreground">
                            {reply.author.logoUrl ? (
                              <img src={reply.author.logoUrl} alt={reply.author.name || "Auteur"} className="w-full h-full object-cover" />
                            ) : (
                              (reply.author.name || reply.author.username || "A")[0]
                            )}
                          </div>
                          <span className="text-xs font-semibold text-foreground">
                            {reply.author.name || reply.author.username || "Lecteur"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(reply.createdAt).toLocaleDateString("fr-FR", { month: "short", day: "numeric" })}
                          </span>
                        </div>

                        {currentUserId === reply.author.id && (
                          <button
                            onClick={() => handleDeleteComment(reply.id, comment.id)}
                            className="p-1 text-muted-foreground hover:text-destructive cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3 stroke-[1.5]" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-foreground leading-relaxed pl-8 whitespace-pre-line font-sans">
                        {reply.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </section>
  )
}
