// =====================================================================
// 🍪 cookie-consent — preuve, catégories et registre des traceurs
// =====================================================================
// Depuis l'adoption du mode « exempté », la mesure d'audience ne demande
// plus de consentement : elle est servie sans aucun cookie, l'adresse IP est
// anonymisée avant tout stockage (jamais conservée, pas même tronquée), et
// aucune donnée n'est croisée avec un autre traitement. C'est le régime de
// l'art. 82 II de la loi Informatique et Libertés, qui dispense de
// consentement une mesure d'audience strictement nécessaire et anonyme.
//
// Conséquence directe : il n'existe plus de traceur dont le dépôt dépende
// d'un accord préalable. La bannière bloquante n'a donc plus d'objet — elle
// est remplacée par un avis d'information non bloquant, qui laisse toujours
// ouverte la possibilité de s'opposer (le droit d'opposition, lui, subsiste).
//
// Ce qui reste vrai et qu'on ne veut pas perdre :
//   - le choix est conservé 6 mois ;
//   - un refus exprimé du temps de la bannière reste un refus : il est
//     relu comme une opposition et continue d'éteindre la mesure ;
//   - chaque décision est journalisée côté serveur, y compris pour un
//     visiteur sans compte.
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
 * Clé localStorage lue par le script Umami : à `true`, le traceur s'arrête
 * de lui-même dans ce navigateur. C'est le seul levier côté client pour faire
 * respecter une opposition à la mesure d'audience, puisqu'il n'y a plus de
 * bannière pour la recueillir.
 */
export const ANALYTICS_DISABLED_KEY = 'umami.disabled';

/**
 * Version de la politique de traceurs. On ne la change QUE si les finalités
 * évoluent : la faire bouger invalide tous les choix stockés et oublierait
 * les refus déjà exprimés.
 *
 * ⚠️ Le passage en mode exempté ne change PAS les finalités (on continue de
 * compter des visites agrégées pour les créateurs et la plateforme) : la
 * version reste donc `1.0`. Seule la base légale change, et elle n'est pas
 * portée par ce compteur mais par le document versionné `politique-cookies`.
 */
export const COOKIE_CONSENT_VERSION = '1.0';

// ─── Mode de mesure d'audience ───────────────────────────────────────

/**
 * `exempt` : mesure d'audience sans cookie ni IP conservée, dispensée de
 * consentement (défaut, et seul mode que le code de production doit utiliser).
 * `consent` : régime antérieur, conservé pour un fournisseur non exempté
 * (ex. une régie externe) — la bannière bloquante reprend alors la main.
 */
export type AnalyticsMode = 'exempt' | 'consent';

export const DEFAULT_ANALYTICS_MODE: AnalyticsMode = 'exempt';

/**
 * Résout le mode depuis la configuration publique. Tout ce qui n'est pas
 * explicitement `consent` retombe sur `exempt` : un environnement mal
 * configuré ne doit jamais introduire une bannière par accident, mais il ne
 * doit jamais non plus *retirer* un consentement déclaré par erreur.
 */
export function resolveAnalyticsMode(raw?: string | null): AnalyticsMode {
  return String(raw ?? '')
    .trim()
    .toLowerCase() === 'consent'
    ? 'consent'
    : DEFAULT_ANALYTICS_MODE;
}

/** Le mode de la plateforme, lu une fois (variable publique Next.js). */
export function analyticsMode(): AnalyticsMode {
  return resolveAnalyticsMode(process.env.NEXT_PUBLIC_ANALYTICS_MODE);
}

/**
 * Un consentement préalable est-il requis pour un traceur non essentiel ?
 * Faux en mode exempté : la mesure d'audience n'en demande plus, et les
 * préférences de confort sont stockées à la demande expresse de la personne.
 */
export function requiresConsentBanner(mode: AnalyticsMode = analyticsMode()): boolean {
  return mode === 'consent';
}

/**
 * Catégories dont le dépôt dépend encore d'un accord en mode `consent`.
 * En mode exempté, la liste est vide : c'est ce qui autorise la suppression
 * de la bannière bloquante.
 */
