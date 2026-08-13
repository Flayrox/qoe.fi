// =====================================================================
// 🖥️ Server Supabase Client
// =====================================================================
// 📖 Pour les Server Components, Server Actions et Route Handlers.
//    Lit/écrit les cookies Next.js automatiquement.
// =====================================================================

import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { getCookieDomain } from './cookie-config';

/**
 * 🖥️ Client Supabase pour le serveur.
 * Gère les cookies via next/headers.
 */
export async function createClient() {
  const cookieStore = await cookies();

  let hostname: string | undefined = undefined;
  try {
    const headersList = await headers();
    const hostHeader = headersList.get('host');
    if (hostHeader) {
      hostname = hostHeader.split(':')[0];
    }
  } catch {
    // headers() might throw in some static generation contexts
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
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
        secure: process.env.NODE_ENV === 'production',
      },
    }
  );
}

/**
 * 🔑 Client avec service role (admin backend, bypass RLS).
 * ⚠️ NE JAMAIS exposer côté client. Uniquement server-side.
 */
export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    }
  );
}
