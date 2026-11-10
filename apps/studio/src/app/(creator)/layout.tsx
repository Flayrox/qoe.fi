import { GlobalCommandMenu } from '@/features/dashboard/components/GlobalCommandMenu';
import { AppSidebar } from '@/features/dashboard/components/app-sidebar';
import { DashboardLayoutContent } from '@/features/dashboard/components/DashboardLayoutContent';
import { SurfaceHotkeys } from '@/features/dashboard/components/SurfaceHotkeys';
import { FeatureAnnouncements } from '@/features/upcoming/provider';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { getLanguage } from '@qoe/i18n/server';
import { fetchPendingAcceptances } from '@qoe/sdk/actions/legal';
import { LegalConsentGate, type ConsentItem } from '@qoe/ui';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Si l'utilisateur n'est pas créateur ou superadmin, il doit être redirigé vers l'onboarding pour créer son espace
  const isCreatorOrAdmin = user.role === 'creator' || user.role === 'superadmin';
  if (!isCreatorOrAdmin) {
    redirect('/onboarding');
  }

  // Si l'utilisateur n'a pas fait l'onboarding mais a déjà un domaine (anciens comptes), on le skip.
  // Go : GET /v1/users/me → publisherId (null si aucun tenant).
  let hasTenant = false;
  try {
    const me = await goFetch<{ data: { publisherId: string | null } }>('/v1/users/me');
    hasTenant = Boolean(me.data.publisherId);
  } catch {
    hasTenant = false;
  }
  if (!user.hasCompletedOnboarding && !hasTenant) {
    redirect('/onboarding');
  }

  // ⚖️ Accord créateur & utilisation acceptable : le studio n'héberge pas de
  // pages légales publiques, on renvoie vers le site lecteur (pages indexées,
  // avec historique des versions).
  const locale = await getLanguage();
  const pendingConsents: ConsentItem[] = (await fetchPendingAcceptances(locale)).map((item) => ({
    slug: item.slug,
    title: item.title,
    version: item.version,
  }));
  const legalHrefBase = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://qoe.fi'}/legal`;

  // 🛡️ Le Cmd+K suit les permissions du workspace actif, comme la sidebar :
  // un viewer média ne se voit pas proposer « Rédiger un article ».
  const workspace = await getActiveWorkspace(user.id).catch(() => null);
  const workspacePermissions = workspace?.type === 'MEDIA' ? workspace.permissions : undefined;

  return (
    <div className="relative flex min-h-screen bg-background">
      <SurfaceHotkeys />
      <AppSidebar />
      <DashboardLayoutContent>
        <FeatureAnnouncements locale={locale}>
          <GlobalCommandMenu permissions={workspacePermissions} />
          {children}
        </FeatureAnnouncements>
      </DashboardLayoutContent>
      <LegalConsentGate pending={pendingConsents} locale={locale} hrefBase={legalHrefBase} />
    </div>
  );
}
