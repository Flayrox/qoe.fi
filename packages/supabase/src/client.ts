// =====================================================================
// 🌐 Browser Supabase Client
// =====================================================================
// 📖 Pour les Client Components ("use client").
//    Utilise createBrowserClient de @supabase/ssr (cookies auto).
// =====================================================================

"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * 🌐 Client Supabase pour le navigateur.
 * Cookies gérés automatiquement par @supabase/ssr.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