export function activeConsentCategories(mode: AnalyticsMode = analyticsMode()): CookieCategory[] {
  return mode === 'consent' ? ['analytics', 'functional', 'marketing'] : [];
}

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
  /**
   * `true` seulement si un accord préalable est indispensable au dépôt dans
   * le régime courant. Depuis le passage en mode exempté, aucune catégorie
   * réellement déployée n'est dans ce cas.
   */
  consentRequired: boolean;
}

export const COOKIE_CATEGORIES: readonly CookieCategoryMeta[] = [
  {
    key: 'necessary',
    label: { fr: 'Strictement nécessaires', en: 'Strictly necessary' },
    description: {
      fr: 'Connexion, sécurité de session, répartition de charge. Sans eux, le site ne fonctionne pas. Aucun consentement n’est requis.',
      en: 'Sign-in, session security, load balancing. Without them the site cannot work. No consent is required.',
    },
    locked: true,
    consentRequired: false,
  },
  {
    key: 'analytics',
    label: { fr: 'Mesure d’audience', en: 'Audience measurement' },
    description: {
      fr: 'Comptage des visites et des pages lues pour les créateurs et la plateforme. Fonctionne sans cookie, avec des adresses IP anonymisées avant tout stockage et des statistiques agrégées. Dispensée de consentement : vous pouvez néanmoins vous y opposer à tout moment.',
      en: 'Visit and page counts for creators and the platform. Runs without cookies, with IP addresses anonymised before any storage and aggregated statistics. Exempt from consent: you can still object at any time.',
    },
    locked: false,
    consentRequired: false,
  },
  {
    key: 'functional',
    label: { fr: 'Préférences de confort', en: 'Comfort preferences' },
    description: {
      fr: 'Langue, thème clair ou sombre, taille de police, vitesse de lecture, lecteur audio. Stockés sur votre appareil parce que vous les avez demandés, pour vous éviter de tout reconfigurer.',
      en: 'Language, light or dark theme, font size, reading speed, audio player. Stored on your device because you asked for them, so you do not have to set them again.',
    },
    locked: false,
    consentRequired: false,
  },
  {
    key: 'marketing',
    label: { fr: 'Publicité et réseaux sociaux', en: 'Advertising and social' },
    description: {
      fr: 'qoe.fi ne diffuse aujourd’hui aucune publicité comportementale et n’intègre aucun bouton de suivi social : rien n’est déposé dans cette catégorie. Elle est conservée parce qu’un tel traceur exigerait, lui, un consentement préalable — ce qu’un registre sans cette catégorie rendrait invisible.',
      en: 'qoe.fi currently runs no behavioural advertising and embeds no social tracking button: nothing is set in this category. It is kept because such a tracker would require prior consent — something a registry without this category would hide.',
    },
    locked: false,
    consentRequired: true,
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
  /** Un accord préalable est-il nécessaire pour CE traceur ? */
  consentRequired: boolean;
  /**
   * `true` quand le traceur satisfait les conditions de la dispense de
   * consentement (pas de lecture/écriture sur le terminal, IP anonymisée,
   * pas de croisement, finalité unique). Affiché dans le centre : c'est la
   * justification que l'on doit pouvoir opposer à un contrôle.
   */
  exemption?: LocalizedText;
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
    consentRequired: false,
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
    consentRequired: false,
    purpose: {
      fr: 'Mémoriser votre éventuelle opposition à la mesure d’audience pour ne pas la redemander à chaque visite.',
      en: 'Remember your possible objection to audience measurement so we do not ask again on every visit.',
    },
    retention: { fr: '6 mois', en: '6 months' },
    href: '/legal/politique-cookies',
  },
  {
    name: 'qoe.theme / qoe.locale',
    provider: 'qoe.fi',
    category: 'functional',
    firstParty: true,
    consentRequired: false,
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
    consentRequired: false,
    purpose: {
      fr: 'Comptage des visites, pages lues, provenance : statistiques agrégées en temps réel pour les créateurs et pour la plateforme.',
      en: 'Visit counting, pages read, referrers: aggregated real-time statistics for creators and for the platform.',
    },
    retention: { fr: '12 mois', en: '12 months' },
    exemption: {
      fr: 'Aucun cookie et aucun accès au stockage du navigateur ; l’adresse IP est anonymisée par hachage salé à sens unique avant tout enregistrement et n’est jamais conservée ; les paramètres de requête et les fragments d’URL ne sont pas collectés ; le réglage « Do Not Track » est respecté ; les données ne sont ni croisées avec un autre traitement ni transmises à un tiers.',
      en: 'No cookie and no access to browser storage; the IP address is one-way salted-hashed before any recording and is never kept; query parameters and URL fragments are not collected; the “Do Not Track” setting is honoured; data is never crossed with another processing nor shared with a third party.',
    },
    href: '/legal/sous-traitants',
  },
];

