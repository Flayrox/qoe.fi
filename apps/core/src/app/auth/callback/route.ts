import { NextResponse } from 'next/server';
import { createClient } from '@qoe/supabase/server';

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
        // Go-only : la ligne User est créée/mise à jour depuis le JWT par
        // POST /v1/me/sync (parité syncUserFromAuth Prisma).
        const goApi = process.env.QOE_API_URL;
        if (goApi) {
          const res = await fetch(`${goApi}/v1/me/sync`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${(await await supabase.auth.getSession()).data.session?.access_token ?? ''}`,
            },
          });
          if (res.ok) {
            const result = (await res.json()) as { needsOnboarding?: boolean };
            if (result.needsOnboarding) {
              next = '/onboarding';
            }
          }
        }
      }

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

  return NextResponse.redirect(`${origin}/login?error=auth-code-error`);
}
