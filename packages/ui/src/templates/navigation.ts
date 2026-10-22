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
  children?: ResolvedTenantNavItem[];
}

export interface ResolvedTenantNavigation {
  /** Tous les items de navigation hiérarchisés pour le menu (Rubriques + Liens externes) */
  navItems: ResolvedTenantNavItem[];
  /** Toutes les catégories non masquées du menu */
  visibleCategories: Array<{ id: string; name: string; slug: string; parentId?: string | null }>;
  /** Catégories racines visibles (sans parent) */
  rootCategories: Array<{ id: string; name: string; slug: string; parentId?: string | null }>;
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
  getSubcategories: (
    parentId: string
  ) => Array<{ id: string; name: string; slug: string; parentId?: string | null }>;
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
  const visibleCategories = (input.categories || []).filter((c) => !hiddenCatIds.has(c.id));
  const rootCategories = visibleCategories.filter((c) => !c.parentId);
  const getSubcategories = (parentId: string) =>
    visibleCategories.filter((c) => c.parentId === parentId);

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
      url: `/${sub.slug}`,
      order: sIdx,
      isExternal: false,
      publicationId: input.publicationId || '',
      isCategory: true,
      categorySlug: sub.slug,
    })),
  }));

  // 3. Liens externes additionnels configurés par le créateur. Une URL vide
  // ou un simple schéma (« https:// ») ne doit jamais apparaître dans le menu
  // public : c'est un lien mort, et next/link tente de le précharger.
  const externalNavItems: ResolvedTenantNavItem[] = (input.navigation || [])
    .filter((n) => n.isExternal && !n.parentId && isConfiguredExternalUrl(n.url))
    .map((parent, idx) => ({
      id: parent.id || `ext-${idx}`,
      label: parent.label,
      url: parent.url || '#',
      order: parent.order ?? 100 + idx,
      isExternal: true,
      publicationId: input.publicationId || '',
      isCategory: false,
      children: (input.navigation || [])
        .filter((n) => n.parentId === parent.id && isConfiguredExternalUrl(n.url))
        .map((child, cIdx) => ({
          id: child.id || `ext-sub-${cIdx}`,
          label: child.label,
          url: child.url || '#',
          order: child.order ?? cIdx,
          isExternal: true,
          publicationId: input.publicationId || '',
          isCategory: false,
        })),
    }));

  // 4. Repli hérité pour liens internes manuels existants (si aucune catégorie)
  const legacyInternalNav: ResolvedTenantNavItem[] =
    categoryNavItems.length === 0
      ? (input.navigation || [])
          .filter((n) => !n.isExternal && !n.parentId)
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

  const navItems = [...categoryNavItems, ...legacyInternalNav, ...externalNavItems];

  return {
    navItems,
    visibleCategories,
    rootCategories,
    externalLinks: (input.navigation || []).filter(
      (n) => n.isExternal && !n.parentId && isConfiguredExternalUrl(n.url)
    ),
    getSubcategories,
  };
}

/** Une URL externe est exploitable seulement si elle est réellement renseignée. */
function isConfiguredExternalUrl(url: string | null | undefined): boolean {
  const value = (url || '').trim();
  return value !== '' && value !== '#' && value !== 'https://' && value !== 'http://';
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
