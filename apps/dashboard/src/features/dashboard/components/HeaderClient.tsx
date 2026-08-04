"use client"

import React, { useState, useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Search, ChevronRight, FileText, Users, Mail, PieChart, Settings, Plus, Command } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@qoe/utils"
import { toast } from "sonner"

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
  const searchParams = useSearchParams()
  const alreadyOnboarded = searchParams.get("already_onboarded")
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Check for already_onboarded query parameter to show toast
  useEffect(() => {
    if (alreadyOnboarded === "true") {
      toast.error("Tu es déjà créateur, tu ne peux pas recommencer l'onboarding !")
      // Clear parameter from URL cleanly without reload
      const newUrl = window.location.pathname
      window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, "", newUrl)
    }
  }, [alreadyOnboarded])

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
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center bg-background/80 px-6 backdrop-blur-md select-none font-sans">
        <div className="w-full max-w-7xl flex items-center justify-between">
          {/* Left: Search Bar (w-96, élargie, alignée) */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsOpen(true)}
              className="w-80 md:w-96 flex items-center justify-between font-sans text-xs text-muted-foreground/80 bg-muted/50 border border-transparent rounded-lg py-1.5 px-3.5 hover:bg-muted hover:text-foreground transition-all duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Search className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.5} />
                <span className="text-[13px] font-normal">Rechercher...</span>
              </div>
              <div className="flex items-center gap-0.5 border border-border/30 bg-background/60 text-[10px] px-1.5 py-0.5 rounded font-medium text-muted-foreground select-none">
                <Command className="w-2.5 h-2.5 shrink-0" strokeWidth={1.5} />
                <span>K</span>
              </div>
            </button>
          </div>

          {/* Right: Writer, Creator, Advanced Navigation Links (Alignés sur le bord max-w-7xl) */}
          <div className="flex items-center gap-6 font-sans text-xs font-semibold">
            <nav className="hidden lg:flex items-center gap-6">
              <button
                onClick={() => handleAction("/")}
                className="text-primary border-b-2 border-primary py-1.5 transition-colors cursor-pointer"
              >
                Writer
              </button>
              <span className="text-muted-foreground/50 py-1.5 cursor-not-allowed opacity-60" title="Prochainement">
                Creator
              </span>
              <span className="text-muted-foreground/50 py-1.5 cursor-not-allowed opacity-60" title="Prochainement">
                Advanced
              </span>
            </nav>
          </div>
        </div>
      </header>

      {/* Cmd+K Search Dialog overlay */}
      <dialog
        ref={dialogRef}
        onClose={closeDialog}
        onClick={(e) => e.target === dialogRef.current && closeDialog()}
        className="fixed inset-0 m-auto w-full max-w-lg rounded-xl border border-border bg-popover/95 backdrop-blur-xl shadow-2xl p-0 focus:outline-none overflow-hidden animate-in fade-in zoom-in-95 duration-200 backdrop:bg-background/25"
      >
        <div className="flex flex-col h-full font-sans">
          {/* Header Search Field */}
          <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher des écrits, réglages, actions..."
              className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60"
              autoFocus
            />
            <button
              onClick={closeDialog}
              className="text-[10px] font-sans font-semibold border border-border rounded px-1.5 py-0.5 text-muted-foreground bg-muted hover:bg-muted/80 transition-colors"
            >
              Échap
            </button>
          </div>

          {/* Results List */}
          <div className="max-h-[300px] overflow-y-auto p-2">
            {filteredActions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                Aucun résultat pour &ldquo;{query}&rdquo;
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground/80">
                  Raccourcis de la console
                </div>
                {filteredActions.map((action, idx) => {
                  const Icon = action.icon
                  return (
                    <button
                      key={action.href + idx}
                      onClick={() => handleAction(action.href)}
                      className="w-full flex items-center justify-between text-left p-2.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center border border-border">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
                        </div>
                        <span className="text-xs font-medium text-foreground/90">
                          {action.label}
                        </span>
                      </div>
                      <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                        {action.category}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer Navigation Hints */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-t border-border text-[10px] text-muted-foreground select-none">
            <span>Sélectionner avec <kbd className="border border-border rounded px-1">Entrée</kbd></span>
            <span>Naviguer avec la souris ou clavier</span>
          </div>
        </div>
      </dialog>
    </>
  )
}
