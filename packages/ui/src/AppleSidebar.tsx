"use client"

import React, { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { cn } from "@qoe/utils"
import { Plus, Settings, LogOut, User, Search, Play, Pause } from "lucide-react"

export interface AppleSidebarItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; width?: number; height?: number }>
  section?: string
  badge?: string | number
}

export interface AppleSidebarProps {
  /** Navigation elements */
  items: AppleSidebarItem[]
  /** Active pathname/URL */
  activeUrl: string
  /** Header Logo/Branding component */
  logo?: React.ReactNode
  /** Brand Name displayed next to logo */
  brandName?: string
  /** User name */
  userName?: string
  /** User email */
  userEmail?: string
  /** User fallback initials */
  userFallback?: string
  /** User avatar URL */
  userAvatar?: string | null
  /** Logout action */
  onLogout?: () => void | Promise<void>
  /** Primary CTA button (e.g. "Nouveau Post") */
  primaryAction?: {
    label: string
    href?: string
    onClick?: () => void
    icon?: React.ComponentType<{ className?: string }>
  }
  /** Optional Search component or handler */
  onSearchChange?: (query: string) => void
  searchPlaceholder?: string
  /** Extra CSS classes */
  className?: string
}

const ArrowSVG = () => (
  <svg height="14" width="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
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
  onSearchChange,
  searchPlaceholder = "Rechercher...",
  className,
}: AppleSidebarProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  const isItemActive = (url: string) => {
    if (url === "/home" || url === "/") {
      return activeUrl === url
    }
    return activeUrl.startsWith(url)
  }

  // Close account popover on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Group items by section
  const groupedItems = items.reduce<Record<string, AppleSidebarItem[]>>((acc, item) => {
    const section = item.section || "DEFAULT"
    if (!acc[section]) acc[section] = []
    acc[section].push(item)
    return acc
  }, {})

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearchQuery(val)
    if (onSearchChange) {
      onSearchChange(val)
    }
  }

  return (
    <aside
      className={cn(
        "fixed top-[12px] left-[12px] bottom-[12px] z-40 hidden md:flex flex-col font-sans select-none w-[250px]",
        className
      )}
    >
      <nav
        className={cn(
          "h-full flex flex-col justify-between p-4 rounded-2xl relative overflow-hidden",
          "bg-sidebar/90 backdrop-blur-2xl saturate-[180%] border border-sidebar-border shadow-2xl text-sidebar-foreground"
        )}
      >
        {/* ── HEADER / BRANDING ── */}
        <div className="space-y-3.5 pb-2">
          <div className="flex items-center justify-between px-1 pt-1">
            <Link href="/home" className="flex items-center gap-3 outline-none group">
              {logo}
              {brandName && (
                <span className="font-bold text-base tracking-tight text-sidebar-foreground group-hover:opacity-85 transition-opacity">
                  {brandName}
                </span>
              )}
            </Link>
          </div>

          {/* Search Bar */}
          {onSearchChange && (
            <div className="relative pt-0.5">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground/70" />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearch}
                placeholder={searchPlaceholder}
                className={cn(
                  "w-full bg-sidebar-accent/50 text-[13px] text-sidebar-foreground placeholder:text-muted-foreground/60",
                  "pl-9 pr-3 py-2 rounded-xl border border-sidebar-border/60",
                  "focus:outline-none focus:ring-1 focus:ring-sidebar-primary/40 focus:bg-sidebar-accent/80 transition-all"
                )}
              />
            </div>
          )}
        </div>

        {/* ── NAVIGATION LIST ── */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-0.5 scrollbar-thin py-2">
          {Object.entries(groupedItems).map(([section, sectionItems]) => (
            <div key={section} className="space-y-1">
              {section !== "DEFAULT" && (
                <div className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                  {section}
                </div>
              )}
              <ul className="space-y-0.5">
                {sectionItems.map((item) => {
                  const Icon = item.icon
                  const active = isItemActive(item.url)

                  return (
                    <li key={item.title}>
                      <Link
                        href={item.url}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 outline-none",
                          active
                            ? "bg-sidebar-primary/10 text-sidebar-primary font-semibold"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground font-medium"
                        )}
                      >
                        <span
                          className={cn(
                            "flex items-center justify-center shrink-0 transition-colors w-[18px] h-[18px]",
                            active ? "text-sidebar-primary" : "text-sidebar-foreground/60"
                          )}
                        >
                          <Icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
                        </span>

                        <span
                          className={cn(
                            "truncate flex-1 text-[13px] tracking-tight",
                            active ? "text-sidebar-primary font-semibold" : ""
                          )}
                        >
                          {item.title}
                        </span>

                        {item.badge !== undefined && item.badge !== null && (
                          <span
                            className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded-full",
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

        {/* ── SIDEBAR MINI AUDIO PLAYER ── */}
        <div className="my-2 p-3 bg-sidebar-accent/40 rounded-xl border border-sidebar-border/50 space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0 border border-primary/20">
              <Play className="w-3.5 h-3.5 fill-current" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-sidebar-foreground truncate">
                Design Systems Audio
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                Rauno Freiberg
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsPlayingAudio(!isPlayingAudio)}
            className="w-full py-1.5 bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-foreground rounded-lg flex items-center justify-center gap-2 text-xs font-medium transition-colors"
          >
            {isPlayingAudio ? (
              <Pause className="w-3.5 h-3.5 fill-current text-primary" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current text-primary" />
            )}
            <span>{isPlayingAudio ? "En pause" : "Écouter l'article"}</span>
          </button>
        </div>

        {/* ── FOOTER: PRIMARY CTA & USER PROFILE ── */}
        <div className="pt-3 border-t border-sidebar-border/50 flex flex-col gap-2.5">
          {primaryAction && (
            primaryAction.href ? (
              <Link
                href={primaryAction.href}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200",
                  "bg-sidebar-accent/80 hover:bg-sidebar-accent border border-sidebar-border/60 text-sidebar-foreground active:scale-[0.98]"
                )}
              >
                <span className="text-sidebar-primary flex items-center justify-center shrink-0 w-4 h-4">
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                </span>
                <span className="flex-1 text-left ml-2 truncate font-semibold text-[13px] tracking-tight">
                  {primaryAction.label}
                </span>
                <span className="text-sidebar-foreground/40 shrink-0 hover:text-sidebar-foreground transition-colors">
                  <ArrowSVG />
                </span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200",
                  "bg-sidebar-accent/80 hover:bg-sidebar-accent border border-sidebar-border/60 text-sidebar-foreground active:scale-[0.98]"
                )}
              >
                <span className="text-sidebar-primary flex items-center justify-center shrink-0 w-4 h-4">
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                </span>
                <span className="flex-1 text-left ml-2 truncate font-semibold text-[13px] tracking-tight">
                  {primaryAction.label}
                </span>
                <span className="text-sidebar-foreground/40 shrink-0 hover:text-sidebar-foreground transition-colors">
                  <ArrowSVG />
                </span>
              </button>
            )
          )}

          {/* User Account Button & Context Popover */}
          <div className="relative flex justify-end" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setIsAccountOpen(!isAccountOpen)}
              className={cn(
                "w-full flex items-center gap-2.5 p-2 rounded-xl transition-colors outline-none",
                "hover:bg-sidebar-accent/60 text-sidebar-foreground"
              )}
              aria-label="Menu compte"
            >
              <span className="w-8 h-8 rounded-full bg-sidebar-primary/10 text-sidebar-primary font-bold text-xs flex items-center justify-center shrink-0 border border-sidebar-primary/20 overflow-hidden">
                {userAvatar ? (
                  <img src={userAvatar} alt={userName || "Utilisateur"} className="w-full h-full object-cover" />
                ) : (
                  userFallback
                )}
              </span>
              <div className="flex-1 text-left truncate min-w-0">
                <span className="text-xs font-semibold block leading-tight truncate">
                  {userName || "Lecteur"}
                </span>
                {userEmail && (
                  <span className="text-[11px] text-muted-foreground block truncate leading-tight mt-0.5">
                    {userEmail}
                  </span>
                )}
              </div>
            </button>

            {/* Contextual Popover */}
            {isAccountOpen && (
              <div
                className={cn(
                  "absolute bottom-12 right-0 z-50 w-56 p-2 rounded-xl shadow-2xl transition-all duration-150 animate-in fade-in slide-in-from-bottom-2",
                  "bg-sidebar/95 backdrop-blur-2xl border border-sidebar-border text-sidebar-foreground"
                )}
              >
                <div className="px-2.5 py-1.5 mb-1 border-b border-sidebar-border/60">
                  <span className="font-semibold text-xs block leading-tight truncate">
                    {userName || "Lecteur"}
                  </span>
                  {userEmail && (
                    <span className="text-[10px] text-muted-foreground block truncate mt-0.5">
                      {userEmail}
                    </span>
                  )}
                </div>

                {userName && (
                  <Link
                    href={`/profile/${userName}`}
                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-medium rounded-lg hover:bg-sidebar-primary/10 hover:text-sidebar-primary transition-colors"
                    onClick={() => setIsAccountOpen(false)}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Mon Profil Public</span>
                  </Link>
                )}

                <Link
                  href="/settings"
                  className="flex items-center gap-2 px-2.5 py-2 text-xs font-medium rounded-lg hover:bg-sidebar-primary/10 hover:text-sidebar-primary transition-colors"
                  onClick={() => setIsAccountOpen(false)}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Réglages</span>
                </Link>

                <div className="h-px my-1 bg-sidebar-border/60" />

                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAccountOpen(false)
                      onLogout()
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-destructive rounded-lg hover:bg-destructive/10 transition-colors text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Se déconnecter</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
    </aside>
  )
}
