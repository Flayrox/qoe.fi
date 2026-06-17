"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Send, Loader2, AlertCircle, Trash2, X } from "lucide-react"

import { getPostThread, toggleLikePost, replyToPost, deletePost, repostPost } from "../actions"
import { LikeIcon, CommentIcon, RepostIcon, ShareIcon } from "@/components/icons/CustomIcons"
import { cn } from "@qoe/utils"

import { TextParser } from "@/components/ui/TextParser"
import { LinkPreview } from "@/components/social/LinkPreview"
import { useTranslate } from "@tolgee/react"
import { trackEvent } from "@/lib/analytics"

const getUrls = (text: string): string[] => {
  const urlRegex = /https?:\/\/[^\s]+/gi
  return text.match(urlRegex) || []
}

interface ExpandedPostViewProps {
  postId: string
  currentUserId: string | null
  onClose?: () => void
  onOpenProfile?: (username: string) => void
  onInteractionUpdate?: (postId: string, update: { liked?: boolean; likesCount?: number; repliesCount?: number }) => void
  onLoginRequired?: () => void
}

const springs = {
  enter: { type: "spring" as const, stiffness: 450, damping: 30 },
  like: { type: "spring" as const, stiffness: 600, damping: 25 },
  lightbox: { type: "spring" as const, stiffness: 350, damping: 30 }
}

