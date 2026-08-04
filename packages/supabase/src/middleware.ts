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
 *
 * En cas de refresh token invalide ou expiré (stale cookie), purge
 * proprement les cookies sb-* pour éviter une boucle de redirection.
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
    error,
  } = await supabase.auth.getUser();

  // Gestion gracieuse des refresh tokens invalides.
  // Ce cas survient quand le navigateur a de vieux cookies sb-* avec un token révoqué.
  // On purge ces cookies pour éviter que le client soit bloqué dans une boucle.
  // Si aucun cookie sb-* n'existe, l'utilisateur n'est simplement pas connecté — c'est normal.
  if (error && !user) {
    const staleCookies = request.cookies.getAll().filter((c) => c.name.startsWith("sb-"));
    if (staleCookies.length > 0) {
      const isTokenError = error.message.includes("Refresh Token Not Found")
        || error.message.includes("Invalid Refresh Token")
        || error.message.includes("invalid claim");

      if (isTokenError) {
        const cookieDomain = getCookieDomain(hostname);
        const cookieDeleteOptions = {
          path: "/",
          ...(cookieDomain ? { domain: cookieDomain } : {}),
          maxAge: 0,
        };

        staleCookies.forEach(({ name }) => {
          supabaseResponse.cookies.set(name, "", cookieDeleteOptions);
        });
      }
    }
  }

  return { supabaseResponse, user };
}
