import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { ALL_LANGUAGES, DEFAULT_LANGUAGE } from '@/tolgee/locales';

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get("host") || "";
  const pathname = url.pathname;

  // 1. Skip assets, API routes, internal Next.js paths
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return await updateSession(request);
  }

  // 2. Multi-tenancy check
  const currentHost =
    process.env.NODE_ENV === "production" && process.env.VERCEL === "1"
      ? hostname.replace(`.qoe.fi`, "")
      : hostname.replace(`.localhost:3000`, "");

  // Define domains that are not tenants (our main app and admin)
  const isMainDomain =
    hostname === "localhost:3000" ||
    hostname === "qoe.fi" ||
    hostname === "www.qoe.fi" ||
    hostname === "admin.localhost:3000" ||
    hostname === "admin.qoe.fi";

  // If we're on a tenant domain (like a custom subdomain or custom domain)
  if (!isMainDomain) {
    // Rewrite path to `/tenant/[domain]/[path]` to avoid routing conflicts with /[locale]
    url.pathname = `/tenant/${currentHost}${pathname}`;
    // We only need to rewrite here, no translation needed for tenants yet (unless requested)
    return NextResponse.rewrite(url);
  }

  // --- Main Domain Logic Below ---

  // 3. Determine locale selection
  // Detect locale from cookie or Accept-Language
  const getPreferredLocale = () => {
    const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
    if (cookieLocale && ALL_LANGUAGES.includes(cookieLocale as any)) {
      return cookieLocale;
    }
    const acceptLanguage = request.headers.get('accept-language');
    if (acceptLanguage) {
      // Basic parser for Accept-Language header
      const langs = acceptLanguage
        .split(',')
        .map(l => l.split(';')[0].trim().substring(0, 2).toLowerCase());
      for (const lang of langs) {
        if (ALL_LANGUAGES.includes(lang as any)) {
          return lang;
        }
      }
    }
    return DEFAULT_LANGUAGE;
  };

  // 4. Handle root path redirect: "/" -> "/[locale]"
  if (pathname === '/') {
    const locale = getPreferredLocale();
    url.pathname = `/${locale}`;
    
    // We must run updateSession first to update the session cookies
    const response = await updateSession(request);
    
    // If updateSession returned a redirect, honor it
    if (response.headers.get('location')) {
      return response;
    }
    
    // Create a redirect response
    const redirectResponse = NextResponse.redirect(url);
    
    // Copy cookies from updateSession response to the redirect response
    response.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    
    return redirectResponse;
  }

  // 5. Check if the pathname starts with a locale
  const segments = pathname.split('/');
  const localeSegment = segments[1];
  const isLocaleSubpath = ALL_LANGUAGES.includes(localeSegment as any);

  let locale = DEFAULT_LANGUAGE;
  if (isLocaleSubpath) {
    locale = localeSegment;
  } else {
    locale = getPreferredLocale();
  }

  // Set the x-locale header on the request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-locale', locale);

  // Clone the request with modified headers so they are passed to the server components
  const modifiedRequest = new NextRequest(request, {
    headers: requestHeaders,
  });

  // Run updateSession with the modified request
  const response = await updateSession(modifiedRequest);

  // If updateSession returned a redirect, honor it
  if (response.headers.get('location')) {
    return response;
  }

  // If it was a locale subpath, ensure the NEXT_LOCALE cookie is synchronized
  if (isLocaleSubpath) {
    const currentCookie = request.cookies.get('NEXT_LOCALE')?.value;
    if (currentCookie !== locale) {
      response.cookies.set('NEXT_LOCALE', locale, {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: '/',
        sameSite: 'lax',
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
