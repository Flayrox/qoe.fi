import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { AppSidebar } from "@/components/layout/AppSidebar"

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      logoUrl: true,
      username: true,
      walletBalanceCents: true
    }
  })

  return (
    <div className="min-h-screen bg-[var(--surface-1)] text-[var(--text-primary)] transition-colors duration-300 font-sans selection:bg-[var(--qoe-vermillion-10)] selection:text-[var(--qoe-vermillion)]">
      <AppSidebar user={dbUser} />
      {/* pl-16 = largeur de la sidebar condensée (64px) */}
      <div className="lg:pl-16 min-h-screen">
        <div className="container mx-auto px-6 py-8 max-w-6xl">
          <main className="min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
