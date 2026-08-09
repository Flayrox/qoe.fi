"use client"

import React, { useEffect, useState, useRef } from "react"
import { createHighlight, quotePassageToFeedAction } from "./actions"
import { Highlighter, Check, Loader2, X, Plus, Globe, Lock, Share2, Quote } from "lucide-react"
import { cn } from "@qoe/utils"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { TextSelectionPopover } from "@qoe/ui"
import { AnnotationSideDrawer, AnnotationItem } from "./AnnotationSideDrawer"

interface HighlightItem {
  id: string
  text: string
  note: string | null
  isPublic?: boolean
  isOfficial?: boolean
  upvotesCount?: number
  createdAt?: Date | string
  reader?: {
    id: string
    name: string | null
    username: string | null
    logoUrl: string | null
    subdomain: string | null
  }
}

interface TextHighlighterProps {
  articleId: string
  creatorName: string
  allowPublicAnnotations: boolean
  isAuthenticated: boolean
  initialHighlights: HighlightItem[]
  publicHighlights?: AnnotationItem[]
  currentUserId?: string | null
  mainAppUrl: string
}

export function TextHighlighter({
  articleId,
  creatorName,
  allowPublicAnnotations,
  isAuthenticated,
  initialHighlights,
  publicHighlights = [],
  currentUserId,
  mainAppUrl,
}: TextHighlighterProps) {
  const [highlights, setHighlights] = useState<HighlightItem[]>(initialHighlights)
  const [allPublic, setAllPublic] = useState<AnnotationItem[]>(publicHighlights)

  // Motion accessibility preference
  const shouldReduceMotion = useReducedMotion()

  // Note input form state
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [activeDraftText, setActiveDraftText] = useState("")
  const [noteText, setNoteText] = useState("")
  const [isPublicChoice, setIsPublicChoice] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Drawer state for clicked highlight
  const [selectedAnnotationForDrawer, setSelectedAnnotationForDrawer] = useState<AnnotationItem | null>(null)
  const [articleAnnotations, setArticleAnnotations] = useState<AnnotationItem[]>([])

  const tempMarkRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    highlightExisting()
  }, [highlights, allPublic])

  const clearForm = () => {
    removeTempDraftMark()
    setShowNoteInput(false)
    setActiveDraftText("")
    setNoteText("")
    setIsPublicChoice(false)
    setSavedSuccess(false)
    setErrorMessage(null)
  }

  // Create temporary active visual mark in DOM so text stays highlighted while typing note
  const applyTempDraftMark = (range: Range) => {
    removeTempDraftMark()
    try {
      const mark = document.createElement("mark")
      mark.id = "temp-draft-annotation-mark"
      mark.className = "bg-amber-500/25 text-foreground border-b-2 border-amber-500 transition-all rounded-xs font-medium animate-pulse"
      
      const contents = range.extractContents()
      mark.appendChild(contents)
      range.insertNode(mark)
      tempMarkRef.current = mark
    } catch (e) {
      console.warn("Could not insert temporary draft mark:", e)
    }
  }

  // Remove temporary active mark from DOM
  const removeTempDraftMark = () => {
    const el = document.getElementById("temp-draft-annotation-mark")
    if (el && el.parentNode) {
      const fragment = document.createDocumentFragment()
      while (el.firstChild) {
        fragment.appendChild(el.firstChild)
      }
      el.parentNode.replaceChild(fragment, el)
    }
    tempMarkRef.current = null
  }

  // Highlight all stored text passages in DOM
  const highlightExisting = () => {
    const articleEl = document.getElementById("article-content")
    if (!articleEl) return

    // Apply reader private highlights
    highlights.forEach((hl) => {
      applyHighlightToDOM(articleEl, hl.text, hl.note || undefined, false, false, hl.id)
    })

    // Apply public & official creator highlights
    allPublic.forEach((pub) => {
      applyHighlightToDOM(articleEl, pub.text, pub.note || undefined, pub.isPublic, pub.isOfficial, pub.id, pub)
    })
  }

  const applyHighlightToDOM = (
    root: HTMLElement,
    textToHighlight: string,
    note?: string,
    isPublic: boolean = false,
    isOfficial: boolean = false,
    id?: string,
    fullAnnotation?: AnnotationItem
  ) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodesToReplace: { textNode: Text; parent: HTMLElement; matches: { index: number; text: string }[] }[] = []

    let node: Node | null
    while ((node = walker.nextNode())) {
      const textNode = node as Text
      const textContent = textNode.textContent || ""
      const index = textContent.indexOf(textToHighlight)

      if (index !== -1) {
        nodesToReplace.push({
          textNode,
          parent: textNode.parentElement!,
          matches: [{ index, text: textToHighlight }],
        })
      }
    }

    nodesToReplace.forEach(({ textNode, parent, matches }) => {
      const textContent = textNode.textContent || ""
      const fragment = document.createDocumentFragment()
      let lastIndex = 0

      matches.forEach(({ index, text }) => {
        if (index > lastIndex) {
          fragment.appendChild(document.createTextNode(textContent.substring(lastIndex, index)))
        }

        const mark = document.createElement("mark")

        if (isOfficial) {
          mark.className =
            "bg-amber-500/20 text-foreground cursor-pointer border-b border-amber-500 hover:bg-amber-500/30 transition-all relative group rounded-xs font-medium"
        } else if (isPublic) {
          mark.className =
            "bg-primary/20 text-foreground cursor-pointer border-b border-primary/50 hover:bg-primary/30 transition-all relative group rounded-xs"
        } else {
          mark.className =
            "bg-amber-500/15 text-foreground cursor-pointer border-b border-dashed border-amber-400/60 hover:bg-amber-500/25 transition-all relative group rounded-xs"
        }

        mark.textContent = text
        mark.setAttribute("data-highlight-text", text)
        if (id) mark.setAttribute("data-highlight-id", id)

        mark.onclick = (e) => {
          e.stopPropagation()
          const targetAnnot = fullAnnotation || {
            id: id || Math.random().toString(),
            text,
            note: note || null,
            isPublic,
            isOfficial,
            upvotesCount: 0,
            createdAt: new Date(),
            reader: {
              id: currentUserId || "anon",
              name: creatorName,
              username: "creator",
              logoUrl: null,
              subdomain: null,
            },
          }

          // Gather all annotations in the article
          const rawList: AnnotationItem[] = []
          const allMarks = document.querySelectorAll("#article-content mark[data-highlight-id]")
          allMarks.forEach((m) => {
            const hId = m.getAttribute("data-highlight-id")
            if (!hId) return

            const pubMatch = allPublic.find((p) => p.id === hId)
            if (pubMatch && !rawList.some((a) => a.id === pubMatch.id)) {
              rawList.push(pubMatch)
              return
            }

            const prvMatch = highlights.find((h) => h.id === hId)
            if (prvMatch && !rawList.some((a) => a.id === prvMatch.id)) {
              rawList.push({
                id: prvMatch.id,
                text: prvMatch.text,
                note: prvMatch.note,
                isPublic: false,
                isOfficial: false,
                upvotesCount: 0,
                createdAt: prvMatch.createdAt || new Date(),
                reader: {
                  id: currentUserId || "anon",
                  name: creatorName,
                  username: "creator",
                  logoUrl: null,
                  subdomain: null,
                },
              })
            }
          })

          if (!rawList.some((a) => a.id === targetAnnot.id)) {
            rawList.push(targetAnnot)
          }

          const articleElText = document.getElementById("article-content")?.textContent || ""

          // 🎯 LOGIQUE DE TRI DÉTERMINISTE :
          // 1. Commence le plus tôt (DOM offset)
          // 2. Finit le plus tôt
          // 3. La plus courte
          // 4. La plus ancienne puis la plus récente (createdAt ascendant)
          const sortedList = rawList.sort((a, b) => {
            const cleanA = a.text.trim()
            const cleanB = b.text.trim()

            const startA = articleElText.indexOf(cleanA)
            const startB = articleElText.indexOf(cleanB)
            const validStartA = startA !== -1 ? startA : 999999
            const validStartB = startB !== -1 ? startB : 999999

            if (validStartA !== validStartB) return validStartA - validStartB

            const endA = validStartA + cleanA.length
            const endB = validStartB + cleanB.length
            if (endA !== endB) return endA - endB

            if (cleanA.length !== cleanB.length) return cleanA.length - cleanB.length

            const dateA = new Date(a.createdAt).getTime()
            const dateB = new Date(b.createdAt).getTime()
            return dateA - dateB
          })

          setArticleAnnotations(sortedList)
          setSelectedAnnotationForDrawer(targetAnnot)
        }

        if (note) {
          mark.title = `${isOfficial ? "Annotation officielle" : isPublic ? "Annotation publique" : "Note privée"} : ${note}`
        }

        fragment.appendChild(mark)
        lastIndex = index + text.length
      })

      if (lastIndex < textContent.length) {
        fragment.appendChild(document.createTextNode(textContent.substring(lastIndex)))
      }

      parent.replaceChild(fragment, textNode)
    })
  }

  const handleInstantHighlight = async (selectedText: string, clearSelection: () => void) => {
    if (!isAuthenticated) {
      window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`
      return
    }

    setSaving(true)
    try {
      const res = await createHighlight(articleId, selectedText, undefined, false)
      if (res.success && res.highlight) {
        setHighlights((prev) => [...prev, res.highlight])
        const articleEl = document.getElementById("article-content")
        if (articleEl) {
          applyHighlightToDOM(articleEl, selectedText, undefined, false, false, res.highlight.id)
        }
        setSavedSuccess(true)
        setTimeout(() => {
          clearSelection()
          clearForm()
          window.getSelection()?.removeAllRanges()
        }, 600)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleHighlightSubmit = async (
    e: React.FormEvent,
    selectedText: string,
    clearSelection: () => void
  ) => {
    e.preventDefault()
    if (!isAuthenticated) {
      window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`
      return
    }

    const targetText = activeDraftText || selectedText

    setErrorMessage(null)
    setSaving(true)
    try {
      const res = await createHighlight(articleId, targetText, noteText || undefined, isPublicChoice)
      if (res.success && res.highlight) {
        removeTempDraftMark()
        setHighlights((prev) => [...prev, res.highlight])

        const articleEl = document.getElementById("article-content")
        if (articleEl) {
          applyHighlightToDOM(articleEl, targetText, noteText || undefined, isPublicChoice, false, res.highlight.id)
        }

        setSavedSuccess(true)
        setTimeout(() => {
          clearSelection()
          clearForm()
          window.getSelection()?.removeAllRanges()
        }, 800)
      } else if (res.error === "PUBLIC_ANNOTATIONS_DISABLED") {
        setErrorMessage("Le créateur a désactivé les annotations publiques sur cet écrit.")
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleDirectCrosspostToFeed = async (selectedText: string, clearSelection: () => void) => {
    if (!isAuthenticated) {
      window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`
      return
    }

    setSaving(true)
    try {
      const res = await quotePassageToFeedAction(articleId, selectedText)
      if (res.success) {
        setSavedSuccess(true)
        setTimeout(() => {
          clearSelection()
          clearForm()
          window.getSelection()?.removeAllRanges()
        }, 800)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <TextSelectionPopover
        containerId="article-content"
        minSelectionLength={1}
        isLocked={showNoteInput || saving}
      >
        {({ text: selectedText, range, placement, clearSelection }) => (
          /* 🍏 RAUNO FREIBERG SIGNATURE MORPHING SURFACE (Stiffness 480 / Damping 30 / Blur Crossfade) */
          <motion.div
            layout
            layoutId="rauno-morphing-surface"
            style={{
              originX: 0.5,
              originY: placement.startsWith("top") ? 1 : 0,
            }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 480, damping: 30, mass: 0.55 }
            }
            className={cn(
              "bg-popover/95 text-popover-foreground border border-border/40 backdrop-blur-2xl shadow-2xl overflow-hidden font-sans",
              showNoteInput ? "rounded-2xl w-80 p-4" : "rounded-full p-1"
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {!showNoteInput ? (
                /* STATE A: Compact Pill Toolbar (Rauno Blur/Scale Exit) */
                <motion.div
                  key="toolbar-state"
                  initial={{ opacity: 0, scale: 0.88, filter: "blur(3px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.88, filter: "blur(3px)" }}
                  transition={{ duration: 0.12 }}
                  className="flex items-center gap-1"
                >
                  {/* 1-Click Instant Highlight */}
                  <button
                    onClick={() => handleInstantHighlight(selectedText, clearSelection)}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium hover:bg-muted/70 text-foreground transition-all cursor-pointer"
                    title="Surligner ce passage"
                  >
                    <Highlighter className="w-3.5 h-3.5 text-amber-500" />
                    <span>Surligner</span>
                  </button>

                  <div className="w-px h-4 bg-border/40" />

                  {/* Add Note Trigger (Morph to State B) */}
                  <button
                    onClick={() => {
                      if (!isAuthenticated) {
                        window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`
                      } else {
                        setActiveDraftText(selectedText)
                        applyTempDraftMark(range)
                        setShowNoteInput(true)
                      }
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium hover:bg-muted/70 text-foreground transition-all cursor-pointer"
                    title="Ajouter une note ou annotation publique"
                  >
                    <Plus className="w-3.5 h-3.5 text-primary" />
                    <span>Annoter</span>
                  </button>

                  <div className="w-px h-4 bg-border/40" />

                  {/* 1-Click Feed Crosspost */}
                  <button
                    onClick={() => handleDirectCrosspostToFeed(selectedText, clearSelection)}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium hover:bg-muted/70 text-foreground transition-all cursor-pointer"
                    title="Citer ce passage sur le Feed"
                  >
                    <Share2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>Citer</span>
                  </button>
                </motion.div>
              ) : (
                /* STATE B: Expanded Note Surface (Rauno Blur/Scale Enter) */
                <motion.form
                  key="form-state"
                  initial={{ opacity: 0, scale: 0.94, filter: "blur(3px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.94, filter: "blur(3px)" }}
                  transition={{ duration: 0.14 }}
                  onSubmit={(e) => handleHighlightSubmit(e, selectedText, clearSelection)}
                  className="flex flex-col gap-3 text-left"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-foreground/80 flex items-center gap-1.5">
                      <Highlighter className="w-3.5 h-3.5 text-amber-500" />
                      <span>Nouvelle annotation</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        clearForm()
                        clearSelection()
                      }}
                      className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Passage quote preview */}
                  <div className="p-2.5 rounded-xl bg-muted/40 border border-border/20 text-xs text-foreground/90 flex items-start gap-2 max-h-20 overflow-y-auto">
                    <Quote className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="font-sans italic text-[11px] leading-relaxed line-clamp-3">
                      « {activeDraftText || selectedText} »
                    </p>
                  </div>

                  <textarea
                    autoFocus
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Écrivez votre réflexion sur ce passage..."
                    className="w-full bg-muted/40 border border-border/30 rounded-xl p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 font-sans resize-none h-20 leading-relaxed"
                  />

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border/20 text-xs">
                    <span className="text-muted-foreground text-[11px] font-medium flex items-center gap-1.5">
                      {isPublicChoice ? <Globe className="w-3.5 h-3.5 text-emerald-500" /> : <Lock className="w-3.5 h-3.5" />}
                      <span>{isPublicChoice ? "Annotation publique" : "Note privée"}</span>
                    </span>

                    <button
                      type="button"
                      disabled={!allowPublicAnnotations}
                      onClick={() => setIsPublicChoice(!isPublicChoice)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer",
                        !allowPublicAnnotations
                          ? "opacity-40 cursor-not-allowed bg-muted text-muted-foreground"
                          : isPublicChoice
                            ? "bg-emerald-500 text-white shadow-xs"
                            : "bg-muted text-foreground hover:bg-muted/80"
                      )}
                      title={!allowPublicAnnotations ? "Les annotations publiques sont désactivées par l'auteur" : "Changer la confidentialité"}
                    >
                      {isPublicChoice ? "Publique" : "Privée"}
                    </button>
                  </div>

                  {!allowPublicAnnotations && (
                    <p className="text-[10px] text-muted-foreground italic">
                      Note : Les annotations publiques sont désactivées sur cet écrit.
                    </p>
                  )}

                  {errorMessage && <p className="text-[11px] text-destructive font-medium">{errorMessage}</p>}

                  <button
                    type="submit"
                    disabled={saving || savedSuccess}
                    className={cn(
                      "w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm",
                      savedSuccess
                        ? "bg-emerald-500 text-white"
                        : "bg-primary text-primary-foreground hover:opacity-90"
                    )}
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : savedSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" /> Enregistré !
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" /> Enregistrer l'annotation
                      </>
                    )}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </TextSelectionPopover>

      {/* Side Drawer when clicking any mark */}
      <AnnotationSideDrawer
        articleId={articleId}
        annotation={selectedAnnotationForDrawer}
        allArticleAnnotations={articleAnnotations}
        creatorName={creatorName}
        allowPublicAnnotations={allowPublicAnnotations}
        isAuthenticated={isAuthenticated}
        currentUserId={currentUserId}
        mainAppUrl={mainAppUrl}
        onClose={() => {
          setSelectedAnnotationForDrawer(null)
          setArticleAnnotations([])
        }}
      />
    </>
  )
}
