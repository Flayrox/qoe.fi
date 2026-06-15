"use client"

import React, { useEffect, useState, useRef } from "react"
import { createHighlight } from "./actions"
import { Highlighter, Check, Loader2, X, Plus } from "lucide-react"
import { cn } from "@qoe/utils"
import { AnimatePresence, motion } from "framer-motion"

interface HighlightItem {
  id: string;
  text: string;
  note: string | null;
}

interface TextHighlighterProps {
  articleId: string;
  isAuthenticated: boolean;
  initialHighlights: HighlightItem[];
  mainAppUrl: string;
}

export function TextHighlighter({
  articleId,
  isAuthenticated,
  initialHighlights,
  mainAppUrl
}: TextHighlighterProps) {
  const [highlights, setHighlights] = useState<HighlightItem[]>(initialHighlights)
  const [selectionRange, setSelectionRange] = useState<Range | null>(null)
  const [selectedText, setSelectedText] = useState("")
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number } | null>(null)
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Highlight existing text on mount
    highlightExisting()

    const handleSelection = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) {
        // Only clear if we aren't currently typing in the note input
        if (!showNoteInput) {
          clearSelection()
        }
        return
      }

      const text = selection.toString().trim()
      if (text.length < 5) {
        if (!showNoteInput) clearSelection()
        return
      }

      // Verify the selection is inside the article element
      const range = selection.getRangeAt(0)
      const articleEl = document.getElementById("article-content")
      if (!articleEl || !articleEl.contains(range.commonAncestorContainer)) {
        if (!showNoteInput) clearSelection()
        return
      }

      setSelectedText(text)
      setSelectionRange(range)

      // Calculate coordinates to position the popover above the selected text
      const rect = range.getBoundingClientRect()
      setPopoverCoords({
        top: rect.top + window.scrollY - 54, // Position above the text
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
    setSavedSuccess(false)
  }

  // Highlight all stored text passages in the article DOM
  const highlightExisting = () => {
    const articleEl = document.getElementById("article-content")
    if (!articleEl) return

    highlights.forEach(hl => {
      applyHighlightToDOM(articleEl, hl.text, hl.note || undefined)
    })
  }

  const applyHighlightToDOM = (root: HTMLElement, textToHighlight: string, note?: string) => {
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
        // Pre-match text
        if (index > lastIndex) {
          fragment.appendChild(document.createTextNode(textContent.substring(lastIndex, index)))
        }

        // Highlight element
        const mark = document.createElement("mark")
        mark.className = "bg-amber-500/20 text-foreground cursor-pointer border-b border-amber-400/50 hover:bg-amber-500/30 transition-colors relative group rounded-sm"
        mark.textContent = text
        if (note) {
          mark.title = `Votre note : ${note}`
          
          // Add a little note indicator dot
          const dot = document.createElement("span")
          dot.className = "absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full border border-white dark:border-zinc-950 scale-0 group-hover:scale-100 transition-transform duration-200"
          mark.appendChild(dot)
        }

        fragment.appendChild(mark)
        lastIndex = index + text.length
      })

      // Post-match text
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

    setSaving(true)
    try {
      const res = await createHighlight(articleId, selectedText, noteText || undefined)
      if (res.success && res.highlight) {
        setHighlights(prev => [...prev, res.highlight])
        
        // Highlight dynamically
        const articleEl = document.getElementById("article-content")
        if (articleEl) {
          applyHighlightToDOM(articleEl, selectedText, noteText || undefined)
        }
        
        setSavedSuccess(true)
        setTimeout(() => {
          clearSelection()
          // Clear active browser selection
          window.getSelection()?.removeAllRanges()
        }, 1200)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  if (!popoverCoords) return null

  return (
    <div
      ref={popoverRef}
      style={{
        position: "absolute",
        top: `${popoverCoords.top}px`,
        left: `${popoverCoords.left}px`,
        transform: "translateX(-50%)",
      }}
      className="z-50 pointer-events-auto"
    >
      <AnimatePresence>
        {!showNoteInput ? (
          <motion.button
            initial={{ scale: 0.8, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 10 }}
            onClick={() => {
              if (!isAuthenticated) {
                window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`
              } else {
                setShowNoteInput(true)
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border border-zinc-800 dark:border-zinc-200 rounded-full text-xs font-bold shadow-2xl hover:scale-105 transition-all cursor-pointer"
          >
            <Highlighter className="w-3.5 h-3.5" />
            <span>Surligner</span>
          </motion.button>
        ) : (
          <motion.form
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            onSubmit={handleHighlightSubmit}
            className="bg-white dark:bg-zinc-900 border border-neutral-200 dark:border-zinc-800 shadow-2xl rounded-2xl p-3 flex flex-col gap-2.5 w-64 text-left"
          >
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Ajouter une note</span>
              <button 
                type="button" 
                onClick={clearSelection} 
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <textarea
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Écrivez une réflexion sur ce passage..."
              className="w-full bg-neutral-50 dark:bg-zinc-950 border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#EE4B2B] resize-none h-16 leading-relaxed"
            />
            
            <button
              type="submit"
              disabled={saving || savedSuccess}
              className={cn(
                "w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-white",
                savedSuccess 
                  ? "bg-emerald-500"
                  : "bg-[#EE4B2B] hover:bg-[#d63d20]"
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
                  <Plus className="w-3.5 h-3.5" /> Enregistrer la note
                </>
              )}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}
