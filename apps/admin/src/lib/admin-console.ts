// =====================================================================
// 🧭 admin-console — vocabulaire de capacités et modèle de navigation
// =====================================================================
// Miroir TypeScript EXACT de `apps/api/internal/adminauthz/capability.go` :
// mêmes valeurs, même ordre, mêmes domaines. La parité est verrouillée par
// `admin-console.test.ts`, qui relit le fichier Go et échoue à la moindre
// divergence — ajouter une capacité côté serveur sans l'exposer ici (ou
// l'inverse) casse la CI, jamais la console en production.
//
// Côté serveur, l'autorité reste le Go : masquer une entrée de navigation
// n'autorise rien, et chaque route revérifie sa capacité de son côté. Ce
// fichier sert à ne PAS proposer un écran qui répondra 403.
// =====================================================================

import { getAdminSurfaces } from '@qoe/config';

/** Domaines d'interface, dans l'ordre d'affichage (miroir `Domains()`). */
export const ADMIN_DOMAINS = [
  'pilotage',
  'moderation',
  'communaute',
  'croissance',
  'produit',
  'plateforme',
] as const;

export type AdminDomain = (typeof ADMIN_DOMAINS)[number];

/** Libellés des domaines — seule traduction autorisée du vocabulaire. */
export const ADMIN_DOMAIN_LABELS: Record<AdminDomain, string> = {
  pilotage: 'Pilotage',
  moderation: 'Confiance & sécurité',
  communaute: 'Support & communauté',
  croissance: 'Croissance & communication',
  produit: 'Produit & contenu',
  plateforme: 'Conformité & plateforme',
};

/** Une ligne de la description produit d'un domaine (écran de refus, aide). */
export const ADMIN_DOMAIN_DESCRIPTIONS: Record<AdminDomain, string> = {
  pilotage: 'Vue d’ensemble, santé, métriques et « Ma file »',
  moderation: 'Comptes, signalements, anti-abus, recours et incidents',
  communaute: 'Support, articles d’aide et imports d’abonnés',
  croissance: 'Campagnes, lancements de features, notifications et abonnements',
  produit: 'Registre des features, flags, frontend/CMS, widgets et traductions',
  plateforme: 'Légal, conformité, audit, accès staff, config, API/OAuth et stockage',
};

/**
 * Vocabulaire FERMÉ des capacités — miroir de la liste ordonnée de
 * `capability.go`. Toute valeur absente d'ici n'existe pas côté serveur : le
 * garde la refuse et le registre de routes la rejette au démarrage.
 */
