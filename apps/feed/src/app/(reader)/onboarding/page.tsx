import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { OnboardingFlow } from './OnboardingFlow';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if they already completed onboarding
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { hasCompletedOnboarding: true },
  });

  if (dbUser?.hasCompletedOnboarding) {
    redirect('/');
  }

  // Get interest categories from SystemConfig (modifiable from admin config menu)
  let uniqueCategories = [];
  const configInterests = await prisma.systemConfig.findUnique({
    where: { key: 'ONBOARDING_INTERESTS' },
  });

  if (configInterests) {
    const list = configInterests.value
      .split(',')
      .map((i: string) => i.trim())
      .filter(Boolean);
    uniqueCategories = list.map((name: string) => ({
      id: name,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
    }));
  } else {
    // Default list
    const defaultList = [
      'Politique',
      'International',
      'Technologie',
      'Économie',
      'Philosophie',
      'Sciences',
      'Art & Design',
    ];
    try {
      await prisma.systemConfig.create({
        data: {
          key: 'ONBOARDING_INTERESTS',
          value: defaultList.join(', '),
          description:
            "Liste des centres d'intérêt proposés lors de l'onboarding (séparés par des virgules).",
        },
      });
    } catch {
      // Ignore if concurrent creation happens
    }
    uniqueCategories = defaultList.map((name) => ({
      id: name,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
    }));
  }

  // Get some certified creators to suggest
  const suggestedCreators = await prisma.user.findMany({
    where: {
      role: 'creator',
      isCertified: true,
    },
    select: { id: true, name: true, subdomain: true, logoUrl: true, heroText: true },
    take: 5,
  });

  // Fallback if no certified creators exist yet (for dev)
  const creators =
    suggestedCreators.length > 0
      ? suggestedCreators
      : await prisma.user.findMany({
          where: { role: 'creator' },
          select: { id: true, name: true, subdomain: true, logoUrl: true, heroText: true },
          take: 5,
        });

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[90%] xl:max-w-6xl mx-auto animate-in fade-in zoom-in duration-500">
        <OnboardingFlow
          categories={uniqueCategories}
          suggestedCreators={creators}
          userId={user.id}
        />
      </div>
    </main>
  );
}
