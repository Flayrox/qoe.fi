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

/** Domaines d'interface, dans l'ordre d'affichage (miroir `Domains()`). */
export const ADMIN_DOMAINS = [
  'pilotage',
  'moderation',
  'communaute',
  'produit',
  'plateforme',
] as const;

export type AdminDomain = (typeof ADMIN_DOMAINS)[number];

/** Libellés des domaines — seule traduction autorisée du vocabulaire. */
export const ADMIN_DOMAIN_LABELS: Record<AdminDomain, string> = {
  pilotage: 'Pilotage',
  moderation: 'Modération',
  communaute: 'Communauté',
  produit: 'Produit',
  plateforme: 'Plateforme',
};

/** Une ligne de la description produit d'un domaine (écran de refus, aide). */
export const ADMIN_DOMAIN_DESCRIPTIONS: Record<AdminDomain, string> = {
  pilotage: 'Vue d’ensemble, audit et santé de la plateforme',
  moderation: 'Comptes, signalements, anti-abus, recours et incidents',
  communaute: 'Support, abonnements et imports d’abonnés',
  produit: 'Contenu éditorial, widgets, livraisons et campagnes',
  plateforme: 'Configuration, identité, conformité et accès staff',
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
  'admin.audit.read': 'pilotage',

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
  'admin.subscriptions.read': 'communaute',
  'admin.subscriptions.write': 'communaute',
  'admin.imports.read': 'communaute',
  'admin.imports.review': 'communaute',

  'admin.content.read': 'produit',
  'admin.content.write': 'produit',
  'admin.widgets.read': 'produit',
  'admin.widgets.write': 'produit',
  'admin.deliveries.read': 'produit',
  'admin.deliveries.retry': 'produit',
  'admin.campaigns.read': 'produit',
  'admin.campaigns.write': 'produit',

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
export const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    href: '/admin',
    label: 'Vue d’ensemble',
    capability: 'admin.dashboard.read',
    description: 'Compteurs globaux, santé et couverture de la console',
  },
  {
    href: '/admin/health',
    label: 'Santé plateforme',
    capability: 'admin.dashboard.read',
    alsoUses: ['admin.config.read'],
    description: 'Postgres, file, workers, version de migration, mode d’autorisation',
  },
  {
    href: '/admin/users',
    label: 'Comptes & modération',
    capability: 'admin.users.read',
    alsoUses: ['admin.users.moderate', 'admin.users.sessions.revoke'],
    description: 'Rechercher un compte, suspendre, certifier, révoquer les sessions',
  },
  {
    href: '/admin/reports',
    label: 'Signalements',
    capability: 'admin.reports.read',
    alsoUses: ['admin.reports.write'],
    description: 'Traiter la file de signalements',
  },
  {
    href: '/admin/abuse',
    label: 'Revue anti-abus',
    capability: 'admin.abuse.read',
    alsoUses: ['admin.abuse.decide'],
    description: 'Verdicts automatiques non triviaux et métriques des deux erreurs',
  },
  {
    href: '/admin/appeals',
    label: 'Recours',
    capability: 'admin.appeals.read',
    alsoUses: ['admin.appeals.decide'],
    description: 'Recours des personnes mesurées — seul `overturned` lève la mesure',
  },
  {
    href: '/admin/incidents',
    label: 'Incidents',
    capability: 'admin.incidents.read',
    alsoUses: ['admin.incidents.write'],
    description: 'Registre des attaques confirmées et des dossiers staff',
  },
  {
    href: '/admin/support',
    label: 'Support',
    capability: 'admin.support.read',
    alsoUses: ['admin.support.write'],
    description: 'Dossiers support, assignation, clôture et métriques',
  },
  {
    href: '/admin/support/articles',
    label: 'Articles d’aide',
    capability: 'admin.content.read',
    alsoUses: ['admin.content.write'],
    description: 'Centre d’aide : brouillons, publication, révision',
  },
  {
    href: '/admin/subscriptions',
    label: 'Abonnements',
    capability: 'admin.subscriptions.read',
    alsoUses: ['admin.subscriptions.write'],
    description: 'Octrois manuels datés, révocation, historique',
  },
  {
    href: '/admin/publications',
    label: 'Publications & freemium',
    capability: 'admin.subscriptions.read',
    alsoUses: ['admin.subscriptions.write'],
    description: 'Palier email Pro par publication (intérim Stripe)',
  },
  {
    href: '/admin/imports',
    label: 'Imports d’abonnés',
    capability: 'admin.imports.read',
    alsoUses: ['admin.imports.review'],
    description: 'Revue des imports, décision staff et déclenchement d’envoi',
  },
  {
    href: '/admin/campaigns',
    label: 'Campagnes staff',
    capability: 'admin.campaigns.read',
    alsoUses: ['admin.campaigns.write'],
    description: 'Campagnes éditoriales tracées de la plateforme',
  },
  {
    href: '/admin/widgets',
    label: 'Widgets & tendances',
    capability: 'admin.widgets.read',
    alsoUses: ['admin.widgets.write'],
    description: 'Mise en avant, tendances, promotions du lecteur',
  },
  {
    href: '/admin/notifications',
    label: 'Notifications & livraisons',
    capability: 'admin.deliveries.read',
    alsoUses: ['admin.deliveries.retry'],
    description: 'Journal des livraisons d’emails et reprise des échecs',
  },
  {
    href: '/admin/registrations',
    label: 'Inscriptions & allowlist',
    capability: 'admin.config.read',
    alsoUses: ['admin.config.write'],
    description: 'Accès privé : invitations d’inscription et mode d’ouverture',
  },
  {
    href: '/admin/reserved-identifiers',
    label: 'Identifiants réservés',
    capability: 'admin.config.read',
    alsoUses: ['admin.config.write'],
    description: 'Noms d’utilisateur et sous-domaines interdits à l’inscription',
  },
  {
    href: '/admin/storage',
    label: 'Stockage médias',
    capability: 'admin.dashboard.read',
    description: 'Saturation du bucket images et principaux consommateurs',
  },
  {
    href: '/admin/api',
    label: 'Demandes d’API',
    capability: 'admin.api.read',
    alsoUses: ['admin.api.grants.write'],
    description: 'Candidatures créateurs et permissions modulables',
  },
  {
    href: '/admin/oauth',
    label: 'Applications OAuth',
    capability: 'admin.oauth.read',
    alsoUses: ['admin.oauth.approve'],
    description: 'Clients OAuth tiers : lecture et décision',
  },
  {
    href: '/admin/config',
    label: 'Feature flags',
    capability: 'admin.config.read',
    alsoUses: ['admin.flags.write', 'admin.config.write'],
    description: 'Interrupteurs de plateforme et configuration système',
  },
  {
    href: '/admin/frontend',
    label: 'Frontend & UI',
    capability: 'admin.config.read',
    alsoUses: ['admin.config.write'],
    description: 'Bandeaux, héros et textes d’interface sans redéploiement',
  },
  {
    href: '/admin/translations',
    label: 'Traducteur & langues',
    capability: 'admin.config.read',
    alsoUses: ['admin.config.write'],
    description: 'Catalogue de traduction publié aux applications',
  },
  {
    href: '/admin/legal',
    label: 'Contenu juridique',
    capability: 'admin.legal.read',
    alsoUses: ['admin.legal.write'],
    description: 'Documents légaux, versions, acceptations et avis',
  },
  {
    href: '/admin/compliance',
    label: 'Conformité',
    capability: 'admin.compliance.read',
    alsoUses: ['admin.compliance.export'],
    description: 'Exports de consentement, vérification et revue RGPD',
  },
  {
    href: '/admin/audit',
    label: 'Journal d’audit',
    capability: 'admin.audit.read',
    description: 'Qui a fait quoi, sous quelle capacité et sous quel mode',
  },
  {
    href: '/admin/access',
    label: 'Accès staff',
    capability: 'admin.access.read',
    alsoUses: ['admin.access.grant'],
    description: 'Attribuer, dater et révoquer les rôles de la console',
  },
  {
    href: '/admin/access/roles',
    label: 'Matrice des rôles',
    capability: 'admin.access.read',
    description: 'Rôle × capacité, généré depuis le vocabulaire serveur',
  },
  {
    // La route exige `admin.audit.read` : lire un refus est un acte d'audit.
    // La capacité principale suit donc le registre, pas le voisinage de l'URL
    // (le domaine affiché se déduit de la capacité, jamais du chemin).
    href: '/admin/access/decisions',
    label: 'Décisions d’autorisation',
    capability: 'admin.audit.read',
    alsoUses: ['admin.access.read'],
    description: 'Journal des refus observés, groupé par capacité',
  },
];

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
