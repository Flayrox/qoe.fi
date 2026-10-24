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
 * 🗺️ Mapping bidirectionnel entre les slugs publics épurés (anglais standard)
 * et les slugs canoniques de la base de données (français historique).
 */
export const LEGAL_SLUG_MAP = {
  terms: 'conditions-generales-utilisation',
  privacy: 'politique-confidentialite',
  'legal-notice': 'mentions-legales',
  notice: 'mentions-legales',
  sales: 'conditions-generales-de-vente',
  dpa: 'accord-traitement-donnees',
  creators: 'accord-createur',
  cookies: 'politique-cookies',
  'acceptable-use': 'politique-utilisation-acceptable',
  subprocessors: 'sous-traitants',
  accessibility: 'engagement-accessibilite',
} as const;

export type LegalEnglishSlug = keyof typeof LEGAL_SLUG_MAP;

/** Map inverse : slug DB français → slug public anglais épuré */
export const LEGAL_REVERSE_SLUG_MAP: Record<string, string> = {
  'conditions-generales-utilisation': 'terms',
  'politique-confidentialite': 'privacy',
  'mentions-legales': 'legal-notice',
  'conditions-generales-de-vente': 'sales',
  'accord-traitement-donnees': 'dpa',
  'accord-createur': 'creators',
  'politique-cookies': 'cookies',
  'politique-utilisation-acceptable': 'acceptable-use',
  'sous-traitants': 'subprocessors',
  'engagement-accessibilite': 'accessibility',
};

/** Convertit n'importe quel slug (alias anglais ou legacy français) vers le slug DB canonique */
export function resolveLegalDbSlug(slug: string): string {
  const clean = slug.toLowerCase().trim();
  return (LEGAL_SLUG_MAP as Record<string, string>)[clean] || clean;
}

/** Convertit un slug DB vers le slug public anglais épuré */
export function toPublicLegalSlug(slug: string): string {
  const clean = slug.toLowerCase().trim();
  return LEGAL_REVERSE_SLUG_MAP[clean] || clean;
}

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

/** 📄 Un document légal précis (mentions, confidentialité, cookies…). Utilise le slug anglais canonique. */
export function getLegalDocumentUrl(slug: string, hostname?: string): string {
  const publicSlug = toPublicLegalSlug(slug);
  return `${getLegalIndexUrl(hostname)}/${encodeURIComponent(publicSlug)}`;
}
