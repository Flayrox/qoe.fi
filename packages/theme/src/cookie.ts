// ═══════════════════════════════════════════════════════════════════
// 🍪 @qoe/theme — cookie.ts
// Persistance du thème dans un cookie partagé sur le domaine parent
// (.qoe.fi) pour synchroniser les apps entre sous-domaines
// (qoe.fi ↔ dashboard.qoe.fi ↔ admin.qoe.fi...).
// ═══════════════════════════════════════════════════════════════════

export const THEME_COOKIE = 'qoe_theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 an
export const THEME_COOKIE_POLL_MS = 1500;

const PARENT_DOMAIN = 'qoe.fi';

/**
 * Domaine de cookie à utiliser.
 * Retourne ".qoe.fi" sur n'importe quel sous-domaine qoe.fi,
 * et null sur localhost (cookie host-only, partagé entre ports).
 */
export function getThemeCookieDomain(): string | null {
  if (typeof window === 'undefined') return null;
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return null;
  if (hostname.endsWith(PARENT_DOMAIN)) return `.${PARENT_DOMAIN}`;
  return null;
}

export function readThemeCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeThemeCookie(theme: string) {
  if (typeof document === 'undefined') return;
  const domain = getThemeCookieDomain();
  const domainAttr = domain ? `; domain=${domain}` : '';
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(theme)}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${domainAttr}${secure}`;
}