export const ADMIN_CAPABILITIES = [
  // Pilotage
  'admin.self.read',
  'admin.dashboard.read',
  'admin.audit.read',
  // Modération
  'admin.users.read',
  'admin.users.moderate',
  'admin.users.sessions.revoke',
  'admin.reports.read',
  'admin.reports.write',
  'admin.abuse.read',
  'admin.abuse.decide',
  'admin.incidents.read',
  'admin.incidents.write',
  'admin.appeals.read',
  'admin.appeals.decide',
  // Communauté
  'admin.support.read',
  'admin.support.write',
  'admin.subscriptions.read',
  'admin.subscriptions.write',
  'admin.imports.read',
  'admin.imports.review',
  // Produit
  'admin.content.read',
  'admin.content.write',
  'admin.widgets.read',
  'admin.widgets.write',
  'admin.deliveries.read',
  'admin.deliveries.retry',
  'admin.campaigns.read',
  'admin.campaigns.write',
  // Plateforme
  'admin.config.read',
  'admin.config.write',
  'admin.flags.write',
  'admin.oauth.read',
  'admin.oauth.approve',
  'admin.api.read',
  'admin.api.grants.write',
  'admin.legal.read',
  'admin.legal.write',
  'admin.compliance.read',
  'admin.compliance.export',
  // Accès staff (gérer les rôles depuis la console)
  'admin.access.read',
  'admin.access.grant',
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

/** Domaine de chaque capacité — miroir de la map `domains` de `capability.go`. */
export const ADMIN_CAPABILITY_DOMAINS: Record<AdminCapability, AdminDomain> = {
  'admin.self.read': 'pilotage',
  'admin.dashboard.read': 'pilotage',
  'admin.audit.read': 'plateforme',

  'admin.users.read': 'moderation',
  'admin.users.moderate': 'moderation',
  'admin.users.sessions.revoke': 'moderation',
  'admin.reports.read': 'moderation',
  'admin.reports.write': 'moderation',
  'admin.abuse.read': 'moderation',
  'admin.abuse.decide': 'moderation',
  'admin.incidents.read': 'moderation',
  'admin.incidents.write': 'moderation',
  'admin.appeals.read': 'moderation',
  'admin.appeals.decide': 'moderation',

  'admin.support.read': 'communaute',
  'admin.support.write': 'communaute',
  'admin.content.read': 'communaute',
  'admin.content.write': 'communaute',
  'admin.imports.read': 'communaute',
  'admin.imports.review': 'communaute',

  'admin.subscriptions.read': 'croissance',
  'admin.subscriptions.write': 'croissance',
  'admin.campaigns.read': 'croissance',
  'admin.campaigns.write': 'croissance',
  'admin.deliveries.read': 'croissance',
  'admin.deliveries.retry': 'croissance',

  'admin.widgets.read': 'produit',
  'admin.widgets.write': 'produit',

  'admin.config.read': 'plateforme',
  'admin.config.write': 'plateforme',
  'admin.flags.write': 'plateforme',
  'admin.oauth.read': 'plateforme',
  'admin.oauth.approve': 'plateforme',
  'admin.api.read': 'plateforme',
  'admin.api.grants.write': 'plateforme',
  'admin.legal.read': 'plateforme',
  'admin.legal.write': 'plateforme',
  'admin.compliance.read': 'plateforme',
  'admin.compliance.export': 'plateforme',
  'admin.access.read': 'plateforme',
  'admin.access.grant': 'plateforme',
};

const CAPABILITY_SET: ReadonlySet<string> = new Set<string>(ADMIN_CAPABILITIES);

/** Dit si une chaîne quelconque (réponse API) est une capacité connue. */
export function isAdminCapability(value: string): value is AdminCapability {
  return CAPABILITY_SET.has(value);
}

/**
 * Filtre une liste brute venue de l'API : une capacité inconnue du vocabulaire
 * est ÉCARTÉE. Le serveur ne devrait jamais en envoyer (vocabulaire fermé), mais
 * une version serveur plus récente ne doit pas faire croire à un droit que
 * l'interface ne sait pas décrire.
 */
export function normalizeCapabilities(
  values: readonly string[] | null | undefined
): AdminCapability[] {
  if (!values) return [];
  const out: AdminCapability[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || seen.has(value)) continue;
    seen.add(value);
    if (isAdminCapability(value)) out.push(value);
  }
  return out;
}

/** Domaine d'une capacité (`null` si inconnue). */
export function capabilityDomain(capability: string): AdminDomain | null {
  return isAdminCapability(capability) ? ADMIN_CAPABILITY_DOMAINS[capability] : null;
}

/** Capacités d'un domaine, dans l'ordre du vocabulaire. */
export function capabilitiesOfDomain(domain: AdminDomain): AdminCapability[] {
  return ADMIN_CAPABILITIES.filter((capability) => ADMIN_CAPABILITY_DOMAINS[capability] === domain);
}

/**
 * Une entrée de navigation : l'écran, la capacité qui l'ouvre et son domaine.
 * `capability` est la capacité MINIMALE qui rend l'écran utile ; un écran qui
 * n'exige rien de plus que la lecture doit le dire ici.
 */
