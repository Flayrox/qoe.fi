"use client"

import React, { useState, useRef, useEffect, createContext, useContext } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@qoe/utils"
import { URLS } from "@qoe/config"
import {
  Home,
  FileText,
  Mail,
  Users,
  PieChart,
  Code,
  Settings,
  Plus,
  LogOut,
  User,
  Palette,
  Search,
  Bookmark,
  Highlighter,
  Wallet,
} from "lucide-react"

/* ─────────────────────────────────────────────
   Icon Registry (Lucide)
   ───────────────────────────────────────────── */
const iconRegistry: Record<
  string,
  React.ComponentType<{ className?: string; strokeWidth?: number; width?: number; height?: number }>
> = {
  Home,
  FileText,
  Mail,
  Users,
  PieChart,
  Code,
  Settings,
  Bookmark,
  Highlighter,
  Wallet,
}

/* ─────────────────────────────────────────────
   Types & Interfaces
   ───────────────────────────────────────────── */
export interface SidebarItemData {
  title: string
  url: string
  iconName?: string
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>
  section?: string
  badge?: string | number
}

export interface SidebarProps {
  /** Shorthand navigation items */
  items?: SidebarItemData[]
  /** Currently active path (defaults to usePathname) */
  activeUrl?: string
  /** Header logo element */
  logo?: React.ReactNode
  /** Brand name displayed next to logo */
  brandName?: string
  /** Authenticated user name */
  userName?: string
  /** Authenticated user email */
  userEmail?: string
  /** User fallback initials */
  userFallback?: string
  /** User avatar image URL */
  userAvatar?: string | null
  /** Logout handler function */
  onLogout?: () => void | Promise<void>
  /** Primary CTA action */
  primaryAction?: {
    label: string
    href?: string
    onClick?: () => void
    icon?: React.ComponentType<{ className?: string }>
  }
  /** Optional search change handler */
  onSearchChange?: (query: string) => void
  /** Optional search placeholder */
  searchPlaceholder?: string
  /** Custom additional CSS classes */
  className?: string
  /** Optional custom children for compound component composition */
  children?: React.ReactNode
}

/* ─────────────────────────────────────────────
   Context for Compound Components
   ───────────────────────────────────────────── */
interface SidebarContextValue {
  activeUrl: string
  isMobileOpen: boolean
  setIsMobileOpen: (open: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function useSidebarContext() {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error("Sidebar sub-components must be used within <Sidebar>")
  }
  return ctx
}

const ArrowSVG = () => (
  <svg height="16" width="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M1.559 16 13.795 3.764v8.962H16V0H3.274v2.205h8.962L0 14.441 1.559 16z" />
  </svg>
)

/* ─────────────────────────────────────────────
   Compound Sub-Components
   ───────────────────────────────────────────── */

export function SidebarHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-between px-2 pt-1 pb-4 mb-1", className)}>{children}</div>
}

export function SidebarContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin", className)}>{children}</div>
}

export function SidebarGroup({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      {title && (
        <div className="px-3 py-1 text-[11px] font-bold tracking-wider text-muted-foreground/70 uppercase">
          {title}
        </div>
      )}
      <ul className="space-y-[2px]">{children}</ul>
    </div>
  )
}

export function SidebarItem({
  href,
  icon: Icon,
  badge,
  children,
  className,
}: {
  href: string
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>
  badge?: string | number
  children: React.ReactNode
  className?: string
}) {
  const { activeUrl } = useSidebarContext()
  const active = href === "/" ? activeUrl === "/" : activeUrl.startsWith(href)

  return (
    <li className="relative">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 px-3 py-2 rounded-[10px] transition-colors duration-150 outline-none z-10",
          active
            ? "text-sidebar-foreground font-medium"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
          className
        )}
      >
        {active && (
          <motion.span
            layoutId="sidebar-active-pill"
            className="absolute inset-0 bg-sidebar-accent/80 rounded-[10px] -z-10"
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
          />
        )}
        {Icon && (
          <span
            className={cn(
              "flex items-center justify-center shrink-0 transition-colors w-[20px] h-[20px]",
              active ? "text-sidebar-primary" : "text-sidebar-foreground/70"
            )}
          >
            <Icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
          </span>
        )}
        <span
          className={cn(
            "truncate flex-1 text-[14px] tracking-[-0.1px] leading-[1.2] font-normal",
            active ? "text-sidebar-primary font-medium" : ""
          )}
        >
          {children}
        </span>
        {badge !== undefined && (
          <span
            className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "bg-sidebar-accent text-muted-foreground"
            )}
          >
            {badge}
          </span>
        )}
      </Link>
    </li>
  )
}

export function SidebarFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("pt-3.5 border-t border-sidebar-border/50 flex flex-col gap-3", className)}>{children}</div>
}

