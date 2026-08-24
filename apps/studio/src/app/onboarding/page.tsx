import { requireUser } from '@qoe/auth/current-user';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/features/onboarding/components/wizard';

export default async function OnboardingPage() {
  // Go : GET /v1/users/me — hasCompletedOnboarding + publicationId personnelle
  // (le tenant créateur).
  const user = await requireUser();
  let me: { data: { hasCompletedOnboarding: boolean; publicationId: string | null } };
  try {
    me = await goFetch<{ data: { hasCompletedOnboarding: boolean; publicationId: string | null } }>(
      '/v1/users/me'
    );
  } catch {
    me = {
      data: {
        hasCompletedOnboarding: user.hasCompletedOnboarding,
        publicationId: null,
      },
    };
  }

  const hasTenant = Boolean(me.data.publicationId);
  if (me.data.hasCompletedOnboarding || hasTenant) {
    redirect('/?already_onboarded=true');
  }

  return (
    <main className="min-h-screen bg-foreground">
      <OnboardingWizard />
    </main>
  );
}
