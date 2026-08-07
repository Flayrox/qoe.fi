"use client"

import React from "react"
import { usePathname } from "next/navigation"
import { cn } from "@qoe/utils"

interface ReaderPageLayoutProps {
  giantTitle?: string
  giantTitleSuffix?: string
  headerWidgets?: React.ReactNode
  children: React.ReactNode
}

export function ReaderPageLayout({ 
  giantTitle, 
  giantTitleSuffix = ".", 
  headerWidgets,
  children 
}: ReaderPageLayoutProps) {
  const pathname = usePathname()
  const isTimeline = pathname.endsWith("/home") || pathname.endsWith("/home/")

  return (
    <div className="relative min-h-screen bg-background text-foreground selection:bg-accent-brand/10 selection:text-accent-brand">
      {/* ── IMMERSIVE BACKGROUND CANVAS / "LIRE" MANIFESTO LAYER ── */}
      <div className="fixed top-0 left-0 md:left-[260px] right-0 h-screen pointer-events-none z-0 flex flex-col justify-start px-6 pt-12 overflow-hidden">
        {/* Soft background ambient glow */}
        <div 
          className="absolute top-[10%] left-[20%] w-[50%] h-[40%] rounded-full opacity-40 dark:opacity-20 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, var(--accent-brand, rgba(238,75,43,0.15)) 0%, transparent 70%)",
            filter: "blur(100px)",
          }}
        />

        {/* Background "Lire" giant title & manifesto header */}
        <div className="max-w-[580px] mx-auto w-full space-y-3 pt-6 select-none opacity-90 transition-opacity">
          {giantTitle && (
            <div className="flex items-center gap-2">
              <span className="font-sans text-5xl sm:text-6xl font-extrabold text-accent-brand tracking-tighter">
                {giantTitle}<span className="text-foreground">{giantTitleSuffix}</span>
              </span>
            </div>
          )}

          <p className="text-sm sm:text-base text-muted-foreground font-normal leading-relaxed max-w-lg">
            Plateforme souveraine de lecture, d&apos;écriture et d&apos;échanges créateurs. Le flux glissant ci-dessous réunit articles longs et micro-posts en une expérience unifiée.
          </p>
        </div>

        {headerWidgets && (
          <div className="max-w-[580px] mx-auto w-full pt-4">
            {headerWidgets}
          </div>
        )}
      </div>

      {/* ── FOREGROUND SLIDING FEED SHEET ── */}
      <div className="relative z-10 w-full min-h-screen">
        <div className={cn("max-w-[580px] mx-auto px-3 sm:px-4 w-full", isTimeline ? "pt-0" : "pt-8")}>
          {children}
        </div>
      </div>
    </div>
  )
}
