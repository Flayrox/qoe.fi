"use client"

import React from "react"
import { usePathname } from "next/navigation"
import {
  Home,
  FileText,
  Mail,
  Users,
  PieChart,
  Code,
  Settings,
  HelpCircle,
  LogOut,
  Plus
} from "lucide-react"
import { cn } from "@qoe/utils"
import Link from "next/link"

const iconMap = {
  Home,
  FileText,
  Mail,
  Users,
  PieChart,
  Code,
  Settings,
  HelpCircle,
  LogOut,
  Plus
}

export type IconName = keyof typeof iconMap

interface MenuItem {
  title: string
  url: string
  iconName: IconName
}

interface SidebarMenuClientProps {
  items: MenuItem[]
  isCollapsed?: boolean
}

export function SidebarMenuClient({ items, isCollapsed = false }: SidebarMenuClientProps) {
  const pathname = usePathname()

  const isLinkActive = (url: string) => {
    if (url === "/") {
      return pathname === "/"
    }
    return pathname.startsWith(url)
  }

  return (
    <nav className={cn("flex flex-col gap-1 w-full", isCollapsed && "items-center")}>
      {items.map((item) => {
        const Icon = iconMap[item.iconName]
        const active = isLinkActive(item.url)

        return (
          <Link
            key={item.title}
            href={item.url}
            title={isCollapsed ? item.title : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl text-xs transition-all duration-200 select-none font-sans",
              isCollapsed ? "w-10 h-10 justify-center p-0" : "px-3 py-2 w-full",
              active
                ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {Icon && <Icon className="w-4 h-4 shrink-0 stroke-[1.75]" />}
            {!isCollapsed && <span className="truncate">{item.title}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
