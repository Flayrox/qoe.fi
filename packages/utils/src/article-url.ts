// =====================================================================
// 🔗 URLs publiques des articles — source de vérité unique.
// Canonique : /{categorie}/{sous-categorie?}/{slug-article}
// La catégorie par défaut (slug « uncategorized ») est incluse pour que
// l'URL reste stable et hiérarchique, même si elle est masquée de la nav.
// =====================================================================

export const DEFAULT_CATEGORY_SLUG = 'uncategorized';

/** Longueur maximale d'un segment d'URL (alignée sur `slugify`). */
const MAX_SEGMENT_LENGTH = 96;

/**
 * 🔒 Nettoie un segment de chemin.
 *
 * Ces valeurs viennent de la base (slugs créés à la main, imports, anciens
 * contenus). Un slug contenant `/`, `\` ou une suite `..` produisait un lien
 * qui sort de la hiérarchie prévue — au mieux une 404, au pire un chemin
 * construit par un tiers. On retire les séparateurs et on compresse les
 * points, sans jamais ré-encoder (les slugs déjà encodés resteraient lisibles).
 */
function safeSegment(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(/[\u0000-\u001f\u007f\\/]+/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, MAX_SEGMENT_LENGTH);
}

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
  const slug = safeSegment(category?.slug);
  if (!slug) return DEFAULT_CATEGORY_SLUG;

  const directParent = safeSegment(category?.parentSlug);
  if (directParent) return `${directParent}/${slug}`;

  if (category?.parentId) {
    const parent = allCategories.find(
      (item) => item.id === category.parentId || item.slug === category.parentId
    );
    const parentSlug = safeSegment(parent?.slug);
    if (parentSlug) return `${parentSlug}/${slug}`;
  }

  return slug;
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
  const slug = safeSegment(article.slug);
  return slug ? `/${categoryPath}/${slug}` : `/${categoryPath}`;
}
