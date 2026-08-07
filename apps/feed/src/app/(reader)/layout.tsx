import React from "react"
import { createClient } from "@qoe/supabase/server"
import { MainContentWrapper } from "@/components/layout/MainContentWrapper"
import { Toaster } from "@/components/ui/sonner"

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background text-foreground transition-colors duration-300 font-sans selection:bg-primary/10 selection:text-primary">
      <MainContentWrapper>
        {children}
      </MainContentWrapper>
      <Toaster />
    </div>
  )
}
