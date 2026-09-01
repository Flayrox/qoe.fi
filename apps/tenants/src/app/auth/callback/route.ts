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

// Idem apps/core : derrière Caddy, `new URL(request.url).origin` vaut
// l'adresse de bind du container (0.0.0.0:3000), pas l'hôte public.
function getPublicBase(request: Request, fallback: string): string {
  const proto =
    request.headers.get('x-forwarded-proto') ??
    (process.env.NODE_ENV === 'development' ? 'http' : 'https');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  return host ? `${proto}://${host}` : fallback;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeNextPath(searchParams.get('next'));

  const isLocalEnv = process.env.NODE_ENV === 'development';
  const base = isLocalEnv ? origin : getPublicBase(request, origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // Go-only : la ligne User est créée/mise à jour par POST /v1/me/sync.
        const goApi = process.env.QOE_API_URL;
        if (goApi) {
          const session = await supabase.auth.getSession();
          await fetch(`${goApi}/v1/me/sync`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.data.session?.access_token ?? ''}`,
            },
          });
        }
      }

      // Retour sur l'article (ou l'accueil) du tenant d'origine.
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(`${base}/?error=auth-code-error`);
}
