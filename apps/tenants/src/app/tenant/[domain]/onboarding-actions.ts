'use server';

import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';

export async function completeOnboarding(data: {
  interests: string[];
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

  // Go-first : POST /v1/me/onboarding-complete (parité completeOnboardingInDb).
  return goFetch('/v1/me/onboarding-complete', {
    method: 'POST',
    body: {
      interests: data.interests,
      subtopics: [],
      onboardingText: data.onboardingText ?? '',
      mutedWords: data.mutedWords,
      creatorsToFollow: data.creatorsToFollow,
      gender: data.gender ?? '',
      ageRange: data.ageRange ?? '',
      pronouns: data.pronouns ?? '',
    },
  });
}
