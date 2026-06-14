// =====================================================================
// 🏠 Layout (reader) — apps/console/src/app/(reader)/layout.tsx
// =====================================================================
// 📖 Layout pour toutes les routes lecteur (library, highlights, etc.)
//    Affiche AppSidebar (gauche) + MainContentWrapper + Toaster.
//
// 🎯 Reprend la structure de src/app/(main)/layout.tsx en utilisant
//    nos packages partagés (auth, db, i18n).
// =====================================================================

import { redirect } from "next/navigation";
import { getCurrentUser } from "@qoe/auth/current-user";
import { getRequestDbUser } from "@qoe/db/cached-queries";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MainContentWrapper } from "@/components/layout/MainContentWrapper";

export default async function ReaderLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dbUser = await getRequestDbUser(user.id);

  return (
    <div className="relative min-h-screen bg-[var(--surface-1)] text-[var(--text-primary)] transition-colors duration-300 font-sans selection:bg-[var(--qoe-vermillion-10)] selection:text-[var(--qoe-vermillion)]">
      <AppSidebar user={dbUser} />
      <MainContentWrapper>{children}</MainContentWrapper>
    </div>
  );
}
