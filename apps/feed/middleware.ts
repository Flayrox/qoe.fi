// =====================================================================
// 🔄 apps/feed/middleware.ts — Auth + Session Refresh pour qoe.fi (Lecteurs)
// =====================================================================

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@qoe/supabase/middleware";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Forward language cookie as header
  const localeCookie = request.cookies.get("x-locale")?.value || "fr";
  request.headers.set("x-locale", localeCookie);

  // 2. Refresh Supabase session (toujours)
  const { supabaseResponse, user } = await updateSession(request);

  // 2. Protection des routes privées des lecteurs
  const protectedRoutes = ["/settings", "/library", "/highlights", "/billing", "/onboarding"];
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 3. Si connecté et qu'on va sur /login, redirige vers /home
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
