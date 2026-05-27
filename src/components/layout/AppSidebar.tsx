"use client"

import React, { useState } from "react"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Activity, BookMarked, Highlighter, Wallet, Settings, User, LogOut, LayoutDashboard, ShieldAlert, Sparkles
} from "lucide-react"
import { logout } from "@/app/login/actions"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
  DropdownMenuGroup
} from "@/components/ui/dropdown-menu"
import { Logo } from "@/components/ui/Logo"
import { cn } from "@/lib/utils"

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
  { href: "/home", label: "Timeline", icon: Activity },
  { href: "/library", label: "Mes Signets", icon: BookMarked },
  { href: "/highlights", label: "Surlignages", icon: Highlighter },
  { href: "/billing", label: "Portefeuille", icon: Wallet },
]

// Rauno's custom springs
const springs = {
  layout: { type: "spring" as const, stiffness: 380, damping: 30, mass: 0.8 },
  hover: { type: "spring" as const, stiffness: 500, damping: 40 }
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()
  const [hoveredIndex, setHoveredIndex] = useState<string | null>(null)

  const isActive = (href: string) => {
    if (href === "/home") return pathname === "/home"
    return pathname.startsWith(href)
  }

  return (
    <aside className="w-64 fixed top-0 left-0 h-screen py-8 hidden lg:flex flex-col border-r border-neutral-100/60 dark:border-neutral-900/40 bg-[#FAFAFA] select-none z-30">
      <div className="flex flex-col justify-between h-full w-full px-4">
        
        <div className="space-y-8">
          {/* Logo with micro-tilt and dynamic glow */}
          <div className="px-3">
            <a href="/home" className="flex items-center gap-2.5 group outline-none">
              <motion.div 
                whileHover={{ scale: 1.03, rotate: -1 }}
                transition={springs.hover}
                className="relative shrink-0 flex items-center"
              >
                <Logo className="h-[14px] w-auto text-[#EE4B2B]" fillColor="#EE4B2B" />
              </motion.div>
              <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 tracking-tight transition-colors group-hover:text-neutral-900">
                QOE.FI
              </span>
            </a>
          </div>

          {/* Navigation with sliding highlight */}
          <div className="space-y-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-neutral-400 block px-3.5 mb-3">
              Navigation
            </span>
            <div 
              className="space-y-0.5 relative" 
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {navLinks.map(link => {
                const Icon = link.icon
                const active = isActive(link.href)
                const isHovered = hoveredIndex === link.href

                return (
                  <a
                    key={link.href}
                    href={link.href}
                    onMouseEnter={() => setHoveredIndex(link.href)}
                    className="relative z-10 w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors duration-200 flex items-center gap-2.5 group block outline-none focus-visible:ring-1 focus-visible:ring-black/[0.05]"
                  >
                    {/* Active Route sliding highlight */}
                    {active && (
                      <motion.div
                        layoutId="activeNavHighlight"
                        transition={springs.layout}
                        className="absolute inset-0 bg-neutral-200/45 dark:bg-neutral-800/40 rounded-xl -z-10 border border-neutral-200/10"
                      />
                    )}

                    {/* Hover state sliding highlight */}
                    <AnimatePresence>
                      {isHovered && !active && (
                        <motion.div
                          layoutId="hoverNavHighlight"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={springs.layout}
                          className="absolute inset-0 bg-neutral-100/50 dark:bg-neutral-900/30 rounded-xl -z-10 border border-neutral-100/5"
                        />
                      )}
                    </AnimatePresence>

                    <Icon className={cn(
                      "w-4 h-4 transition-colors shrink-0 duration-300",
                      active ? "text-[#EE4B2B] drop-shadow-[0_0_6px_rgba(238,75,43,0.15)]" : "text-neutral-400 group-hover:text-neutral-600"
                    )} />
                    <span className={cn(
                      "transition-colors duration-300",
                      active ? "text-neutral-900 dark:text-neutral-100 font-bold" : "text-neutral-500 group-hover:text-neutral-900"
                    )}>
                      {link.label}
                    </span>
                  </a>
                )
              })}
            </div>
          </div>

          {/* Shortcut connections */}
          <div>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-neutral-400 block px-3.5 mb-3">
              Raccourcis
            </span>
            <div className="space-y-0.5">
              {(user?.role === 'creator' || user?.role === 'superadmin') && (
                <a
                  href="/dashboard"
                  className="relative z-10 w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors duration-200 flex items-center gap-2.5 group block outline-none hover:bg-neutral-100/50"
                >
                  <LayoutDashboard className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 transition-colors shrink-0" />
                  <span className="text-neutral-500 group-hover:text-neutral-900 transition-colors">
                    Espace Créateur
                  </span>
                </a>
              )}

              {user?.role === 'superadmin' && (
                <a
                  href="/admin"
                  className="relative z-10 w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors duration-200 flex items-center gap-2.5 group block outline-none hover:bg-neutral-100/50"
                >
                  <ShieldAlert className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 transition-colors shrink-0" />
                  <span className="text-neutral-500 group-hover:text-neutral-900 transition-colors">
                    Administration
                  </span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Bottom User Area with subtle border and zero background encapsulation */}
        <div className="space-y-4 pt-6">
          
          {/* Minimalist Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full focus:outline-none flex items-center cursor-pointer select-none">
              <div className="w-full flex items-center gap-3 p-1.5 rounded-xl hover:bg-neutral-100/40 border border-transparent hover:border-neutral-200/20 hover:shadow-[0_1px_4px_rgba(0,0,0,0.01)] transition-all text-left group">
                <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 border border-neutral-200/40 shadow-xs">
                  {user?.logoUrl ? (
                    <img src={user.logoUrl} className="w-full h-full object-cover shrink-0" alt="" />
                  ) : (
                    <div className="w-full h-full bg-[#EE4B2B]/5 flex items-center justify-center font-bold text-[#EE4B2B] text-xs shrink-0">
                      {user?.name?.substring(0, 2).toUpperCase() || "L"}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block truncate leading-tight group-hover:text-neutral-900">
                    {user?.name || "Lecteur"}
                  </span>
                  <span className="text-[9px] text-neutral-400 font-mono block truncate mt-0.5">
                    {user ? (user.walletBalanceCents / 100).toFixed(2) : "0.00"} €
                  </span>
                </div>
                <Settings className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 shrink-0 transition-colors duration-300" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56 p-1.5 bg-white/90 backdrop-blur-xl border border-neutral-200/60 rounded-2xl shadow-xl z-50">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2.5 py-2">
                  <span className="font-bold text-xs block leading-tight text-neutral-800">{user?.name || "Lecteur"}</span>
                  <span className="text-[10px] text-neutral-400 block truncate mt-0.5">{user?.email}</span>
                  <span className="inline-block mt-2 text-[8px] uppercase tracking-wider font-bold bg-neutral-100 px-2 py-0.5 rounded text-[#EE4B2B]">
                    {user?.role === 'superadmin' ? 'Superadmin' : user?.role === 'creator' ? 'Créateur' : 'Lecteur'}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-neutral-100/80" />
                {user?.username && (
                  <DropdownMenuItem className="cursor-pointer font-sans text-xs font-semibold text-neutral-700 focus:bg-[#EE4B2B]/5 focus:text-[#EE4B2B]" onClick={() => window.location.href = `/@${user.username}`}>
                    <User className="w-4 h-4 mr-2.5 text-neutral-400 focus-hover:text-[#EE4B2B]" />
                    Mon Profil Public
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="cursor-pointer font-sans text-xs font-semibold text-neutral-700" onClick={() => window.location.href = "/settings"}>
                  <Settings className="w-4 h-4 mr-2.5 text-neutral-400" />
                  Réglages
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer font-sans text-xs font-semibold text-neutral-700" onClick={() => window.location.href = "/onboarding"}>
                  <Sparkles className="w-4 h-4 mr-2.5 text-neutral-400" />
                  Recommencer l'onboarding
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-neutral-100/80" />
                <DropdownMenuItem className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive font-sans text-xs font-semibold" onClick={async () => {
                  await logout();
                  window.location.href = "/";
                }}>
                  <LogOut className="w-4 h-4 mr-2.5" />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

      </div>
    </aside>
  )
}
