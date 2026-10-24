// =====================================================================
// ⚖️ @qoe/config/legal — où vivent les pages légales de la plateforme
// =====================================================================
// La vitrine publique (apps/hi) est la SEULE à servir /legal et
// /legal/[slug]. Les tenants, l'app lecteur, le studio et les composants
// partagés pointent donc tous vers elle par un lien absolu.
//
// Résolution volontairement déterministe : pas de `window` ici, sinon le
// HTML rendu par le serveur et celui rendu par le client différeraient
// (erreur d'hydratation React). Même entrée → même URL des deux côtés.
//
// Module isolé (pas d'import du barrel ni de validation d'env Zod) : il est
// importé par des composants clients.
// =====================================================================

const DEFAULT_LANDING_URL = 'https://hi.qoe.fi';
/** Port de `apps/hi` en développement. */
const LANDING_DEV_PORT = 15401;

/**
 * 🏝️ Origine de la vitrine publique.
 *
 * 1. `NEXT_PUBLIC_LANDING_URL` fait foi quand il est défini ;
 * 2. sinon on déduit l'URL locale de l'hôte fourni (`localhost`, `lvh.me`,
 *    `qoe.test`) — utile côté serveur où l'hôte est connue ;
 * 3. sinon, en développement, on vise `apps/hi` sur son port de dev ;
 * 4. sinon la prod.
 */
export function getLandingAppUrl(hostname?: string, port = LANDING_DEV_PORT): string {
  const explicit = process.env.NEXT_PUBLIC_LANDING_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const hostWithoutPort = (hostname ?? '').split(':')[0].toLowerCase();

  if (hostWithoutPort) {
    if (hostWithoutPort.endsWith('lvh.me')) return `http://lvh.me:${port}`;
    if (hostWithoutPort.endsWith('qoe.test')) return `http://qoe.test:${port}`;
    if (hostWithoutPort === 'localhost' || hostWithoutPort.endsWith('.localhost')) {
      return `http://localhost:${port}`;
    }
  }

  if (process.env.NODE_ENV === 'development') return `http://localhost:${port}`;
  return DEFAULT_LANDING_URL;
}

/** 📚 Sommaire des documents légaux. */
export function getLegalIndexUrl(hostname?: string): string {
  return `${getLandingAppUrl(hostname)}/legal`;
}

/** 📄 Un document légal précis (mentions, confidentialité, cookies…). */
export function getLegalDocumentUrl(slug: string, hostname?: string): string {
  return `${getLegalIndexUrl(hostname)}/${encodeURIComponent(slug)}`;
}
