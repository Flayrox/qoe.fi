// =====================================================================
// 🔄 apps/feed/middleware.ts — Auth + Session Refresh pour qoe.fi (Lecteurs)
// =====================================================================

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@qoe/supabase/middleware";
import { getSafeRedirectUrl } from "@qoe/utils";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0];
  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  // 1. Étape 0 Absolue : Canonicalisation immédiate de localhost -> lvh.me
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    url.hostname = "lvh.me";
    return NextResponse.redirect(url);
  }

  // Read language cookie
  const localeCookie = request.cookies.get("x-locale")?.value || "fr";

  // Forward language as a request header for Server Components
  request.headers.set("x-locale", localeCookie);

  // Refresh Supabase session (toujours)
  const { supabaseResponse, user } = await updateSession(request);
  if (supabaseResponse.status === 307 || supabaseResponse.status === 308) {
    return supabaseResponse;
  }

  // Set the locale header on the response
  supabaseResponse.headers.set("x-locale", localeCookie);

  // 2. Protection des routes privées des lecteurs
  const protectedRoutes = ["/settings", "/library", "/highlights", "/billing", "/onboarding"];
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtectedRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  // 3. Si connecté et qu'on va sur /login, redirige vers la cible de retour (ou /home)
  if ((pathname === "/login" || pathname === "/register") && user) {
    const customRedirect = request.nextUrl.searchParams.get("redirect") || request.nextUrl.searchParams.get("next");
    if (customRedirect) {
      const safeRedirect = getSafeRedirectUrl(customRedirect, "");
      if (safeRedirect) {
        try {
          return NextResponse.redirect(new URL(safeRedirect, request.url));
        } catch {
          // Fallback si l'URL est invalide
        }
      }
    }
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/home";
    homeUrl.searchParams.delete("redirect");
    homeUrl.searchParams.delete("next");
    return NextResponse.redirect(homeUrl);
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
