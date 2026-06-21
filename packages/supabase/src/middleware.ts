// =====================================================================
// 🔄 Middleware Supabase — Refresh session
// =====================================================================
// 📖 Appelé par le middleware Next.js à chaque requête.
//    Rafraîchit le token JWT Supabase s'il est expiré.
//
// 📖 Pattern officiel recommandé par Supabase :
//    https://supabase.com/docs/guides/auth/server-side/nextjs
// =====================================================================

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getCookieDomain } from "./cookie-config";

/**
 * 🔄 Met à jour la session Supabase pour la requête en cours.
 * Retourne la response avec les cookies rafraichis.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  const hostHeader = request.headers.get("host");
  const hostname = hostHeader ? hostHeader.split(":")[0] : undefined;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
      cookieOptions: {
        domain: getCookieDomain(hostname),
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    }
  );

  // ⚠️ IMPORTANT : ne pas mettre de code entre createServerClient et getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user };
}
