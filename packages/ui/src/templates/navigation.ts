// =====================================================================
// 🧭 navigation.ts — Résolution souveraine de la navigation Tenant
// =====================================================================
// Unifie la résolution des rubriques, sous-rubriques et liens externes
// pour l'ensemble des archétypes (@qoe/ui : TenantHeader, NavbarBlock, MinimalCraftShell).
// Respecte nativement :
// - Le masquage des catégories via siteOptions.hiddenNavCategoryIds (catégories seules)
// - Les sous-rubriques hiérarchiques
// - Les liens externes créateur (Podcast, Réseaux, Boutique...)
// - La rétrocompatibilité avec les liens internes historiques
// =====================================================================

export interface TenantNavigationInput {
  categories?: Array<{
    id: string;
    name: string;
    slug: string;
    parentId?: string | null;
    isDefault?: boolean;
  }>;
  navigation?: Array<{
    id?: string;
    label: string;
    url: string | null;
    order: number;
    isExternal: boolean;
    parentId?: string | null;
  }>;
  siteOptions?: Record<string, unknown> | null;
  publicationId?: string;
  /** Inclut les pages intégrées (Accueil, À propos, Pensées) dans navItems. */
  includePages?: boolean;
}

export interface ResolvedTenantNavItem {
  id: string;
  label: string;
  url: string;
  order: number;
  isExternal: boolean;
  publicationId: string;
  isCategory: boolean;
  categorySlug?: string;
  isHome?: boolean;
  isPage?: boolean;
  isMail?: boolean;
  children?: ResolvedTenantNavItem[];
}

export interface ResolvedTenantNavigation {
  /** Tous les items de navigation hiérarchisés pour le menu (Rubriques + Liens externes) */
  navItems: ResolvedTenantNavItem[];
  /** Toutes les catégories non masquées du menu */
  visibleCategories: Array<{
    id: string;
    name: string;
    slug: string;
    parentId?: string | null;
    isDefault?: boolean;
  }>;
  /** Catégories racines visibles (sans parent) */
  rootCategories: Array<{
    id: string;
    name: string;
    slug: string;
    parentId?: string | null;
    isDefault?: boolean;
  }>;
  /** Liens externes racine configurés */
  externalLinks: Array<{
    id?: string;
    label: string;
    url: string | null;
    order: number;
    isExternal: boolean;
    parentId?: string | null;
  }>;
  /** Helper pour récupérer les sous-catégories visibles d'un parent */
  getSubcategories: (parentId: string) => Array<{
    id: string;
    name: string;
    slug: string;
    parentId?: string | null;
    isDefault?: boolean;
  }>;
}

/**
 * Résout de manière déterministe et performante la structure de navigation
 * d'un site tenant à partir du contexte de publication.
 */
