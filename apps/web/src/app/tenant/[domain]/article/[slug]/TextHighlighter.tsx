"use client"

import React, { useEffect, useState, useRef } from "react"
import { createHighlight, quotePassageToFeedAction } from "./actions"
import { Highlighter, Check, Loader2, X, Plus, Globe, Lock, Share2, Sparkles } from "lucide-react"
import { cn } from "@qoe/utils"
import { AnimatePresence, motion } from "framer-motion"
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
  mainAppUrl
}: TextHighlighterProps) {
  const [highlights, setHighlights] = useState<HighlightItem[]>(initialHighlights)
  const [allPublic, setAllPublic] = useState<AnnotationItem[]>(publicHighlights)
  const [selectionRange, setSelectionRange] = useState<Range | null>(null)
  const [selectedText, setSelectedText] = useState("")
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number } | null>(null)
  
  // Note input popover states
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [isPublicChoice, setIsPublicChoice] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Drawer state for clicked highlight
  const [selectedAnnotationForDrawer, setSelectedAnnotationForDrawer] = useState<AnnotationItem | null>(null)

  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Highlight existing text on mount
    highlightExisting()

    const handleSelection = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) {
        if (!showNoteInput) clearSelection()
        return
      }

      const text = selection.toString().trim()
      if (text.length < 5) {
        if (!showNoteInput) clearSelection()
        return
      }

      // Verify selection is inside article element
      const range = selection.getRangeAt(0)
      const articleEl = document.getElementById("article-content")
      if (!articleEl || !articleEl.contains(range.commonAncestorContainer)) {
        if (!showNoteInput) clearSelection()
        return
      }

      setSelectedText(text)
      setSelectionRange(range)

      const rect = range.getBoundingClientRect()
      setPopoverCoords({
        top: rect.top + window.scrollY - 58,
        left: rect.left + window.scrollX + rect.width / 2
      })
    }

    document.addEventListener("selectionchange", handleSelection)
    return () => {
      document.removeEventListener("selectionchange", handleSelection)
    }
  }, [showNoteInput])

  const clearSelection = () => {
    setPopoverCoords(null)
    setSelectedText("")
    setSelectionRange(null)
    setShowNoteInput(false)
    setNoteText("")
    setIsPublicChoice(false)
    setSavedSuccess(false)
    setErrorMessage(null)
  }

  // Highlight all stored text passages in DOM
  const highlightExisting = () => {
    const articleEl = document.getElementById("article-content")
    if (!articleEl) return

    // Apply reader private highlights
    highlights.forEach(hl => {
      applyHighlightToDOM(articleEl, hl.text, hl.note || undefined, false, false, hl.id)
    })

    // Apply public & official creator highlights
    allPublic.forEach(pub => {
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
          matches: [{ index, text: textToHighlight }]
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
          mark.className = "bg-amber-500/20 text-foreground cursor-pointer border-b-2 border-amber-500 hover:bg-amber-500/30 transition-all relative group rounded-xs font-medium"
        } else if (isPublic) {
          mark.className = "bg-primary/20 text-foreground cursor-pointer border-b border-primary/50 hover:bg-primary/30 transition-all relative group rounded-xs"
        } else {
          mark.className = "bg-amber-500/15 text-foreground cursor-pointer border-b border-dashed border-amber-400/60 hover:bg-amber-500/25 transition-all relative group rounded-xs"
        }

        mark.textContent = text
        mark.setAttribute("data-highlight-text", text)
        if (id) mark.setAttribute("data-highlight-id", id)

        // Click on mark opens Genius Side Drawer!
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
              subdomain: null
            }
          }
          setSelectedAnnotationForDrawer(targetAnnot)
        }

        if (note) {
          mark.title = `${isOfficial ? "Annotation Officielle" : isPublic ? "Annotation Publique" : "Note Privée"} : ${note}`
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

  const handleHighlightSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!isAuthenticated) {
      window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`
      return
    }

    setErrorMessage(null)
    setSaving(true)
    try {
      const res = await createHighlight(articleId, selectedText, noteText || undefined, isPublicChoice)
      if (res.success && res.highlight) {
        setHighlights(prev => [...prev, res.highlight])
        
        const articleEl = document.getElementById("article-content")
        if (articleEl) {
          applyHighlightToDOM(articleEl, selectedText, noteText || undefined, isPublicChoice, false, res.highlight.id)
        }
        
        setSavedSuccess(true)
        setTimeout(() => {
          clearSelection()
          window.getSelection()?.removeAllRanges()
        }, 1000)
      } else if (res.error === "PUBLIC_ANNOTATIONS_DISABLED") {
        setErrorMessage("Le créateur a désactivé les annotations publiques sur cet écrit.")
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleDirectCrosspostToFeed = async () => {
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
          window.getSelection()?.removeAllRanges()
        }, 1000)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {popoverCoords && (
        <div
          ref={popoverRef}
          style={{
            position: "absolute",
            top: `${popoverCoords.top}px`,
            left: `${popoverCoords.left}px`,
            transform: "translateX(-50%)",
          }}
          className="z-50 pointer-events-auto font-sans"
        >
          <AnimatePresence>
            {!showNoteInput ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.8, opacity: 0, y: 10 }}
                className="flex items-center gap-1.5 p-1 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border border-zinc-800 dark:border-zinc-200 rounded-full shadow-2xl"
              >
                <button
                  onClick={() => {
                    if (!isAuthenticated) {
                      window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`
                    } else {
                      setShowNoteInput(true)
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  <Highlighter className="w-3.5 h-3.5" />
                  <span>Annoter</span>
                </button>

                <div className="w-[1px] h-4 bg-zinc-800 dark:bg-zinc-200" />

                <button
                  onClick={handleDirectCrosspostToFeed}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors cursor-pointer text-amber-400 dark:text-amber-600"
                  title="Citer ce passage sur le Feed"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Citer</span>
                </button>
              </motion.div>
            ) : (
              <motion.form
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                onSubmit={handleHighlightSubmit}
                className="bg-card border border-border/40 shadow-2xl rounded-2xl p-3.5 flex flex-col gap-3 w-72 text-left"
              >
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Nouvelle Annotation
                  </span>
                  <button 
                    type="button" 
                    onClick={clearSelection} 
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Textarea */}
                <textarea
                  autoFocus
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Écrivez votre réflexion sur ce passage..."
                  className="w-full bg-background border border-border/40 rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none h-16 leading-relaxed font-sans"
                />

                {/* Privacy Choice (Private vs Public Genius) */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-muted/30 border border-border/30 text-xs">
                  <span className="text-muted-foreground text-[11px] font-medium flex items-center gap-1">
                    {isPublicChoice ? <Globe className="w-3 h-3 text-emerald-500" /> : <Lock className="w-3 h-3" />}
                    <span>{isPublicChoice ? "Annotation Publique" : "Note Privée"}</span>
                  </span>

                  <button
                    type="button"
                    disabled={!allowPublicAnnotations}
                    onClick={() => setIsPublicChoice(!isPublicChoice)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer",
                      !allowPublicAnnotations
                        ? "opacity-40 cursor-not-allowed bg-muted text-muted-foreground"
                        : isPublicChoice
                          ? "bg-emerald-500 text-white"
                          : "bg-muted text-foreground hover:bg-muted/80"
                    )}
                    title={!allowPublicAnnotations ? "Le créateur a désactivé les annotations publiques" : "Changer la confidentialité"}
                  >
                    {isPublicChoice ? "Publique" : "Privée"}
                  </button>
                </div>

                {!allowPublicAnnotations && (
                  <p className="text-[10px] text-muted-foreground italic">
                    Note : Les annotations publiques sont désactivées par l'auteur sur cet écrit.
                  </p>
                )}

                {errorMessage && (
                  <p className="text-[11px] text-destructive font-medium">
                    {errorMessage}
                  </p>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={saving || savedSuccess}
                  className={cn(
                    "w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-white shadow-xs",
                    savedSuccess 
                      ? "bg-emerald-500"
                      : "bg-primary hover:opacity-90"
                  )}
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : savedSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Enregistré !
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
        </div>
      )}

      {/* Genius Right Slide-Over Side Drawer when clicking any mark */}
      <AnnotationSideDrawer
        articleId={articleId}
        annotation={selectedAnnotationForDrawer}
        creatorName={creatorName}
        allowPublicAnnotations={allowPublicAnnotations}
        isAuthenticated={isAuthenticated}
        currentUserId={currentUserId}
        mainAppUrl={mainAppUrl}
        onClose={() => setSelectedAnnotationForDrawer(null)}
      />
    </>
  )
}
