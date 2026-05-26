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
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <AppSidebar user={dbUser} />
          <main className="lg:col-span-9 min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
