"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Send, Loader2, AlertCircle, Trash2, X } from "lucide-react"
import { useTabStore } from "@/lib/use-tab-store"
import { getPostThread, toggleLikePost, replyToPost, deletePost, repostPost } from "../actions"
import { LikeIcon, CommentIcon, RepostIcon, ShareIcon } from "@/components/icons/CustomIcons"
import { cn } from "@/lib/utils"

interface ExpandedPostViewProps {
  postId: string
  currentUserId: string | null
}

const springs = {
  enter: { type: "spring" as const, stiffness: 450, damping: 30 },
  like: { type: "spring" as const, stiffness: 600, damping: 25 },
  lightbox: { type: "spring" as const, stiffness: 350, damping: 30 }
}

export function ExpandedPostView({ postId, currentUserId }: ExpandedPostViewProps) {
  const { setActiveTabId, addTab, removeTab } = useTabStore()
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

  const handleOpenProfile = () => {
    const targetUsername = post?.author?.username || post?.author?.subdomain
    if (!targetUsername) return
    addTab({
      id: `profile-${targetUsername}`,
      title: `@${targetUsername}`,
      type: "profile",
      slug: targetUsername
    })
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
    if (!currentUserId) return
    
    setLiked(prev => !prev)
    setLikesCount(prev => liked ? prev - 1 : prev + 1)

    const res = await toggleLikePost(postId)
    if (!res.success) {
      setLiked(prev => !prev)
      setLikesCount(prev => liked ? prev + 1 : prev - 1)
    }
  }

  const handleRepost = async () => {
    if (!currentUserId || reposted) return
    setReposted(true)
    const res = await repostPost(postId)
    if (!res.success) setReposted(false)
  }

  const handleDelete = async () => {
    if (!confirm("Voulez-vous vraiment supprimer ce post ?")) return
    setDeleting(true)
    const res = await deletePost(postId)
    if (res.success) {
      // Close the tab and return to timeline
      removeTab(`post-${postId}`)
      setActiveTabId("timeline")
    } else {
      setDeleting(false)
      alert("Erreur lors de la suppression.")
    }
  }

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/@${post.author.username || post.author.subdomain}/post/${post.id}`
    const shareData = {
      title: `Pensée de ${post.author.name} sur QOE.FI`,
      text: post.content,
      url: shareUrl
    }

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        console.log("Share failed or cancelled:", err)
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl)
        alert("Lien copié dans le presse-papiers !")
      } catch (err) {
        console.error("Copy error:", err)
      }
    }
  }

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyText.trim() || !currentUserId) return

    setSendingReply(true)
    const res = await replyToPost({ postId, content: replyText })
    setSendingReply(false)

    if (res.success && res.data?.reply) {
      setReplyText("")
      setPost(prev => ({
        ...prev,
        replies: [res.data.reply, ...(prev?.replies || [])]
      }))
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

    setPost(prev => {
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
    setPost(prev => ({
      ...prev,
      replies: deleteRecursively(prev?.replies || [])
    }))
  }

  if (loading || deleting) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white border border-neutral-200/50 rounded-xl shadow-xs">
        <Loader2 className="w-5 h-5 animate-spin text-[#EE4B2B]" />
        <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider font-mono">
          {deleting ? "Suppression en cours..." : "Chargement du fil social..."}
        </span>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="bg-white border border-neutral-200/50 rounded-xl p-8 text-center text-neutral-500 shadow-xs">
        <AlertCircle className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
        <p className="text-xs">Le contenu demandé est introuvable ou a été supprimé.</p>
      </div>
    )
  }

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.enter}
        className="bg-white border border-neutral-200/50 rounded-xl p-6 shadow-xs flex flex-col gap-6"
      >
        {/* Thread Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <button
            onClick={() => setActiveTabId("timeline")}
            className="flex items-center gap-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Retour au flux
          </button>
          
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest font-mono">Fil social</span>
            {currentUserId === post.authorId && (
              <button onClick={handleDelete} className="text-neutral-400 hover:text-red-500 transition-colors cursor-pointer" title="Supprimer le post">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Main post layout */}
        <div className="space-y-4">
          <button onClick={handleOpenProfile} className="flex items-center gap-3 text-left hover:opacity-90 transition-opacity cursor-pointer outline-none group/author">
            <div className="w-10 h-10 rounded-md overflow-hidden border border-neutral-200/40 shrink-0 shadow-xs">
              {post.author.logoUrl ? (
                <img src={post.author.logoUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full bg-[#EE4B2B]/5 flex items-center justify-center font-bold text-sm text-[#EE4B2B]">
                  {post.author.name?.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-neutral-800 group-hover/author:text-[#EE4B2B] transition-colors">{post.author.name}</span>
                {post.author.isCertified && <span className="text-[#EE4B2B] text-[9px] font-black">✓</span>}
              </div>
              <span className="text-xs text-neutral-400 block mt-0.5 font-mono">@{post.author.username || post.author.subdomain}</span>
            </div>
          </button>

          <div className="text-base text-neutral-800 leading-relaxed font-sans font-light">
            {post.content}
          </div>

          {post.imageUrl && (
            <div 
              onClick={() => setLightboxImage(post.imageUrl)}
              className="rounded-lg border border-neutral-200/40 overflow-hidden bg-neutral-100 max-h-[500px] cursor-zoom-in"
            >
              <img src={post.imageUrl} className="w-full h-full object-cover" alt="Image du post" />
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 font-mono font-semibold pt-2">
            <span>{new Date(post.createdAt).toLocaleDateString(undefined, { hour: "numeric", minute: "numeric" })}</span>
            <span>•</span>
            <span>Souveraineté QOE</span>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between border-y border-neutral-100 py-3 px-1 text-neutral-400 text-xs font-semibold">
          <button 
            onClick={handleLikeToggle}
            className={cn(
              "flex items-center gap-2 cursor-pointer transition-colors",
              liked ? "text-[#EE4B2B]" : "hover:text-[#EE4B2B]"
            )}
          >
            <motion.div whileTap={{ scale: 1.4 }} transition={springs.like}>
              <LikeIcon className="w-4 h-4" style={{ fill: liked ? "#EE4B2B" : "transparent" }} />
            </motion.div>
            <span>{likesCount} Likes</span>
          </button>

          <div className="flex items-center gap-2">
            <CommentIcon className="w-4 h-4 text-neutral-400" />
            <span>{post.replies?.length || 0} Réponses</span>
          </div>

          <button 
            onClick={handleRepost}
            className={cn(
              "flex items-center gap-2 cursor-pointer transition-colors",
              reposted ? "text-emerald-500" : "hover:text-emerald-500"
            )}
          >
            <RepostIcon className="w-4 h-4" />
            <span>{reposted ? "Reposté" : "Repost"}</span>
          </button>

          <button onClick={handleShare} className="flex items-center gap-2 hover:text-neutral-700 cursor-pointer">
            <ShareIcon className="w-4 h-4" />
            <span>Partager</span>
          </button>
        </div>

        {/* Reply Composer */}
        {currentUserId && (
          <form onSubmit={handleReplySubmit} className="flex gap-3 items-end">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Publiez votre réponse..."
              rows={1}
              className="flex-1 text-[13px] border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-lg p-2.5 h-10 resize-none outline-none transition-all"
              required
            />
            <button
              type="submit"
              disabled={sendingReply || !replyText.trim()}
              className="bg-neutral-900 text-white p-2.5 rounded-lg flex items-center justify-center cursor-pointer h-10 w-10 shrink-0 hover:bg-neutral-800 transition-colors"
            >
              {sendingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </form>
        )}

        {/* Recursive Comments list */}
        <div className="space-y-4 pt-2">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2.5">Fils de discussion</h4>
          <div className="space-y-4">
            {post.replies && post.replies.length === 0 ? (
              <p className="text-[11px] text-neutral-400 font-medium italic py-2 pl-1">Aucune réponse pour le moment. Engagez la discussion !</p>
            ) : (
              post.replies?.map((reply: any) => (
                <CommentThread 
                  key={reply.id}
                  reply={reply}
                  depth={0}
                  currentUserId={currentUserId}
                  onReplyAdded={handleNestedReplyAdded}
                  onReplyDeleted={handleNestedReplyDeleted}
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
                className="w-auto h-auto max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" 
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
  onReplyDeleted 
}: { 
  reply: any; 
  depth?: number; 
  currentUserId: string | null; 
  onReplyAdded: (parentId: string, newReply: any) => void;
  onReplyDeleted: (deletedId: string) => void;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [liked, setLiked] = useState(reply.likes?.some((l: any) => l.userId === currentUserId) || false)
  const [likesCount, setLikesCount] = useState(reply.likes?.length || 0)
  const { addTab } = useTabStore()

  const handleOpenProfile = () => {
    const targetUsername = reply.author.username || reply.author.subdomain
    if (!targetUsername) return
    addTab({
      id: `profile-${targetUsername}`,
      title: `@${targetUsername}`,
      type: "profile",
      slug: targetUsername
    })
  }

  const handleLike = async () => {
    if (!currentUserId) return
    setLiked(prev => !prev)
    setLikesCount(prev => liked ? prev - 1 : prev + 1)
    await toggleLikePost(reply.id)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyText.trim() || !currentUserId) return
    setSending(true)
    const res = await replyToPost({ postId: reply.id, content: replyText })
    setSending(false)
    if (res.success && res.data?.reply) {
      setReplyText("")
      setShowReplyForm(false)
      onReplyAdded(reply.id, res.data.reply)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Voulez-vous supprimer cette réponse ?")) return
    setDeleting(true)
    const res = await deletePost(reply.id)
    if (res.success) {
      onReplyDeleted(reply.id)
    } else {
      setDeleting(false)
      alert("Erreur lors de la suppression.")
    }
  }

  if (deleting) return null

  return (
    <div className="space-y-3 pl-3 border-l border-neutral-100 relative group/comment mt-4">
      <div className="flex items-center gap-2.5">
        <button onClick={handleOpenProfile} className="w-6 h-6 rounded-md overflow-hidden border border-neutral-200/30 shrink-0 shadow-xs cursor-pointer hover:opacity-85 transition-opacity outline-none">
          {reply.author.logoUrl ? (
            <img src={reply.author.logoUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full bg-[#EE4B2B]/5 flex items-center justify-center font-bold text-[9px] text-[#EE4B2B]">
              {reply.author.name?.charAt(0)}
            </div>
          )}
        </button>
        <button onClick={handleOpenProfile} className="flex items-center text-left hover:text-[#EE4B2B] transition-colors cursor-pointer outline-none">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-neutral-800 block leading-none">{reply.author.name}</span>
            {reply.author.isCertified && <span className="text-[#EE4B2B] text-[8px] font-black">✓</span>}
          </div>
          <span className="text-[9px] text-neutral-400 font-mono ml-2">@{reply.author.username}</span>
        </button>
        
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[9px] text-neutral-400 font-mono">{new Date(reply.createdAt).toLocaleDateString()}</span>
          {currentUserId === reply.authorId && (
            <button onClick={handleDelete} className="text-neutral-400 hover:text-red-500 transition-colors opacity-0 group-hover/comment:opacity-100 cursor-pointer">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <p className="text-[13px] text-neutral-700 leading-relaxed font-sans pl-8">
        {reply.content}
      </p>

      {/* Sub-comment actions */}
      <div className="flex items-center gap-4 pl-8 text-[10px] text-neutral-400 font-semibold">
        <button 
          onClick={handleLike}
          className={cn("flex items-center gap-1.5 hover:text-[#EE4B2B] transition-colors cursor-pointer", liked && "text-[#EE4B2B]")}
        >
          <LikeIcon className="w-3.5 h-3.5" style={{ fill: liked ? "#EE4B2B" : "transparent" }} />
          <span>{likesCount}</span>
        </button>

        <button 
          onClick={() => setShowReplyForm(prev => !prev)}
          className="flex items-center gap-1.5 hover:text-neutral-700 transition-colors cursor-pointer"
        >
          <CommentIcon className="w-3.5 h-3.5" />
          <span>Répondre</span>
        </button>
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
              placeholder="Écrire une réponse..."
              className="flex-1 text-[11px] border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-md p-2 h-8 outline-none transition-all"
              required
            />
            <button
              type="submit"
              disabled={sending}
              className="bg-neutral-900 text-white p-2 rounded-md h-8 w-8 flex items-center justify-center cursor-pointer disabled:opacity-40"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            </button>
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
