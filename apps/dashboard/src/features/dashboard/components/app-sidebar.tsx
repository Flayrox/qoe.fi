import React from "react"
import { createClient } from "@qoe/supabase/server"
import { prisma } from "@qoe/db/client"
import { logout } from "@/app/login/actions"
import { getTranslate } from "@qoe/i18n/server"
import { SidebarMenuClient, type IconName } from "./SidebarMenuClient"
import { FloatingSidebarClient } from "./FloatingSidebarClient"
import { Plus } from "lucide-react"
import Link from "next/link"
import { Logo } from "@qoe/ui"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar"

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
  const userName = user?.name || "Creator"
  const userFallback = userName.slice(0, 2).toUpperCase()

  const t = await getTranslate()

  const menuItems = [
    {
      title: t('sidebar.nav_overview', 'Home'),
      url: "/",
      iconName: "Home" as IconName,
    },
    {
      title: t('sidebar.nav_articles', 'Articles'),
      url: "/articles",
      iconName: "FileText" as IconName,
    },
    {
      title: t('sidebar.nav_newsletters', 'Newsletters'),
      url: "/newsletters",
      iconName: "Mail" as IconName,
    },
    {
      title: t('sidebar.nav_audience', 'Audience'),
      url: "/audience",
      iconName: "Users" as IconName,
    },
    {
      title: t('sidebar.nav_analytics', 'Analytics'),
      url: "/analytics",
      iconName: "PieChart" as IconName,
    },
    {
      title: t('sidebar.nav_developer', 'Développeur / API'),
      url: "/developer",
      iconName: "Code" as IconName,
    },
    {
      title: t('sidebar.nav_settings', 'Paramètres'),
      url: "/settings",
      iconName: "Settings" as IconName,
    },
  ]

  return (
    <>
      {/* Desktop Floating Rounded Sidebar Card with Collapse/Expand */}
      <FloatingSidebarClient
        userName={userName}
        userEmail={userEmail}
        userFallback={userFallback}
        menuItems={menuItems}
        logoutAction={logout}
      />

      {/* Mobile Drawer (Visible only on mobile md:hidden) */}
      <Sidebar className="md:hidden border-r border-border/50 bg-sidebar">
        <SidebarHeader className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <Logo className="h-4.5 w-auto" fillColor="currentColor" />
            <span className="font-sans text-sm font-semibold tracking-tight text-sidebar-foreground">qoe.fi</span>
          </div>
          <Link
            href="/articles/new"
            className="w-full py-2 px-3 bg-primary text-primary-foreground rounded-xl font-sans text-xs font-semibold flex items-center justify-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Draft</span>
          </Link>
        </SidebarHeader>

        <SidebarContent className="px-2">
          <SidebarMenuClient items={menuItems} />
        </SidebarContent>

        <SidebarFooter className="p-3 border-t border-border/40">
          <form action={logout} className="w-full">
            <button
              type="submit"
              className="w-full text-left px-2 py-1.5 text-destructive font-sans text-xs font-semibold hover:bg-destructive/10 rounded-lg"
            >
              Logout
            </button>
          </form>
        </SidebarFooter>
      </Sidebar>
    </>
  )
}
