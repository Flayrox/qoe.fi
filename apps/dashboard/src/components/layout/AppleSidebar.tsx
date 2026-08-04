"use client"

import React, { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { cn } from "@qoe/utils"
import { URLS } from "@qoe/config"
import { Plus, Settings, LogOut, User, Palette } from "lucide-react"

export interface AppleSidebarItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; width?: number; height?: number }>
  section?: string
  badge?: string | number
}

export interface AppleSidebarProps {
  /** Liste des éléments de navigation */
  items: AppleSidebarItem[]
  /** URL ou path actuellement actif */
  activeUrl: string
  /** Logo ou élément branding d'en-tête */
  logo?: React.ReactNode
  /** Titre ou nom affiché sous le logo */
  brandName?: string
  /** Nom de l'utilisateur connecté */
  userName?: string
  /** Email de l'utilisateur connecté */
  userEmail?: string
  /** Initiale/fallback de l'utilisateur */
  userFallback?: string
  /** Avatar de l'utilisateur */
  userAvatar?: string | null
  /** Action de déconnexion */
  onLogout?: () => void | Promise<void>
  /** Action principale CTA (ex: "Nouvel Écrit") */
  primaryAction?: {
    label: string
    href: string
    icon?: React.ComponentType<{ className?: string }>
  }
  /** Classes CSS surchargées sur le conteneur principal */
  className?: string
}

const ArrowSVG = () => (
  <svg height="16" width="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M1.559 16 13.795 3.764v8.962H16V0H3.274v2.205h8.962L0 14.441 1.559 16z" />
  </svg>
)

