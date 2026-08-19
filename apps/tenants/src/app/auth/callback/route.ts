import { NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';

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
  let next = sanitizeNextPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // Garantit la ligne User (créée côté tenant si nécessaire). La session
        // est ensuite partagée avec les autres apps via le cookie de domaine .qoe.fi.
        const { syncUserFromAuth } = await import('@qoe/db/sync-user');
        await syncUserFromAuth(user);
      }

      // Redirige vers l'article d'origine (next = chemin local, jamais d'URL externe).
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth-code-error`);
}