export function ExpandedPostView({ postId, currentUserId, onClose, onOpenProfile: onOpenProfileProp, onInteractionUpdate, onLoginRequired }: ExpandedPostViewProps) {
  const { t } = useTranslate()
  const [post, setPost] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState("")
  const [sendingReply, setSendingReply] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  
  // New social states
  const [reposted, setReposted] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [isWarningRevealed, setIsWarningRevealed] = useState(false)

  const handleOpenProfile = () => {
    const targetUsername = post?.author?.username || post?.author?.subdomain
    if (!targetUsername) return
    if (onOpenProfileProp) {
      onOpenProfileProp(targetUsername)
    } else {
      window.location.href = `/profile/${targetUsername}`
    }
  }

  useEffect(() => {
    async function loadThread() {
      setLoading(true)
      const res = await getPostThread(postId)
      if (res.success && res.data?.post) {
        const postData = res.data.post
        setPost(postData)
        const userHasLiked = postData.likes.some((l: any) => l.userId === currentUserId)
        setLiked(userHasLiked)
        setLikesCount(postData.likes.length)
        const userHasReposted = postData.reposts?.some((r: any) => r.authorId === currentUserId) || false
        setReposted(userHasReposted)
      }
      setLoading(false)
    }
    loadThread()
  }, [postId, currentUserId])

  const handleLikeToggle = async () => {
    if (!currentUserId) {
      if (onLoginRequired) onLoginRequired()
      return
    }
    
    const newLiked = !liked
    const newLikesCount = liked ? likesCount - 1 : likesCount + 1

    setLiked(newLiked)
    setLikesCount(newLikesCount)

    if (onInteractionUpdate) {
      onInteractionUpdate(postId, { liked: newLiked, likesCount: newLikesCount })
    }

    trackEvent("post_like", { postId, liked: newLiked })

    const res = await toggleLikePost(postId)
    if (!res.success) {
      // Rollback
      setLiked(liked)
      setLikesCount(likesCount)
      if (onInteractionUpdate) {
        onInteractionUpdate(postId, { liked, likesCount })
      }
    }
  }

  const handleRepost = async () => {
    if (!currentUserId) {
      if (onLoginRequired) onLoginRequired()
      return
    }
    if (reposted) return
    setReposted(true)
    trackEvent("post_repost", { postId })
    const res = await repostPost(postId)
    if (!res.success) setReposted(false)
  }

  const handleDelete = async () => {
    if (!confirm(t("feed.msg_confirm_delete_post", "Voulez-vous vraiment supprimer ce post ?"))) return
    setDeleting(true)
    trackEvent("post_delete", { postId })
    const res = await deletePost(postId)
    if (res.success) {
      // Close the view
      if (onClose) onClose()
    } else {
      setDeleting(false)
      alert(t("feed.msg_error_delete", "Erreur lors de la suppression."))
    }
  }

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/@${post.author.username || post.author.subdomain}/post/${post.id}`
    const shareData = {
      title: t("feed.share_title", { name: post.author.name }),
      text: post.content,
      url: shareUrl
    }

    trackEvent("post_share", { postId })

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        console.log("Share failed or cancelled:", err)
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl)
        alert(t("feed.msg_link_copied", "Lien copié dans le presse-papiers !"))
      } catch (err) {
        console.error("Copy error:", err)
      }
    }
  }

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyText.trim() || !currentUserId) return

    setSendingReply(true)
    trackEvent("post_reply", { postId })
    const res = await replyToPost({ postId, content: replyText })
    setSendingReply(false)

    if (res.success && res.data?.reply) {
      setReplyText("")
      setPost((prev: any) => ({
        ...prev,
        replies: [res.data!.reply, ...(prev?.replies || [])]
      }))
      if (onInteractionUpdate) {
        onInteractionUpdate(postId, { repliesCount: (post.replies?.length || 0) + 1 })
      }
    }
  }

  const handleNestedReplyAdded = (parentId: string, newReply: any) => {
    const appendReplyRecursively = (repliesList: any[]): any[] => {
      return repliesList.map(reply => {
        if (reply.id === parentId) {
          return {
            ...reply,
            replies: [newReply, ...(reply.replies || [])]
          }
        }
        if (reply.replies && reply.replies.length > 0) {
          return {
            ...reply,
            replies: appendReplyRecursively(reply.replies)
          }
        }
        return reply
      })
    }

    setPost((prev: any) => {
      if (!prev) return prev
      if (prev.id === parentId) {
        return {
          ...prev,
          replies: [newReply, ...(prev.replies || [])]
        }
      }
      return {
        ...prev,
        replies: appendReplyRecursively(prev.replies || [])
      }
    })
  }

  const handleNestedReplyDeleted = (deletedId: string) => {
    const deleteRecursively = (repliesList: any[]): any[] => {
      return repliesList.filter(r => r.id !== deletedId).map(reply => ({
        ...reply,
        replies: reply.replies ? deleteRecursively(reply.replies) : []
      }))
    }
    setPost((prev: any) => ({
      ...prev,
      replies: deleteRecursively(prev?.replies || [])
    }))
  }

  if (loading || deleting) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white border border-neutral-200/50 rounded-[var(--radius-card)] shadow-xs">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--qoe-vermillion)]" />
        <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
          {deleting ? t("feed.loading_post_deleting", "Suppression en cours...") : t("feed.loading_post", "Chargement du fil social...")}
        </span>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="bg-white border border-neutral-200/50 rounded-[var(--radius-card)] p-8 text-center text-neutral-500 shadow-xs">
        <AlertCircle className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
        <p className="text-xs">{t("feed.post_not_found", "Le contenu demandé est introuvable ou a été supprimé.")}</p>
      </div>
    )
  }

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.enter}
        className="bg-white border border-neutral-200/50 rounded-[var(--radius-card)] p-6 shadow-xs flex flex-col gap-6"
      >
        {/* Thread Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <motion.button
            onClick={() => onClose?.()}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition-colors cursor-pointer px-2 py-1.5 -ml-2 rounded-[var(--radius-button)] hover:bg-neutral-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {t("feed.back_to_feed", "Retour au flux")}
          </motion.button>
          
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{t("feed.social_thread", "Fil social")}</span>
            {currentUserId === post.authorId && (
              <motion.button
                onClick={handleDelete}
                whileTap={{ scale: 0.95 }}
                className="w-11 h-11 -my-3.5 -mr-3.5 flex items-center justify-center rounded-[var(--radius-button)] text-neutral-400 hover:text-red-500 hover:bg-neutral-50 transition-colors cursor-pointer"
                title={t("feed.delete_post", "Supprimer le post")}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </div>
        </div>

        {/* Main post layout */}
        <div className="space-y-4">
          <motion.button
            onClick={handleOpenProfile}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-3 text-left hover:opacity-90 transition-opacity cursor-pointer outline-none group/author"
          >
            <div className="w-10 h-10 rounded-[var(--radius-icon)] overflow-hidden border border-neutral-200/40 shrink-0 shadow-xs">
              {post.author.logoUrl ? (
                <img src={post.author.logoUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-sm text-[var(--qoe-vermillion)]">
                  {post.author.name?.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-neutral-800 group-hover/author:text-[var(--qoe-vermillion)] transition-colors">{post.author.name}</span>
                {post.author.isCertified && <span className="text-[var(--qoe-vermillion)] text-[9px] font-black">✓</span>}
              </div>
              <span className="text-xs text-neutral-400 block mt-0.5">@{post.author.username || post.author.subdomain}</span>
            </div>
          </motion.button>
 
          <div className="relative">
            <div className={cn(
              "transition-all duration-300",
              (post.triggerWarning && !isWarningRevealed) && "blur-[16px] pointer-events-none select-none"
            )}>
              <div className="text-base text-neutral-800 leading-relaxed font-sans font-light">
                <TextParser content={post.content} />
              </div>

              {getUrls(post.content).length > 0 && (
                <div className="mt-2">
                  <LinkPreview urls={getUrls(post.content)} />
                </div>
              )}
 
              {post.imageUrl && (
                <ImageGrid urls={getImages(post.imageUrl)} onImageClick={(url) => setLightboxImage(url)} />
              )}
            </div>
 
            {post.triggerWarning && !isWarningRevealed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 dark:bg-black/40 backdrop-blur-md transition-all duration-300 p-4">
                <span className="text-[11px] uppercase tracking-wider text-amber-600 mb-2 font-bold">{t("feed.warning_label", "Avertissement")}</span>
                <p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100 text-center max-w-[280px] mb-3.5 leading-snug">
                  {post.triggerWarning}
                </p>
                <button
                  onClick={() => setIsWarningRevealed(true)}
                  className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-850 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-black hover:opacity-90 text-[10px] font-bold rounded-[var(--radius-button)] transition-all cursor-pointer shadow-sm uppercase tracking-wider"
                >
                  {t("feed.warning_show", "Afficher")}
                </button>
              </div>
            )}
          </div>
 
          <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 font-semibold pt-2">
            <span>{new Date(post.createdAt).toLocaleDateString(undefined, { hour: "numeric", minute: "numeric" })}</span>
            <span>•</span>
            <span>{t("feed.qoe_sovereignty", "Souveraineté QOE")}</span>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between border-y border-neutral-100 py-3 px-1 text-neutral-400 text-xs font-semibold">
          <motion.button 
            onClick={handleLikeToggle}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "flex items-center gap-2 cursor-pointer transition-colors px-2 py-1.5 rounded-[var(--radius-button)] hover:bg-neutral-50",
              liked ? "text-[var(--qoe-vermillion)]" : "hover:text-[var(--qoe-vermillion)]"
            )}
          >
            <motion.div whileTap={{ scale: 1.4 }} transition={springs.like}>
              <LikeIcon className="w-4 h-4" style={{ fill: liked ? "var(--qoe-vermillion)" : "transparent" }} />
            </motion.div>
            <span>{likesCount} Likes</span>
          </motion.button>

          <div className="flex items-center gap-2">
            <CommentIcon className="w-4 h-4 text-neutral-400" />
            <span>{post.replies?.length || 0} Réponses</span>
          </div>

          <motion.button 
            onClick={handleRepost}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "flex items-center gap-2 cursor-pointer transition-colors px-2 py-1.5 rounded-[var(--radius-button)] hover:bg-neutral-50",
              reposted ? "text-emerald-500" : "hover:text-emerald-500"
            )}
          >
            <RepostIcon className="w-4 h-4" />
            <span>{reposted ? t("feed.reposted_btn", "Reposté") : t("feed.repost_btn", "Repost")}</span>
          </motion.button>

          <motion.button
            onClick={handleShare}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 hover:text-neutral-700 cursor-pointer px-2 py-1.5 rounded-[var(--radius-button)] hover:bg-neutral-50"
          >
            <ShareIcon className="w-4 h-4" />
            <span>{t("feed.share_btn", "Partager")}</span>
          </motion.button>
        </div>

        {/* Reply Composer */}
        <form 
          onSubmit={(e) => {
            if (!currentUserId) {
              e.preventDefault()
              if (onLoginRequired) onLoginRequired()
              return
            }
            handleReplySubmit(e)
          }} 
          className="flex gap-3 items-end"
        >
          <textarea
            value={replyText}
            onChange={(e) => {
              if (!currentUserId) {
                if (onLoginRequired) onLoginRequired()
                return
              }
              setReplyText(e.target.value)
            }}
            onFocus={(e) => {
              if (!currentUserId) {
                e.currentTarget.blur()
                if (onLoginRequired) onLoginRequired()
              }
            }}
            placeholder={t("feed.reply_publish", "Publiez votre réponse...")}
            rows={1}
            className="flex-1 text-[13px] border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-[var(--radius-element)] p-2.5 h-10 resize-none outline-none transition-all"
            required
          />
          <motion.button
            type="submit"
            whileTap={{ scale: 0.95 }}
            disabled={sendingReply || !!(currentUserId && !replyText.trim())}
            className="bg-neutral-900 text-white p-2.5 rounded-[var(--radius-button)] flex items-center justify-center cursor-pointer h-10 w-10 shrink-0 hover:bg-neutral-800 transition-colors disabled:opacity-40"
          >
            {sendingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </motion.button>
        </form>

        {/* Recursive Comments list */}
        <div className="space-y-4 pt-2">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2.5">{t("feed.replies_header", "Fils de discussion")}</h4>
          <div className="space-y-4">
            {post.replies && post.replies.length === 0 ? (
              <p className="text-[11px] text-neutral-400 font-medium italic py-2 pl-1">{t("feed.no_replies", "Aucune réponse pour le moment. Engagez la discussion !")}</p>
            ) : (
              post.replies?.map((reply: any) => (
                <CommentThread 
                  key={reply.id}
                  reply={reply}
                  depth={0}
                  currentUserId={currentUserId}
                  onReplyAdded={handleNestedReplyAdded}
                  onReplyDeleted={handleNestedReplyDeleted}
                  onLoginRequired={onLoginRequired}
                />
              ))
            )}
          </div>
        </div>

      </motion.div>

      {/* Immersive Image Lightbox Overlay */}
      <AnimatePresence>
        {lightboxImage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLightboxImage(null)}
              className="absolute inset-0 bg-neutral-900/80 backdrop-blur-xl cursor-zoom-out"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={springs.lightbox}
              className="relative z-10 max-w-5xl w-full max-h-[90vh] flex flex-col items-center justify-center"
            >
              <button 
                onClick={() => setLightboxImage(null)}
                className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-all cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
              <img 
                src={lightboxImage} 
                alt="Fullscreen post image" 
                className="w-auto h-auto max-w-full max-h-[85vh] object-contain rounded-[var(--radius-card)] shadow-2xl" 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}

function CommentThread({ 
  reply, 
  depth = 0, 
  currentUserId, 
  onReplyAdded,
  onReplyDeleted,
  onLoginRequired
}: { 
  reply: any; 
  depth?: number; 
  currentUserId: string | null; 
  onReplyAdded: (parentId: string, newReply: any) => void;
  onReplyDeleted: (deletedId: string) => void;
  onLoginRequired?: () => void;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [liked, setLiked] = useState(reply.likes?.some((l: any) => l.userId === currentUserId) || false)
  const [likesCount, setLikesCount] = useState(reply.likes?.length || 0)
  const { t } = useTranslate()

  const handleOpenProfile = () => {
    const targetUsername = reply.author.username || reply.author.subdomain
    if (!targetUsername) return
    window.location.href = `/profile/${targetUsername}`
  }

  const handleLike = async () => {
    if (!currentUserId) {
      if (onLoginRequired) onLoginRequired()
      return
    }
    setLiked((prev: boolean) => !prev)
    setLikesCount((prev: number) => liked ? prev - 1 : prev + 1)
    trackEvent("comment_like", { replyId: reply.id, liked: !liked })
    await toggleLikePost(reply.id)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId) {
      if (onLoginRequired) onLoginRequired()
      return
    }
    if (!replyText.trim()) return
    setSending(true)
    trackEvent("comment_reply", { parentReplyId: reply.id })
    const res = await replyToPost({ postId: reply.id, content: replyText })
    setSending(false)
    if (res.success && res.data?.reply) {
      setReplyText("")
      setShowReplyForm(false)
      onReplyAdded(reply.id, res.data.reply)
    }
  }

  const handleDelete = async () => {
    if (!confirm(t("feed.msg_confirm_delete_reply", "Voulez-vous supprimer cette réponse ?"))) return
    setDeleting(true)
    trackEvent("comment_delete", { replyId: reply.id })
    const res = await deletePost(reply.id)
    if (res.success) {
      onReplyDeleted(reply.id)
    } else {
      setDeleting(false)
      alert(t("feed.msg_error_delete", "Erreur lors de la suppression."))
    }
  }

  if (deleting) return null

  return (
    <div className="space-y-3 pl-3 border-l border-neutral-100 relative group/comment mt-4">
      <div className="flex items-center gap-2.5">
        <motion.button 
          onClick={handleOpenProfile} 
          whileTap={{ scale: 0.98 }}
          className="w-6 h-6 rounded-[var(--radius-icon)] overflow-hidden border border-neutral-200/30 shrink-0 shadow-xs cursor-pointer hover:opacity-85 transition-opacity outline-none"
        >
          {reply.author.logoUrl ? (
            <img src={reply.author.logoUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-[9px] text-[var(--qoe-vermillion)]">
              {reply.author.name?.charAt(0)}
            </div>
          )}
        </motion.button>
        <motion.button 
          onClick={handleOpenProfile} 
          whileTap={{ scale: 0.98 }}
          className="flex items-center text-left hover:text-[var(--qoe-vermillion)] transition-colors cursor-pointer outline-none"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-neutral-800 block leading-none">{reply.author.name}</span>
            {reply.author.isCertified && <span className="text-[var(--qoe-vermillion)] text-[8px] font-black">✓</span>}
          </div>
          <span className="text-[9px] text-neutral-400 ml-2">@{reply.author.username}</span>
        </motion.button>
        
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[9px] text-neutral-400">{new Date(reply.createdAt).toLocaleDateString()}</span>
          {currentUserId === reply.authorId && (
            <motion.button
              onClick={handleDelete}
              whileTap={{ scale: 0.95 }}
              className="w-11 h-11 -my-4 -mr-4 flex items-center justify-center rounded-[var(--radius-button)] text-neutral-400 hover:text-red-500 transition-colors opacity-0 group-hover/comment:opacity-100 cursor-pointer"
              title={t("feed.delete_post", "Supprimer le post")}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </div>
      </div>

      <p className="text-[13px] text-neutral-700 leading-relaxed font-sans pl-8">
        {reply.content}
      </p>

      {/* Sub-comment actions */}
      <div className="flex items-center gap-4 pl-8 text-[10px] text-neutral-400 font-semibold">
        <motion.button 
          onClick={handleLike}
          whileTap={{ scale: 0.98 }}
          className={cn("flex items-center gap-1.5 hover:text-[var(--qoe-vermillion)] transition-colors cursor-pointer px-2 py-1 rounded-[var(--radius-button)] hover:bg-neutral-50", liked && "text-[var(--qoe-vermillion)]")}
        >
          <LikeIcon className="w-3.5 h-3.5" style={{ fill: liked ? "var(--qoe-vermillion)" : "transparent" }} />
          <span>{likesCount}</span>
        </motion.button>

        <motion.button 
          onClick={() => {
            if (!currentUserId) {
              if (onLoginRequired) onLoginRequired()
              return
            }
            setShowReplyForm(prev => !prev)
          }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-1.5 hover:text-neutral-700 transition-colors cursor-pointer px-2 py-1 rounded-[var(--radius-button)] hover:bg-neutral-50"
        >
          <CommentIcon className="w-3.5 h-3.5" />
          <span>{t("feed.reply_btn", "Répondre")}</span>
        </motion.button>
      </div>

      <AnimatePresence>
        {showReplyForm && (
          <motion.form 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit}
            className="flex gap-2 pl-8 pt-1"
          >
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={t("feed.reply_placeholder", "Écrire une réponse...")}
              className="flex-1 text-[11px] border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-[var(--radius-element)] p-2 h-8 outline-none transition-all"
              required
            />
            <motion.button
              type="submit"
              whileTap={{ scale: 0.95 }}
              disabled={sending}
              className="bg-neutral-900 text-white p-2 rounded-[var(--radius-button)] h-8 w-8 flex items-center justify-center cursor-pointer disabled:opacity-40"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Children replies */}
      {reply.replies && reply.replies.length > 0 && depth < 3 && (
        <div className="space-y-2 mt-2">
          {reply.replies.map((childReply: any) => (
            <CommentThread 
              key={childReply.id} 
              reply={childReply} 
              depth={depth + 1} 
              currentUserId={currentUserId}
              onReplyAdded={onReplyAdded}
              onReplyDeleted={onReplyDeleted}
              onLoginRequired={onLoginRequired}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const getImages = (url: string | null | undefined): string[] => {
  if (!url) return []
  if (url.startsWith("[")) {
    try {
      return JSON.parse(url)
    } catch (e) {
      return [url]
    }
  }
  return [url]
}

function ImageGrid({ urls, onImageClick }: { urls: string[]; onImageClick?: (url: string) => void }) {
  if (urls.length === 0) return null

  return (
    <div className={cn(
      "grid gap-2 overflow-hidden rounded-[var(--radius-element)] mt-2",
      urls.length === 1 ? "grid-cols-1" : "grid-cols-2"
    )}>
      {urls.map((url) => (
        <div
          key={url}
          onClick={() => onImageClick?.(url)}
          className="relative overflow-hidden bg-[var(--surface-2)] aspect-video border border-[var(--border-default)] cursor-zoom-in"
        >
          <img
            src={url}
            alt=""
            className="w-full h-full object-cover hover:scale-[1.01] transition-transform duration-500"
          />
        </div>
      ))}
    </div>
  )
}
