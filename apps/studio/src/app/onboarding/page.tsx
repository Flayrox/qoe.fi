import { requireUser } from '@qoe/auth/current-user';
import { prisma } from '@qoe/db/client';
import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/features/onboarding/components/wizard';

export default async function OnboardingPage() {
  const user = await requireUser();

  // S'ils ont déjà passé l'onboarding, on les renvoie sur le dashboard
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
