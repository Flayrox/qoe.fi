'use server';

import { createClient } from '@qoe/supabase/server';
import { completeOnboardingInDb } from '@qoe/db/onboarding';

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

  return completeOnboardingInDb(user.id, data);
}
