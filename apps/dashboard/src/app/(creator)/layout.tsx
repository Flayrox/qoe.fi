import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/features/dashboard/components/app-sidebar"
import { HeaderClient } from "@/features/dashboard/components/HeaderClient"
import { requireCreator } from "@qoe/auth/current-user"
import { redirect } from "next/navigation"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCreator()

  // Si l'utilisateur n'a pas fait l'onboarding mais a déjà un domaine (anciens comptes), on le skip
  if (!user.hasCompletedOnboarding && !user.subdomain) {
    redirect("/onboarding")
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col">
        <HeaderClient />
        
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
