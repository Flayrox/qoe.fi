"use client"

import React, { useState, useEffect, useCallback } from "react"
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
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RotateCcw
} from "lucide-react"
import {
  toggleHighlightPrivacyAction,
  upvoteHighlightAction,
  createAnnotationCommentAction,
  quotePassageToFeedAction,
  updateHighlightNoteAction
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
  updatedAt?: Date | string
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
  allArticleAnnotations?: AnnotationItem[]
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
  allArticleAnnotations = [],
  creatorName,
  allowPublicAnnotations,
  isAuthenticated,
  currentUserId,
  mainAppUrl,
  onClose,
  onUpdateAnnotation
}: AnnotationSideDrawerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [annotationsList, setAnnotationsList] = useState<AnnotationItem[]>([])

  const activeAnnotation = annotationsList[currentIndex] || annotation

  const [upvotes, setUpvotes] = useState(activeAnnotation?.upvotesCount || 0)
  const [hasUpvoted, setHasUpvoted] = useState(false)
  const [isPublicState, setIsPublicState] = useState(activeAnnotation?.isPublic || false)
  const [togglingPrivacy, setTogglingPrivacy] = useState(false)
  const [privacyError, setPrivacyError] = useState<string | null>(null)

  // Inline note editing state
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [editNoteContent, setEditNoteContent] = useState(activeAnnotation?.note || "")
  const [savingEdit, setSavingEdit] = useState(false)

  // Comment thread state
  const [comments, setComments] = useState<AnnotationCommentItem[]>(activeAnnotation?.comments || [])
  const [newCommentText, setNewCommentText] = useState("")
  const [submittingComment, setSubmittingComment] = useState(false)

  // Crosspost to feed state
  const [crosspostCommentary, setCrosspostCommentary] = useState("")
  const [isCrossposting, setIsCrossposting] = useState(false)
  const [crosspostSuccess, setCrosspostSuccess] = useState(false)
  const [showCrosspostForm, setShowCrosspostForm] = useState(false)

  // Synchronize annotations list and set initial index to clicked annotation
  useEffect(() => {
    const list = allArticleAnnotations.length > 0 ? allArticleAnnotations : annotation ? [annotation] : []
    setAnnotationsList(list)

    if (annotation) {
      const idx = list.findIndex((a) => a.id === annotation.id)
      setCurrentIndex(idx !== -1 ? idx : 0)
    } else {
      setCurrentIndex(0)
    }
  }, [annotation, allArticleAnnotations])

  // Spotlight glow animation & smooth scroll to active mark in DOM
  useEffect(() => {
    if (activeAnnotation) {
      setUpvotes(activeAnnotation.upvotesCount || 0)
      setIsPublicState(activeAnnotation.isPublic || false)
      setComments(activeAnnotation.comments || [])
      setEditNoteContent(activeAnnotation.note || "")
      setIsEditingNote(false)
      setHasUpvoted(false)
      setPrivacyError(null)
      setShowCrosspostForm(false)

      const mark = document.querySelector(`mark[data-highlight-id="${activeAnnotation.id}"]`)
      if (mark) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" })

        // Apply spotlight light pulse effect on document mark
        mark.classList.add("ring-2", "ring-primary/80", "bg-amber-500/40", "shadow-lg", "shadow-amber-500/30", "transition-all", "duration-500")
        setTimeout(() => {
          mark.classList.remove("ring-2", "ring-primary/80", "bg-amber-500/40", "shadow-lg", "shadow-amber-500/30", "transition-all", "duration-500")
        }, 1200)
      }
    }
  }, [currentIndex, activeAnnotation?.id])

  const totalAnnotations = annotationsList.length

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
    }
  }, [currentIndex])

  const handleNext = useCallback(() => {
    if (currentIndex < totalAnnotations - 1) {
      setCurrentIndex((prev) => prev + 1)
    }
  }, [currentIndex, totalAnnotations])

  // Keyboard Arrow navigation (< / >)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeAnnotation || isEditingNote) return
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return

      if (e.key === "ArrowLeft") {
        handlePrev()
      } else if (e.key === "ArrowRight") {
        handleNext()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeAnnotation, isEditingNote, handlePrev, handleNext])

  if (!activeAnnotation) return null

  const handleLoginRedirect = () => {
    window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`
  }

  // Handle Note Inline Edit Save
  const handleSaveNoteEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAnnotation) return
    if (!isAuthenticated) {
      handleLoginRedirect()
      return
    }

    setSavingEdit(true)
    try {
      const res = await updateHighlightNoteAction(activeAnnotation.id, editNoteContent || null)
      if (res.success && res.highlight) {
        const updated: AnnotationItem = {
          ...activeAnnotation,
          note: editNoteContent || null,
          updatedAt: new Date().toISOString(),
        }
        const newList = [...annotationsList]
        newList[currentIndex] = updated
        setAnnotationsList(newList)
        setIsEditingNote(false)
        if (onUpdateAnnotation) onUpdateAnnotation(updated)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSavingEdit(false)
    }
  }

  // Handle privacy toggle (Private <-> Public)
  const handleTogglePrivacy = async () => {
    if (!activeAnnotation) return
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
        const newList = [...annotationsList]
        newList[currentIndex] = updated
        setAnnotationsList(newList)
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

  // Handle upvote (toggleable like)
  const handleUpvote = async () => {
    if (!activeAnnotation) return
    if (hasUpvoted) {
      setHasUpvoted(false)
      setUpvotes((prev) => Math.max(0, prev - 1))
    } else {
      setHasUpvoted(true)
      setUpvotes((prev) => prev + 1)
      try {
        await upvoteHighlightAction(activeAnnotation.id)
      } catch (e) {
        console.error(e)
      }
    }
  }

  // Handle annotation comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAnnotation) return
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
    if (!activeAnnotation) return
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

  // Format sophisticated modification date
  const isEdited = Boolean(
    activeAnnotation.updatedAt &&
      new Date(activeAnnotation.updatedAt).getTime() - new Date(activeAnnotation.createdAt).getTime() > 3000
  )

  const formattedEditTime = isEdited && activeAnnotation.updatedAt
    ? new Date(activeAnnotation.updatedAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  return (
    <AnimatePresence>
      {activeAnnotation && (
        <div className="fixed inset-y-0 right-0 z-50 flex pointer-events-none font-sans select-text">
          <motion.div
            initial={{ x: "100%", opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className="w-screen max-w-sm sm:max-w-md bg-popover/90 text-popover-foreground border-l border-border/30 backdrop-blur-2xl shadow-2xl rounded-l-3xl flex flex-col justify-between pointer-events-auto h-full overflow-hidden"
          >
            {/* Header with multi-annotation switcher */}
            <div className="p-4 border-b border-border/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activeAnnotation.isOfficial ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-medium flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Annotation officielle
                  </span>
                ) : (
                  <span className="text-xs font-medium text-foreground/80">
                    Annotation
                  </span>
                )}

                {/* Sequential article-wide annotation pagination switcher */}
                {totalAnnotations > 1 && (
                  <div className="flex items-center gap-1 ml-2 pl-2 border-l border-border/30">
                    <button
                      onClick={handlePrev}
                      disabled={currentIndex === 0}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
                      title="Annotation précédente (Flèche gauche)"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] text-muted-foreground font-medium px-1">
                      {currentIndex + 1} / {totalAnnotations}
                    </span>
                    <button
                      onClick={handleNext}
                      disabled={currentIndex === totalAnnotations - 1}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
                      title="Annotation suivante (Flèche droite)"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={onClose}
                className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Main Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* Quoted Passage: High Legibility Apple Typography with subtle capillary accent line */}
              <div className="space-y-1 py-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Passage cité
                </span>
                <p className="text-xs sm:text-sm text-foreground/90 font-sans italic leading-relaxed pl-3 border-l-2 border-primary/40">
                  « {activeAnnotation.text} »
                </p>
              </div>

              {/* Author / Note Details */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border/40 font-semibold text-xs">
                      {activeAnnotation.reader.logoUrl ? (
                        <img src={activeAnnotation.reader.logoUrl} alt={activeAnnotation.reader.name || "Auteur"} className="w-full h-full object-cover" />
                      ) : (
                        (activeAnnotation.reader.name || activeAnnotation.reader.username || "A")[0]
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <span>{activeAnnotation.reader.name || activeAnnotation.reader.username || "Lecteur"}</span>
                        {activeAnnotation.isOfficial && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-amber-500 text-white">
                            Auteur
                          </span>
                        )}
                      </h4>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(activeAnnotation.createdAt).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short"
                          })}
                        </span>

                        {/* Sophisticated Modification timestamp badge if edited */}
                        {isEdited && (
                          <span
                            className="text-[10px] text-muted-foreground/80 flex items-center gap-1 italic"
                            title={`Édité le ${formattedEditTime}`}
                          >
                            <span>•</span>
                            <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
                            <span>Modifié le {formattedEditTime}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Inline Edit Button if author of highlight */}
                    {currentUserId === activeAnnotation.reader.id && (
                      <button
                        onClick={() => setIsEditingNote(!isEditingNote)}
                        className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                        title="Modifier cette annotation"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Privacy Badge / Toggle if author of highlight */}
                    {currentUserId === activeAnnotation.reader.id && !activeAnnotation.isOfficial && (
                      <button
                        onClick={handleTogglePrivacy}
                        disabled={togglingPrivacy}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer",
                          isPublicState
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20"
                            : "bg-muted text-muted-foreground border-border/30 hover:text-foreground"
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
                </div>

                {privacyError && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive p-2.5 rounded-xl text-xs flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{privacyError}</span>
                  </div>
                )}

                {/* Inline Note Editor Form or Note Display */}
                {isEditingNote ? (
                  <form onSubmit={handleSaveNoteEdit} className="space-y-2.5">
                    <textarea
                      autoFocus
                      rows={3}
                      value={editNoteContent}
                      onChange={(e) => setEditNoteContent(e.target.value)}
                      placeholder="Modifier votre réflexion..."
                      className="w-full p-3 rounded-2xl bg-background border border-border/30 text-xs text-foreground focus:outline-none focus:border-primary font-sans resize-none leading-relaxed"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingNote(false)}
                        className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="px-3 py-1 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        <span>Enregistrer</span>
                      </button>
                    </div>
                  </form>
                ) : activeAnnotation.note ? (
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-line bg-muted/40 p-3.5 rounded-2xl border border-border/20 font-sans">
                    {activeAnnotation.note}
                  </p>
                ) : (
                  <p className="text-xs italic text-muted-foreground">
                    Aucune note attachée à ce surlignage.
                  </p>
                )}
              </div>

              {/* Action Bar (Upvotes & Quote to Feed) */}
              <div className="flex items-center justify-between pt-2.5 border-t border-border/20">
                <button
                  onClick={handleUpvote}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer",
                    hasUpvoted
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-muted/40 text-muted-foreground border-border/30 hover:text-foreground"
                  )}
                >
                  <ThumbsUp className={cn("w-3.5 h-3.5", hasUpvoted && "fill-primary")} />
                  <span>{upvotes > 0 ? `${upvotes} Utile` : "Utile"}</span>
                </button>

                <button
                  onClick={() => setShowCrosspostForm(!showCrosspostForm)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all cursor-pointer shadow-xs"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Citer sur le Feed</span>
                </button>
              </div>

              {/* Crosspost Success Alert */}
              {crosspostSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-3 rounded-2xl text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    <span>Passage cité avec succès sur votre fil Feed !</span>
                  </div>
                  <a href="/feed" className="font-medium underline">Voir</a>
                </div>
              )}

              {/* Crosspost Form */}
              {showCrosspostForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="p-3 rounded-2xl bg-muted/30 border border-border/30 space-y-2.5"
                >
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Ajouter un commentaire sur le Feed (optionnel)
                  </label>
                  <textarea
                    rows={2}
                    value={crosspostCommentary}
                    onChange={(e) => setCrosspostCommentary(e.target.value)}
                    placeholder="Qu'en pensez-vous ?"
                    className="w-full p-2.5 rounded-xl bg-background border border-border/30 text-xs text-foreground focus:outline-none focus:border-primary resize-none font-sans"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowCrosspostForm(false)}
                      className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      disabled={isCrossposting}
                      onClick={handleCrosspostToFeed}
                      className="px-3 py-1 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      {isCrossposting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Publier sur le Feed"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Annotation Discussion Thread (Comments) */}
              {(activeAnnotation.isPublic || activeAnnotation.isOfficial) && (
                <div className="pt-3.5 border-t border-border/20 space-y-3.5">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                    <h5 className="text-xs font-medium text-muted-foreground">
                      Discussion ({comments.length})
                    </h5>
                  </div>

                  {/* Add comment input */}
                  <form onSubmit={handleAddComment} className="flex gap-2">
                    <input
                      type="text"
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      placeholder="Réagir à cette annotation..."
                      className="flex-1 bg-background border border-border/30 rounded-xl px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-sans"
                    />
                    <button
                      type="submit"
                      disabled={submittingComment || !newCommentText.trim()}
                      className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                    >
                      {submittingComment ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    </button>
                  </form>

                  {/* Comments list */}
                  <div className="space-y-2.5">
                    {comments.map((cmt) => (
                      <div key={cmt.id} className="p-3 rounded-2xl bg-muted/30 border border-border/20 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground">
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
      )}
    </AnimatePresence>
  )
}
