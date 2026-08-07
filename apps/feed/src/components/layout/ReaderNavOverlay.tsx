"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Home,
  Bookmark,
  Highlighter,
  Wallet,
  Settings,
  User,
  LogOut,
  Sparkles,
  LayoutDashboard,
} from "lucide-react"
import { cn } from "@qoe/utils"
import { Logo } from "@qoe/ui"
import { routes } from "@qoe/config/routes"
import { URLS } from "@qoe/config"

interface ReaderNavOverlayProps {
  userName?: string
  userEmail?: string
  userAvatar?: string | null
  userRole?: string
  onLogout?: () => void | Promise<void>
}

export function ReaderNavOverlay({
  userName = "Lecteur",
  userEmail = "",
  userAvatar,
  userRole,
  onLogout,
}: ReaderNavOverlayProps) {
  const pathname = usePathname()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const navItems = [
    { label: "Accueil", href: routes.feed.home(), icon: Home },
    { label: "Signets", href: routes.feed.library(), icon: Bookmark },
    { label: "Surlignages", href: routes.feed.highlights(), icon: Highlighter },
    { label: "Portefeuille", href: routes.feed.billing(), icon: Wallet },
  ]

  const isItemActive = (href: string) => {
    if (href === "/home" || href === "/") {
      return pathname === "/home" || pathname === "/"
    }
    return pathname.startsWith(href)
  }

  // Handle Escape key to close popover
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsProfileOpen(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <header className="fixed top-3 left-0 right-0 z-50 pointer-events-none flex justify-center px-4 md:hidden">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={cn(
          "pointer-events-auto flex items-center justify-between gap-3 p-1.5 pl-3.5 pr-2 rounded-2xl shadow-xl",
          "bg-card/85 backdrop-blur-2xl border border-border/60 text-foreground"
        )}
      >
        {/* Brand Logo & Title */}
        <Link href="/home" className="flex items-center gap-2 outline-none group mr-1">
          <Logo className="h-5 w-auto" fillColor="#EE4B2B" />
          <span className="font-bold text-sm tracking-tight text-foreground group-hover:opacity-85 transition-opacity">
            qoe<span className="text-primary">.fi</span>
          </span>
        </Link>

        <div className="h-4 w-px bg-border/60 mx-0.5" />

        {/* Navigation Tabs with Spring Pill */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isItemActive(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors outline-none",
                  active
                    ? "text-primary-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="reader-active-pill"
                    className="absolute inset-0 bg-primary rounded-xl -z-10 shadow-xs"
                    transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  />
                )}
                <Icon className={cn("w-3.5 h-3.5 shrink-0", active ? "text-primary-foreground" : "text-muted-foreground")} />
                <span className="hidden sm:inline text-xs tracking-tight">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="h-4 w-px bg-border/60 mx-0.5" />

        {/* User Profile / Menu Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 p-1 rounded-xl hover:bg-muted transition-colors outline-none cursor-pointer"
            aria-label="Menu profil"
            aria-expanded={isProfileOpen}
          >
            <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden border border-primary/20">
              {userAvatar ? (
                <img src={userAvatar} alt={userName} className="w-full h-full object-cover" />
              ) : (
                userName.slice(0, 2).toUpperCase()
              )}
            </span>
          </button>

          {/* Contextual Popover */}
          <AnimatePresence>
            {isProfileOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className={cn(
                  "absolute top-10 right-0 z-50 w-56 p-2 rounded-2xl shadow-2xl origin-top-right",
                  "bg-card/95 backdrop-blur-2xl border border-border text-foreground"
                )}
              >
                <div className="px-3 py-2 mb-1 border-b border-border/60">
                  <span className="font-bold text-xs block truncate leading-tight">{userName}</span>
                  {userEmail && (
                    <span className="text-[10px] text-muted-foreground block truncate mt-0.5 font-mono">
                      {userEmail}
                    </span>
                  )}
                </div>

                {(userRole === "creator" || userRole === "superadmin") && (
                  <a
                    href={isMounted ? URLS.DASHBOARD : "#"}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl text-primary hover:bg-primary/10 transition-colors mb-1"
                    onClick={() => setIsProfileOpen(false)}
                  >
                    <LayoutDashboard className="w-3.5 h-3.5" />
                    <span>Studio Créateur</span>
                  </a>
                )}

                <Link
                  href="/settings"
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-xl hover:bg-muted transition-colors"
                  onClick={() => setIsProfileOpen(false)}
                >
                  <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Réglages du Compte</span>
                </Link>

                <div className="h-px my-1 bg-border/60" />

                {onLogout && (
                  <form
                    action={() => {
                      setIsProfileOpen(false)
                      onLogout()
                    }}
                  >
                    <button
                      type="submit"
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-destructive rounded-xl hover:bg-destructive/10 transition-colors text-left cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Se déconnecter</span>
                    </button>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </header>
  )
}
