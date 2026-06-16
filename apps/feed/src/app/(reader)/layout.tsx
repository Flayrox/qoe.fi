import { createClient } from "@qoe/supabase/server"
import { redirect } from "next/navigation"
import { getRequestDbUser } from "../../lib/cached-queries"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { MainContentWrapper } from "@/components/layout/MainContentWrapper"
import { Toaster } from "@/components/ui/sonner"

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const dbUser = await getRequestDbUser(user.id)

  return (
    <div className="relative min-h-screen bg-[var(--surface-1)] text-[var(--text-primary)] transition-colors duration-300 font-sans selection:bg-[var(--qoe-vermillion-10)] selection:text-[var(--qoe-vermillion)]">
      <AppSidebar user={dbUser} />
      <MainContentWrapper>
        {children}
      </MainContentWrapper>
      <Toaster />
    </div>
  )
}
