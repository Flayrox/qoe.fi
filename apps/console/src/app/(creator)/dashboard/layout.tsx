// =====================================================================
// 🎨 Layout dashboard créateur — apps/console/src/app/(creator)/dashboard/
// =====================================================================
// 📖 Layout shadcn avec AppSidebar (SidebarProvider + SidebarInset).
//    Sert toutes les routes /dashboard/*.
//
// 📖 Migré depuis src/app/(dashboard)/layout.tsx en Phase 3.
//    Amélioration : ajout du check auth (manquant dans l'ancien).
// =====================================================================

import { redirect } from "next/navigation";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/features/dashboard/components/app-sidebar";
import { getCurrentUser } from "@qoe/auth/current-user";
import { isCreator } from "@qoe/auth/roles";
import { Toaster } from "@/components/ui/sonner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // ⚠️ Fix de sécurité : vérifie que c'est bien un créateur (ou superadmin)
  // L'ancien layout ne le faisait pas (bug P7 de l'audit)
  if (!isCreator(user.role as any)) {
    redirect("/");
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-border/50 bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/60">
          <SidebarTrigger />
          <div className="flex-1" />
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>

        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
}
