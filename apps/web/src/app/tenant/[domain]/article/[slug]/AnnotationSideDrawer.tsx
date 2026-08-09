"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Sparkles,
  Share2,
  ThumbsUp,
  MessageSquare,
  Lock,
  Globe,
  Send,
  Loader2,
  Check,
  AlertCircle
} from "lucide-react"
import {
  toggleHighlightPrivacyAction,
  upvoteHighlightAction,
  createAnnotationCommentAction,
  quotePassageToFeedAction
} from "./actions"
import { cn } from "@qoe/utils"

export interface AnnotationCommentItem {
  id: string
  content: string
  createdAt: Date | string
  author: {
    id: string
    name: string | null
    username: string | null
    logoUrl: string | null
  }
}

export interface AnnotationItem {
  id: string
  text: string
  note?: string | null
  isPublic: boolean
  isOfficial: boolean
  upvotesCount: number
  createdAt: Date | string
  reader: {
    id: string
    name: string | null
    username: string | null
    logoUrl: string | null
    subdomain: string | null
  }
  comments?: AnnotationCommentItem[]
}

interface AnnotationSideDrawerProps {
  articleId: string
  annotation: AnnotationItem | null
  allAnnotationsForPassage?: AnnotationItem[]
  creatorName: string
  allowPublicAnnotations: boolean
  isAuthenticated: boolean
  currentUserId?: string | null
  mainAppUrl: string
  onClose: () => void
  onUpdateAnnotation?: (updated: AnnotationItem) => void
}

