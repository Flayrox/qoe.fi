// =====================================================================
// 🔄 apps/dashboard/middleware.ts — Auth & Protection pour dashboard.qoe.fi
// =====================================================================

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@qoe/supabase/middleware";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const { supabaseResponse, user } = await updateSession(request);

  // 1. Déterminer l'URL de login centrale (qoe.fi/login)
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  const loginUrl = isLocal
    ? "http://localhost:3010/login"
    : "https://qoe.fi/login";

  // 2. Protection de l'espace créateur
  if (!user) {
    return NextResponse.redirect(new URL(loginUrl));
  }

  // 3. Optionnel : vérifier si l'utilisateur a le rôle CREATOR ou SUPERADMIN
  // TODO : s'assurer que seuls les créateurs accèdent au dashboard

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
