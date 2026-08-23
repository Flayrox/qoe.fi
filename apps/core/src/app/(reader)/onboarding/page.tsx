import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';
import { getOnboardingData } from '@qoe/db/onboarding';
import { OnboardingFlow } from '@qoe/ui';
import { completeOnboarding } from './actions';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if they already completed onboarding (Go /v1/me, fallback Prisma dev).
  let hasCompletedOnboarding = false;
  try {
    const profile = await goFetch<{ hasCompletedOnboarding: boolean }>('/v1/me');
    hasCompletedOnboarding = profile.hasCompletedOnboarding;
  } catch {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { hasCompletedOnboarding: true },
    });
    hasCompletedOnboarding = dbUser?.hasCompletedOnboarding ?? false;
  }

  if (hasCompletedOnboarding) {
    redirect('/');
  }

  const { categories, suggestedCreators } = await getOnboardingData();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[90%] xl:max-w-6xl mx-auto animate-in fade-in zoom-in duration-500">
        <OnboardingFlow
          categories={categories}
          suggestedCreators={suggestedCreators}
          onSubmit={completeOnboarding}
        />
      </div>
    </main>
  );
}
