"use client"

import React, { useEffect, useState, useRef } from "react"
import { Highlighter, Check, Loader2, X, Plus, Globe, Lock, Share2, Quote, Eye, EyeOff, Sparkles } from "lucide-react"
import { cn } from "@qoe/utils"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { TextSelectionPopover } from "./TextSelectionPopover"
import { AnnotationSideDrawer } from "./AnnotationSideDrawer"
import { toast } from "sonner"
import {
  AnnotationFilterMode,
  AnnotationItem,
  HighlightItem,
  TextHighlighterProps,
  MARK_STYLE_CLASSES
} from "./types"

export type { AnnotationFilterMode }

export function TextHighlighter({
  articleId,
  creatorName,
  allowPublicAnnotations,
  isAuthenticated,
  initialHighlights,
  publicHighlights = [],
  currentUserId,
  currentUserProfile,
  articleAuthorId,
  mainAppUrl,
  containerId = "article-content",
  callbacks,
  onRequireAuth,
}: TextHighlighterProps) {
  const defaultReader = {
    id: currentUserId || "anon",
    name: currentUserProfile?.name || currentUserProfile?.username || "Lecteur",
    username: currentUserProfile?.username || "lecteur",
    logoUrl: currentUserProfile?.logoUrl || null,
    subdomain: null,
  }

  const [highlights, setHighlights] = useState<HighlightItem[]>(initialHighlights as HighlightItem[])
  const [allPublic, setAllPublic] = useState<AnnotationItem[]>(publicHighlights)

  useEffect(() => {
    setHighlights(initialHighlights as HighlightItem[])
  }, [initialHighlights])

  useEffect(() => {
    setAllPublic(publicHighlights)
  }, [publicHighlights])

  // Universal Reader Annotation Filter Mode (persisted across all tenants in localStorage)
  const [filterMode, setFilterMode] = useState<AnnotationFilterMode>("all")

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

  // Load persisted reader filter mode on mount
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem("qoe_annotation_filter_mode") as AnnotationFilterMode | null
      if (savedMode && ["all", "official", "none"].includes(savedMode)) {
        setFilterMode(savedMode)
      }
    } catch {
      // Ignore localStorage access restrictions
    }
  }, [])

  // Attach interactivity to HTML-embedded <mark data-annotation-note="..."> author marks
  const setupHtmlMarksInDOM = () => {
    const articleEl = document.getElementById(containerId)
    if (!articleEl) return

    const htmlMarks = articleEl.querySelectorAll("mark[data-annotation-note]")
    htmlMarks.forEach((mark, index) => {
      const note = mark.getAttribute("data-annotation-note") || ""
      const text = mark.textContent || ""
      const existingId = mark.getAttribute("data-highlight-id")
      const generatedId = existingId || `official-html-mark-${index}`

      mark.setAttribute("data-highlight-id", generatedId)
      mark.className = MARK_STYLE_CLASSES.official

      const officialAnnot: AnnotationItem = {
        id: generatedId,
        text,
        note,
        isPublic: true,
        isOfficial: true,
        upvotesCount: 0,
        createdAt: new Date().toISOString(),
        reader: {
          id: "creator",
          name: creatorName,
          username: "creator",
          logoUrl: null,
          subdomain: null,
        },
      }

      setAllPublic((prev) => {
        if (!prev.some((p) => p.id === generatedId || (p.isOfficial && p.text === text))) {
          return [...prev, officialAnnot]
        }
        return prev
      })

      ;(mark as HTMLElement).onclick = (e) => {
        e.stopPropagation()
        setSelectedAnnotationForDrawer(officialAnnot)
      }
    })
  }

  // Re-apply DOM highlights whenever highlights list, public list, or filterMode changes
  useEffect(() => {
    removeAllMarksFromDOM()
    setupHtmlMarksInDOM()
    if (filterMode !== "none") {
      highlightExisting()
    }
  }, [highlights, allPublic, filterMode, containerId])

  const changeFilterMode = (mode: AnnotationFilterMode) => {
    setFilterMode(mode)
    try {
      localStorage.setItem("qoe_annotation_filter_mode", mode)
    } catch {
      // Ignore localStorage write restriction
    }
  }

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

  // Strip all rendered highlights from DOM cleanly
  const removeAllMarksFromDOM = () => {
    const articleEl = document.getElementById(containerId)
    if (!articleEl) return

    const marks = articleEl.querySelectorAll("mark[data-highlight-id]")
    marks.forEach((mark) => {
      const parent = mark.parentNode
      if (parent) {
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark)
        }
        parent.removeChild(mark)
      }
    })
    // 🌟 Merge adjacent text nodes after unwrapping marks so indexOf string matching stays 100% reliable
    articleEl.normalize()
  }

  // Highlight stored text passages in DOM based on active reader filterMode
  const highlightExisting = () => {
    const articleEl = document.getElementById(containerId)
    if (!articleEl) return

    // Ensure DOM text nodes are normalized before scanning
    articleEl.normalize()

    if (filterMode === "official") {
      // Render ONLY official creator highlights
      allPublic
        .filter((pub) => pub.isOfficial)
        .forEach((pub) => {
          applyHighlightToDOM(articleEl, pub.text, pub.note || undefined, pub.isPublic, pub.isOfficial, pub.id, pub)
        })
      return
    }

    // Render all (private + public + official)
    // 1. Reader private highlights
    highlights.forEach((hl) => {
      applyHighlightToDOM(articleEl, hl.text, hl.note || undefined, false, false, hl.id)
    })

    // 2. Public & official creator highlights
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
    if (!textToHighlight || !textToHighlight.trim()) return

    root.normalize()

    const targetText = textToHighlight.trim()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodesToReplace: { textNode: Text; parent: HTMLElement; matches: { index: number; text: string }[] }[] = []

    let node: Node | null
    while ((node = walker.nextNode())) {
      const textNode = node as Text
      const textContent = textNode.textContent || ""
      const index = textContent.indexOf(targetText)

      if (index !== -1) {
        nodesToReplace.push({
          textNode,
          parent: textNode.parentElement!,
          matches: [{ index, text: targetText }],
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
          mark.className = MARK_STYLE_CLASSES.official
        } else if (isPublic) {
          mark.className = MARK_STYLE_CLASSES.public
        } else {
          mark.className = MARK_STYLE_CLASSES.private
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
            reader: defaultReader,
          }

          // Gather all annotations in the article
          const rawList: AnnotationItem[] = []
          const allMarks = document.querySelectorAll(`#${containerId} mark[data-highlight-id]`)
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
                reader: defaultReader,
              })
            }
          })

          if (!rawList.some((a) => a.id === targetAnnot.id)) {
            rawList.push(targetAnnot)
          }

          const articleElText = document.getElementById(containerId)?.textContent || ""

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

  const handleLoginRedirect = () => {
    if (onRequireAuth) {
      onRequireAuth()
    } else if (callbacks?.onLoginRedirect) {
      callbacks.onLoginRedirect()
    } else if (mainAppUrl) {
      window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`
    }
  }

  const handleInstantHighlight = async (selectedText: string, clearSelection: () => void) => {
    if (!isAuthenticated) {
      handleLoginRedirect()
      return
    }

    setSaving(true)
    try {
      const res = callbacks?.onHighlightCreate
        ? await callbacks.onHighlightCreate({ articleId, text: selectedText, note: null, isPublic: false })
        : { ok: true, data: { id: `hl-${Date.now()}`, text: selectedText, note: null } }

      if (res?.ok && res.data) {
        setHighlights((prev) => [...prev, res.data])
        const articleEl = document.getElementById(containerId)
        if (articleEl) {
          applyHighlightToDOM(articleEl, selectedText, undefined, false, false, res.data.id)
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
      handleLoginRedirect()
      return
    }

    const targetText = activeDraftText || selectedText

    setErrorMessage(null)
    setSaving(true)
    try {
      const res = callbacks?.onHighlightCreate
        ? await callbacks.onHighlightCreate({ articleId, text: targetText, note: noteText || null, isPublic: isPublicChoice })
        : { ok: true, data: { id: `hl-${Date.now()}`, text: targetText, note: noteText || null, reader: defaultReader } }

      if (res?.ok && res.data) {
        removeTempDraftMark()

        // 🌟 Ensure public highlight is in BOTH allPublic and highlights state so it NEVER disappears for author or readers!
        const createdItem: AnnotationItem = {
          id: res.data.id,
          text: targetText,
          note: noteText || null,
          isPublic: isPublicChoice,
          isOfficial: false,
          upvotesCount: 0,
          createdAt: new Date().toISOString(),
          reader: res.data.reader || defaultReader,
        }

        if (isPublicChoice) {
          setAllPublic((prev) => [...prev, createdItem])
        }
        setHighlights((prev) => [...prev, res.data])

        setSavedSuccess(true)
        setTimeout(() => {
          clearSelection()
          clearForm()
          window.getSelection()?.removeAllRanges()
        }, 800)
      } else if (res && !res.ok && res.error?.code === "PUBLIC_ANNOTATIONS_DISABLED") {
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
      handleLoginRedirect()
      return
    }

    setSaving(true)
    try {
      const res = callbacks?.onCrosspost
        ? await callbacks.onCrosspost({ articleId, text: selectedText })
        : { ok: true }

      if (res?.ok) {
        setSavedSuccess(true)
        toast.success("Passage cité avec succès sur le Feed !")
        setTimeout(() => {
          clearSelection()
          clearForm()
          window.getSelection()?.removeAllRanges()
        }, 1000)
      } else {
        toast.error("Impossible de citer ce passage")
      }
    } catch (e) {
      console.error(e)
      toast.error("Une erreur est survenue")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* 🌍 UNIVERSAL TENANT ANNOTATION READER FILTER BAR */}
      <div className="my-4 flex items-center justify-between border-b border-border/20 pb-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
          <span>Affichage des annotations :</span>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-full bg-muted/50 border border-border/20 text-xs font-sans">
          <button
            onClick={() => changeFilterMode("all")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer",
              filterMode === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Afficher toutes les annotations (publiques, officielles et privées)"
          >
            Toutes
          </button>

          <button
            onClick={() => changeFilterMode("official")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1",
              filterMode === "official"
                ? "bg-amber-500 text-white shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Afficher uniquement les annotations officielles de l'auteur"
          >
            <Sparkles className="w-3 h-3" />
            <span>Officielles</span>
          </button>

          <button
            onClick={() => changeFilterMode("none")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1",
              filterMode === "none"
                ? "bg-muted text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Masquer toutes les annotations pour une lecture épurée sans interruption"
          >
            <EyeOff className="w-3 h-3" />
            <span>Aucune</span>
          </button>
        </div>
      </div>

      <TextSelectionPopover
        containerId={containerId}
        minSelectionLength={1}
        isLocked={showNoteInput || saving}
      >
        {({ text: selectedText, range, placement, clearSelection }) => (
          /* 🍏 RAUNO FREIBERG SIGNATURE MORPHING SURFACE */
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
                : { type: "spring", stiffness: 500, damping: 32 }
            }
            className={cn(
              "bg-popover text-popover-foreground border border-border/30 backdrop-blur-2xl shadow-2xl overflow-hidden font-sans",
              showNoteInput ? "rounded-2xl w-80 sm:w-84 p-4 space-y-3" : "rounded-full p-1"
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {!showNoteInput ? (
                /* STATE A: Compact Pill Toolbar */
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
                    <Highlighter className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
                    <span>Surligner</span>
                  </button>

                  <div className="w-px h-4 bg-border/40" />

                  {/* Add Note Trigger (Morph to State B) */}
                  <button
                    onClick={() => {
                      if (!isAuthenticated) {
                        handleLoginRedirect()
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
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium hover:bg-muted/70 text-foreground transition-all cursor-pointer disabled:opacity-50"
                    title="Citer ce passage sur le Feed"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                        <span className="text-muted-foreground">Publication...</span>
                      </>
                    ) : savedSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-500 font-semibold">Cité !</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5 text-amber-500" />
                        <span>Citer</span>
                      </>
                    )}
                  </button>
                </motion.div>
              ) : (
                /* STATE B: Expanded Card with Unified Quoted Block & Separator */
                <motion.form
                  key="form-state"
                  initial={{ opacity: 0, scale: 0.94, filter: "blur(3px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.94, filter: "blur(3px)" }}
                  transition={{ duration: 0.14 }}
                  onSubmit={(e) => handleHighlightSubmit(e, selectedText, clearSelection)}
                  className="flex flex-col gap-3 text-left"
                >
                  {/* Header: Centered Title + Pencil SVG with Gomme Separation Line */}
                  <div className="flex items-center justify-between">
                    <div className="w-6 h-6" /> {/* Left spacer */}
                    
                    <span className="text-sm font-semibold text-foreground flex items-center justify-center gap-2">
                      <svg
                        className="w-4 h-4 text-foreground shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {/* Pencil body filled */}
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" fill="currentColor" fillOpacity="0.25" />
                        {/* Distinct Eraser / Gomme separation line */}
                        <line x1="15" y1="5" x2="19" y2="9" stroke="currentColor" strokeWidth="2" />
                      </svg>
                      <span>Nouvelle annotation</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        clearForm()
                        clearSelection()
                      }}
                      className="w-6 h-6 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Single Unified Card: Quoted Block + Capillary Line + Textarea */}
                  <div className="rounded-2xl border border-border/30 bg-gradient-to-b from-muted/60 via-muted/20 to-transparent overflow-hidden shadow-xs">
                    {/* Top Quoted Passage */}
                    <div className="p-3 text-xs text-foreground/90 flex items-center gap-2.5">
                      <Quote className="w-4 h-4 fill-muted-foreground/30 text-muted-foreground shrink-0" />
                      <p className="font-sans italic text-xs font-medium truncate text-foreground/90">
                        “ "{activeDraftText || selectedText}" ”
                      </p>
                    </div>

                    {/* Ultra-subtle Capillary Line Separator */}
                    <div className="w-full h-px bg-border/25" />

                    {/* Bottom Textarea Input */}
                    <textarea
                      autoFocus
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Écrivez votre réflexion sur ce passage..."
                      className="w-full bg-transparent p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none font-sans resize-none h-20 leading-relaxed border-none"
                    />
                  </div>

                  {/* Apple-Style Segmented Pill Control with Sliding Active Background */}
                  <div className="p-1 rounded-full bg-muted/60 border border-border/20 flex items-center relative select-none">
                    <button
                      type="button"
                      onClick={() => setIsPublicChoice(false)}
                      className={cn(
                        "relative z-10 flex-1 py-1.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer",
                        !isPublicChoice ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span>Privée</span>
                      <Lock className="w-3.5 h-3.5" />
                      {!isPublicChoice && (
                        <motion.div
                          layoutId="privacy-pill-indicator"
                          className="absolute inset-0 bg-primary rounded-full shadow-xs -z-10"
                          transition={{ type: "spring", stiffness: 450, damping: 32 }}
                        />
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={!allowPublicAnnotations}
                      onClick={() => setIsPublicChoice(true)}
                      className={cn(
                        "relative z-10 flex-1 py-1.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer",
                        !allowPublicAnnotations && "opacity-40 cursor-not-allowed",
                        isPublicChoice ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                      title={!allowPublicAnnotations ? "Les annotations publiques sont désactivées par l'auteur" : "Annotation publique"}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Publique</span>
                      {isPublicChoice && (
                        <motion.div
                          layoutId="privacy-pill-indicator"
                          className="absolute inset-0 bg-primary rounded-full shadow-xs -z-10"
                          transition={{ type: "spring", stiffness: 450, damping: 32 }}
                        />
                      )}
                    </button>
                  </div>

                  {!allowPublicAnnotations && (
                    <p className="text-[10px] text-muted-foreground italic text-center">
                      Les annotations publiques sont désactivées par l'auteur.
                    </p>
                  )}

                  {errorMessage && <p className="text-[11px] text-destructive font-medium text-center">{errorMessage}</p>}

                  {/* Primary Action Button */}
                  <button
                    type="submit"
                    disabled={saving || savedSuccess}
                    className={cn(
                      "w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs",
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
        articleAuthorId={articleAuthorId}
        mainAppUrl={mainAppUrl}
        callbacks={callbacks}
        onRequireAuth={onRequireAuth}
        onClose={() => {
          setSelectedAnnotationForDrawer(null)
          setArticleAnnotations([])
        }}
        onUpdateAnnotation={(updated) => {
          setAllPublic((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
          setHighlights((prev) =>
            prev.map((h) =>
              h.id === updated.id
                ? { ...h, note: updated.note ?? null, isPublic: updated.isPublic }
                : h
            )
          )
          setSelectedAnnotationForDrawer(updated)
        }}
        onDeleteAnnotation={(deletedId) => {
          setAllPublic((prev) => prev.filter((a) => a.id !== deletedId))
          setHighlights((prev) => prev.filter((h) => h.id !== deletedId))
          const marks = document.querySelectorAll(`mark[data-highlight-id="${deletedId}"]`)
          marks.forEach((mark) => {
            const parent = mark.parentNode
            if (parent) {
              while (mark.firstChild) {
                parent.insertBefore(mark.firstChild, mark)
              }
              parent.removeChild(mark)
            }
          })
          setSelectedAnnotationForDrawer(null)
        }}
      />
    </>
  )
}
