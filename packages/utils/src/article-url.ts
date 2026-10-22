// =====================================================================
// 🔗 URLs publiques des articles — source de vérité unique.
// Canonique : /{categorie}/{sous-categorie?}/{slug-article}
// La catégorie par défaut (slug « uncategorized ») est incluse pour que
// l'URL reste stable et hiérarchique, même si elle est masquée de la nav.
// =====================================================================

export const DEFAULT_CATEGORY_SLUG = 'uncategorized';

export interface CategoryUrlNode {
  id?: string;
  slug?: string | null;
  parentId?: string | null;
  parentSlug?: string | null;
}

/** Chemin de catégorie sans le préfixe /categorie (ex: « tech/ia »). */
export function resolveCategoryPath(
  category: CategoryUrlNode | null | undefined,
  allCategories: readonly CategoryUrlNode[] = []
): string {
  if (!category?.slug) return DEFAULT_CATEGORY_SLUG;

  const directParent = category.parentSlug?.trim();
  if (directParent) return `${directParent}/${category.slug}`;

  if (category.parentId) {
    const parent = allCategories.find(
      (item) => item.id === category.parentId || item.slug === category.parentId
    );
    if (parent?.slug) return `${parent.slug}/${category.slug}`;
  }

  return category.slug;
}

/** Chemin public d'une catégorie (ex: « /tech/ia »). */
export function buildCategoryPath(
  category: CategoryUrlNode | null | undefined,
  allCategories: readonly CategoryUrlNode[] = []
): string {
  return `/${resolveCategoryPath(category, allCategories)}`;
}

/** Chemin public canonique d'un article. */
export function buildArticlePath(
  article: { slug: string; category?: CategoryUrlNode | null },
  allCategories: readonly CategoryUrlNode[] = []
): string {
  const categoryPath = resolveCategoryPath(article.category, allCategories);
  return `/${categoryPath}/${article.slug}`;
}
