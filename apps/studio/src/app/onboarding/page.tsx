import { requireUser } from '@qoe/auth/current-user';
import { prisma } from '@qoe/db/client';
import { goFetch, isGoEnabled } from '@qoe/api-client/actions/utils/go-client';
import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/features/onboarding/components/wizard';

export default async function OnboardingPage() {
  // Go en primaire (GET /v1/users/me) : hasCompletedOnboarding + publicationId
  // personnelle (le tenant créateur). Zéro Prisma sur le chemin nominal.
  let needsRedirect = false;
  if (isGoEnabled()) {
    try {
      const me = await goFetch<{
        data: { hasCompletedOnboarding: boolean; publicationId: string | null };
      }>('/v1/users/me');
      needsRedirect = me.data.hasCompletedOnboarding || Boolean(me.data.publicationId);
      if (!needsRedirect) {
        return (
          <main className="min-h-screen bg-foreground">
            <OnboardingWizard />
          </main>
        );
      }
    } catch {
      // 401 (non connecté) ou erreur Go → fallback Prisma dev ci-dessous
      // (requireUser redirige vers le login si besoin).
    }
  }
  if (needsRedirect) {
    redirect('/?already_onboarded=true');
  }

  // Fallback dev (sans QOE_API_URL) : Prisma.
  const user = await requireUser();
  const hasTenant = (await prisma.publication.count({ where: { user: { id: user.id } } })) > 0;
  if (user.hasCompletedOnboarding || hasTenant) {
    redirect('/?already_onboarded=true');
  }

  return (
    <main className="min-h-screen bg-foreground">
      <OnboardingWizard />
    </main>
  );
}