export function AppleSidebar({
  items,
  activeUrl,
  logo,
  brandName = "qoe.fi",
  userName,
  userEmail,
  userFallback = "CR",
  userAvatar,
  onLogout,
  primaryAction,
  className,
}: AppleSidebarProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const accountUrl = isMounted ? `${URLS.CONSOLE}/settings` : "#"

  const isItemActive = (url: string) => {
    if (url === "/") {
      return activeUrl === "/"
    }
    return activeUrl.startsWith(url)
  }

  // Fermeture du popover au clic extérieur
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Groupement des items par section
  const groupedItems = items.reduce<Record<string, AppleSidebarItem[]>>((acc, item) => {
    const section = item.section || "DEFAULT"
    if (!acc[section]) acc[section] = []
    acc[section].push(item)
    return acc
  }, {})

  return (
    <aside
      className={cn(
        "fixed top-[6px] left-[6px] bottom-[6px] z-40 hidden md:flex flex-col font-sans select-none w-[250px]",
        className
      )}
    >
      <nav
        className={cn(
          "h-full flex flex-col justify-between p-4 rounded-[18px] relative overflow-hidden",
          "bg-sidebar/85 backdrop-blur-[25px] saturate-[180%] border border-sidebar-border shadow-xl text-sidebar-foreground"
        )}
      >
        {/* ── EN-TÊTE / LOGO ── */}
        <div className="flex items-center justify-between px-2 pt-1 pb-6 mb-1">
          <Link href="/" className="flex items-center gap-2 outline-none group">
            {logo}
            {brandName && (
              <span className="font-semibold text-[17px] tracking-tight leading-none text-sidebar-foreground group-hover:opacity-85 transition-opacity ml-0.5">
                {brandName}
              </span>
            )}
          </Link>
        </div>

        {/* ── LISTE DÉFILANTE DE NAVIGATION ── */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
          {Object.entries(groupedItems).map(([section, sectionItems]) => (
            <div key={section} className="space-y-1">
              {section !== "DEFAULT" && (
                <div className="px-3 py-1 text-[11px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                  {section}
                </div>
              )}
              <ul className="space-y-[2px]">
                {sectionItems.map((item) => {
                  const Icon = item.icon
                  const active = isItemActive(item.url)

                  return (
                    <li key={item.title}>
                      <Link
                        href={item.url}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-[10px] transition-all duration-150 outline-none",
                          active
                            ? "bg-sidebar-accent/80 text-sidebar-foreground font-medium"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "flex items-center justify-center shrink-0 transition-colors w-[20px] h-[20px]",
                            active ? "text-sidebar-primary" : "text-sidebar-foreground/70"
                          )}
                        >
                          <Icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
                        </span>

                        <span
                          className={cn(
                            "truncate flex-1 text-[14px] tracking-[-0.1px] leading-[1.2] font-normal",
                            active ? "text-sidebar-primary" : ""
                          )}
                        >
                          {item.title}
                        </span>

                        {item.badge && (
                          <span
                            className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                              active
                                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                : "bg-sidebar-accent text-muted-foreground"
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* ── PIED DE PAGE : ACTION PRINCIPALE & COMPTE ── */}
        <div className="pt-3.5 border-t border-sidebar-border/50 flex flex-col gap-3">
          {primaryAction && (
            <Link
              href={primaryAction.href}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-2 rounded-[12px] text-[13px] font-medium transition-all duration-200",
                "bg-sidebar-accent/60 hover:bg-sidebar-accent border border-sidebar-border/60 text-sidebar-foreground active:scale-[0.98]"
              )}
            >
              <span className="text-sidebar-primary flex items-center justify-center shrink-0 w-[22px] h-[22px]">
                <Plus className="w-4 h-4" strokeWidth={2.5} />
              </span>
              <span className="flex-1 text-left ml-2 truncate font-medium text-[13px] tracking-[-0.1px]">
                {primaryAction.label}
              </span>
              <span className="text-sidebar-foreground/45 shrink-0 hover:text-sidebar-foreground transition-colors">
                <ArrowSVG />
              </span>
            </Link>
          )}

          {/* Profil Utilisateur / Contextual Popover */}
          <div className="relative flex justify-end" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setIsAccountOpen(!isAccountOpen)}
              className={cn(
                "w-full flex items-center gap-2.5 p-1.5 rounded-[12px] transition-colors outline-none",
                "hover:bg-sidebar-accent/60 text-sidebar-foreground"
              )}
              aria-label="Menu compte"
            >
              <span className="w-7 h-7 rounded-full bg-sidebar-primary/10 text-sidebar-primary font-bold text-xs flex items-center justify-center shrink-0 border border-sidebar-primary/20 overflow-hidden">
                {userAvatar ? (
                  <img src={userAvatar} alt={userName || "Utilisateur"} className="w-full h-full object-cover" />
                ) : (
                  userFallback
                )}
              </span>
              <div className="flex-1 text-left truncate min-w-0">
                <span className="text-xs font-semibold block leading-tight truncate">
                  {userName || "Créateur"}
                </span>
                {userEmail && (
                  <span className="text-[11px] text-muted-foreground block truncate leading-tight mt-0.5">
                    {userEmail}
                  </span>
                )}
              </div>
            </button>

            {/* Popover contextuel style Apple */}
            {isAccountOpen && (
              <div
                className={cn(
                  "absolute bottom-11 right-0 z-50 w-56 p-2 rounded-[14px] shadow-2xl transition-all duration-150 animate-in fade-in slide-in-from-bottom-2",
                  "bg-sidebar/95 backdrop-blur-2xl border border-sidebar-border text-sidebar-foreground"
                )}
              >
                <div className="px-2.5 py-2 mb-1 border-b border-sidebar-border/60">
                  <span className="font-semibold text-xs block leading-tight truncate">
                    {userName || "Créateur"}
                  </span>
                  {userEmail && (
                    <span className="text-[10px] text-muted-foreground block truncate mt-0.5">
                      {userEmail}
                    </span>
                  )}
                </div>

                <a
                  href={accountUrl}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-[8px] hover:bg-sidebar-primary hover:text-sidebar-primary-foreground transition-colors"
                  onClick={() => setIsAccountOpen(false)}
                >
                  <User className="w-4 h-4" />
                  <span>Mon Compte Personnel</span>
                </a>

                <Link
                  href="/settings"
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-[8px] hover:bg-sidebar-primary hover:text-sidebar-primary-foreground transition-colors"
                  onClick={() => setIsAccountOpen(false)}
                >
                  <Palette className="w-4 h-4" />
                  <span>Design du Média</span>
                </Link>

                <div className="h-px my-1 bg-sidebar-border/60" />

                {onLogout && (
                  <form
                    action={() => {
                      setIsAccountOpen(false)
                      onLogout()
                    }}
                  >
                    <button
                      type="submit"
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-destructive rounded-[8px] hover:bg-destructive/10 transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Se déconnecter</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
    </aside>
  )
}
