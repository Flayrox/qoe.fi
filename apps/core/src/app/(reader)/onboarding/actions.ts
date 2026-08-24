'use server';

import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';

export async function completeOnboarding(data: {
  interests: string[];
  subtopics?: string[];
  onboardingText?: string;
  mutedWords: string[];
  creatorsToFollow: string[];
  gender?: string;
  ageRange?: string;
  pronouns?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Unauthorized');

  // Go (backend-of-record, requis en Phase 3) : POST /v1/me/onboarding-complete
  // (profil + embedding pgvector + mots masqués + suivis — parité completeOnboardingInDb).
  await goFetch('/v1/me/onboarding-complete', {
    method: 'POST',
    body: data,
  });

  return { success: true };
}