export interface AdminNavItem {
  href: string;
  label: string;
  /** Capacité qui ouvre l'entrée. */
  capability: AdminCapability;
  /** Capacités secondaires que l'écran utilise s'il en a plusieurs. */
  alsoUses?: AdminCapability[];
  /** Une phrase : ce que l'écran permet de faire. */
  description: string;
}

/**
 * Navigation de la console. Le domaine n'est pas répété ici : il se déduit de
 * la capacité (`ADMIN_CAPABILITY_DOMAINS`), pour qu'une entrée ne puisse pas se
 * ranger dans un domaine que sa capacité ne lui donne pas.
 */
function requireAdminCapability(value: string): AdminCapability {
  if (!isAdminCapability(value)) {
    throw new Error(`Capacité admin inconnue dans le manifeste de surfaces : ${value}`);
  }
  return value;
}

/**
 * Navigation de la console, dérivée du manifeste partagé
 * (`@qoe/config/surfaces`). Le domaine n'est pas répété ici : il se déduit de
 * la capacité (`ADMIN_CAPABILITY_DOMAINS`). Chaque capacité est validée au
 * démarrage contre le vocabulaire fermé, miroir de Go.
 */
export const ADMIN_NAV: readonly AdminNavItem[] = getAdminSurfaces().map((surface) => ({
  href: surface.path,
  label: surface.defaultLabel,
  capability: requireAdminCapability(surface.capability ?? ''),
  alsoUses: surface.alsoUses?.map((capability) => requireAdminCapability(capability)),
  description: surface.description ?? '',
}));

/** Entrée de navigation pour un chemin (la plus longue correspondance). */
export function navItemForPath(pathname: string): AdminNavItem | null {
  let best: AdminNavItem | null = null;
  for (const item of ADMIN_NAV) {
    if (pathname !== item.href && !pathname.startsWith(`${item.href}/`)) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best;
}

/** Capacités qu'une entrée utilise (la principale puis les secondaires). */
export function navItemCapabilities(item: AdminNavItem): AdminCapability[] {
  const out: AdminCapability[] = [item.capability];
  for (const extra of item.alsoUses ?? []) {
    if (!out.includes(extra)) out.push(extra);
  }
  return out;
}

/**
 * Entrées atteignables avec un jeu de capacités. Une entrée est visible si sa
 * capacité principale est détenue : une entrée dont on ne pourrait lire que la
 * moitié écrirait des boutons qui répondent 403.
 */
export function visibleNav(capabilities: readonly AdminCapability[]): AdminNavItem[] {
  const held = new Set<string>(capabilities);
  return ADMIN_NAV.filter((item) => held.has(item.capability));
}

/** Décrit ce qui manque pour un écran (message de refus lisible). */
export function missingCapabilityMessage(
  item: AdminNavItem,
  capabilities: readonly AdminCapability[]
): string {
  const held = new Set<string>(capabilities);
  const missing = navItemCapabilities(item).filter((capability) => !held.has(capability));
  const domain = ADMIN_CAPABILITY_DOMAINS[item.capability];
  if (missing.length === 0) {
    return `L’écran « ${item.label} » (${ADMIN_DOMAIN_LABELS[domain]}) est accessible avec vos rôles actuels.`;
  }
  return `L’écran « ${item.label} » (${ADMIN_DOMAIN_LABELS[domain]}) demande ${missing.join(', ')}.`;
}

/** Entrées regroupées par domaine, dans l'ordre d'affichage. */
export function navByDomain(
  capabilities: readonly AdminCapability[]
): { domain: AdminDomain; label: string; items: AdminNavItem[] }[] {
  const visible = visibleNav(capabilities);
  return ADMIN_DOMAINS.map((domain) => ({
    domain,
    label: ADMIN_DOMAIN_LABELS[domain],
    items: visible.filter((item) => ADMIN_CAPABILITY_DOMAINS[item.capability] === domain),
  })).filter((section) => section.items.length > 0);
}
