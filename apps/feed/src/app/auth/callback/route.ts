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
        const { prisma } = await import('@qoe/db/client');
        let dbUser = await prisma.user.findUnique({
          where: { id: user.id },
        });

        if (!dbUser) {
          const emailPrefix = user.email ? user.email.split('@')[0] : 'user';
          let baseUsername = emailPrefix.toLowerCase().replace(/[^a-z0-9_-]/g, '');
          if (!baseUsername) baseUsername = 'user';

          let finalUsername = baseUsername;
          const existingUsername = await prisma.user.findUnique({
            where: { username: finalUsername },
          });
          if (existingUsername) {
            finalUsername = `${baseUsername}_${crypto.randomUUID().replace(/-/g, '').substring(0, 6)}`;
          }

          dbUser = await prisma.user.create({
            data: {
              id: user.id,
              email: user.email!,
              name: user.user_metadata?.name || user.user_metadata?.full_name || emailPrefix,
              username: finalUsername,
              role: 'user',
              hasCompletedOnboarding: false,
            },
          });
          next = '/onboarding';
        } else {
          if (dbUser.role === 'user' && !dbUser.hasCompletedOnboarding) {
            next = '/onboarding';
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
