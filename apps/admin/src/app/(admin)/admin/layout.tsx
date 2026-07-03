import { ReactNode } from "react"
import { createClient } from "@qoe/supabase/server"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { prisma } from "@qoe/db/client"
import { AdminSidebar } from "./components/AdminSidebar"
import { CommandPalette } from "./components/CommandPalette"
import { AdminHeader } from "./components/AdminHeader"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const headersList = await headers();
  const host = headersList.get("host") || "";

  if (!authUser) {
    const isLocal = host.includes("localhost") || host.includes("qoe.test") || process.env.NODE_ENV === 'development';
    const baseDomain = host.includes("qoe.test") ? "qoe.test" : "localhost";
    const loginUrl = isLocal ? `http://${baseDomain}/login` : "https://qoe.fi/login";
    redirect(loginUrl);
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  })

  // Security Check: Only superadmins
  if (user?.role !== 'superadmin') {
    const isLocal = host.includes("localhost") || host.includes("qoe.test") || process.env.NODE_ENV === 'development';
    const baseDomain = host.includes("qoe.test") ? "qoe.test" : "localhost";
    const homeUrl = isLocal ? `http://${baseDomain}` : "https://qoe.fi";
    redirect(homeUrl);
  }

  return (
    <div className="min-h-screen bg-[#EE4B2B] text-white flex flex-col md:flex-row p-0 md:p-6 lg:p-8 gap-0 md:gap-6 font-sans antialiased selection:bg-[#EE4B2B]/20 selection:text-neutral-900">
      <AdminSidebar />
      
      <main className="flex-1 bg-white rounded-[32px] md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col relative text-neutral-900 ring-1 ring-white/20">
        <AdminHeader user={user} />
        
        <div className="flex-1 overflow-y-auto p-8 md:p-12 lg:p-16 xl:p-24 bg-white relative">
          {children}
        </div>
      </main>
      
      <CommandPalette />
    </div>
  )
}
