"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Send, Loader2, AlertCircle, Trash2, X, Repeat, CornerDownRight, MoreHorizontal, Pin, Quote } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"

import { getPostThread, toggleLikePost, replyToPost, deletePost, repostPost } from "../actions"
import { LikeIcon, CommentIcon, RepostIcon, ShareIcon } from "@/components/icons/CustomIcons"
import { cn } from "@qoe/utils"
import { toast } from "sonner"

import { TextParser } from "@/components/ui/TextParser"
import { CertifiedBadge } from "@/components/ui/CertifiedBadge"
import { LinkPreview } from "@/components/social/LinkPreview"
import { QuotedThoughtCard } from "@/components/social/QuotedThoughtCard"
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card"
import { useTranslate } from "@qoe/i18n"
import { trackEvent } from "@/lib/analytics"
import { routes } from "@qoe/config/routes"

const getUrls = (text: string): string[] => {
  const urlRegex = /https?:\/\/[^\s]+/gi
  return text.match(urlRegex) || []
}

interface ThoughtThreadViewProps {
  postId: string
  currentUserId: string | null
  initialPost?: any
  standalone?: boolean
  onClose?: () => void
  onOpenProfile?: (username: string) => void
  onInteractionUpdate?: (postId: string, update: { liked?: boolean; likesCount?: number; repliesCount?: number }) => void
  onLoginRequired?: () => void
}

const springs = {
  enter: { type: "spring" as const, stiffness: 450, damping: 30 },
  like: { type: "spring" as const, stiffness: 500, damping: 15 },
  lightbox: { type: "spring" as const, stiffness: 350, damping: 25 }
}

