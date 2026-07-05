"use client"

import React from "react"
import { usePathname } from "next/navigation"
import { Home, Settings, FileText, Users, Mail, PieChart } from "lucide-react"
import { cn } from "@qoe/utils"
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"

const iconMap = {
  Home,
  FileText,
  Mail,
  Users,
  PieChart,
  Settings,
}

export type IconName = keyof typeof iconMap

interface MenuItem {
  title: string
  url: string
  iconName: IconName
}

interface SidebarMenuClientProps {
  items: MenuItem[]
}

export function SidebarMenuClient({ items }: SidebarMenuClientProps) {
  const pathname = usePathname()

  const isLinkActive = (url: string) => {
    if (url === "/") {
      return pathname === "/"
    }
    return pathname.startsWith(url)
  }

  return (
    <SidebarMenu>
      {items.map((item) => {
        const Icon = iconMap[item.iconName]
        const active = isLinkActive(item.url)

        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              size="sm"
              isActive={active}
              tooltip={item.title}
              render={<a href={item.url} />}
              className={cn(
                "transition-colors duration-200 select-none text-xs rounded-md font-sans py-1.5 px-3 h-8 flex items-center gap-2.5",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              {Icon && <Icon strokeWidth={1.5} className="w-4 h-4 shrink-0" />}
              <span className="truncate">{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
