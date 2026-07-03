"use client"

import React, { useState, useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search, ChevronRight, FileText, Users, Mail, PieChart, Settings, Plus, Command } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@qoe/utils"

const segmentMap: Record<string, string> = {
  articles: "Écrits",
  new: "Nouveau",
  audience: "Audience",
  newsletters: "Newsletters",
  analytics: "Analyses",
  settings: "Réglages",
}

export function HeaderClient() {
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const dialogRef = useRef<HTMLDialogElement>(null)

  // 1. Dynamic Breadcrumbs parsing
  const getBreadcrumbs = () => {
    const segments = pathname.split("/").filter(Boolean)
    if (segments.length === 0) {
      return [{ label: "Console", href: "/" }, { label: "Aperçu", href: "/" }]
    }

    const list = [{ label: "Console", href: "/" }]
    let currentHref = ""

    segments.forEach((segment) => {
      currentHref += `/${segment}`
      const mapped = segmentMap[segment]
      
      // Handle IDs or sub-routes dynamically
      if (mapped) {
        list.push({ label: mapped, href: currentHref })
      } else if (segment.length > 8) {
        // Looks like a database ID (UUID or similar), map to "Détails"
        list.push({ label: "Détails", href: currentHref })
      } else {
        // Uppercase first letter fallback
        const formatted = segment.charAt(0).toUpperCase() + segment.slice(1)
        list.push({ label: formatted, href: currentHref })
      }
    })

    return list
  }

  const breadcrumbs = getBreadcrumbs()

  // 2. Keyboard shortcut Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // 3. Dialog Modal state sync
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      dialog.showModal()
      setQuery("")
    } else {
      dialog.close()
    }
  }, [isOpen])

  const closeDialog = () => {
    setIsOpen(false)
  }

  const handleAction = (href: string) => {
    router.push(href)
    closeDialog()
  }

  // Quick navigation items in search palette
  const quickActions = [
    { label: "Rédiger un article", href: "/articles/new", icon: Plus, category: "Actions" },
    { label: "Liste des écrits", href: "/articles", icon: FileText, category: "Navigation" },
    { label: "Gérer l'audience", href: "/audience", icon: Users, category: "Navigation" },
    { label: "Envoyer une newsletter", href: "/newsletters", icon: Mail, category: "Actions" },
    { label: "Consulter les statistiques", href: "/analytics", icon: PieChart, category: "Navigation" },
    { label: "Réglages de la console", href: "/settings", icon: Settings, category: "Paramètres" },
  ]

  const filteredActions = quickActions.filter((action) =>
    action.label.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-zinc-100 bg-white/80 px-4 backdrop-blur-md select-none dark:border-zinc-800/40 dark:bg-zinc-950/80">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors" />
          
          <span className="text-zinc-300 dark:text-zinc-700 mx-1">|</span>

          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 font-sans text-xs" aria-label="Fil d'Ariane">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1
              return (
                <React.Fragment key={crumb.href + idx}>
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-650 shrink-0" strokeWidth={1.5} />}
                  <span
                    onClick={() => !isLast && handleAction(crumb.href)}
                    className={cn(
                      "transition-colors duration-200",
                      isLast
                        ? "text-zinc-850 font-semibold cursor-default dark:text-zinc-200"
                        : "text-zinc-400 hover:text-zinc-950 cursor-pointer dark:hover:text-zinc-50"
                    )}
                  >
                    {crumb.label}
                  </span>
                </React.Fragment>
              )
            })}
          </nav>
        </div>

        {/* Global Search Button Trigger */}
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-3 font-sans text-xs text-zinc-400 bg-zinc-50 border border-zinc-200/60 rounded-lg py-1.5 px-3 hover:bg-zinc-100 hover:text-zinc-700 hover:border-zinc-300/80 transition-all duration-200 cursor-pointer dark:bg-zinc-900/40 dark:border-zinc-800/40 dark:text-zinc-500 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
        >
          <div className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
            <span>Rechercher...</span>
          </div>
          <div className="flex items-center gap-0.5 border border-zinc-200/80 bg-white shadow-[0_1px_1px_rgba(0,0,0,0.02)] text-[10px] px-1 rounded font-semibold text-zinc-400 select-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">
            <Command className="w-2.5 h-2.5 shrink-0" strokeWidth={1.5} />
            <span>K</span>
          </div>
        </button>
      </header>

      {/* Cmd+K Search Dialog overlay */}
      <dialog
        ref={dialogRef}
        onClose={closeDialog}
        onClick={(e) => e.target === dialogRef.current && closeDialog()}
        className="fixed inset-0 m-auto w-full max-w-lg rounded-xl border border-zinc-200/80 bg-white/95 backdrop-blur-xl shadow-2xl p-0 focus:outline-none dark:border-zinc-800/80 dark:bg-zinc-900/95 overflow-hidden animate-in fade-in zoom-in-95 duration-200 backdrop:bg-zinc-950/20 dark:backdrop:bg-zinc-950/40"
      >
        <div className="flex flex-col h-full font-sans">
          {/* Header Search Field */}
          <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800/65">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" strokeWidth={1.5} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher des écrits, réglages, actions..."
              className="flex-1 text-sm bg-transparent border-none outline-none text-zinc-850 placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              autoFocus
            />
            <button
              onClick={closeDialog}
              className="text-[10px] font-sans font-semibold border border-zinc-200 rounded px-1.5 py-0.5 text-zinc-400 bg-zinc-50 hover:bg-zinc-100 transition-colors dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500"
            >
              Échap
            </button>
          </div>

          {/* Results List */}
          <div className="max-h-[300px] overflow-y-auto p-2">
            {filteredActions.length === 0 ? (
              <div className="text-center py-8 text-zinc-450 text-xs dark:text-zinc-550">
                Aucun résultat pour &ldquo;{query}&rdquo;
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-bold text-zinc-400/80 dark:text-zinc-500/80">
                  Raccourcis de la console
                </div>
                {filteredActions.map((action, idx) => {
                  const Icon = action.icon
                  return (
                    <button
                      key={action.href + idx}
                      onClick={() => handleAction(action.href)}
                      className="w-full flex items-center justify-between text-left p-2.5 rounded-lg hover:bg-zinc-100/85 transition-colors cursor-pointer dark:hover:bg-zinc-800/60"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-md bg-zinc-50 flex items-center justify-center border border-zinc-150 dark:bg-zinc-900 dark:border-zinc-800">
                          <Icon className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" strokeWidth={1.5} />
                        </div>
                        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          {action.label}
                        </span>
                      </div>
                      <span className="text-[9px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-medium dark:bg-zinc-800 dark:text-zinc-400">
                        {action.category}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer Navigation Hints */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50/50 border-t border-zinc-100 text-[10px] text-zinc-400 select-none dark:bg-zinc-950/30 dark:border-zinc-800/40 dark:text-zinc-500">
            <span>Sélectionner avec <kbd className="border border-zinc-200 rounded px-1 dark:border-zinc-800">Entrée</kbd></span>
            <span>Naviguer avec la souris ou clavier</span>
          </div>
        </div>
      </dialog>
    </>
  )
}
