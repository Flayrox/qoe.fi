import { NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';
import { getMainAppUrl } from '@qoe/config';

function sanitizeNextPath(target: string | null): string {
  if (!target) return '/';
  const trimmed = target.trim();
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/\\') &&
    !/^[a-z0-9]+:/i.test(trimmed.substring(1))
  ) {
    return trimmed;
  }
  return '/';
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeNextPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // Garantit la ligne User et détermine si l'onboarding est requis.
        const { syncUserFromAuth } = await import('@qoe/db/sync-user');
        const result = await syncUserFromAuth(user);

        // Nouveau compte (ou compte jamais onboardé) : direction l'onboarding
        // de l'app principale — on ne le saute JAMAIS, même pour Google/Apple.
        if (result.needsOnboarding) {
          const host = request.headers.get('host') || '';
          return NextResponse.redirect(`${getMainAppUrl(host)}/onboarding`);
        }
      }

      // Compte existant onboardé : retour sur l'article d'origine.
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';
      const base = isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin;
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth-code-error`);
}
