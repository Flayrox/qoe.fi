// =====================================================================
// 🗺️ MANIFESTE DE SURFACES — navigation, Cmd+K, hotkeys, RBAC
// =====================================================================
// Une surface déclarée UNE fois alimente la sidebar, la palette Cmd+K, l'aide
// des raccourcis claviers et les gardes RBAC du Studio. Les chemins viennent
// exclusivement de `routes` : aucune URL en dur.
//
// Les `requiredPermission` sont les permissions média réelles
// (`packages/auth/src/media.ts`, parité Go `internal/permissions`) : elles ne
// s'appliquent qu'en workspace MEDIA. Un compte PERSONNEL voit tout.
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
  /** Permission média requise (absente = accessible à tous les membres). */
  requiredPermission?: string;
  showInSidebar: boolean;
  showInCmdK: boolean;
}

/**
 * Liste canonique. L'ordre est celui de la sidebar : un ajout ici rend la
 * surface disponible partout (sidebar, Cmd+K, hotkeys, RBAC) sans modifier les
 * layouts.
 */
export const PLATFORM_SURFACES: readonly SurfaceDescriptor[] = [
  // ── Studio (ordre de la sidebar) ───────────────────────────────────
  {
    id: 'studio.home',
    scope: 'studio',
    path: routes.studio.home(),
    iconName: 'Home',
    defaultLabel: 'Accueil',
    section: 'navigation',
    keywords: ['accueil', 'tableau de bord', 'dashboard', 'home'],
    hotkey: 'g h',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.articles',
    scope: 'studio',
    path: routes.studio.articles.list(),
    iconName: 'FileText',
    defaultLabel: 'Articles',
    section: 'creation',
    keywords: ['articles', 'écrits', 'brouillons', 'publications'],
    hotkey: 'g a',
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
    id: 'studio.media',
    scope: 'studio',
    path: routes.studio.media(),
    iconName: 'Building2',
    defaultLabel: 'Médias',
    section: 'workspace',
    keywords: ['médias', 'medias', 'publications', 'espaces'],
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
    requiredPermission: 'media:manage_newsletter',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.audience',
    scope: 'studio',
    path: routes.studio.audience(),
    iconName: 'Users',
    defaultLabel: 'Audience',
    section: 'growth',
    keywords: ['audience', 'abonnés', 'abonnes', 'lecteurs', 'followers'],
    hotkey: 'g u',
    requiredPermission: 'media:view_analytics',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.analytics',
    scope: 'studio',
    path: routes.studio.analytics(),
    iconName: 'PieChart',
    defaultLabel: 'Analytics',
    section: 'growth',
    keywords: ['analytics', 'statistiques', 'stats', 'performances'],
    hotkey: 'g s',
    requiredPermission: 'media:view_analytics',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.developer',
    scope: 'studio',
    path: routes.studio.developer(),
    iconName: 'Code',
    defaultLabel: 'Développeur',
    section: 'system',
    keywords: ['api', 'développeur', 'developpeur', 'webhook', 'clé'],
    requiredPermission: 'api_keys:manage',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.settings',
    scope: 'studio',
    path: routes.studio.settings(),
    iconName: 'Settings',
    defaultLabel: 'Réglages',
    section: 'system',
    keywords: ['réglages', 'reglages', 'paramètres', 'parametres', 'settings'],
    hotkey: 'g ,',
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'studio.pricing',
    scope: 'studio',
    path: routes.studio.pricing(),
    iconName: 'Wallet',
    defaultLabel: 'Offre Pro',
    section: 'system',
    keywords: ['abonnement', 'offre', 'paiement', 'pricing', 'facturation'],
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
    requiredPermission: 'media:create_articles',
    showInSidebar: false,
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
    requiredPermission: 'subscribers:import_request',
    showInSidebar: false,
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
    defaultLabel: 'Accueil',
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
    defaultLabel: 'Recherche',
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
    defaultLabel: 'Bibliothèque',
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
    // Accessible depuis l'onglet de la bibliothèque et le Cmd+K : la sidebar
    // lecteur historique n'affiche qu'une entrée « Bibliothèque ».
    showInSidebar: false,
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
    showInSidebar: false,
    showInCmdK: true,
  },
  {
    id: 'reader.billing',
    scope: 'reader',
    path: routes.feed.billing(),
    iconName: 'Wallet',
    defaultLabel: 'Portefeuille',
    section: 'system',
    keywords: ['abonnement', 'paiement', 'facturation', 'billing'],
    showInSidebar: true,
    showInCmdK: true,
  },
  {
    id: 'reader.pricing',
    scope: 'reader',
    path: routes.feed.pricing(),
    iconName: 'Crown',
    defaultLabel: 'Abonnement Plus',
    section: 'system',
    keywords: ['abonnement', 'plus', 'offre', 'pricing', 'premium'],
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

interface SplitPath {
  pathname: string;
  search: string;
}

/** Sépare chemin / query / hash : `/library?tab=bookmarks#top`. */
function splitPath(value: string): SplitPath {
  const hashIndex = value.indexOf('#');
  const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const searchIndex = withoutHash.indexOf('?');
  return searchIndex >= 0
    ? {
        pathname: withoutHash.slice(0, searchIndex),
        search: withoutHash.slice(searchIndex),
      }
    : { pathname: withoutHash, search: '' };
}

function pathMatches(surfacePath: string, pathname: string): boolean {
  if (pathname === surfacePath) return true;
  if (surfacePath === '/') return false;
  return pathname.startsWith(`${surfacePath}/`);
}

/**
 * Vérifie l'accès au chemin courant.
 *
 * - `?tab=` et `#ancre` sont ignorés pour la résolution, mais une correspondance
 *   exacte (query comprise) est prioritaire — `/library?tab=bookmarks` ne se
 *   confond donc pas avec `/library?tab=highlights` ;
 * - chemin inconnu du manifeste → true (il n'est pas gouverné ici) ;
 * - surface la plus spécifique retenue (chemin le plus long) ;
 * - refus uniquement si aucune surface correspondante n'est autorisée.
 */
export function canAccessSurfacePath(
  scope: AppSurfaceScope,
  pathname: string,
  userPermissions: string[]
): boolean {
  const target = splitPath(pathname);
  const scoped = PLATFORM_SURFACES.filter((surface) => surface.scope === scope);

  const exact = scoped.filter((surface) => {
    const split = splitPath(surface.path);
    return split.pathname === target.pathname && split.search === target.search;
  });
  if (exact.length > 0) return exact.some((surface) => hasPermission(surface, userPermissions));

  const candidates = scoped
    .filter((surface) => pathMatches(splitPath(surface.path).pathname, target.pathname))
    .sort((a, b) => splitPath(b.path).pathname.length - splitPath(a.path).pathname.length);

  if (candidates.length === 0) return true;

  const longest = splitPath(candidates[0].path).pathname.length;
  const mostSpecific = candidates.filter(
    (surface) => splitPath(surface.path).pathname.length === longest
  );
  return mostSpecific.some((surface) => hasPermission(surface, userPermissions));
}
