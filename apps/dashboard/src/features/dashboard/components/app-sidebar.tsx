import React from "react"
import { createClient } from "@qoe/supabase/server"
import { prisma } from "@qoe/db/client"
import { logout } from "@/app/login/actions"
import { getTranslate } from "@qoe/i18n/server"
import { Sidebar } from "@qoe/ui/sidebar"
import { Logo } from "@qoe/ui"

export async function AppSidebar() {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  const user = authUser
    ? await prisma.user.findUnique({
        where: { id: authUser.id },
      })
    : null

  const userEmail = user?.email || authUser?.email || "hello@qoe.fi"
  const userName = user?.name || user?.username || (authUser?.user_metadata?.name as string | undefined) || "Creator"
  const userFallback = userName.slice(0, 2).toUpperCase()
  const userAvatar = user?.logoUrl || (authUser?.user_metadata?.avatar_url as string | undefined) || null

  const t = await getTranslate()

  const menuItems = [
    {
      title: t('sidebar.nav_overview', 'Home'),
      url: "/",
      iconName: "Home",
    },
    {
      title: t('sidebar.nav_articles', 'Articles'),
      url: "/articles",
      iconName: "FileText",
    },
    {
      title: t('sidebar.nav_newsletters', 'Newsletters'),
      url: "/newsletters",
      iconName: "Mail",
    },
    {
      title: t('sidebar.nav_audience', 'Audience'),
      url: "/audience",
      iconName: "Users",
    },
    {
      title: t('sidebar.nav_analytics', 'Analytics'),
      url: "/analytics",
      iconName: "PieChart",
    },
    {
      title: t('sidebar.nav_developer', 'Développeur / API'),
      url: "/developer",
      iconName: "Code",
    },
    {
      title: t('sidebar.nav_settings', 'Paramètres'),
      url: "/settings",
      iconName: "Settings",
    },
    {
      title: "Importation (Substack)",
      url: "/import",
      iconName: "Upload",
    },
  ]

  return (
    <Sidebar
      items={menuItems}
      logo={<Logo className="h-5 w-auto" fillColor="#EE4B2B" />}
      brandName="Studio"
      userName={userName}
      userEmail={userEmail}
      userFallback={userFallback}
      userAvatar={userAvatar}
      onLogout={logout}
      primaryAction={{
        label: "Nouvel Écrit",
        href: "/articles/new",
      }}
    />
  )
}
