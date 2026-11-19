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
export function getThemeCookieDomain(hostname?: string): string | null {
  // F143 — `endsWith('qoe.fi')` acceptait `evilqoe.fi` et écrivait alors le
  // cookie avec `Domain=.qoe.fi` depuis un hôte qui n'appartient pas au site.
  const host = hostname ?? (typeof window === 'undefined' ? null : window.location.hostname);
  if (!host) return null;
  if (host === 'localhost' || host === '127.0.0.1') return null;
  if (host === PARENT_DOMAIN || host.endsWith(`.${PARENT_DOMAIN}`)) return `.${PARENT_DOMAIN}`;
  return null;
}

export function readThemeCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
  const raw = match?.[1];
  if (!raw) return null;
  // F141 — `decodeURIComponent` lève une URIError sur `%E0%A4%A`. Un cookie
  // abîmé ne doit pas casser le provider : on le traite comme absent.
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export function writeThemeCookie(theme: string) {
  if (typeof document === 'undefined') return;
  const domain = getThemeCookieDomain();
  const domainAttr = domain ? `; domain=${domain}` : '';
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(theme)}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${domainAttr}${secure}`;
}
