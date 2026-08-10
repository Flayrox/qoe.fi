// =====================================================================
// 🔄 apps/admin/middleware.ts — Auth & Protection pour admin.qoe.fi
// =====================================================================

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@qoe/supabase/middleware";
import { getMonorepoUrl } from "@qoe/config";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0];

  // 1. Étape 0 Absolue : Canonicalisation immédiate de localhost -> admin.lvh.me
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = "admin.lvh.me";
    return NextResponse.redirect(canonicalUrl);
  }

  // Forward language cookie as request header
  const localeCookie = request.cookies.get("x-locale")?.value || "fr";
  request.headers.set("x-locale", localeCookie);

  const { supabaseResponse, user } = await updateSession(request);
  if (supabaseResponse.status === 307 || supabaseResponse.status === 308) {
    return supabaseResponse;
  }
  supabaseResponse.headers.set("x-locale", localeCookie);

  // 2. Protection de l'espace admin avec résolution universelle getMonorepoUrl
  if (!user) {

    const loginBase = `${getMonorepoUrl("feed", host)}/login`;
    const currentTarget = request.nextUrl.href;
    const redirectTarget = `${loginBase}?redirect=${encodeURIComponent(currentTarget)}`;
    return NextResponse.redirect(new URL(redirectTarget));
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