/** Traceurs d'une catégorie (y compris les strictement nécessaires). */
export function trackersByCategory(category: CookieCategory): TrackerEntry[] {
  return TRACKER_REGISTRY.filter((tracker) => tracker.category === category);
}

/** Traceur réellement déposé qui, aujourd'hui, exige un consentement. */
export function trackersRequiringConsent(): TrackerEntry[] {
  return TRACKER_REGISTRY.filter((tracker) => tracker.consentRequired);
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

/**
 * Choix par défaut. En mode exempté, la mesure d'audience est **allumée par
 * défaut** : il n'existe plus de consentement à recueillir, et un visiteur qui
 * ne se prononce pas doit être compté. Les préférences de confort, elles,
 * restent neutres jusqu'à ce que la personne les demande.
 */
export function defaultChoice(): CookieConsentChoice {
  return {
    version: COOKIE_CONSENT_VERSION,
    analytics: true,
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
 * La mesure d'audience doit-elle être servie pour ce visiteur ?
 *
 * - mode `consent` : seulement si un accord explicite est stocké ;
 * - mode `exempt`  : par défaut oui, sauf opposition exprimée (un ancien
 *   « tout refuser » reste un refus, il ne devient pas un accord).
 */
export function analyticsAllowed(
  raw: string | undefined | null,
  mode: AnalyticsMode = analyticsMode()
): boolean {
  const choice = parseConsentCookie(raw ?? undefined);
  if (mode === 'consent') return choice?.analytics === true;
  return choice ? choice.analytics === true : true;
}

/** Une opposition a-t-elle été exprimée par ce visiteur ? */
export function hasAnalyticsObjection(raw: string | undefined | null): boolean {
  const choice = parseConsentCookie(raw ?? undefined);
  return choice !== null && choice.analytics === false;
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
    // ⚠️ Analyse stricte : seul un `true` explicite vaut autorisation. Une
    // valeur malformée ne doit jamais faire basculer la mesure d'audience.
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

/**
 * Avis affiché en mode exempté. Il ne bloque rien : il informe que la mesure
 * d'audience est anonyme et sans cookie, et laisse la porte ouverte à une
 * opposition — sans obligation d'appeler une bannière.
 */
export const EXEMPT_ANALYTICS_NOTICE: {
  title: LocalizedText;
  body: LocalizedText;
  learnMore: LocalizedText;
  object: LocalizedText;
  allow: LocalizedText;
  dismissed: LocalizedText;
  objectionSaved: LocalizedText;
  restore: LocalizedText;
} = {
  title: {
    fr: 'Mesure d’audience sans cookie',
    en: 'Cookieless audience measurement',
  },
  body: {
    fr: 'Nous comptons les visites pour nos créateurs avec une mesure d’audience anonyme : aucun cookie, aucune adresse IP conservée, statistiques agrégées. Vous pouvez vous y opposer.',
    en: 'We count visits for our creators with anonymous audience measurement: no cookie, no IP address kept, aggregated statistics. You can object.',
  },
  learnMore: { fr: 'En savoir plus', en: 'Learn more' },
  object: { fr: 'M’y opposer', en: 'Object' },
  allow: { fr: 'Autoriser cette mesure', en: 'Allow this measurement' },
  dismissed: { fr: 'Compris, masquer', en: 'Got it, hide' },
  objectionSaved: {
    fr: 'Opposition enregistrée : la mesure d’audience est désactivée dans ce navigateur.',
    en: 'Objection recorded: audience measurement is disabled in this browser.',
  },
  restore: {
    fr: 'La mesure d’audience anonyme est à nouveau active.',
    en: 'Anonymous audience measurement is active again.',
  },
};
