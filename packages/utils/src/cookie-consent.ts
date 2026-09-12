// =====================================================================
// 🍪 cookie-consent — preuve, catégories et registre des traceurs
// =====================================================================
// Le choix est stocké deux fois volontairement :
//   - localStorage : état instantané pour la bannière (pas de flash) ;
//   - cookie lisible côté serveur : permet de charger (ou non) les
//     traceurs non essentiels AVANT toute exécution JavaScript, ce qui
//     est la seule façon de tenir la promesse « aucun traceur non
//     essentiel avant consentement » (art. 82 LIL / art. 7 RGPD).
// Durée de conservation du choix : 6 mois, puis il est redemandé.
//
// Partagé par toutes les apps (site public qoe.fi, blogs des créateurs) :
// une seule politique, un seul format de cookie, donc une seule preuve.
//
// Ce module reste PUR (aucun accès navigateur) : il est relu côté serveur par
// AnalyticsGate. La persistance vit dans `@qoe/ui/legal/cookie-consent-storage`.
// =====================================================================

export const COOKIE_POLICY_SLUG = 'politique-cookies';
export const COOKIE_CONSENT_KEY = 'qoe.cookie-consent';
export const COOKIE_CONSENT_COOKIE = 'qoe_cookie_consent';
export const COOKIE_CONSENT_MAX_AGE = 60 * 60 * 24 * 180; // 6 mois
export const COOKIE_PREFERENCES_EVENT = 'qoe:cookie-preferences';

/**
 * Version de la politique de traceurs. On ne la change QUE si les finalités
 * évoluent : la faire bouger invalide tous les choix stockés et redemande la
 * bannière à tout le monde. Présenter autrement les mêmes finalités (centre de
 * préférences, liste des traceurs) n'est pas un changement de finalité.
 */
export const COOKIE_CONSENT_VERSION = '1.0';

// ─── Catégories ──────────────────────────────────────────────────────

export type CookieCategory = 'necessary' | 'analytics' | 'functional' | 'marketing';

export type LocalizedText = { fr: string; en: string };

export interface CookieCategoryMeta {
  key: CookieCategory;
  label: LocalizedText;
  description: LocalizedText;
  /**
   * Un traceur strictement nécessaire ne peut pas être refusé sans rendre le
   * service inutilisable : on l'affiche, on l'explique, on ne le rend pas
   * décochable (une case grisée serait une fausse promesse).
   */
  locked: boolean;
}

export const COOKIE_CATEGORIES: readonly CookieCategoryMeta[] = [
  {
    key: 'necessary',
    label: { fr: 'Strictement nécessaires', en: 'Strictly necessary' },
    description: {
      fr: 'Connexion, sécurité de session, répartition de charge et choix que vous venez de faire. Sans eux, le site ne fonctionne pas. Aucun consentement n’est requis.',
      en: 'Sign-in, session security, load balancing and the choice you just made. Without them the site cannot work. No consent is required.',
    },
    locked: true,
  },
  {
    key: 'analytics',
    label: { fr: 'Mesure d’audience', en: 'Audience measurement' },
    description: {
      fr: 'Statistiques de visite agrégées, sans profil publicitaire ni revente, et statistiques que les créateurs consultent sur leurs propres articles.',
      en: 'Aggregated visit statistics, with no advertising profile and no resale, plus the statistics creators see on their own articles.',
    },
    locked: false,
  },
  {
    key: 'functional',
    label: { fr: 'Préférences de confort', en: 'Comfort preferences' },
    description: {
      fr: 'Langue, thème clair ou sombre, taille de police, vitesse de lecture, lecteur audio. Stockés sur votre appareil pour vous éviter de tout reconfigurer.',
      en: 'Language, light or dark theme, font size, reading speed, audio player. Stored on your device so you do not have to set them again.',
    },
    locked: false,
  },
  {
    key: 'marketing',
    label: { fr: 'Publicité et réseaux sociaux', en: 'Advertising and social' },
    description: {
      fr: 'qoe.fi ne diffuse aujourd’hui aucune publicité comportementale et n’intègre aucun bouton de suivi social. Cette catégorie existe pour que le jour où cela changerait, il soit impossible de l’activer sans votre accord.',
      en: 'qoe.fi currently runs no behavioural advertising and embeds no social tracking button. This category exists so that if that ever changes, it can never be enabled without your agreement.',
    },
    locked: false,
  },
] as const;

// ─── Registre des traceurs ───────────────────────────────────────────

export interface TrackerEntry {
  /** Identifiant technique (cookie, clé de stockage ou script). */
  name: string;
  /** Qui le dépose : qoe.fi, un sous-traitant, ou un tiers. */
  provider: string;
  category: CookieCategory;
  purpose: LocalizedText;
  retention: LocalizedText;
  /** Émetteur : true quand le traceur est servi depuis nos propres domaines. */
  firstParty: boolean;
  /** Lien utile (registre des sous-traitants, code du script…). */
  href?: string;
}

/**
 * Registre public des traceurs réellement utilisés. C'est la même source qui
 * alimente le centre de préférences et la page « politique de cookies » : on ne
 * peut pas afficher une liste que le code ne respecte pas.
 *
 * À tenir à jour à chaque nouvelle intégration : un traceur absent d'ici est un
 * traceur déposé sans base légale.
 */
