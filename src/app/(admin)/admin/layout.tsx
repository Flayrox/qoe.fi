import { ReactNode } from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { Shield, Search } from "lucide-react"
import { AdminSidebar } from "./components/AdminSidebar"
import { CommandPalette } from "./components/CommandPalette"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: authUser.id }
  })

  // Security Check: Only superadmins
  if (user?.role !== 'superadmin') {
    redirect("/") 
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col md:flex-row p-2 md:p-4 gap-2 md:gap-4 font-sans selection:bg-[#EE4B2B] selection:text-white">
      <AdminSidebar />
      
      <main className="flex-1 bg-white rounded-[36px] border border-neutral-200/60 shadow-2xl overflow-hidden flex flex-col relative">
        <header className="h-[72px] border-b border-neutral-100 flex items-center justify-between px-8 shrink-0 bg-white/80 backdrop-blur-md sticky top-0 z-10">
           <div className="flex items-center gap-3 text-neutral-400 text-xs font-bold tracking-wider uppercase">
             <Shield className="w-4 h-4 text-[#EE4B2B]" />
             SUPERADMIN
           </div>
           
           <div className="flex items-center gap-6">
             {/* Note: In a real app, this button could trigger the CMDK directly, 
                 but since CMDK is global, we just show it as a hint here. */}
             <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-50 border border-neutral-100 text-neutral-400 text-sm font-medium">
               <Search className="w-3.5 h-3.5" />
               <span className="hidden sm:inline">Search...</span>
               <kbd className="hidden sm:inline-flex items-center gap-0.5 font-mono text-[10px] font-bold opacity-60 bg-neutral-200/50 px-1.5 py-0.5 rounded">
                 <span>⌘</span>K
               </kbd>
             </div>
             
             <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#EE4B2B] to-orange-400 text-white flex items-center justify-center font-bold text-sm shadow-sm">
               {user.username?.charAt(0).toUpperCase() || "A"}
             </div>
           </div>
        </header>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white relative">
          {children}
        </div>
      </main>
      
      <CommandPalette />
    </div>
  )
}