export function AnnotationSideDrawer({
  articleId,
  annotation,
  allAnnotationsForPassage = [],
  creatorName,
  allowPublicAnnotations,
  isAuthenticated,
  currentUserId,
  mainAppUrl,
  onClose,
  onUpdateAnnotation
}: AnnotationSideDrawerProps) {
  const [activeAnnotation, setActiveAnnotation] = useState<AnnotationItem | null>(annotation)
  const [upvotes, setUpvotes] = useState(annotation?.upvotesCount || 0)
  const [hasUpvoted, setHasUpvoted] = useState(false)
  const [isPublicState, setIsPublicState] = useState(annotation?.isPublic || false)
  const [togglingPrivacy, setTogglingPrivacy] = useState(false)
  const [privacyError, setPrivacyError] = useState<string | null>(null)

  // Comment thread state
  const [comments, setComments] = useState<AnnotationCommentItem[]>(annotation?.comments || [])
  const [newCommentText, setNewCommentText] = useState("")
  const [submittingComment, setSubmittingComment] = useState(false)

  // Crosspost to feed state
  const [crosspostCommentary, setCrosspostCommentary] = useState("")
  const [isCrossposting, setIsCrossposting] = useState(false)
  const [crosspostSuccess, setCrosspostSuccess] = useState(false)
  const [showCrosspostForm, setShowCrosspostForm] = useState(false)

  if (!activeAnnotation) return null

  const handleLoginRedirect = () => {
    window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`
  }

  // Handle privacy toggle (Private <-> Public)
  const handleTogglePrivacy = async () => {
    if (!isAuthenticated) {
      handleLoginRedirect()
      return
    }

    setPrivacyError(null)
    setTogglingPrivacy(true)
    const targetPublic = !isPublicState

    try {
      const res = await toggleHighlightPrivacyAction(activeAnnotation.id, targetPublic)
      if (res.success) {
        setIsPublicState(targetPublic)
        const updated = { ...activeAnnotation, isPublic: targetPublic }
        setActiveAnnotation(updated)
        if (onUpdateAnnotation) onUpdateAnnotation(updated)
      } else if (res.error === "PUBLIC_ANNOTATIONS_DISABLED") {
        setPrivacyError("Le créateur a désactivé les annotations publiques sur cet écrit.")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setTogglingPrivacy(false)
    }
  }

  // Handle upvote
  const handleUpvote = async () => {
    if (hasUpvoted) return
    setUpvotes(prev => prev + 1)
    setHasUpvoted(true)
    try {
      await upvoteHighlightAction(activeAnnotation.id)
    } catch (e) {
      console.error(e)
    }
  }

  // Handle annotation comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAuthenticated) {
      handleLoginRedirect()
      return
    }

    if (!newCommentText.trim()) return

    setSubmittingComment(true)
    try {
      const res = await createAnnotationCommentAction(activeAnnotation.id, newCommentText)
      if (res.success && res.comment) {
        setComments(prev => [...prev, res.comment as AnnotationCommentItem])
        setNewCommentText("")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSubmittingComment(false)
    }
  }

  // Handle 1-click Quote to Feed Crossposting
  const handleCrosspostToFeed = async () => {
    if (!isAuthenticated) {
      handleLoginRedirect()
      return
    }

    setIsCrossposting(true)
    setCrosspostSuccess(false)
    try {
      const res = await quotePassageToFeedAction(articleId, activeAnnotation.text, crosspostCommentary)
      if (res.success) {
        setCrosspostSuccess(true)
        setShowCrosspostForm(false)
        setCrosspostCommentary("")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsCrossposting(false)
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden font-sans pointer-events-auto select-text">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-background/60 backdrop-blur-xs transition-opacity"
        />

        <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="w-screen max-w-md bg-card border-l border-border/40 shadow-2xl flex flex-col justify-between"
          >
            {/* Header */}
            <div className="p-5 border-b border-border/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activeAnnotation.isOfficial ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Annotation Officielle Auteur
                  </span>
                ) : (
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Genius Margins & Notes
                  </span>
                )}
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Main Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              
              {/* Quoted Passage Card */}
              <div className="p-4 rounded-xl bg-muted/40 border-l-4 border-amber-500 space-y-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Passage Cité
                </span>
                <p className="text-sm font-serif italic text-foreground leading-relaxed">
                  « {activeAnnotation.text} »
                </p>
              </div>

              {/* Author / Note Details */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border/40 font-bold text-xs">
                      {activeAnnotation.reader.logoUrl ? (
                        <img src={activeAnnotation.reader.logoUrl} alt={activeAnnotation.reader.name || "Auteur"} className="w-full h-full object-cover" />
                      ) : (
                        (activeAnnotation.reader.name || activeAnnotation.reader.username || "A")[0]
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <span>{activeAnnotation.reader.name || activeAnnotation.reader.username || "Lecteur"}</span>
                        {activeAnnotation.isOfficial && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500 text-white">
                            Créateur
                          </span>
                        )}
                      </h4>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(activeAnnotation.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short"
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Privacy Badge / Toggle if author of highlight */}
                  {currentUserId === activeAnnotation.reader.id && !activeAnnotation.isOfficial && (
                    <button
                      onClick={handleTogglePrivacy}
                      disabled={togglingPrivacy}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer",
                        isPublicState
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20"
                          : "bg-muted text-muted-foreground border-border/40 hover:text-foreground"
                      )}
                      title={isPublicState ? "Rendre privée" : "Rendre publique sur l'article"}
                    >
                      {togglingPrivacy ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isPublicState ? (
                        <>
                          <Globe className="w-3 h-3" />
                          <span>Publique</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3" />
                          <span>Privée</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {privacyError && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive p-2.5 rounded-lg text-xs flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{privacyError}</span>
                  </div>
                )}

                {/* Note Content */}
                {activeAnnotation.note ? (
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line bg-card p-3 rounded-xl border border-border/30">
                    {activeAnnotation.note}
                  </p>
                ) : (
                  <p className="text-xs italic text-muted-foreground">
                    Aucune note attachée à ce surlignage.
                  </p>
                )}
              </div>

              {/* Action Bar (Upvotes & Quote to Feed) */}
              <div className="flex items-center justify-between pt-3 border-t border-border/30">
                <button
                  onClick={handleUpvote}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer",
                    hasUpvoted
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-muted/40 text-muted-foreground border-border/30 hover:text-foreground"
                  )}
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                  <span>{upvotes} Utile</span>
                </button>

                <button
                  onClick={() => setShowCrosspostForm(!showCrosspostForm)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all cursor-pointer shadow-xs"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Citer sur le Feed</span>
                </button>
              </div>

              {/* Crosspost Success Alert */}
              {crosspostSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-3 rounded-xl text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    <span>Passage cité avec succès sur votre fil Feed !</span>
                  </div>
                  <a href="/feed" className="font-bold underline">Voir</a>
                </div>
              )}

              {/* Crosspost Form */}
              {showCrosspostForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-3"
                >
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    Ajouter un commentaire sur le Feed (optionnel)
                  </label>
                  <textarea
                    rows={2}
                    value={crosspostCommentary}
                    onChange={(e) => setCrosspostCommentary(e.target.value)}
                    placeholder="Qu'en pensez-vous ?"
                    className="w-full p-2.5 rounded-lg bg-background border border-border/40 text-xs text-foreground focus:outline-none focus:border-primary resize-none font-sans"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowCrosspostForm(false)}
                      className="px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      disabled={isCrossposting}
                      onClick={handleCrosspostToFeed}
                      className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      {isCrossposting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Publier sur le Feed"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Annotation Discussion Thread (Comments) */}
              {(activeAnnotation.isPublic || activeAnnotation.isOfficial) && (
                <div className="pt-4 border-t border-border/30 space-y-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Discussion sur cette note ({comments.length})
                    </h5>
                  </div>

                  {/* Add comment input */}
                  <form onSubmit={handleAddComment} className="flex gap-2">
                    <input
                      type="text"
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      placeholder="Réagir à cette annotation..."
                      className="flex-1 bg-background border border-border/40 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-sans"
                    />
                    <button
                      type="submit"
                      disabled={submittingComment || !newCommentText.trim()}
                      className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                    >
                      {submittingComment ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    </button>
                  </form>

                  {/* Comments list */}
                  <div className="space-y-3">
                    {comments.map((cmt) => (
                      <div key={cmt.id} className="p-3 rounded-xl bg-card border border-border/30 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            {cmt.author.name || cmt.author.username || "Lecteur"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(cmt.createdAt).toLocaleDateString("fr-FR", { month: "short", day: "numeric" })}
                          </span>
                        </div>
                        <p className="text-xs text-foreground leading-relaxed">
                          {cmt.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  )
}
