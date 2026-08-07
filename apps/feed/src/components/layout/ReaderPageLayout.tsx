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
  children,
}: ReaderPageLayoutProps) {
  const pathname = usePathname()
  const isTimeline = pathname.endsWith("/home") || pathname.endsWith("/home/")

  return (
    <div className="relative min-h-screen bg-background text-foreground selection:bg-primary/10 selection:text-primary">
      {/* ── SEAMLESS FULL-VIEWPORT BACKGROUND CANVAS (STATIC) ── */}
      <div className="fixed top-0 bottom-0 right-0 left-0 md:left-[256px] pointer-events-none z-0 flex flex-col justify-start overflow-hidden bg-background">
        {/* Soft continuous ambient radial glow */}
        <div
          className="absolute top-[5%] left-[20%] w-[60%] h-[50%] rounded-full opacity-45 dark:opacity-25 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, var(--primary, rgba(238,75,43,0.22)) 0%, transparent 70%)",
            filter: "blur(120px)",
          }}
        />

        {/* Static Background "Lire" giant title & manifesto header (aligned 1:1 with max-w-3xl timeline sheet) */}
        <div className="max-w-3xl mx-auto px-3 sm:px-6 w-full space-y-3 pt-12 sm:pt-14 select-none">
          {giantTitle && (
            <div className="flex items-center gap-2">
              <span className="font-sans text-5xl sm:text-6xl font-extrabold text-primary tracking-tighter">
                {giantTitle}
                <span className="text-foreground">{giantTitleSuffix}</span>
              </span>
            </div>
          )}

          <p className="text-sm sm:text-base text-muted-foreground font-normal leading-relaxed max-w-xl">
            Plateforme souveraine de lecture, d&apos;écriture et d&apos;échanges créateurs. Le flux glissant ci-dessous réunit articles longs et micro-posts en une expérience unifiée.
          </p>

          {headerWidgets && (
            <div className="w-full pt-2">{headerWidgets}</div>
          )}
        </div>
      </div>

      {/* ── FOREGROUND SLIDING FEED SHEET (FULL STAGE WIDTH) ── */}
      <div className="relative z-10 w-full min-h-screen">
        <div className={cn("w-full px-0 sm:px-2 md:px-4", isTimeline ? "pt-0" : "pt-8")}>
          {children}
        </div>
      </div>
    </div>
  )
}
