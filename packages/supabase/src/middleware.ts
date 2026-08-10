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
 * proprement les cookies sb-* (double-purge: host-only ET root domain)
 * pour éviter toute boucle de redirection.
 */
export async function updateSession(request: NextRequest) {
  const hostHeader = request.headers.get("host");
  const hostname = hostHeader ? hostHeader.split(":")[0] : undefined;

  // 1. Étape 0 : Canonicalisation immédiate de localhost -> lvh.me en dev local
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = "lvh.me";
    return {
      supabaseResponse: NextResponse.redirect(canonicalUrl, { status: 307 }),
      user: null,
    };
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  const cookieDomain = getCookieDomain(hostname);

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
            supabaseResponse.cookies.set(name, value, {
              ...options,
              domain: cookieDomain,
            })
          );
        },
      },
      cookieOptions: {
        domain: cookieDomain,
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

  // Gestion gracieuse des refresh tokens invalides (Stale Cookies).
  // Purge double-target (domain + host-only) pour garantir la suppression intégrale.
  if (error && !user) {
    const staleCookies = request.cookies.getAll().filter((c) => c.name.startsWith("sb-"));
    if (staleCookies.length > 0) {
      const isTokenError =
        error.message.includes("Refresh Token Not Found") ||
        error.message.includes("Invalid Refresh Token") ||
        error.message.includes("invalid claim") ||
        error.message.includes("JWT");

      if (isTokenError) {
        staleCookies.forEach(({ name }) => {
          // Purge 1 : avec domaine de cookie (.lvh.me / .qoe.fi)
          if (cookieDomain) {
            supabaseResponse.cookies.set(name, "", {
              path: "/",
              domain: cookieDomain,
              maxAge: 0,
              expires: new Date(0),
            });
          }
          // Purge 2 : host-only (sans domain) au cas où le cookie initial était mal ciblé
          supabaseResponse.cookies.set(name, "", {
            path: "/",
            maxAge: 0,
            expires: new Date(0),
          });
        });
      }
    }
  }

  return { supabaseResponse, user };
}