export const TRACKER_REGISTRY: readonly TrackerEntry[] = [
  {
    name: 'sb-*-auth-token',
    provider: 'Supabase (hébergé UE)',
    category: 'necessary',
    firstParty: true,
    purpose: {
      fr: 'Maintenir la session connectée et vérifier l’identité à chaque requête.',
      en: 'Keep the session signed in and verify identity on every request.',
    },
    retention: { fr: 'Session, puis 1 an au maximum', en: 'Session, then up to 1 year' },
    href: '/legal/sous-traitants',
  },
  {
    name: 'qoe_cookie_consent',
    provider: 'qoe.fi',
    category: 'necessary',
    firstParty: true,
    purpose: {
      fr: 'Mémoriser votre choix sur cette page pour ne pas vous le redemander à chaque visite.',
      en: 'Remember your choice here so we do not ask again on every visit.',
    },
    retention: { fr: '6 mois', en: '6 months' },
    href: '/legal/politique-cookies',
  },
  {
    name: 'qoe.theme / qoe.locale',
    provider: 'qoe.fi',
    category: 'functional',
    firstParty: true,
    purpose: {
      fr: 'Restituer votre thème (clair/sombre), votre langue et votre confort de lecture.',
      en: 'Restore your theme (light/dark), language and reading comfort.',
    },
    retention: { fr: 'Jusqu’à effacement par vos soins', en: 'Until you clear it' },
  },
  {
    name: 'umami',
    provider: 'Umami Analytics (auto-hébergé, UE)',
    category: 'analytics',
    firstParty: true,
    purpose: {
      fr: 'Comptage des visites, pages lues, provenance : statistiques agrégées en temps réel pour les créateurs et pour la plateforme.',
      en: 'Visit counting, pages read, referrers: aggregated real-time statistics for creators and for the platform.',
    },
    retention: { fr: '12 mois', en: '12 months' },
    href: '/legal/sous-traitants',
  },
];

/** Traceurs d'une catégorie (y compris les strictement nécessaires). */
export function trackersByCategory(category: CookieCategory): TrackerEntry[] {
  return TRACKER_REGISTRY.filter((tracker) => tracker.category === category);
}

// ─── Choix ───────────────────────────────────────────────────────────

export interface CookieConsentChoice {
  /** Version de la politique acceptée (permet de redemander si elle change). */
  version: string;
  /** Le module de mesure d'audience. */
  analytics: boolean;
  /** Préférences fonctionnelles (langue, confort de lecture…). */
  functional: boolean;
  /** Publicité : aucune par défaut, la finalité n'existe pas chez qoe.fi. */
  marketing: boolean;
  decidedAt: string;
}

/** Choix par défaut : tout ce qui n'est pas essentiel est refusé. */
export function defaultChoice(): CookieConsentChoice {
  return {
    version: COOKIE_CONSENT_VERSION,
    analytics: false,
    functional: false,
    marketing: false,
    decidedAt: new Date().toISOString(),
  };
}

/** Convertit un choix en dictionnaire de catégories (journal serveur). */
export function choiceToCategories(choice: CookieConsentChoice): Record<CookieCategory, boolean> {
  return {
    necessary: true,
    analytics: choice.analytics === true,
    functional: choice.functional === true,
    marketing: choice.marketing === true,
  };
}

/** Applique un dictionnaire de catégories à un choix (import/restauration). */
export function categoriesToChoice(
  categories: Partial<Record<CookieCategory, boolean>>,
  decidedAt = new Date().toISOString()
): CookieConsentChoice {
  return {
    version: COOKIE_CONSENT_VERSION,
    analytics: categories.analytics === true,
    functional: categories.functional === true,
    marketing: categories.marketing === true,
    decidedAt,
  };
}

/** Nombre de catégories optionnelles acceptées (0 = tout refusé). */
export function acceptedOptionalCount(choice: CookieConsentChoice): number {
  return [choice.analytics, choice.functional, choice.marketing].filter(Boolean).length;
}

/**
 * Normalise un choix quelconque (localStorage, cookie) en objet sûr.
 * Retourne null si absent, malformé ou périmé (> 6 mois ou version changée).
 */
export function normalizeConsent(value: unknown): CookieConsentChoice | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const decidedAt = typeof raw.decidedAt === 'string' ? raw.decidedAt : '';
  const decided = new Date(decidedAt);
  if (Number.isNaN(decided.getTime())) return null;
  const ageMs = Date.now() - decided.getTime();
  if (ageMs < 0 || ageMs > COOKIE_CONSENT_MAX_AGE * 1000) return null;
  const version = typeof raw.version === 'string' ? raw.version : COOKIE_CONSENT_VERSION;
  if (version !== COOKIE_CONSENT_VERSION) return null;
  return {
    version,
    analytics: raw.analytics === true,
    functional: raw.functional === true,
    marketing: raw.marketing === true,
    decidedAt,
  };
}

/** Découpe un cookie brut (côté serveur) en choix exploitable. */
export function parseConsentCookie(raw: string | undefined): CookieConsentChoice | null {
  if (!raw) return null;
  try {
    return normalizeConsent(JSON.parse(decodeURIComponent(raw)) as unknown);
  } catch {
    return null;
  }
}

/** Sélectionne la variante linguistique d'un libellé du registre. */
export function localized(text: LocalizedText, locale: string): string {
  return locale.startsWith('en') ? text.en : text.fr;
}
