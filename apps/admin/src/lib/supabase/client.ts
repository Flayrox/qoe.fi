import { createBrowserClient } from '@supabase/ssr';
import { resolveSupabaseUrl } from '@qoe/supabase/url';
import { requireSupabaseAnonKey } from './env';

export function createClient() {
  return createBrowserClient(
    resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_APP_URL),
    requireSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}
