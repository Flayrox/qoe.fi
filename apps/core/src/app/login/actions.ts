'use server';

import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { getSafeRedirectUrl } from '@qoe/utils';
import { getCurrentUserAction, logoutAction } from '@qoe/sdk/actions/auth';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { validateRegistrationEmail, validateUsername } from '@qoe/moderation';
import { fetchMeProfile } from '@/lib/me';

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
  // fetchMeProfile auto-répare un 404 (ligne User absente — login dev de démo).
  // Le profil n'est qu'une heuristique d'onboarding : une panne Go ne doit pas
  // transformer une connexion valide en erreur 500.
  const profile = await fetchMeProfile().catch(() => null);
  if (
    profile &&
    profile.role === 'user' &&
    profile.followsCount === 0 &&
    profile.mutedWordsCount === 0
  ) {
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

  // 🛡️ Protection Trust & Safety : validation email anti-jetable et anti-multi-comptes
  const emailValidation = validateRegistrationEmail(email);
  if (!emailValidation.valid) {
    redirect(`/login?error=${encodeURIComponent(emailValidation.error || 'Email non autorisé')}`);
  }

  // 🛡️ Protection Trust & Safety : validation pseudo anti-haine et anti-usurpation
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    redirect(
      `/login?error=${encodeURIComponent(usernameValidation.error || "Nom d'utilisateur non autorisé")}`
    );
  }

  // 🚪 Inscriptions ouvertes ou email invité ? Pré-contrôle AVANT
  // supabase.auth.signUp : sans ça, un email refusé créerait quand même un
  // compte Auth orphelin (sans ligne User). Le serveur re-vérifie au sync.
  const normalizedEmail = emailValidation.normalizedEmail || email.trim();
  // Via `goFetch` : URL normalisée, `no-store`, timeout borné (un `fetch` brut
  // laissait le formulaire pendre si Go ne répondait pas).
  // API injoignable → `null` : on laisse passer, le sync tranchera (fail-open
  // côté inscription, fail-closed côté création — aucun compte fantôme).
  const status = await goFetch<{ open?: boolean; allowed?: boolean }>(
    `/v1/auth/registration-status?email=${encodeURIComponent(normalizedEmail)}`
  ).catch(() => null);
  if (status && !status.open && !status.allowed) {
    redirect(
      `/login?error=${encodeURIComponent('Inscriptions sur invitation : cet email n’est pas invité.')}`
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        name: name.trim(),
        username: username.trim(),
        canonicalEmail: emailValidation.canonicalEmail,
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
