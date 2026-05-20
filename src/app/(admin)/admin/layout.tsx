import { ReactNode } from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import Link from "next/link"
import { Shield, Users, Activity, Settings2 } from "lucide-react"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  })

  // Security Check: Only superadmins
  if (user?.role !== 'superadmin') {
    redirect("/") // Or return 403 Forbidden
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex">
      <aside className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-zinc-800">
          <Link href="/admin" className="flex items-center gap-2 font-bold text-lg">
            <Shield className="w-5 h-5 text-red-500" />
            GOD MODE
          </Link>
        </div>
        <nav className="p-4 space-y-2 flex-1">
          <Link href="/admin" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition-colors">
            <Activity className="w-4 h-4 text-zinc-400" /> System Health
          </Link>
          <Link href="/admin/creators" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 font-medium hover:bg-zinc-800 hover:text-white transition-colors">
            <Users className="w-4 h-4" /> Moderation
          </Link>
          <Link href="/admin/config" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 font-medium hover:bg-zinc-800 hover:text-white transition-colors">
            <Settings2 className="w-4 h-4" /> Feature Flags
          </Link>
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
