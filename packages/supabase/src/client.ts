// =====================================================================
// 🌐 Browser Supabase Client
// =====================================================================
// 📖 Pour les Client Components ("use client").
//    Utilise createBrowserClient de @supabase/ssr (cookies auto).
// =====================================================================

'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getCookieDomain } from './cookie-config';
import { resolveSupabaseUrl } from './url';

/**
 * 🌐 Client Supabase pour le navigateur.
 * Cookies gérés automatiquement par @supabase/ssr.
 */
export function createClient() {
  // Accès statique : Next n'inline que `process.env.NEXT_PUBLIC_*` littéral.
  // `resolveSupabaseUrl` empêche un build local d'inliner l'API de production.
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
  return createBrowserClient(url, anonKey, {
    cookieOptions: {
      domain: getCookieDomain(),
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  });
}
