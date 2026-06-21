// =====================================================================
// 🔄 apps/admin/middleware.ts — Auth & Protection pour admin.qoe.fi
// =====================================================================

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@qoe/supabase/middleware";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const { supabaseResponse, user } = await updateSession(request);

  // 1. Déterminer l'URL de login centrale (qoe.fi/login)
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1") || host.includes("qoe.test");
  const loginUrl = isLocal
    ? host.includes("qoe.test")
      ? "http://qoe.test/login"
      : "http://localhost/login"
    : "https://qoe.fi/login";

  // 2. Protection de l'espace admin (layout s'occupe de vérifier le rôle superadmin)
  if (!user) {
    return NextResponse.redirect(new URL(loginUrl));
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
