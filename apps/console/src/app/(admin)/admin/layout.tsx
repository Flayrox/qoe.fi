// =====================================================================
// 🔴 Layout admin — apps/console/src/app/(admin)/admin/layout.tsx
// =====================================================================
// 📖 Layout vermillon pour l'admin plateforme.
//    Check role === 'superadmin' OBLIGATOIRE.
//
// 🎯 Migré depuis src/app/(admin)/admin/layout.tsx avec auth
//    renforcée (avant : check dans le layout, OK mais on garde
//    aussi le check middleware pour défense en profondeur).
// =====================================================================

import { redirect } from "next/navigation";
import { getCurrentUser } from "@qoe/auth/current-user";
import { isSuperadmin } from "@qoe/auth/roles";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { CommandPalette } from "@/components/admin/CommandPalette";
import { AdminHeader } from "@/components/admin/AdminHeader";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!isSuperadmin(user.role as any)) {
    redirect("/");
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
  );
}
