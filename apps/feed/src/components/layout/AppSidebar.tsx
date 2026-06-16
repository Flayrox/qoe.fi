"use client"

import React, { useState } from "react"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Activity, BookMarked, Highlighter, Wallet, Settings,
  User, LogOut, LayoutDashboard, ShieldAlert, Sparkles,
  ChevronRight, Bell
} from "lucide-react"
import { logout } from "@/app/login/actions"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
  DropdownMenuGroup
} from "@/components/ui/dropdown-menu"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from "@/components/ui/tooltip"
import { Logo } from "@/components/ui/Logo"
import { cn } from "@qoe/utils"


interface AppSidebarUser {
  id: string
  name: string | null
  email: string
  role: string
  logoUrl: string | null
  username: string | null
  walletBalanceCents: number
}

interface AppSidebarProps {
  user: AppSidebarUser | null
}

const navLinks = [
  { href: "/home",       label: "Timeline",     icon: Activity,   badge: null },
  { href: "/library",    label: "Mes Signets",  icon: BookMarked, badge: null },
  { href: "/highlights", label: "Surlignages",  icon: Highlighter, badge: null },
  { href: "/billing",    label: "Portefeuille", icon: Wallet,     badge: null },
]

// Rauno-style springs
const springs = {
  layout:   { type: "spring" as const, stiffness: 400, damping: 32, mass: 0.8 },
  sidebar:  { type: "spring" as const, stiffness: 320, damping: 30, mass: 1 },
  hover:    { type: "spring" as const, stiffness: 500, damping: 40 },
  settings: { type: "spring" as const, stiffness: 260, damping: 24 },
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()
  const [hoveredIndex, setHoveredIndex] = useState<string | null>(null)
  const [settingsHovered, setSettingsHovered] = useState(false)

  const isHome =
    pathname.endsWith("/home") || pathname.endsWith("/home/") ||
    pathname.endsWith("/library") || pathname.endsWith("/library/") ||
    pathname.endsWith("/highlights") || pathname.endsWith("/highlights/") ||
    pathname.endsWith("/billing") || pathname.endsWith("/billing/")

  const isTimeline = pathname.endsWith("/home") || pathname.endsWith("/home/")

  const isActive = (href: string) => {
    if (href === "/home") return pathname === "/home"
    return pathname.startsWith(href)
  }

  const walletFormatted = user
    ? (user.walletBalanceCents / 100).toFixed(2)
    : "0.00"

  const roleLabel =
    user?.role === "superadmin" ? "Superadmin"
    : user?.role === "creator"  ? "Créateur"
    : "Lecteur"

  return (
    <TooltipProvider delay={180}>
      <div 
        className={cn(
          isHome 
            ? "absolute top-0 w-16 h-full pointer-events-none z-30" 
            : "fixed top-0 left-0 w-16 h-full z-30"
        )}
        style={{
          left: isHome ? "calc(50vw - 404px)" : "0px",
        }}
      >
        <div
          className={cn(
            isHome 
              ? "sticky top-[28px] h-[calc(100vh-28px)] w-16 pointer-events-auto" 
              : "h-full w-16"
          )}
          style={{
            marginTop: isHome ? (isTimeline ? "calc(30vh + 32px)" : "36px") : "0px",
          }}
        >
          <motion.aside
            className={cn(
              "absolute inset-0 flex flex-col w-16",
              isHome ? "border-r-0" : "border-r border-[var(--border-subtle)]",
              "bg-transparent select-none overflow-hidden"
            )}
          >
          <div className="flex flex-col h-full w-full py-5">

          {/* ── TOP SECTION ─────────────────────────────── */}
          <div className="space-y-6">

             {/* Logo */}
             <div className="px-4 h-8 flex items-center justify-center">
               {isTimeline ? (
                 <button
                   onClick={(e) => {
                     e.preventDefault()
                     window.scrollTo({ top: 0, behavior: "smooth" })
                   }}
                   className="flex items-center justify-center w-8 h-8 outline-none group cursor-pointer bg-transparent border-0"
                   title="Retour en haut"
                 >
                   <motion.div
                     whileHover={{ scale: 1.06, rotate: -2 }}
                     transition={springs.hover}
                     className="shrink-0 flex items-center justify-center w-8 h-8"
                   >
                     <Logo className="h-[20px] w-auto" fillColor="#EE4B2B" />
                   </motion.div>
                 </button>
               ) : (
                 <a
                   href="/home"
                   className="flex items-center justify-center gap-2.5 h-8 outline-none group"
                 >
                   <motion.div
                     whileHover={{ scale: 1.06, rotate: -2 }}
                     transition={springs.hover}
                     className="shrink-0 flex items-center justify-center w-8 h-8"
                   >
                     <Logo className="h-[20px] w-auto" fillColor="#EE4B2B" />
                   </motion.div>
                 </a>
               )}
             </div>

            {/* Navigation */}
            <nav
              className="space-y-0.5 px-2"
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {navLinks.map(link => {
                const Icon = link.icon
                const active = isActive(link.href)
                const isHovered = hoveredIndex === link.href

                return (
                  <Tooltip key={link.href}>
                    <TooltipTrigger>
                      <a
                        href={link.href}
                        onMouseEnter={() => setHoveredIndex(link.href)}
                        className={cn(
                          "relative flex items-center justify-center w-12 h-10 rounded-[var(--radius-button)]",
                          "text-xs font-semibold transition-colors duration-200 outline-none",
                          "focus-visible:ring-1 focus-visible:ring-[var(--qoe-vermillion)]/30"
                        )}
                      >
                        {/* Active sliding highlight */}
                        {active && (
                          <motion.div
                            layoutId="activeNavHighlight"
                            transition={springs.layout}
                            className="absolute inset-0 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] rounded-[var(--radius-button)] -z-10 border border-[var(--border-default)]"
                          />
                        )}

                        {/* Hover state */}
                        <AnimatePresence>
                          {isHovered && !active && (
                            <motion.div
                              layoutId="hoverNavHighlight"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={springs.layout}
                              className="absolute inset-0 bg-white/50 rounded-[var(--radius-button)] -z-10"
                            />
                          )}
                        </AnimatePresence>

                        {/* Active dot indicator */}
                        <div className="relative shrink-0 flex items-center justify-center">
                          <Icon
                            className={cn(
                              "w-4 h-4 transition-colors duration-300 shrink-0",
                              active
                                ? "text-[var(--qoe-vermillion)]"
                                : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]"
                            )}
                          />
                          {active && (
                            <motion.div
                              layoutId="activeNavDot"
                              transition={springs.layout}
                              className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--qoe-vermillion)]"
                              style={{ boxShadow: "0 0 6px var(--qoe-vermillion-glow)" }}
                            />
                          )}
                        </div>
                      </a>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="bg-white text-[var(--text-primary)] text-[10px] font-bold tracking-tight rounded-md px-2.5 py-1.5 border border-[var(--border-default)] shadow-[0_4px_12px_rgba(0,0,0,0.05)] ml-2"
                    >
                      {link.label}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </nav>

            {/* Raccourcis Créateur / Admin */}
            {(user?.role === "creator" || user?.role === "superadmin") && (
              <div className="px-2 space-y-0.5 border-t border-[var(--border-subtle)] pt-4 mt-2">
                <Tooltip>
                  <TooltipTrigger>
                    <a
                      href="/dashboard"
                      className="relative flex items-center justify-center w-12 h-10 rounded-[var(--radius-button)]
                                 text-xs font-semibold transition-colors duration-200 outline-none
                                 hover:bg-white/50"
                    >
                      <LayoutDashboard className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-white text-[var(--text-primary)] text-[10px] font-bold tracking-tight rounded-md px-2.5 py-1.5 border border-[var(--border-default)] shadow-[0_4px_12px_rgba(0,0,0,0.05)] ml-2">
                    Espace Créateur
                  </TooltipContent>
                </Tooltip>

                {user?.role === "superadmin" && (
                  <Tooltip>
                    <TooltipTrigger>
                      <a
                        href="/admin"
                        className="relative flex items-center justify-center w-12 h-10 rounded-[var(--radius-button)]
                                   text-xs font-semibold transition-colors duration-200 outline-none
                                   hover:bg-white/50"
                      >
                        <ShieldAlert className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-white text-[var(--text-primary)] text-[10px] font-bold tracking-tight rounded-md px-2.5 py-1.5 border border-[var(--border-default)] shadow-[0_4px_12px_rgba(0,0,0,0.05)] ml-2">
                      Administration
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </div>

          </div>
          </motion.aside>
        </div>
      </div>

      {/* ── FIXED BOTTOM USER PROFILE ── */}
      <div 
        className="fixed bottom-5 w-16 z-40 flex justify-center pointer-events-auto"
        style={{
          left: isHome ? "calc(50vw - 404px)" : "0px",
        }}
      >
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            className="outline-none cursor-pointer"
          >
            <div
              className={cn(
                "flex items-center justify-center w-12 h-10 rounded-[var(--radius-button)]",
                "hover:bg-white/50 border border-transparent",
                "hover:border-[var(--border-subtle)] transition-all duration-200 group"
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  "relative w-8 h-8 rounded-[var(--radius-button)] overflow-hidden shrink-0",
                  "border border-[var(--border-default)]",
                  user?.role === "creator" ? "ring-1 ring-[var(--qoe-vermillion)]/25 ring-offset-1" : ""
                )}
              >
                {user?.logoUrl ? (
                  <img src={user.logoUrl} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-[var(--qoe-vermillion)] text-xs">
                    {user?.name?.substring(0, 2).toUpperCase() || "L"}
                  </div>
                )}
              </div>
            </div>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            side="right"
            sideOffset={16}
            className="w-56 p-1.5 bg-white/95 backdrop-blur-xl border border-[var(--border-default)] rounded-[var(--radius-element)] shadow-[var(--shadow-elevated)] z-50 ml-2"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2.5 py-2">
                <span className="font-bold text-xs block leading-tight text-[var(--text-primary)]">
                  {user?.name || "Lecteur"}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] block truncate mt-0.5">
                  {user?.email}
                </span>
                <span className="inline-block mt-2 text-[8px] uppercase tracking-wider font-bold bg-[var(--qoe-vermillion-08)] px-2 py-0.5 rounded text-[var(--qoe-vermillion)]">
                  {roleLabel}
                </span>
              </DropdownMenuLabel>

              <DropdownMenuSeparator className="bg-[var(--border-subtle)]" />

              {user?.username && (
                <DropdownMenuItem
                  className="cursor-pointer font-sans text-xs font-semibold text-[var(--text-secondary)] focus:bg-[var(--qoe-vermillion-08)] focus:text-[var(--qoe-vermillion)] rounded-[8px]"
                  onClick={() => window.location.href = `/profile/${user.username}`}
                >
                  <User className="w-4 h-4 mr-2.5 text-[var(--text-tertiary)]" />
                  Mon Profil Public
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                className="cursor-pointer font-sans text-xs font-semibold text-[var(--text-secondary)] focus:bg-[var(--surface-2)] rounded-[8px]"
                onClick={() => window.location.href = "/settings"}
              >
                <Settings className="w-4 h-4 mr-2.5 text-[var(--text-tertiary)]" />
                Réglages
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer font-sans text-xs font-semibold text-[var(--text-secondary)] focus:bg-[var(--surface-2)] rounded-[8px]"
                onClick={() => window.location.href = "/onboarding"}
              >
                <Sparkles className="w-4 h-4 mr-2.5 text-[var(--text-tertiary)]" />
                Recommencer l'onboarding
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-[var(--border-subtle)]" />

              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive font-sans text-xs font-semibold rounded-[8px]"
                onClick={async () => {
                  await logout()
                  window.location.href = "/"
                }}
              >
                <LogOut className="w-4 h-4 mr-2.5" />
                Se déconnecter
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  )
}
