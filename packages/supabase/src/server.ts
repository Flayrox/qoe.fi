// =====================================================================
// 🖥️ Server Supabase Client
// =====================================================================
// 📖 Pour les Server Components, Server Actions et Route Handlers.
//    Lit/écrit les cookies Next.js automatiquement.
// =====================================================================

import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { getCookieDomain, getCookieSecure } from './cookie-config';
import { resolveSupabaseUrl } from './url';

/**
 * 🖥️ Client Supabase pour le serveur.
 * Gère les cookies via next/headers.
 */
export async function createClient() {
  const cookieStore = await cookies();

  let hostname: string | undefined = undefined;
  try {
    const headersList = await headers();
    // Derrière Caddy, `host` peut être l'adresse de bind du container :
    // x-forwarded-host porte le vrai domaine public (même piège que requireUser).
    const rawHost =
      headersList.get('x-forwarded-host')?.split(',')[0]?.trim() || headersList.get('host');
    if (rawHost) {
      hostname = rawHost.split(':')[0];
    }
  } catch {
    // headers() might throw in some static generation contexts
  }

  // Même règle que côté navigateur : un build local ne s'authentifie jamais
  // contre le Supabase de production (cf. `./url.ts`).
  const url = resolveSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_APP_URL
  );
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error(
      '@qoe/supabase: NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY requis (self-hosted ou cloud)'
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appelé depuis un Server Component : OK car le middleware
          // rafraîchit la session avant chaque render.
        }
      },
    },
    cookieOptions: {
      domain: getCookieDomain(hostname),
      path: '/',
      sameSite: 'lax',
      secure: getCookieSecure(process.env.NEXT_PUBLIC_APP_URL),
    },
  });
}

/**
 * 🔑 Client avec service role (admin backend, bypass RLS).
 * ⚠️ NE JAMAIS exposer côté client. Uniquement server-side.
 */
export function createServiceClient() {
  const url = resolveSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_APP_URL
  );
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('@qoe/supabase: SUPABASE_SERVICE_ROLE_KEY + URL requis (serveur uniquement)');
  }
  return createServerClient(url, serviceKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
