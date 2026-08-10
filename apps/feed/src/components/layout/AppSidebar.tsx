"use client"

import React from "react"
import { Sidebar } from "@qoe/ui/sidebar"
import { Logo } from "@qoe/ui"
import { routes } from "@qoe/config/routes"
import { useTranslate } from "@qoe/i18n"

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
  const { t } = useTranslate()
  const userFallback = userName.slice(0, 2).toUpperCase()

  const menuItems = [
    {
      title: t("feed.home", "Accueil"),
      url: routes.feed.home(),
      iconName: "Home",
    },
    {
      title: t("feed.tab_library", "Signets"),
      url: routes.feed.library(),
      iconName: "Bookmark",
    },
    {
      title: t("highlights.title", "Surlignages"),
      url: routes.feed.highlights(),
      iconName: "Highlighter",
    },
    {
      title: t("settings_reader.tab_billing", "Portefeuille"),
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
        label: t("feed.publish_thought", "Publier une pensée"),
        onClick: handleOpenComposer,
      }}
    />
  )
}

