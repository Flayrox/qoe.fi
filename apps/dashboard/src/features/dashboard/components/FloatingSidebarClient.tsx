"use client"

import React from "react"
import { usePathname } from "next/navigation"
import { useSidebar } from "@/components/ui/sidebar"
import { Logo } from "@qoe/ui"
import { AppleSidebar, AppleSidebarItem } from "@/components/layout/AppleSidebar"
import {
  Home,
  FileText,
  Mail,
  Users,
  PieChart,
  Code,
  Settings,
} from "lucide-react"

interface MenuItem {
  title: string
  url: string
  iconName: string
}

interface FloatingSidebarClientProps {
  userName: string
  userEmail: string
  userFallback: string
  userAvatar?: string | null
  menuItems: MenuItem[]
  logoutAction: () => Promise<void>
}

const iconMap: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  Home,
  FileText,
  Mail,
  Users,
  PieChart,
  Code,
  Settings,
}

export function FloatingSidebarClient({
  userName,
  userEmail,
  userFallback,
  userAvatar,
  menuItems,
  logoutAction,
}: FloatingSidebarClientProps) {
  const pathname = usePathname()
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  // Conversion des items de menu vers la structure AppleSidebar
  const sidebarItems: AppleSidebarItem[] = menuItems.map((item) => ({
    title: item.title,
    url: item.url,
    icon: iconMap[item.iconName] || FileText,
  }))

  return (
    <AppleSidebar
      items={sidebarItems}
      activeUrl={pathname}
      logo={<Logo className="h-5 w-auto" fillColor="#EE4B2B" />}
      brandName="Studio"
      userName={userName}
      userEmail={userEmail}
      userFallback={userFallback}
      userAvatar={userAvatar}
      onLogout={logoutAction}
      primaryAction={{
        label: "Nouvel Écrit",
        href: "/articles/new",
      }}
    />
  )
}
