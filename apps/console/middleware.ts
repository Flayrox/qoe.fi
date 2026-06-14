// =====================================================================
// 🔄 apps/console/middleware.ts — Auth + Dispatch par host
// =====================================================================
// 📖 Ce middleware est appelé pour TOUTES les requêtes vers qoe.fi
//    (et sous-domaines dashboard.*, admin.*).
//
// 🎯 2 responsabilités UNIQUEMENT :
//    1. Refresh session Supabase
//    2. Dispatch par host : force les paths selon le sous-domaine
//
// 📖 vs src/middleware.ts actuel : c'était devenu 155 lignes avec
//    auth + locale + multi-tenancy. Maintenant chaque app a son
//    propre middleware simple.
// =====================================================================

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@qoe/supabase/middleware";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  // 1. Refresh Supabase session (toujours)
  const { supabaseResponse, user } = await updateSession(request);

  // 2. Dispatch par sous-domaine
  // Si on est sur admin.qoe.fi mais qu'on n'est pas sur /admin/* → redirige
  if (host.startsWith("admin.")) {
    if (!pathname.startsWith("/admin") && pathname !== "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
  }
  // Si on est sur dashboard.qoe.fi mais qu'on n'est pas sur /dashboard/* → redirige
  else if (host.startsWith("dashboard.")) {
    if (!pathname.startsWith("/dashboard") && pathname !== "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  // 3. Protection des routes privées
  if (pathname.startsWith("/dashboard")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/admin")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    // TODO Phase 3.5 : ajouter check role === 'superadmin' via /api ou cache
  }

  // 4. Si connecté et qu'on va sur /login, redirige vers /home
  if (pathname === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Skip Next.js internals + static files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
