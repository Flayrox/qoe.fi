"use client"

import React, { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import {
  Activity, BookMarked, Highlighter, Wallet,
  LayoutDashboard, ShieldAlert, Radio
} from "lucide-react"
import { logout } from "@/app/login/actions"
import { Logo, AppleSidebar, type AppleSidebarItem } from "@qoe/ui"
import { URLS } from "@qoe/config"
import { routes } from "@qoe/config/routes"

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
  onSearchChange?: (query: string) => void
}

export function AppSidebar({ user, onSearchChange }: AppSidebarProps) {
  const pathname = usePathname()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setIsMounted(true), 0)
    return () => clearTimeout(t)
  }, [])

  const dashboardUrl = isMounted ? URLS.DASHBOARD : "http://dashboard.localhost"
  const adminUrl = isMounted ? URLS.ADMIN : "http://admin.localhost"

  const roleLabel =
    user?.role === "superadmin" ? "Superadmin"
    : user?.role === "creator"  ? "Créateur"
    : "Lecteur"

  const userFallback = user?.name
    ? user.name.substring(0, 2).toUpperCase()
    : user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : "CR"

  const sidebarItems: AppleSidebarItem[] = [
    {
      title: "Fil d'actualité",
      url: routes.feed.home(),
      icon: Activity,
      section: "Apple Stream",
    },
    {
      title: "Émissions & Directs",
      url: "/home?tab=live",
      icon: Radio,
      section: "Apple Stream",
    },
    {
      title: "Mes Signets",
      url: routes.feed.library(),
      icon: BookMarked,
      section: "Bibliothèque",
    },
    {
      title: "Surlignages",
      url: routes.feed.highlights(),
      icon: Highlighter,
      section: "Bibliothèque",
    },
    {
      title: "Portefeuille",
      url: routes.feed.billing(),
      icon: Wallet,
      section: "Bibliothèque",
    },
  ]

  if (user?.role === "creator" || user?.role === "superadmin") {
    sidebarItems.push({
      title: "Studio Créateur",
      url: dashboardUrl,
      icon: LayoutDashboard,
      section: "Espaces",
    })
  }

  if (user?.role === "superadmin") {
    sidebarItems.push({
      title: "Administration",
      url: adminUrl,
      icon: ShieldAlert,
      section: "Espaces",
    })
  }

  return (
    <AppleSidebar
      items={sidebarItems}
      activeUrl={pathname}
      logo={<Logo className="h-6.5 w-auto shrink-0" fillColor="#EE4B2B" />}
      brandName="Platform"
      userName={user?.name || "Lecteur"}
      userEmail={user?.email || ""}
      userFallback={userFallback}
      userAvatar={user?.logoUrl}
      onLogout={async () => {
        await logout()
        window.location.href = "/"
      }}
      onSearchChange={onSearchChange}
      searchPlaceholder="Rechercher flux, écrits..."
      primaryAction={
        user?.role === "creator" || user?.role === "superadmin"
          ? {
              label: "Nouvel Écrit",
              href: `${dashboardUrl}/articles/new`,
            }
          : undefined
      }
    />
  )
}
