import { createClient } from "@qoe/supabase/server"
import { getRequestDbUser } from "../../lib/cached-queries"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { MainContentWrapper } from "@/components/layout/MainContentWrapper"
import { Toaster } from "@/components/ui/sonner"

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const dbUser = user ? await getRequestDbUser(user.id) : null

  return (
    <div className="relative min-h-screen bg-background text-foreground transition-colors duration-300 font-sans selection:bg-primary/10 selection:text-primary">
      <AppSidebar user={dbUser} />
      <MainContentWrapper>
        {children}
      </MainContentWrapper>
      <Toaster />
    </div>
  )
}
