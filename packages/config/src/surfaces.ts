// =====================================================================
// 🗺️ MANIFESTE DE SURFACES — navigation, Cmd+K, hotkeys, RBAC
// =====================================================================
// Une surface déclarée UNE fois alimente la sidebar, la palette Cmd+K, l'aide
// des raccourcis claviers et les gardes RBAC du Studio. Les chemins viennent
// exclusivement de `routes` : aucune URL en dur.
// =====================================================================

import { routes } from './routes';

export type AppSurfaceScope = 'reader' | 'studio' | 'admin';

export type SurfaceSection =
  'navigation' | 'library' | 'creation' | 'growth' | 'workspace' | 'system';

export interface SurfaceDescriptor {
  id: string;
  scope: AppSurfaceScope;
  path: string;
  iconName: string;
  /** Libellé par défaut (français), traduit par la surface consommatrice. */
  defaultLabel: string;
  section: SurfaceSection;
  /** Mots-clés de recherche pour le Spotlight (Cmd+K). */
  keywords: string[];
  /** Raccourci clavier éventuel (ex. 'g h'). */
  hotkey?: string;
  /** Permission RBAC requise en mode MEDIA (absente = accessible à tous). */
  requiredPermission?: string;
  showInSidebar: boolean;
  showInCmdK: boolean;
}

/**
 * Liste canonique. Un ajout ici rend la surface disponible partout (sidebar,
 * Cmd+K, hotkeys, RBAC) sans modifier les layouts.
 */
export const PLATFORM_SURFACES: readonly SurfaceDescriptor[] = [
  // ── Studio ─────────────────────────────────────────────────────────
  {
    id: 'studio.home',
    scope: 'studio',
    path: routes.studio.home(),
    iconName: 'Home',
    defaultLabel: 'Tableau de bord',
    section: 'navigation',
    keywords: ['accueil', 'tableau de bord', 'dashboard', 'home'],
    hotkey: 'g h',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.new-article',
    scope: 'studio',
    path: routes.studio.articles.new(),
    iconName: 'Plus',
    defaultLabel: 'Rédiger un article',
    section: 'creation',
    keywords: ['écrire', 'rédiger', 'nouvel article', 'composer'],
    hotkey: 'c a',
    requiredPermission: 'articles:write',
    showInSidebar: false,
    showInCmdK: true,
  },
  {
    id: 'studio.articles',
    scope: 'studio',
    path: routes.studio.articles.list(),
    iconName: 'FileText',
    defaultLabel: 'Liste des écrits',
    section: 'creation',
    keywords: ['articles', 'écrits', 'brouillons', 'publications'],
    hotkey: 'g a',
    requiredPermission: 'articles:read',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.newsletters',
    scope: 'studio',
    path: routes.studio.newsletters(),
    iconName: 'Mail',
    defaultLabel: 'Newsletters',
    section: 'growth',
    keywords: ['newsletter', 'email', 'diffusion', 'envoi'],
    hotkey: 'g n',
    requiredPermission: 'newsletters:manage',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.audience',
    scope: 'studio',
    path: routes.studio.audience(),
    iconName: 'Users',
    defaultLabel: "Gérer l'audience",
    section: 'growth',
    keywords: ['audience', 'abonnés', 'abonnes', 'lecteurs', 'followers'],
    hotkey: 'g u',
    requiredPermission: 'subscribers:read',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.analytics',
    scope: 'studio',
    path: routes.studio.analytics(),
    iconName: 'PieChart',
    defaultLabel: 'Statistiques',
    section: 'growth',
    keywords: ['analytics', 'statistiques', 'stats', 'performances'],
    hotkey: 'g s',
    requiredPermission: 'analytics:read',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.media',
    scope: 'studio',
    path: routes.studio.media(),
    iconName: 'Building2',
    defaultLabel: 'Publications',
    section: 'workspace',
    keywords: ['médias', 'medias', 'publications', 'espaces'],
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.import',
    scope: 'studio',
    path: routes.studio.import(),
    iconName: 'Users',
    defaultLabel: 'Importer son audience',
    section: 'growth',
    keywords: ['importer', 'import', 'migration', 'audience'],
    requiredPermission: 'subscribers:write',
    showInSidebar: false,
    showInCmdK: true,
  },
  {
    id: 'studio.pricing',
    scope: 'studio',
    path: routes.studio.pricing(),
    iconName: 'Wallet',
    defaultLabel: 'Abonnement',
    section: 'system',
    keywords: ['abonnement', 'offre', 'paiement', 'pricing', 'facturation'],
    requiredPermission: 'billing:manage',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.notifications',
    scope: 'studio',
    path: routes.studio.notifications(),
    iconName: 'Bell',
    defaultLabel: 'Notifications',
    section: 'navigation',
    keywords: ['notifications', 'alertes'],
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.developer',
    scope: 'studio',
    path: routes.studio.developer(),
    iconName: 'Code',
    defaultLabel: 'Espace développeur',
    section: 'system',
    keywords: ['api', 'développeur', 'developpeur', 'webhook', 'clé'],
    requiredPermission: 'settings:manage',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.settings',
    scope: 'studio',
    path: routes.studio.settings(),
    iconName: 'Settings',
    defaultLabel: 'Réglages de la console',
    section: 'system',
    keywords: ['réglages', 'reglages', 'paramètres', 'parametres', 'settings'],
    hotkey: 'g ,',
    requiredPermission: 'settings:manage',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.onboarding',
    scope: 'studio',
    path: routes.studio.onboarding(),
    iconName: 'Compass',
    defaultLabel: 'Assistant de démarrage',
    section: 'navigation',
    keywords: ['démarrage', 'demarrage', 'onboarding'],
    showInSidebar: false,
    showInCmdK: true,
  },

  // ── Reader ─────────────────────────────────────────────────────────
  {
    id: 'reader.home',
    scope: 'reader',
    path: routes.feed.home(),
    iconName: 'Home',
    defaultLabel: 'Fil',
    section: 'navigation',
    keywords: ['accueil', 'fil', 'home', 'feed'],
    hotkey: 'g h',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'reader.search',
    scope: 'reader',
    path: routes.feed.search(),
    iconName: 'Search',
    defaultLabel: 'Rechercher',
    section: 'navigation',
    keywords: ['recherche', 'chercher', 'search'],
    hotkey: '/',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'reader.notifications',
    scope: 'reader',
    path: routes.feed.notifications(),
    iconName: 'Bell',
    defaultLabel: 'Notifications',
    section: 'navigation',
    keywords: ['notifications', 'alertes'],
    hotkey: 'g n',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'reader.messages',
    scope: 'reader',
    path: routes.feed.messages(),
    iconName: 'Mail',
    defaultLabel: 'Messages',
    section: 'navigation',
    keywords: ['messages', 'conversations', 'inbox'],
    hotkey: 'g m',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'reader.bookmarks',
    scope: 'reader',
    path: routes.feed.library('bookmarks'),
    iconName: 'Bookmark',
    defaultLabel: 'Signets',
    section: 'library',
    keywords: ['signets', 'bibliothèque', 'bookmarks', 'enregistrés'],
    hotkey: 'g b',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'reader.highlights',
    scope: 'reader',
    path: routes.feed.highlights(),
    iconName: 'Highlighter',
    defaultLabel: 'Surlignages',
    section: 'library',
    keywords: ['surlignages', 'annotations', 'highlights'],
    hotkey: 'g l',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'reader.ebooks',
    scope: 'reader',
    path: routes.feed.ebooks(),
    iconName: 'FileText',
    defaultLabel: 'Livres',
    section: 'library',
    keywords: ['ebooks', 'livres', 'bibliothèque'],
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'reader.billing',
    scope: 'reader',
    path: routes.feed.billing(),
    iconName: 'Wallet',
    defaultLabel: 'Abonnement',
    section: 'system',
    keywords: ['abonnement', 'paiement', 'facturation', 'billing'],
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'reader.settings',
    scope: 'reader',
    path: routes.feed.settings(),
    iconName: 'Settings',
    defaultLabel: 'Réglages',
    section: 'system',
    keywords: ['réglages', 'paramètres', 'compte', 'settings'],
    hotkey: 'g ,',
    showInSidebar: true,
    showInCmdK: true,
  },
];

