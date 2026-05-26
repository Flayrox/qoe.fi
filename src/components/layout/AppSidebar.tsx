"use client"

import React from "react"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import {
  Activity, BookMarked, Highlighter, Wallet, Bell, Settings,
  LogOut, LayoutDashboard, ShieldAlert, User, Sparkles, Compass
} from "lucide-react"
import { logout } from "@/app/login/actions"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
  DropdownMenuGroup
} from "@/components/ui/dropdown-menu"
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

const springTransition = { type: "spring" as const, stiffness: 350, damping: 30 }

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === "/home") return pathname === "/home"
    return pathname.startsWith(href)
  }

  return (
    <aside className="lg:col-span-3 lg:sticky lg:top-6 hidden lg:flex">
      <div className="bg-neutral-100/70 border border-neutral-200/50 rounded-[32px] p-5 flex flex-col justify-between min-h-[calc(100vh-48px)] w-full shadow-xs">
        
        {/* ── Logo ── */}
        <div className="space-y-6">
          <a href="/home" className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-7 h-7 bg-[#EE4B2B] rounded-lg flex items-center justify-center">
              <span className="text-white text-[10px] font-black tracking-tighter">Q</span>
            </div>
            <span className="text-sm font-bold text-neutral-800 tracking-tight">QOE.FI</span>
          </a>

          {/* ── Navigation principale ── */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block px-3 mb-2.5">
              Navigation
            </span>
            <div className="space-y-1 relative">
              {navLinks.map(link => {
                const Icon = link.icon
                const active = isActive(link.href)
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    className="relative z-10 w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors duration-200 flex items-center gap-2.5 group block"
                  >
                    {active && (
                      <motion.div
                        layoutId="activeNavHighlight"
                        transition={springTransition}
                        className="absolute inset-0 bg-white border border-neutral-200/60 rounded-2xl shadow-sm -z-10"
                      />
                    )}
                    <Icon className={cn(
                      "w-4 h-4 transition-colors shrink-0",
                      active ? "text-[#EE4B2B]" : "text-neutral-400 group-hover:text-neutral-600"
                    )} />
                    <span className={cn(
                      "transition-colors",
                      active ? "text-[#EE4B2B]" : "text-neutral-500 group-hover:text-neutral-900"
                    )}>
                      {link.label}
                    </span>
                  </a>
                )
              })}
            </div>
          </div>

          {/* ── Quick links ── */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block px-3 mb-2.5">
              Raccourcis
            </span>
            <div className="space-y-1">
              <a
                href="/settings"
                className={cn(
                  "relative z-10 w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors duration-200 flex items-center gap-2.5 group block",
                )}
              >
                {isActive("/settings") && (
                  <motion.div
                    layoutId="activeNavHighlight"
                    transition={springTransition}
                    className="absolute inset-0 bg-white border border-neutral-200/60 rounded-2xl shadow-sm -z-10"
                  />
                )}
                <Settings className={cn(
                  "w-4 h-4 transition-colors shrink-0",
                  isActive("/settings") ? "text-[#EE4B2B]" : "text-neutral-400 group-hover:text-neutral-600"
                )} />
                <span className={cn(
                  "transition-colors",
                  isActive("/settings") ? "text-[#EE4B2B]" : "text-neutral-500 group-hover:text-neutral-900"
                )}>
                  Réglages
                </span>
              </a>

              {user?.username && (
                <a
                  href={`/@${user.username}`}
                  className="relative z-10 w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors duration-200 flex items-center gap-2.5 group block"
                >
                  <User className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 transition-colors shrink-0" />
                  <span className="text-neutral-500 group-hover:text-neutral-900 transition-colors">
                    Mon Profil
                  </span>
                </a>
              )}

              {(user?.role === 'creator' || user?.role === 'superadmin') && (
                <a
                  href="/dashboard"
                  className="relative z-10 w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors duration-200 flex items-center gap-2.5 group block"
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
                  className="relative z-10 w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors duration-200 flex items-center gap-2.5 group block"
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

        {/* ── Bottom section ── */}
        <div className="space-y-4 pt-6 border-t border-neutral-200/50">
          {/* Wallet widget */}
          <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 flex flex-col gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#EE4B2B]/10 flex items-center justify-center text-[#EE4B2B] shrink-0">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold block leading-none">Portefeuille</span>
                <span className="text-base font-bold font-mono text-neutral-800 block mt-1 leading-none">
                  {user ? (user.walletBalanceCents / 100).toFixed(2) : "0.00"} €
                </span>
              </div>
            </div>
            <a
              href="/billing"
              className="w-full bg-[#EE4B2B] text-white hover:bg-[#d63d20] transition-colors py-2 rounded-xl text-xs font-bold shadow-xs shadow-[#EE4B2B]/10 text-center block"
            >
              Recharger
            </a>
          </div>

          {/* Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full focus:outline-none flex items-center cursor-pointer select-none">
              <div className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-white border border-transparent hover:border-neutral-200/60 hover:shadow-xs transition-all text-left group">
                {user?.logoUrl ? (
                  <img src={user.logoUrl} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#EE4B2B]/10 border border-[#EE4B2B]/20 flex items-center justify-center font-bold text-[#EE4B2B] text-xs shrink-0">
                    {user?.name?.substring(0, 2).toUpperCase() || "L"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-neutral-800 block truncate leading-tight group-hover:text-neutral-900">{user?.name || "Lecteur"}</span>
                  <span className="text-[9px] text-neutral-400 block truncate mt-0.5">{user?.email}</span>
                </div>
                <Settings className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 shrink-0 transition-colors" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56 p-1 bg-white border border-neutral-200/80 rounded-2xl shadow-xl z-50">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2.5 py-2">
                  <span className="font-bold text-sm block leading-tight text-foreground">{user?.name || "Lecteur"}</span>
                  <span className="text-[10px] text-muted-foreground block truncate mt-0.5">{user?.email}</span>
                  <span className="inline-block mt-2 text-[9px] uppercase tracking-wider font-bold bg-neutral-100 px-2 py-0.5 rounded text-[#EE4B2B]">
                    {user?.role === 'superadmin' ? 'Superadmin' : user?.role === 'creator' ? 'Créateur' : 'Lecteur'}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-neutral-100" />
                {user?.username && (
                  <DropdownMenuItem className="cursor-pointer font-sans text-xs font-bold text-[#EE4B2B] focus:bg-[#EE4B2B]/5 focus:text-[#EE4B2B]" onClick={() => window.location.href = `/@${user.username}`}>
                    <User className="w-4 h-4 mr-2.5 text-[#EE4B2B]" />
                    Mon Profil Public
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="cursor-pointer font-sans text-xs" onClick={() => window.location.href = "/onboarding"}>
                  <Sparkles className="w-4 h-4 mr-2.5 text-neutral-400" />
                  Recommencer l'onboarding
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-neutral-100" />
                <DropdownMenuItem className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive font-sans text-xs" onClick={async () => {
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
