// =====================================================================
// 🔄 apps/web/src/middleware.ts — Auth + Session Refresh & Multi-tenancy
// =====================================================================

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@qoe/supabase/middleware";

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  // 1. Skip Next.js internals, API, static files and SSO auth routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth/sso") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Refresh Supabase session (toujours)
  const { supabaseResponse, user } = await updateSession(request);

  // 3. Multi-tenancy check
  const hostname = request.headers.get("host") || "";
  const hostWithoutPort = hostname.split(":")[0];

  let currentHost = hostWithoutPort;
  if (hostWithoutPort.endsWith(".localhost")) {
    currentHost = hostWithoutPort.replace(".localhost", "");
  } else if (hostWithoutPort.endsWith(".qoe.test")) {
    currentHost = hostWithoutPort.replace(".qoe.test", "");
  } else if (hostWithoutPort.endsWith(".lvh.me")) {
    currentHost = hostWithoutPort.replace(".lvh.me", "");
  } else if (hostWithoutPort.endsWith(".qoe.fi")) {
    currentHost = hostWithoutPort.replace(".qoe.fi", "");
  }

  // Define domains that are NOT tenant sites
  const systemDomains = [
    "localhost",
    "qoe.test",
    "lvh.me",
    "qoe.fi",
    "www.qoe.fi",
    "start.qoe.fi",
    "api.qoe.fi",
    "dashboard.qoe.fi",
    "admin.qoe.fi"
  ];

  const isSystemDomain = systemDomains.includes(currentHost);

  if (!isSystemDomain) {
    // If the user has no session locally, and we haven't checked SSO in the last 5 mins, redirect to main platform SSO sync.
    const ssoChecked = request.cookies.get("sso_checked")?.value === "true";
    if (!user && !ssoChecked) {
      let mainAppUrl = "https://qoe.fi";
      if (process.env.NODE_ENV === "development") {
        mainAppUrl = "http://qoe.test";
      }
      
      const host = request.headers.get("host") || "localhost:3000";
      const protocol = request.headers.get("x-forwarded-proto") || "http";
      const callbackPath = `/auth/sso/callback?redirect_to=${encodeURIComponent(pathname + url.search)}`;
      const callbackUrl = `${protocol}://${host}${callbackPath}`;
      
      const ssoSyncUrl = new URL(`${mainAppUrl}/auth/sso/sync`);
      ssoSyncUrl.searchParams.set("return_to", callbackUrl);
      return NextResponse.redirect(ssoSyncUrl.toString());
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant-domain", currentHost);

    // Rewrite path to /tenant/[domain]/[path]
    url.pathname = `/tenant/${currentHost}${pathname}`;

    // Return rewritten path with session headers
    const rewriteResponse = NextResponse.rewrite(url, {
      request: {
        headers: requestHeaders,
      },
    });

    // Sync cookies from Supabase session refresh
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      rewriteResponse.cookies.set(cookie.name, cookie.value, cookie);
    });

    return rewriteResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
