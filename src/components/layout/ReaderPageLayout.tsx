"use client"

import React from "react"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

interface ReaderPageLayoutProps {
  giantTitle?: string
  giantTitleSuffix?: string
  children: React.ReactNode
}

export function ReaderPageLayout({ giantTitle, giantTitleSuffix = ".", children }: ReaderPageLayoutProps) {
  const pathname = usePathname()
  const isTimeline = pathname.endsWith("/home") || pathname.endsWith("/home/")

  return (
    <>
      {/* ── IMMERSIVE BACKGROUND BLURS ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[#faf7f5]" />
        
        <div 
          className="absolute bottom-[-20%] left-[-15%] w-[80%] h-[70%] rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, rgba(238,75,43,0.12) 0%, rgba(238,75,43,0.06) 35%, rgba(238,75,43,0.02) 60%, transparent 80%)",
            filter: "blur(60px)",
          }}
        />
        
        <div 
          className="absolute top-[-10%] right-[-10%] w-[60%] h-[50%] rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, rgba(255,180,140,0.15) 0%, rgba(255,200,170,0.08) 40%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />

        <div 
          className="absolute top-[30%] left-[30%] w-[50%] h-[50%] rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, rgba(255,230,215,0.2) 0%, transparent 60%)",
            filter: "blur(100px)",
          }}
        />

        <div 
          className="absolute top-0 right-0 bottom-0 w-[35%]"
          style={{
            background: "linear-gradient(to left, rgba(250,247,245,0.95) 0%, transparent 100%)",
          }}
        />
      </div>

      {/* ── CENTERED CONTAINER ── */}
      <div className={cn(
        "pb-24 max-w-[640px] mx-auto selection:bg-[var(--qoe-vermillion-10)] selection:text-[var(--qoe-vermillion)] relative z-20 px-4 sm:px-6",
        isTimeline ? "pt-[30vh]" : "pt-16"
      )}>
        

        {/* ── STICKY TITLE ── */}
        {giantTitle && (
          <div className={cn("sticky h-0 z-10 pointer-events-none select-none", isTimeline ? "top-0" : "top-[48px]")}>
            <div className="absolute left-2 top-1">
              <span className="font-sans text-5xl font-extrabold text-[var(--qoe-vermillion)] tracking-tighter">
                {giantTitle}<span className="text-[var(--text-primary)]">{giantTitleSuffix}</span>
              </span>
            </div>
          </div>
        )}

        {children}
      </div>
    </>
  )
}
