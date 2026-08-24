'use server';

import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { getSafeRedirectUrl } from '@qoe/utils';
import { getCurrentUserAction, logoutAction } from '@qoe/api-client/actions/auth';

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const rawRedirect = formData.get('redirect') as string;
  const redirectTo = getSafeRedirectUrl(rawRedirect, '/home');

  if (!email || !password) {
    redirect('/login?error=Missing+credentials');
  }

  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !user) {
    redirect(`/login?error=${encodeURIComponent(error?.message || 'Authentication failed')}`);
  }

  // Go (backend-of-record, requis en Phase 3) : GET /v1/me (profil + compteurs).
  // Un nouveau lecteur sans suivi ni mot masqué est dirigé vers l'onboarding.
  const { goFetch } = await import('@qoe/api-client/actions/utils/go-client');
  const profile = await goFetch<{
    id: string;
    role: string;
    followsCount: number;
    mutedWordsCount: number;
  }>('/v1/me');
  if (profile.role === 'user' && profile.followsCount === 0 && profile.mutedWordsCount === 0) {
    redirect('/onboarding');
  }

  redirect(redirectTo || '/home');
}

export async function signup(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const name = formData.get('name') as string;
  const username = formData.get('username') as string;

  if (!email || !password || !name || !username) {
    redirect('/login?error=Missing+fields');
  }

  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        username,
      },
    },
  });

  if (error || !user) {
    redirect(`/login?error=${encodeURIComponent(error?.message || 'Signup failed')}`);
  }

  redirect('/onboarding');
}

export async function logout() {
  await logoutAction();
  redirect('/login');
}

export async function getCurrentUser() {
  return getCurrentUserAction();
}
