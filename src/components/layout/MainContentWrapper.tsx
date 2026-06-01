"use client"

import React from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export function MainContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isHome = 
    pathname.endsWith("/home") || pathname.endsWith("/home/") ||
    pathname.endsWith("/library") || pathname.endsWith("/library/") ||
    pathname.endsWith("/highlights") || pathname.endsWith("/highlights/") ||
    pathname.endsWith("/billing") || pathname.endsWith("/billing/")

  return (
    <div className={cn("min-h-screen transition-all duration-300", isHome ? "lg:pl-0" : "lg:pl-16")}>
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <main className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
