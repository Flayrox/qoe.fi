import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { OnboardingFlow } from '@qoe/ui';
import { fetchMeProfile } from '@/lib/me';
import { completeOnboarding } from './actions';

// Contrat GET /v1/home/onboarding (module home — parité getOnboardingData).
interface OnboardingSubtopic {
  id: string;
  name: string;
  slug: string;
  tags?: string[];
}
interface OnboardingCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  subtopics: OnboardingSubtopic[];
}
interface OnboardingCreator {
  id: string;
  name: string | null;
  slug?: string | null;
  subdomain?: string | null;
  logoUrl: string | null;
  heroText: string | null;
  isCertified?: boolean;
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Go (backend-of-record, requis en Phase 3) : GET /v1/me.
  // fetchMeProfile auto-répare un 404 (ligne User absente) avant d'entrer
  // dans l'onboarding. Une panne du profil ne doit pas fermer le parcours :
  // Go reste juge au moment de l'enregistrement.
  const profile = await fetchMeProfile().catch(() => null);
  if (profile?.hasCompletedOnboarding) {
    redirect('/');
  }

  // Go : GET /v1/home/onboarding (catégories statiques + créateurs certifiés).
  // Suggestions indisponibles → listes vides : le parcours reste utilisable,
  // l'alternative serait un écran bloqué pour un contenu d'agrément.
  const onboarding = await goFetch<{
    categories: OnboardingCategory[];
    suggestedCreators: OnboardingCreator[];
  }>('/v1/home/onboarding').catch(() => null);
  const categories = onboarding?.categories ?? [];
  const suggestedCreators = onboarding?.suggestedCreators ?? [];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[90%] xl:max-w-6xl mx-auto animate-in fade-in-0 duration-200">
        <OnboardingFlow
          categories={categories}
          suggestedCreators={suggestedCreators}
          onSubmit={completeOnboarding}
        />
      </div>
    </main>
  );
}
