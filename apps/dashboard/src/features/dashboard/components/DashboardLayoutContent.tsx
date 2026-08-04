"use client"

import React from "react"
import { useSidebar, SidebarInset } from "@/components/ui/sidebar"
import { HeaderClient } from "./HeaderClient"
import { cn } from "@qoe/utils"

export function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <SidebarInset
      className={cn(
        "flex flex-col min-w-0 min-h-screen bg-background transition-all duration-300 ease-in-out md:ml-[256px]"
      )}
    >
      <HeaderClient />
      
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:pl-4 md:pr-6 md:py-6 w-full">
        {children}
      </div>
    </SidebarInset>
  )
}
