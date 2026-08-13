// =====================================================================
// 🔄 apps/web/src/middleware.ts — Auth + Session Refresh & Multi-tenancy
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@qoe/supabase/middleware';
import { parseTenantHost, getMainAppUrl } from '@qoe/config';

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  // 1. Skip Next.js internals, API, static files, already-rewritten tenant routes and SSO auth routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth/sso') ||
    pathname.startsWith('/tenant/') ||
    /\.(ico|png|jpg|jpeg|svg|css|js|webp|json|txt|xml|woff|woff2|ttf|eot)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 1.5 Forward language cookie as request header
  const localeCookie = request.cookies.get('x-locale')?.value || 'fr';
  request.headers.set('x-locale', localeCookie);

  // 2. Refresh Supabase session (toujours)
  const { supabaseResponse, user } = await updateSession(request);
  if (supabaseResponse.status === 307 || supabaseResponse.status === 308) {
    return supabaseResponse;
  }

  // 2.5 Set locale header on response
  supabaseResponse.headers.set('x-locale', localeCookie);

  // 3. Multi-tenancy check via @qoe/config
  const hostname = request.headers.get('host') || '';
  const { subdomain, isSystemDomain } = parseTenantHost(hostname);

  if (!isSystemDomain && subdomain) {
    // If the user has no session locally, and we haven't checked SSO in the last 5 mins, redirect to main platform SSO sync.
    const ssoChecked = request.cookies.get('sso_checked')?.value === 'true';
    if (!user && !ssoChecked) {
      const mainAppUrl = getMainAppUrl(hostname);
      const host = request.headers.get('host') || 'localhost:3000';
      const protocol = request.headers.get('x-forwarded-proto') || 'http';
      const callbackPath = `/auth/sso/callback?redirect_to=${encodeURIComponent(pathname + url.search)}`;
      const callbackUrl = `${protocol}://${host}${callbackPath}`;

      const ssoSyncUrl = new URL(`${mainAppUrl}/auth/sso/sync`);
      ssoSyncUrl.searchParams.set('return_to', callbackUrl);
      return NextResponse.redirect(ssoSyncUrl.toString());
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-domain', subdomain);

    // Rewrite path to /tenant/[domain]/[path]
    url.pathname = `/tenant/${subdomain}${pathname}`;

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

    // Also forward locale header on rewrite
    rewriteResponse.headers.set('x-locale', localeCookie);

    return rewriteResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
