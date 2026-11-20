// =====================================================================
// 🍪 cookie-config — domaine de cookie dynamique (multi-sous-domaines)
// =====================================================================
// 📖 Les cookies de session doivent être partagés entre les apps
//    (qoe.fi, studio.qoe.fi…) mais jamais posés sur un domaine qu'on ne
//    contrôle pas, ni sur une IP (un `Domain=192.168.1.10` est rejeté par le
//    navigateur → session perdue sans message).

/**
 * Vrai pour une adresse IP littérale (IPv4, IPv6, avec ou sans crochets).
 * `Domain=` n'accepte pas les IP : le cookie serait silencieusement ignoré.
 */
export function isIpLiteral(host: string): boolean {
  const trimmed = host.replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(trimmed)) return true;
  return trimmed.includes(':') && /^[0-9a-f:.]+$/i.test(trimmed);
}

/**
 * Correspondance de domaine **bornée par un point** : `evilqoe.fi` ne doit
 * pas correspondre à `qoe.fi` (l'ancien `endsWith` posait un cookie sur un
 * domaine non contrôlé).
 */
function isSameOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Get the cookie domain dynamically based on the current hostname.
 * Allows cookie sharing across subdomains (e.g., .qoe.test in dev, .qoe.fi in prod).
 * Returns undefined for bare hostnames/IPs to prevent browser rejection.
 */
export function getCookieDomain(hostname?: string) {
  let activeHost = hostname;
  if (!activeHost) {
    const glob = globalThis as { window?: { location: { hostname: string } } };
    if (typeof glob.window !== 'undefined') {
      activeHost = glob.window.location.hostname;
    } else {
      // Server-side fallback if hostname is not passed
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (appUrl) {
        try {
          activeHost = new URL(appUrl).hostname;
        } catch {
          return undefined;
        }
      } else {
        return undefined;
      }
    }
  }

  if (!activeHost) {
    return undefined;
  }

  // Split port if present
  activeHost = activeHost.split(':')[0].trim().toLowerCase().replace(/\.$/, '');
  if (!activeHost) return undefined;

  // In development, return '.qoe.test' for any subdomain or root domain of qoe.test
  if (isSameOrSubdomain(activeHost, 'qoe.test')) {
    return '.qoe.test';
  }

  // In development, return '.lvh.me' for any subdomain or root domain of lvh.me.
  // NOTE: bare 'localhost'/'127.0.0.1' deliberately returns undefined (host-only
  // cookie) — the preview webview cannot resolve lvh.me, and cookies ignore the
  // port so apps on localhost:3010/3020 still share the session.
  if (isSameOrSubdomain(activeHost, 'lvh.me')) {
    return '.lvh.me';
  }
  if (activeHost === 'localhost' || activeHost.endsWith('.localhost')) {
    return undefined;
  }

  // For production domains
  if (isSameOrSubdomain(activeHost, 'qoe.fi')) {
    return '.qoe.fi';
  }

  // Jamais de `Domain=` sur une IP ou un hôte sans point (intranet, nom de
  // service docker) : le navigateur refuserait le cookie.
  if (isIpLiteral(activeHost) || !activeHost.includes('.')) {
    return undefined;
  }

  return `.${activeHost}`;
}

/**
 * Drapeau `Secure` des cookies de session : suit le **schéma de l'origine
 * publique** (`NEXT_PUBLIC_APP_URL`), jamais `NODE_ENV` seul.
 *
 * 📖 Pourquoi : un build de production (`next start`, `NODE_ENV=production`)
 *    servi en **clair** — la preuve e2e locale sur `http://lvh.me:15402`, ou un
 *    déploiement intranet http — faisait poser `Secure` sur `http://`. Le
 *    navigateur **jette** alors le cookie sans aucune erreur : le login
 *    réussit (200 sur `/auth/v1/token`), puis chaque app renvoie /login en
 *    boucle (mesuré au L20n, cookie absent de `context.cookies()`).
 *    `NODE_ENV` dit comment le code a été compilé, pas comment la requête
 *    arrive : le schéma de l'origine publique, lui, dit la vérité du
 *    transport (https → `Secure` conservé en production).
 *
 * ⚠️ Appeler avec `process.env.NEXT_PUBLIC_APP_URL` **littéralement** au site
 *    d'appel : Next n'inline que les accès statiques.
 */
export function getCookieSecure(appUrl?: string): boolean {
  if (appUrl) {
    try {
      return new URL(appUrl).protocol === 'https:';
    } catch {
      // Origine illisible : on retombe sur l'environnement ci-dessous.
    }
  }
  // Aucune origine déclarée : on ne retire jamais `Secure` à une production
  // qui n'a pas dit sur quel schéma elle sert.
  return process.env.NODE_ENV === 'production';
}
