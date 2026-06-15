import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/features/dashboard/components/app-sidebar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-border/50 bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/60">
          <SidebarTrigger />
          <div className="flex-1" />
          {/* Add more topbar elements here later (search, notifications, etc.) */}
        </header>
        
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
