import { createServerClient } from '@supabase/ssr';
import { resolveSupabaseUrl } from '@qoe/supabase/url';
import { cookies } from 'next/headers';
import { requireSupabaseAnonKey } from './env';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_APP_URL),
    requireSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
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
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}