export function resolveTenantNavigation(input: TenantNavigationInput): ResolvedTenantNavigation {
  const hiddenCatIds = new Set(
    (input.siteOptions?.hiddenNavCategoryIds as string[] | undefined) || []
  );

  // 1. Filtrage des catégories visibles (celles qui sont des rubriques dans l'en-tête)
  // La catégorie par défaut (« Non classé ») est un conteneur technique :
  // elle ne doit jamais apparaître dans la navigation publique.
  const visibleCategories = (input.categories || []).filter(
    (c) => !hiddenCatIds.has(c.id) && c.isDefault !== true
  );
  // Les données historiques peuvent contenir plusieurs catégories homonymes
  // (« Sport » x3) : on n'affiche que la première dans le menu, sans supprimer
  // les autres catégories (leurs pages restent accessibles par URL).
  const dedupeByLabel = <T extends { name: string }>(items: T[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.name.trim().toLocaleLowerCase('fr');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const rootCategories = dedupeByLabel(visibleCategories.filter((c) => !c.parentId));
  const getSubcategories = (parentId: string) =>
    dedupeByLabel(visibleCategories.filter((c) => c.parentId === parentId));

  // 2. Transformation des rubriques en items de navigation arborescents
  const categoryNavItems: ResolvedTenantNavItem[] = rootCategories.map((cat, idx) => ({
    id: cat.id,
    label: cat.name,
    url: `/${cat.slug}`,
    order: idx,
    isExternal: false,
    publicationId: input.publicationId || '',
    isCategory: true,
    categorySlug: cat.slug,
    children: getSubcategories(cat.id).map((sub, sIdx) => ({
      id: sub.id,
      label: sub.name,
      url: `/${cat.slug}/${sub.slug}`,
      order: sIdx,
      isExternal: false,
      publicationId: input.publicationId || '',
      isCategory: true,
      categorySlug: sub.slug,
    })),
  }));

  // 3. Liens externes additionnels & emails configurés par le créateur.
  // Une URL vide ou un simple schéma (« https:// ») ne doit jamais apparaître dans le menu public.
  const externalNavItems: ResolvedTenantNavItem[] = (input.navigation || [])
    .filter(
      (n) => (n.isExternal || isMailtoUrl(n.url)) && !n.parentId && isConfiguredExternalUrl(n.url)
    )
    .map((parent, idx) => {
      const normalized = normalizeNavigationUrl(parent.url);
      return {
        id: parent.id || `ext-${idx}`,
        label: parent.label,
        url: normalized.url || '#',
        order: parent.order ?? 100 + idx,
        isExternal: normalized.isExternal,
        isMail: normalized.isMail,
        publicationId: input.publicationId || '',
        isCategory: false,
        children: (input.navigation || [])
          .filter((n) => n.parentId === parent.id && isConfiguredExternalUrl(n.url))
          .map((child, cIdx) => {
            const childNorm = normalizeNavigationUrl(child.url);
            return {
              id: child.id || `ext-sub-${cIdx}`,
              label: child.label,
              url: childNorm.url || '#',
              order: child.order ?? cIdx,
              isExternal: childNorm.isExternal,
              isMail: childNorm.isMail,
              publicationId: input.publicationId || '',
              isCategory: false,
            };
          }),
      };
    });

  // 4. Repli hérité pour liens internes manuels existants (si aucune catégorie)
  const legacyInternalNav: ResolvedTenantNavItem[] =
    categoryNavItems.length === 0
      ? (input.navigation || [])
          .filter((n) => !n.isExternal && !isMailtoUrl(n.url) && !n.parentId)
          .map((parent, idx) => ({
            id: parent.id || `leg-${idx}`,
            label: parent.label,
            url: parent.url || '#',
            order: parent.order ?? idx,
            isExternal: false,
            publicationId: input.publicationId || '',
            isCategory: false,
            children: (input.navigation || [])
              .filter((n) => n.parentId === parent.id)
              .map((child, cIdx) => ({
                id: child.id || `leg-sub-${cIdx}`,
                label: child.label,
                url: child.url || '#',
                order: child.order ?? cIdx,
                isExternal: false,
                publicationId: input.publicationId || '',
                isCategory: false,
              })),
          }))
          .sort((a, b) => a.order - b.order)
      : [];

  // 5. Pages intégrées de la publication (Accueil, À propos, Pensées)
  const shouldIncludePages = Boolean(
    input.includePages ??
    (input.siteOptions &&
      ('showAboutInNav' in input.siteOptions ||
        'showThoughtsInNav' in input.siteOptions ||
        'showHomeInNav' in input.siteOptions ||
        'navOrder' in input.siteOptions))
  );

  const systemPageItems: ResolvedTenantNavItem[] = [];
  if (shouldIncludePages) {
    const showHome = (input.siteOptions?.showHomeInNav ?? true) !== false;
    const showThoughts = (input.siteOptions?.showThoughtsInNav ?? true) !== false;
    const showAbout = (input.siteOptions?.showAboutInNav ?? true) !== false;

    if (showHome) {
      systemPageItems.push({
        id: 'home',
        label: 'Accueil',
        url: '/',
        order: -10,
        isExternal: false,
        publicationId: input.publicationId || '',
        isCategory: false,
        isHome: true,
      });
    }

    if (showThoughts) {
      systemPageItems.push({
        id: 'page:thoughts',
        label: 'Pensées',
        url: '/thoughts',
        order: 80,
        isExternal: false,
        publicationId: input.publicationId || '',
        isCategory: false,
        isPage: true,
      });
    }

    if (showAbout) {
      systemPageItems.push({
        id: 'page:about',
        label: 'À propos',
        url: '/about',
        order: 90,
        isExternal: false,
        publicationId: input.publicationId || '',
        isCategory: false,
        isPage: true,
      });
    }
  }

  // 6. Assemblage & tri unifié selon siteOptions.navOrder (Navbar Organizer)
  const rawItems = shouldIncludePages
    ? [
        ...systemPageItems.filter((p) => p.id === 'home'),
        ...categoryNavItems,
        ...systemPageItems.filter((p) => p.id !== 'home'),
        ...legacyInternalNav,
        ...externalNavItems,
      ]
    : [...categoryNavItems, ...legacyInternalNav, ...externalNavItems];

  const rawNavOrder = input.siteOptions?.navOrder;
  const navOrder = Array.isArray(rawNavOrder) ? (rawNavOrder as string[]) : null;

  const navItems =
    navOrder && navOrder.length > 0
      ? [...rawItems].sort((a, b) => {
          const getRank = (item: ResolvedTenantNavItem) => {
            const keys = getItemOrderKeys(item);
            for (const k of keys) {
              const idx = navOrder.indexOf(k);
              if (idx !== -1) return idx;
            }
            return 1000 + item.order;
          };
          return getRank(a) - getRank(b);
        })
      : rawItems;

  return {
    navItems,
    visibleCategories,
    rootCategories,
    externalLinks: (input.navigation || [])
      .filter((n) => !n.parentId && isConfiguredExternalUrl(n.url))
      .map((n) => {
        const norm = normalizeNavigationUrl(n.url);
        return {
          ...n,
          url: norm.url,
          isExternal: norm.isExternal,
        };
      }),
    getSubcategories,
  };
}

/** Vérifie si une chaîne correspond à un lien email (préfixé par mailto: ou adresse brute). */
export function isMailtoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('mailto:') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Normalise une URL saisie par le créateur :
 * - Détecte les adresses email et applique automatiquement le préfixe mailto:
 * - Détecte les liens externes (http://, https://, //)
 */
export function normalizeNavigationUrl(rawUrl: string | null | undefined): {
  url: string;
  isMail: boolean;
  isExternal: boolean;
} {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { url: '', isMail: false, isExternal: false };
  }

  // Cas Email (ex: contact@journal.fr ou mailto:contact@journal.fr)
  if (trimmed.toLowerCase().startsWith('mailto:')) {
    return { url: trimmed, isMail: true, isExternal: true };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(trimmed)) {
    return { url: `mailto:${trimmed}`, isMail: true, isExternal: true };
  }

  // Cas URL externe classique
  const isExt =
    trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//');

  return { url: trimmed, isMail: false, isExternal: isExt };
}

/**
 * Retourne l'ensemble des clés d'identification d'un item pour la comparaison avec siteOptions.navOrder.
 */
export function getItemOrderKeys(item: {
  id: string;
  url?: string | null;
  categorySlug?: string;
  isCategory?: boolean;
}): string[] {
  const keys: string[] = [item.id];
  if (item.id === 'home' || item.url === '/') {
    keys.push('home', 'system:home', '/');
  } else if (item.id === 'page:about' || item.url === '/about') {
    keys.push('page:about', 'about', '/about');
  } else if (item.id === 'page:thoughts' || item.url === '/thoughts') {
    keys.push('page:thoughts', 'thoughts', '/thoughts');
  } else if (item.isCategory) {
    keys.push(`cat:${item.id}`, `category:${item.id}`);
    if (item.categorySlug) {
      keys.push(`cat:${item.categorySlug}`, `category:${item.categorySlug}`, item.categorySlug);
    }
  } else {
    keys.push(`link:${item.id}`);
  }
  return keys;
}

/** Une URL externe est exploitable seulement si elle est réellement renseignée. */
function isConfiguredExternalUrl(url: string | null | undefined): boolean {
  const value = (url || '').trim();
  if (value === '' || value === '#' || value === 'https://' || value === 'http://') {
    return false;
  }
  if (value.toLowerCase().startsWith('mailto:')) {
    const email = value.slice(7).trim();
    return email.length > 0 && email.includes('@');
  }
  return true;
}

/**
 * Normalise un slug de catégorie (minuscules, sans accents, caractères spéciaux convertis en tirets).
 */
export function normalizeCategorySlug(rawSlug: string): string {
  return rawSlug
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Recherche une catégorie par slug (exact puis insensible à la casse puis normalisé).
 */
export function findCategoryBySlug<
  T extends { id: string; name: string; slug: string; parentId?: string | null },
>(categories: T[], rawSlug: string): T | undefined {
  if (!rawSlug) return undefined;
  const trimmed = rawSlug.trim();
  const lower = trimmed.toLowerCase();
  const normalized = normalizeCategorySlug(trimmed);

  // 1. Correspondance exacte
  const exact = categories.find((c) => c.slug === trimmed);
  if (exact) return exact;

  // 2. Correspondance insensible à la casse
  const caseInsensitive = categories.find((c) => c.slug.toLowerCase() === lower);
  if (caseInsensitive) return caseInsensitive;

  // 3. Correspondance normalisée (accents et espaces tolérés)
  return categories.find((c) => normalizeCategorySlug(c.slug) === normalized);
}

/**
 * Récupère tous les IDs de sous-catégories descendantes (directes et indirectes).
 */
export function getDescendantCategoryIds(
  categories: Array<{ id: string; parentId?: string | null }>,
  parentId: string
): Set<string> {
  const result = new Set<string>();
  const queue = [parentId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const cat of categories) {
      if (cat.parentId === current && !result.has(cat.id)) {
        result.add(cat.id);
        queue.push(cat.id);
      }
    }
  }

  return result;
}

/**
 * Récupère tous les slugs normalisés de sous-catégories descendantes.
 */
export function getDescendantCategorySlugs(
  categories: Array<{ id: string; slug: string; parentId?: string | null }>,
  parentId: string
): Set<string> {
  const descendantIds = getDescendantCategoryIds(categories, parentId);
  const slugs = new Set<string>();
  for (const cat of categories) {
    if (descendantIds.has(cat.id)) {
      slugs.add(normalizeCategorySlug(cat.slug));
    }
  }
  return slugs;
}

export interface MinimalArticleCategoryInfo {
  id?: string;
  categoryId?: string | null;
  category?: { id?: string; slug?: string; name?: string } | null;
  published?: boolean;
}

/**
 * Filtre les articles de manière déterministe pour une catégorie donnée.
 * Inclut automatiquement :
 * - Les articles directement associés à la catégorie (par ID ou par slug)
 * - Si la catégorie a des sous-rubriques descendantes, les articles de toutes ces sous-rubriques
 * Exclut les brouillons (`published === false`).
 */
export function filterArticlesByCategory<T extends MinimalArticleCategoryInfo>(
  articles: T[],
  targetCategory: { id: string; slug: string },
  allCategories: Array<{ id: string; slug: string; parentId?: string | null }> = []
): T[] {
  const normalizedTargetSlug = normalizeCategorySlug(targetCategory.slug);
  const descendantIds = getDescendantCategoryIds(allCategories, targetCategory.id);
  const descendantSlugs = getDescendantCategorySlugs(allCategories, targetCategory.id);

  return articles.filter((art) => {
    if (art.published === false) return false;

    const catId = art.categoryId || art.category?.id;
    const catSlug = art.category?.slug ? normalizeCategorySlug(art.category.slug) : null;

    // 1. Correspondance directe
    if (catId === targetCategory.id || (catSlug && catSlug === normalizedTargetSlug)) {
      return true;
    }

    // 2. Correspondance avec une sous-rubrique descendante
    if (catId && descendantIds.has(catId)) {
      return true;
    }
    if (catSlug && descendantSlugs.has(catSlug)) {
      return true;
    }

    return false;
  });
}
