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
    <div className="min-h-screen bg-[#FAFAFA] text-neutral-800 transition-colors duration-300 font-sans selection:bg-[#EE4B2B]/10 selection:text-[#EE4B2B]">
      <AppSidebar user={dbUser} />
      <div className="lg:pl-64 min-h-screen">
        <div className="container mx-auto px-6 py-8 max-w-6xl">
          <main className="min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