/* ─────────────────────────────────────────────
   Main <Sidebar /> Component
   ───────────────────────────────────────────── */
export function Sidebar({
  items,
  activeUrl: activeUrlProp,
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
  children,
}: SidebarProps) {
  const currentPathname = usePathname()
  const activeUrl = activeUrlProp ?? currentPathname
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const accountUrl = isMounted ? `${URLS.CONSOLE}/settings` : "#"

  // Handle outside click & Escape key & Mobile drawer toggle event
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAccountOpen(false)
        setIsMobileOpen(false)
      }
    }
    const handleToggleMobile = () => {
      setIsMobileOpen((prev) => !prev)
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("toggle-mobile-sidebar", handleToggleMobile)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("toggle-mobile-sidebar", handleToggleMobile)
    }
  }, [])

  // Close mobile menu on page navigation
  useEffect(() => {
    setIsMobileOpen(false)
  }, [activeUrl])

  // Group items by section if provided
  const groupedItems = (items || []).reduce<Record<string, SidebarItemData[]>>((acc, item) => {
    const section = item.section || "DEFAULT"
    if (!acc[section]) acc[section] = []
    acc[section].push(item)
    return acc
  }, {})

  const contextValue = { activeUrl, isMobileOpen, setIsMobileOpen }

  return (
    <SidebarContext.Provider value={contextValue}>
      {/* ── MOBILE BACKDROP ── */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          "font-sans select-none w-[250px]",
          "fixed top-[6px] left-[6px] bottom-[6px] z-40 transition-transform duration-200 ease-in-out",
          isMobileOpen
            ? "flex flex-col translate-x-0"
            : "hidden md:flex flex-col -translate-x-full md:translate-x-0",
          className
        )}
      >
        <nav
          aria-label="Navigation principale"
          className={cn(
            "h-full flex flex-col justify-between p-4 rounded-[18px] relative overflow-hidden",
            "bg-sidebar backdrop-blur-[25px] saturate-[180%] border border-sidebar-border shadow-xl text-sidebar-foreground"
          )}
        >
          {children ? (
            children
          ) : (
            <>
              {/* ── HEADER / LOGO ── */}
              <SidebarHeader>
                <Link href="/" className="flex items-center gap-2 outline-none group">
                  {logo}
                  {brandName && (
                    <span className="font-semibold text-[17px] tracking-tight leading-none text-sidebar-foreground group-hover:opacity-85 transition-opacity ml-0.5">
                      {brandName}
                    </span>
                  )}
                </Link>
              </SidebarHeader>

              {/* ── OPTIONAL SEARCH BAR ── */}
              {onSearchChange && (
                <div className="px-2 pb-3">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-sidebar-accent/50 border border-sidebar-border/40 text-xs text-muted-foreground">
                    <Search className="w-3.5 h-3.5 shrink-0" />
                    <input
                      type="text"
                      placeholder={searchPlaceholder}
                      onChange={(e) => onSearchChange(e.target.value)}
                      className="w-full bg-transparent outline-none placeholder:text-muted-foreground/60 text-sidebar-foreground text-xs"
                    />
                  </div>
                </div>
              )}

              {/* ── SCROLLABLE NAVIGATION LIST ── */}
              <SidebarContent>
                {Object.entries(groupedItems).map(([section, sectionItems]) => (
                  <SidebarGroup key={section} title={section !== "DEFAULT" ? section : undefined}>
                    {sectionItems.map((item) => {
                      const Icon = item.icon || (item.iconName ? iconRegistry[item.iconName] : FileText)

                      return (
                        <SidebarItem
                          key={item.title}
                          href={item.url}
                          icon={Icon}
                          badge={item.badge}
                        >
                          {item.title}
                        </SidebarItem>
                      )
                    })}
                  </SidebarGroup>
                ))}
              </SidebarContent>

              {/* ── FOOTER: PRIMARY ACTION & ACCOUNT ── */}
              <SidebarFooter>
                {primaryAction && (
                  primaryAction.onClick ? (
                    <button
                      type="button"
                      onClick={primaryAction.onClick}
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-2 rounded-[12px] text-[13px] font-medium transition-all duration-200 cursor-pointer outline-none",
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
                    </button>
                  ) : (
                    <Link
                      href={primaryAction.href || "#"}
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
                  )
                )}

                {/* Profile Popover */}
                <div className="relative flex justify-end" ref={accountMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsAccountOpen(!isAccountOpen)}
                    aria-expanded={isAccountOpen}
                    aria-haspopup="menu"
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

                  <AnimatePresence>
                    {isAccountOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 8 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className={cn(
                          "absolute bottom-11 right-0 z-50 w-56 p-2 rounded-[14px] shadow-2xl origin-bottom-right",
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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </SidebarFooter>
            </>
          )}
        </nav>
      </aside>
    </SidebarContext.Provider>
  )
}
