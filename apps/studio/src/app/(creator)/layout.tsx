import { GlobalCommandMenu } from '@/features/dashboard/components/GlobalCommandMenu';
import { AppSidebar } from '@/features/dashboard/components/app-sidebar';
import { DashboardLayoutContent } from '@/features/dashboard/components/DashboardLayoutContent';
import { requireUser } from '@qoe/auth/current-user';
import { prisma } from '@qoe/db/client';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Si l'utilisateur n'est pas créateur ou superadmin, il doit être redirigé vers l'onboarding pour créer son espace
  const isCreatorOrAdmin = user.role === 'creator' || user.role === 'superadmin';
  if (!isCreatorOrAdmin) {
    redirect('/onboarding');
  }

  // Si l'utilisateur n'a pas fait l'onboarding mais a déjà un domaine (anciens comptes), on le skip
  const hasTenant = (await prisma.publication.count({ where: { user: { id: user.id } } })) > 0;
  if (!user.hasCompletedOnboarding && !hasTenant) {
    redirect('/onboarding');
  }

  return (
    <div className="relative flex min-h-screen bg-background">
      <AppSidebar />
      <DashboardLayoutContent>
        <GlobalCommandMenu />
        {children}
      </DashboardLayoutContent>
    </div>
  );
}
