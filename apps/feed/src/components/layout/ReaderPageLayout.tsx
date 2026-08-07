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
      <div className="fixed inset-0 pointer-events-none z-0 flex flex-col justify-start px-6 pt-16 overflow-hidden bg-background">
        {/* Soft continuous ambient radial glow */}
        <div
          className="absolute top-[5%] left-[20%] w-[60%] h-[50%] rounded-full opacity-45 dark:opacity-25 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, var(--primary, rgba(238,75,43,0.22)) 0%, transparent 70%)",
            filter: "blur(120px)",
          }}
        />

        {/* Static Background "Lire" giant title & manifesto header */}
        <div className="max-w-[580px] mx-auto w-full space-y-3 pt-6 select-none">
          {giantTitle && (
            <div className="flex items-center gap-2">
              <span className="font-sans text-5xl sm:text-6xl font-extrabold text-primary tracking-tighter">
                {giantTitle}
                <span className="text-foreground">{giantTitleSuffix}</span>
              </span>
            </div>
          )}

          <p className="text-sm sm:text-base text-muted-foreground font-normal leading-relaxed max-w-lg">
            Plateforme souveraine de lecture, d&apos;écriture et d&apos;échanges créateurs. Le flux glissant ci-dessous réunit articles longs et micro-posts en une expérience unifiée.
          </p>
        </div>

        {headerWidgets && (
          <div className="max-w-[580px] mx-auto w-full pt-4">{headerWidgets}</div>
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