export function ThoughtThreadView({
  postId,
  currentUserId,
  initialPost,
  standalone = false,
  onClose,
  onOpenProfile,
  onInteractionUpdate,
  onLoginRequired,
}: ThoughtThreadViewProps) {
  const { t } = useTranslate()
  const [post, setPost] = useState<any | null>(initialPost || null)
  const [loading, setLoading] = useState(!initialPost)
  const [replyText, setReplyText] = useState("")
  const [sendingReply, setSendingReply] = useState(false)
  const [liked, setLiked] = useState(initialPost?.likes?.some((l: any) => l.userId === currentUserId) || false)
  const [likesCount, setLikesCount] = useState(initialPost?.likes?.length || 0)
  
  const [reposted, setReposted] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [isWarningRevealed, setIsWarningRevealed] = useState(false)

  const handleOpenProfile = (author: any) => {
    const targetUsername = author?.username || author?.subdomain
    if (!targetUsername) return
    if (onOpenProfile) {
      onOpenProfile(targetUsername)
    } else {
      window.location.href = routes.feed.profile(targetUsername)
    }
  }

  const navigateToThought = (targetPostId: string, authorUsername?: string) => {
    const handle = authorUsername || post?.author?.username || post?.author?.subdomain || post?.author?.id || "author"
    const newUrl = routes.feed.thought(handle, targetPostId)
    window.history.pushState({ postId: targetPostId }, "", newUrl)
    
    setLoading(true)
    getPostThread(targetPostId).then(res => {
      if (res.ok && res.data?.post) {
        setPost(res.data.post)
        setLiked(res.data.post.likes?.some((l: any) => l.userId === currentUserId) || false)
        setLikesCount(res.data.post.likes?.length || 0)
      }
      setLoading(false)
    })
  }

  useEffect(() => {
    if (initialPost && initialPost.id === postId) {
      setPost(initialPost)
      setLoading(false)
      return
    }

    async function loadThread() {
      setLoading(true)
      const res = await getPostThread(postId)
      if (res.ok && res.data?.post) {
        const postData = res.data.post
        setPost(postData)
        const userHasLiked = postData.likes?.some((l: any) => l.userId === currentUserId)
        setLiked(userHasLiked)
        setLikesCount(postData.likes?.length || 0)
        const userHasReposted = postData.reposts?.some((r: any) => r.authorId === currentUserId) || false
        setReposted(userHasReposted)
      } else {
        setPost(null)
      }
      setLoading(false)
    }
    loadThread()
  }, [postId, currentUserId, initialPost])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxImage) {
          setLightboxImage(null)
        } else if (onClose) {
          onClose()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [lightboxImage, onClose])

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
    if (!res.ok) {
      setLiked(liked)
      setLikesCount(likesCount)
      if (onInteractionUpdate) {
        onInteractionUpdate(postId, { liked, likesCount })
      }
    }
  }

  const [showRepostPopover, setShowRepostPopover] = useState(false)

  const handleDirectRepost = async () => {
    setShowRepostPopover(false)
    if (!currentUserId) {
      if (onLoginRequired) onLoginRequired()
      return
    }
    if (reposted) return
    setReposted(true)
    toast.success(t("feed.repost_success", "Post repartagé."))
    trackEvent("post_repost", { postId })
    const res = await repostPost(postId)
    if (!res.ok) setReposted(false)
  }

  const handleQuoteThought = () => {
    setShowRepostPopover(false)
    if (!currentUserId) {
      if (onLoginRequired) onLoginRequired()
      return
    }
    const quoteTarget = post.repost ? post.repost : post
    window.dispatchEvent(new CustomEvent("open-composer", { detail: { quotedThought: quoteTarget } }))
  }

  const handleDelete = async () => {
    if (!confirm(t("feed.msg_confirm_delete_post", "Voulez-vous vraiment supprimer ce post ?"))) return
    setDeleting(true)
    trackEvent("post_delete", { postId })
    const res = await deletePost(postId)
    if (res.ok) {
      toast.success(t("feed.delete_success", "Post supprimé."))
      if (onClose) onClose()
      else window.location.href = routes.feed.home()
    } else {
      setDeleting(false)
      toast.error(t("feed.msg_error_delete", "Erreur lors de la suppression."))
    }
  }

  const handleShare = async () => {
    const authorHandle = post.author.username || post.author.subdomain || post.author.id
    const shareUrl = `${window.location.origin}${routes.feed.thought(authorHandle, post.id)}`
    
    const shareData = {
      title: `${post.author.name} sur qoe.fi`,
      text: post.content,
      url: shareUrl
    }

    trackEvent("post_share", { postId })

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        console.log("Share cancelled:", err)
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl)
        toast.success(t("feed.msg_link_copied", "Lien copié !"))
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

    if (res.ok && res.data?.reply) {
      toast.success(t("feed.reply_success", "Réponse publiée."))
      setReplyText("")
      setPost((prev: any) => ({
        ...prev,
        replies: [res.data!.reply, ...(prev?.replies || [])]
      }))
      if (onInteractionUpdate) {
        onInteractionUpdate(postId, { repliesCount: (post.replies?.length || 0) + 1 })
      }
    } else {
      toast.error(t("feed.reply_error", "Erreur de publication."))
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
    return <ExpandedPostSkeleton standalone={standalone} />
  }

  if (!post) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <AlertCircle className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs">{t("feed.post_not_found", "Contenu introuvable ou supprimé.")}</p>
        <button
          onClick={() => {
            if (onClose) onClose()
            else window.location.href = routes.feed.home()
          }}
          className="mt-3 text-xs font-semibold text-foreground hover:underline cursor-pointer"
        >
          {t("feed.back_to_feed", "Retour au flux")}
        </button>
      </div>
    )
  }

  const isPureRepost = !!post.repost && !post.content.trim()
  const isQuotePost = !!post.repost && !!post.content.trim()

  const displayAuthor = isPureRepost ? post.repost.author : post.author
  const displayContent = isPureRepost ? post.repost.content : post.content
  const displayImageUrl = isPureRepost ? post.repost.imageUrl : post.imageUrl

  const handleBack = () => {
    if (onClose) {
      onClose()
    } else if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back()
    } else {
      window.location.href = routes.feed.home()
    }
  }

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.enter}
        className="flex flex-col gap-4 font-sans"
      >
        {/* Navigation top bar */}
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t("feed.back_to_feed", "Retour")}</span>
          </button>

          {currentUserId === post.authorId && (
            <button
              onClick={handleDelete}
              className="text-muted-foreground hover:text-destructive transition-colors p-1 cursor-pointer"
              title={t("feed.delete_post", "Supprimer")}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* ── PARENT ANCESTOR CHAIN (If reply) ── */}
        {post.parent && (
          <div className="pb-3 border-b border-border/40 pl-3 border-l-2 border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <CornerDownRight className="w-3 h-3 text-brand" />
              <span>{t("feed.replying_to", "En réponse à")}</span>
            </div>
            
            <div 
              onClick={() => navigateToThought(post.parent.id, post.parent.author.username || post.parent.author.subdomain)}
              className="cursor-pointer group/parent space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-md overflow-hidden bg-muted shrink-0">
                    {post.parent.author.logoUrl ? (
                      <img src={post.parent.author.logoUrl} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full bg-brand/10 flex items-center justify-center font-bold text-xs text-brand">
                        {post.parent.author.name?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-semibold text-foreground group-hover/parent:text-brand transition-colors">{post.parent.author.name}</span>
                      {post.parent.author.isCertified && <CertifiedBadge />}
                    </div>
                    <span className="text-xs text-muted-foreground">@{post.parent.author.username || post.parent.author.subdomain || post.parent.author.id.slice(0, 8)}</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(post.parent.createdAt).toLocaleDateString("fr-FR", { month: "short", day: "numeric" })}
                </span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed font-sans line-clamp-2">
                {post.parent.content}
              </p>
            </div>
          </div>
        )}

        {/* ── MAIN FOCUS POST ── */}
        <div className="py-2 border-b border-border/40 flex flex-col gap-4">
          {(isPureRepost || isQuotePost) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-1 mb-1">
              <Repeat className="w-3.5 h-3.5 text-emerald-500" />
              <span>
                <strong 
                  onClick={() => handleOpenProfile(post.author)}
                  className="font-semibold text-foreground hover:underline cursor-pointer"
                >
                  @{post.author.username || post.author.subdomain || post.author.id.slice(0, 8)}
                </strong> {isQuotePost ? "a cité une pensée" : "a repartagé"}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <HoverCard>
              <HoverCardTrigger
                render={
                  <button 
                    onClick={() => handleOpenProfile(displayAuthor)}
                    className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer group/author text-left outline-none"
                  >
                    <div className="w-9 h-9 rounded-md overflow-hidden bg-muted shrink-0 transition-transform duration-300 group-hover/author:scale-105">
                      {displayAuthor.logoUrl ? (
                        <img src={displayAuthor.logoUrl} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full bg-brand/10 flex items-center justify-center font-bold text-xs text-brand">
                          {displayAuthor.name?.charAt(0) || "U"}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground block leading-none group-hover/author:text-brand transition-colors">{displayAuthor.name}</span>
                        {displayAuthor.isCertified && <CertifiedBadge />}
                      </div>
                      <span className="text-xs text-muted-foreground block mt-1">@{displayAuthor.username || displayAuthor.subdomain || displayAuthor.id.slice(0, 8)}</span>
                    </div>
                  </button>
                }
              />
              
              <HoverCardContent className="w-72 p-4 bg-card border border-border/40 rounded-lg shadow-xl z-50">
                <div className="flex justify-between space-x-4">
                  <div className="w-10 h-10 rounded-md overflow-hidden bg-muted shrink-0">
                    {displayAuthor.logoUrl ? (
                      <img src={displayAuthor.logoUrl} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full bg-brand/10 flex items-center justify-center font-bold text-sm text-brand">
                        {displayAuthor.name?.charAt(0) || "U"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-foreground leading-none">{displayAuthor.name}</h4>
                      {displayAuthor.isCertified && <CertifiedBadge />}
                    </div>
                    <p className="text-xs text-muted-foreground leading-none">@{displayAuthor.username || displayAuthor.subdomain || displayAuthor.id.slice(0, 8)}</p>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>

            <span className="text-xs text-muted-foreground">
              {new Date(post.createdAt).toLocaleDateString("fr-FR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          <div className="relative">
            <div className={cn(
              "transition-all duration-300",
              (post.triggerWarning && !isWarningRevealed) && "blur-md pointer-events-none select-none"
            )}>
              <div className="text-base text-foreground leading-relaxed font-sans">
                <TextParser content={displayContent} />
              </div>

              {/* Embedded Quoted Thought Card if Quote Post */}
              {isQuotePost && (
                <div className="mt-3">
                  <QuotedThoughtCard post={post.repost} onOpenPost={(id, authorUsername) => navigateToThought(id, authorUsername)} />
                </div>
              )}

              {getUrls(displayContent).length > 0 && (
                <div className="mt-2">
                  <LinkPreview urls={getUrls(displayContent)} />
                </div>
              )}

              {displayImageUrl && (
                <div className="mt-2">
                  <ImageGrid urls={getImages(displayImageUrl)} onImageClick={(url) => setLightboxImage(url)} />
                </div>
              )}
            </div>

            {post.triggerWarning && !isWarningRevealed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/90 backdrop-blur-xs p-4">
                <span className="text-xs font-semibold text-amber-500 mb-1">Avertissement</span>
                <p className="text-xs text-muted-foreground text-center max-w-[280px] mb-3">
                  {post.triggerWarning}
                </p>
                <button
                  onClick={() => setIsWarningRevealed(true)}
                  className="px-3 py-1.5 bg-foreground text-background hover:opacity-90 text-xs font-semibold rounded-md transition-opacity cursor-pointer"
                >
                  Afficher
                </button>
              </div>
            )}
          </div>

          {/* Actions Bar — Identical to timeline */}
          <div className="flex items-center justify-between pt-3 border-t border-border/30 text-xs text-muted-foreground">
            <button 
              onClick={handleLikeToggle}
              className={cn(
                "flex items-center gap-1.5 hover:text-brand transition-colors cursor-pointer",
                liked && "text-brand font-semibold"
              )}
            >
              <motion.div whileTap={{ scale: 1.3 }} transition={springs.like}>
                <LikeIcon className="w-4 h-4" style={{ fill: liked ? "var(--accent-brand, #EE4B2B)" : "transparent" }} />
              </motion.div>
              <span>{likesCount}</span>
            </button>

            <div className="flex items-center gap-1.5">
              <CommentIcon className="w-4 h-4" />
              <span>{post.replies?.length || 0}</span>
            </div>

            <Popover open={showRepostPopover} onOpenChange={setShowRepostPopover}>
              <PopoverTrigger
                render={
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setShowRepostPopover(true)
                    }}
                    className={cn(
                      "flex items-center gap-1.5 hover:text-emerald-500 transition-colors cursor-pointer",
                      reposted && "text-emerald-500 font-semibold"
                    )}
                  >
                    <RepostIcon className="w-4 h-4" />
                    <span>{reposted ? "Reposté" : "Repost"}</span>
                  </button>
                }
              />
              <PopoverContent align="center" className="w-48 p-1.5 space-y-1 bg-card border border-border/60 rounded-xl shadow-xl z-50">
                <button
                  type="button"
                  onClick={handleDirectRepost}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Repeat className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Partager direct</span>
                </button>
                <button
                  type="button"
                  onClick={handleQuoteThought}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Quote className="w-3.5 h-3.5 text-brand" />
                  <span>Citer la pensée</span>
                </button>
              </PopoverContent>
            </Popover>

            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
            >
              <ShareIcon className="w-4 h-4" />
              <span>Partager</span>
            </button>
          </div>
        </div>

        {/* ── REPLY INPUT COMPOSER ── */}
        <form 
          onSubmit={(e) => {
            if (!currentUserId) {
              e.preventDefault()
              if (onLoginRequired) onLoginRequired()
              return
            }
            handleReplySubmit(e)
          }} 
          className="flex gap-2 items-center pt-2"
        >
          <input
            type="text"
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
            placeholder={t("feed.reply_publish", "Écrire une réponse...")}
            className="flex-1 text-xs border-b border-border/40 focus:border-foreground bg-transparent text-foreground placeholder:text-muted-foreground py-2 outline-none transition-colors"
            required
          />
          <button
            type="submit"
            disabled={sendingReply || !!(currentUserId && !replyText.trim())}
            className="text-xs font-semibold text-foreground hover:text-brand disabled:opacity-40 transition-colors cursor-pointer px-2 py-1"
          >
            {sendingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Publier"}
          </button>
        </form>

        {/* ── REPLIES LIST ── */}
        <div className="space-y-3 pt-2">
          {post.replies && post.replies.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">{t("feed.no_replies", "Aucune réponse pour le moment.")}</p>
          ) : (
            post.replies?.map((reply: any) => (
              <CommentThread 
                key={reply.id}
                reply={reply}
                depth={0}
                currentUserId={currentUserId}
                onSelectThought={(replyId, username) => navigateToThought(replyId, username)}
                onReplyAdded={handleNestedReplyAdded}
                onReplyDeleted={handleNestedReplyDeleted}
                onLoginRequired={onLoginRequired}
              />
            ))
          )}
        </div>
      </motion.div>

      {/* Lightbox Overlay */}
      <AnimatePresence>
        {lightboxImage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLightboxImage(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-xl cursor-zoom-out"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={springs.lightbox}
              className="relative z-10 max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center"
            >
              <button 
                onClick={() => setLightboxImage(null)}
                className="absolute -top-10 right-0 p-1 text-foreground hover:opacity-80 transition-opacity cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <img 
                src={lightboxImage} 
                alt="" 
                className="w-auto h-auto max-w-full max-h-[85vh] object-contain rounded-md shadow-2xl" 
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
  onSelectThought,
  onReplyAdded,
  onReplyDeleted,
  onLoginRequired
}: { 
  reply: any; 
  depth?: number; 
  currentUserId: string | null;
  onSelectThought: (replyId: string, username?: string) => void;
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

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation()
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
    if (res.ok && res.data?.reply) {
      toast.success(t("feed.reply_success", "Réponse publiée."))
      setReplyText("")
      setShowReplyForm(false)
      onReplyAdded(reply.id, res.data.reply)
    } else {
      toast.error(t("feed.reply_error", "Erreur."))
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(t("feed.msg_confirm_delete_reply", "Voulez-vous supprimer cette réponse ?"))) return
    setDeleting(true)
    trackEvent("comment_delete", { replyId: reply.id })
    const res = await deletePost(reply.id)
    if (res.ok) {
      toast.success(t("feed.delete_success", "Réponse supprimée."))
      onReplyDeleted(reply.id)
    } else {
      setDeleting(false)
      toast.error(t("feed.msg_error_delete", "Erreur lors de la suppression."))
    }
  }

  if (deleting) return null

  const handleThreadClick = () => {
    onSelectThought(reply.id, reply.author.username || reply.author.subdomain)
  }

  return (
    <div className="py-3 border-b border-border/30 pl-3 border-l-2 border-border/40 relative group/comment">
      <div 
        onClick={handleThreadClick}
        className="cursor-pointer space-y-2"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md overflow-hidden bg-muted shrink-0">
              {reply.author.logoUrl ? (
                <img src={reply.author.logoUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full bg-brand/10 flex items-center justify-center font-bold text-xs text-brand">
                  {reply.author.name?.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">{reply.author.name}</span>
                {reply.author.isCertified && <CertifiedBadge />}
              </div>
              <span className="text-xs text-muted-foreground block">@{reply.author.username || reply.author.subdomain || reply.author.id.slice(0, 8)}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              {new Date(reply.createdAt).toLocaleDateString("fr-FR", { month: "short", day: "numeric" })}
            </span>
            {currentUserId === reply.authorId && (
              <button
                onClick={handleDelete}
                className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover/comment:opacity-100 p-1 cursor-pointer"
                title={t("feed.delete_post", "Supprimer")}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <p className="text-sm text-foreground/90 leading-relaxed font-sans">
          {reply.content}
        </p>

        <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground font-medium">
          <button 
            onClick={handleLike}
            className={cn("flex items-center gap-1 hover:text-brand transition-colors cursor-pointer", liked && "text-brand font-semibold")}
          >
            <LikeIcon className="w-3.5 h-3.5" style={{ fill: liked ? "var(--accent-brand, #EE4B2B)" : "transparent" }} />
            <span>{likesCount}</span>
          </button>

          <button 
            onClick={(e) => {
              e.stopPropagation()
              if (!currentUserId) {
                if (onLoginRequired) onLoginRequired()
                return
              }
              setShowReplyForm(prev => !prev)
            }}
            className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
          >
            <CommentIcon className="w-3.5 h-3.5" />
            <span>Répondre</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showReplyForm && (
          <motion.form 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit}
            className="flex gap-2 pt-2"
          >
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={t("feed.reply_placeholder", "Écrire une réponse...")}
              className="flex-1 text-xs border-b border-border/40 focus:border-foreground bg-transparent text-foreground placeholder:text-muted-foreground py-1 outline-none transition-colors"
              required
            />
            <button
              type="submit"
              disabled={sending}
              className="text-xs font-semibold text-foreground hover:text-brand disabled:opacity-40 transition-colors cursor-pointer"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Envoyer"}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Nested Child Replies */}
      {reply.replies && reply.replies.length > 0 && depth < 3 && (
        <div className="space-y-2 mt-2">
          {reply.replies.map((childReply: any) => (
            <CommentThread 
              key={childReply.id} 
              reply={childReply} 
              depth={depth + 1} 
              currentUserId={currentUserId}
              onSelectThought={onSelectThought}
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

function ExpandedPostSkeleton({ standalone = false }: { standalone?: boolean }) {
  return (
    <div className={cn(
      "py-6 space-y-4 animate-pulse font-sans",
      standalone && "max-w-2xl mx-auto"
    )}>
      <div className="h-4 w-24 bg-muted/60 rounded-md" />
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-muted/60" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-32 bg-muted/60 rounded-md" />
          <div className="h-2.5 w-20 bg-muted/60 rounded-md" />
        </div>
      </div>
      <div className="space-y-2 pt-2">
        <div className="h-4 w-full bg-muted/60 rounded-md" />
        <div className="h-4 w-5/6 bg-muted/60 rounded-md" />
        <div className="h-4 w-3/4 bg-muted/60 rounded-md" />
      </div>
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
      "grid gap-2 overflow-hidden rounded-md mt-2",
      urls.length === 1 ? "grid-cols-1" : "grid-cols-2"
    )}>
      {urls.map((url) => (
        <div
          key={url}
          onClick={() => onImageClick?.(url)}
          className="relative overflow-hidden bg-muted aspect-video rounded-md border border-border/30 cursor-zoom-in"
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
