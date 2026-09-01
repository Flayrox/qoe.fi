// =====================================================================
// 🔄 apps/studio/middleware.ts — Auth & Protection pour studio.qoe.fi
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@qoe/supabase/middleware';
import { getMonorepoUrl } from '@qoe/config';

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0];

  // 1. Étape 0 Absolue : Canonicalisation immédiate de localhost -> studio.lvh.me
  // S'exécute avant toute lecture d'URL ou de session pour éliminer toute fuite de localhost dans les paramètres redirect.
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = 'studio.lvh.me';
    return NextResponse.redirect(canonicalUrl);
  }

  // Forward language cookie as request header
  const localeCookie = request.cookies.get('x-locale')?.value || 'fr';
  request.headers.set('x-locale', localeCookie);

  const { supabaseResponse, user } = await updateSession(request);
  if (supabaseResponse.status === 307 || supabaseResponse.status === 308) {
    return supabaseResponse;
  }
  supabaseResponse.headers.set('x-locale', localeCookie);
  // Chemin courant pour les composants serveur (ex: badge notifications)
  supabaseResponse.headers.set('x-pathname', request.nextUrl.pathname);

  // 2. Protection de l'espace créateur avec résolution universelle getMonorepoUrl
  if (!user) {
    const loginBase = `${getMonorepoUrl('feed', host)}/login`;
    // ⚠️ PIÈGE PROXY (vécu 01/09) : `request.nextUrl.href` est reconstruit
    // par Next avec l'adresse de bind du container (0.0.0.0:3000) derrière
    // Caddy — le ?redirect= partait sur https://0.0.0.0:3000. On construit
    // l'URL de retour depuis les headers propagés par le proxy
    // (x-forwarded-host sinon host) + x-forwarded-proto, avec repli sur
    // l'URL canonique du studio si tout est une adresse interne.
    const proto =
      request.headers.get('x-forwarded-proto') ||
      (process.env.NODE_ENV === 'production' ? 'https' : 'http');
    const rawHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    const isBindAddress = /^(0\.0\.0\.0|127\.0\.0\.1|\[?::1\]?|localhost)(:\d+)?$/i.test(rawHost);
    const safeHost = isBindAddress ? '' : rawHost;
    const currentTarget = safeHost
      ? `${proto}://${safeHost}${request.nextUrl.pathname}${request.nextUrl.search}`
      : `${getMonorepoUrl('dashboard')}${request.nextUrl.pathname}${request.nextUrl.search}`;
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
