"use client"

import React from "react"
import { Sidebar } from "@qoe/ui/sidebar"
import { Logo } from "@qoe/ui"
import { routes } from "@qoe/config/routes"

interface AppSidebarProps {
  userName?: string
  userEmail?: string
  userAvatar?: string | null
  userRole?: string
  onLogout?: () => void | Promise<void>
}

export function AppSidebar({
  userName = "Lecteur",
  userEmail = "",
  userAvatar = null,
  userRole = "reader",
  onLogout,
}: AppSidebarProps) {
  const userFallback = userName.slice(0, 2).toUpperCase()

  const menuItems = [
    {
      title: "Accueil",
      url: routes.feed.home(),
      iconName: "Home",
    },
    {
      title: "Signets",
      url: routes.feed.library(),
      iconName: "Bookmark",
    },
    {
      title: "Surlignages",
      url: routes.feed.highlights(),
      iconName: "Highlighter",
    },
    {
      title: "Portefeuille",
      url: routes.feed.billing(),
      iconName: "Wallet",
    },
  ]

  const handleOpenComposer = () => {
    window.dispatchEvent(new CustomEvent("open-composer"))
  }

  return (
    <Sidebar
      items={menuItems}
      logo={<Logo className="h-5 w-auto" fillColor="#EE4B2B" />}
      brandName="qoe.fi"
      userName={userName}
      userEmail={userEmail}
      userFallback={userFallback}
      userAvatar={userAvatar}
      onLogout={onLogout}
      primaryAction={{
        label: "Publier une pensée",
        onClick: handleOpenComposer,
      }}
    />
  )
}
