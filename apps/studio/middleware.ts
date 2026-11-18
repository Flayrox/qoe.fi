// =====================================================================
// 🔄 apps/studio/middleware.ts — Auth & Protection pour studio.qoe.fi
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@qoe/supabase/middleware';
import { getMonorepoUrl } from '@qoe/config';
import { isCrossOriginServerAction } from '@qoe/utils';
import { workspaceCookie } from './src/lib/workspace-cookie';
import { safeLocale } from './src/lib/locale-header';

export async function middleware(request: NextRequest) {
  // 0. Server actions du studio : refus d'une origine tierce avant toute
  //    lecture de session.
  if (isCrossOriginServerAction(request)) {
    return new NextResponse(null, { status: 403 });
  }

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
  // Liste blanche : une valeur de cookie arbitraire ne doit pas atterrir
  // telle quelle dans un en-tête.
  const localeCookie = safeLocale(request.cookies.get('x-locale')?.value);
  request.headers.set('x-locale', localeCookie);

  const { supabaseResponse, user } = await updateSession(request);
  if (supabaseResponse.status === 307 || supabaseResponse.status === 308) {
    return supabaseResponse;
  }
  supabaseResponse.headers.set('x-locale', localeCookie);
  // Chemin courant pour les composants serveur (ex: badge notifications)
  supabaseResponse.headers.set('x-pathname', request.nextUrl.pathname);

  // 1bis. UI Lab de développement (packages/ui + patterns) : accessible sans
  // session en local, sinon la page de revue serait derrière le login créateur.
  // La route elle-même renvoie 404 en production.
  // Le job E2E sert un build de production (`PLAYWRIGHT_APPS_PROD=1`) : sans ce
  // drapeau, le middleware renvoyait /dev/editor-check vers le login et le banc
  // n'était jamais rendu. La page elle-même reste un 404 hors dev.
  const isDev = process.env.NODE_ENV !== 'production';
  const devRoutesAllowed = isDev || process.env.QOE_E2E_DEV_ROUTES === '1';
  if (
    devRoutesAllowed &&
    (request.nextUrl.pathname === '/dev' || request.nextUrl.pathname.startsWith('/dev/'))
  ) {
    return supabaseResponse;
  }

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
      : `${getMonorepoUrl('studio')}${request.nextUrl.pathname}${request.nextUrl.search}`;
    const redirectTarget = `${loginBase}?redirect=${encodeURIComponent(currentTarget)}`;
    const redirectRes = NextResponse.redirect(new URL(redirectTarget));
    redirectRes.headers.set('Cache-Control', 'private, no-store');
    return redirectRes;
  }

  // 3. Liens profonds `?ws=<mediaId>` (notifications, emails, partage) :
  // on pose le cookie de workspace actif puis on redirige vers la même page
  // sans le paramètre. Le layout et les résolveurs serveur voient alors le
  // bon média dès le premier rendu.
  const ws = request.nextUrl.searchParams.get('ws');
  if (ws && /^[0-9a-fA-F-]{36}$/.test(ws)) {
    const url = request.nextUrl.clone();
    url.searchParams.delete('ws');
    const redirect = NextResponse.redirect(url);
    // `secure` suit l'environnement : jamais de cookie d'espace en clair en prod.
    const cookie = workspaceCookie(
      { type: 'MEDIA', id: ws },
      process.env.NODE_ENV === 'production'
    );
    redirect.cookies.set(cookie.name, cookie.value, cookie.options);
    redirect.headers.set('x-locale', localeCookie);
    return redirect;
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