function hasPermission(surface: SurfaceDescriptor, userPermissions: string[]): boolean {
  return !surface.requiredPermission || userPermissions.includes(surface.requiredPermission);
}

/** Surfaces affichées dans la sidebar d'un scope. */
export function getSidebarSurfaces(
  scope: AppSurfaceScope,
  userPermissions?: string[]
): SurfaceDescriptor[] {
  return PLATFORM_SURFACES.filter(
    (surface) =>
      surface.scope === scope &&
      surface.showInSidebar &&
      (userPermissions === undefined || hasPermission(surface, userPermissions))
  );
}

/** Surfaces proposées par la palette Cmd+K d'un scope. */
export function getCmdKSurfaces(
  scope: AppSurfaceScope,
  userPermissions?: string[]
): SurfaceDescriptor[] {
  return PLATFORM_SURFACES.filter(
    (surface) =>
      surface.scope === scope &&
      surface.showInCmdK &&
      (userPermissions === undefined || hasPermission(surface, userPermissions))
  );
}

/** Surfaces portant un raccourci clavier (pour l'aide et la résolution). */
export function getHotkeySurfaces(scope?: AppSurfaceScope): SurfaceDescriptor[] {
  return PLATFORM_SURFACES.filter(
    (surface) => Boolean(surface.hotkey) && (!scope || surface.scope === scope)
  );
}

function pathMatches(surfacePath: string, pathname: string): boolean {
  if (pathname === surfacePath) return true;
  if (surfacePath === '/') return false;
  return pathname.startsWith(`${surfacePath}/`);
}

/**
 * Vérifie l'accès au chemin courant.
 *
 * - chemin inconnu du manifeste → true (il n'est pas gouverné ici) ;
 * - surface la plus spécifique retenue (chemin le plus long) ;
 * - refus uniquement si cette surface exige une permission absente.
 */
export function canAccessSurfacePath(
  scope: AppSurfaceScope,
  pathname: string,
  userPermissions: string[]
): boolean {
  const match = PLATFORM_SURFACES.filter(
    (surface) => surface.scope === scope && pathMatches(surface.path, pathname)
  ).sort((a, b) => b.path.length - a.path.length)[0];

  if (!match) return true;
  return hasPermission(match, userPermissions);
}
