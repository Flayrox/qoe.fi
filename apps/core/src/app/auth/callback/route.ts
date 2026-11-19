import { NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

function sanitizeNextPath(target: string | null): string {
  if (!target) return '/home';
  // Interdire les URLs absolues, les schémas, les double-slashes et les antislashs (Open Redirect OWASP A01:2021)
  const trimmed = target.trim();
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/\\') &&
    !/^[a-z0-9]+:/i.test(trimmed.substring(1))
  ) {
    return trimmed;
  }
  return '/home';
}

// Derrière le reverse-proxy (Caddy), `new URL(request.url).origin` est
// reconstruit avec l'adresse de bind du container (0.0.0.0:3000) et ne vaut
// PAS l'hôte public (prouvé en prod : les redirects d'erreur partaient sur
// https://0.0.0.0:3000/login). On préfère les headers propagés par Caddy
// (x-forwarded-host, sinon host) + le schéma x-forwarded-proto.
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
  let next = sanitizeNextPath(searchParams.get('next'));

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
        // Go-only : la ligne User est créée/mise à jour depuis le JWT par
        // POST /v1/me/sync (parité syncUserFromAuth Prisma). Passer par
        // `goFetch` garde un seul chemin réseau : `QOE_API_URL` normalisée à
        // l'appel, `cache: 'no-store'`, timeout borné — un `fetch` brut ici
        // pouvait pendre indéfiniment sur le callback d'authentification.
        try {
          const result = await goFetch<{ needsOnboarding?: boolean }>('/v1/me/sync', {
            method: 'POST',
          });
          if (result.needsOnboarding) {
            next = '/onboarding';
          }
        } catch (syncError) {
          if ((syncError as { status?: number }).status === 403) {
            // 🚪 Inscriptions fermées / email non invité : pas de ligne User.
            // On coupe la session Auth (sinon compte orphelin + boucle
            // auto-réparation) et on renvoie vers /login avec un message clair.
            await supabase.auth.signOut();
            const msg =
              (syncError instanceof Error && syncError.message) ||
              'Inscriptions fermées pour le moment. Demandez une invitation.';
            return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(msg)}`);
          }
          // Autre panne (5xx, timeout, API absente) : la ligne User sera créée
          // par l'auto-réparation du prochain GET /v1/me — ne pas bloquer la
          // connexion.
        }
      }

      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(`${base}/login?error=auth-code-error`);
}
