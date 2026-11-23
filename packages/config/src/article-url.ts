// =====================================================================
// 🔗 URLs publiques des articles — source de vérité unique.
// =====================================================================
// 📖 Ce module vivait dans `@qoe/utils` ; il est ici parce que `@qoe/config`
//    est le paquet le plus bas et que ses `routes` doivent composer les mêmes
//    chemins (`@qoe/utils` dépend de `@qoe/config`, l'inverse serait un
//    cycle). `@qoe/utils` le ré-exporte : une seule implémentation pour le
//    web, le mobile et les actions serveur.
//
// Trois formes, et elles ne sont PAS interchangeables :
//   • tenant : /{categorie}/{sous-categorie?}/{slug}  → canonique
//   • core   : /{proprietaire}/a/{slug}               → canonique
//   • /article/{slug}                                 → ANCIENNE, 308
//
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
export function sanitizeUrlSegment(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(/[\u0000-\u001f\u007f\\/]+/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, MAX_SEGMENT_LENGTH);
}

/**
 * Encode chaque segment d'un chemin sans encoder le séparateur.
 *
 * Une sous-catégorie s'exprime `parent/enfant` : encoder la chaîne entière
 * donnerait `parent%2Fenfant`, donc une 404 (F70).
 */
export function encodeUrlPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Décode un segment déjà passé par le routeur.
 *
 * Next.js décode les `params` avant de les rendre : un slug contenant un `%`
 * littéral (`100%-pure`) faisait lever `URIError` à `decodeURIComponent`, donc
 * une **500** au lieu d'une page. On décode une fois, et on renvoie la valeur
 * telle quelle si elle n'est pas un encodage valide.
 */
export function decodeUrlSegment(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Décode chaque segment d'un chemin (`/tech/caf%C3%A9` → `/tech/café`). */
export function decodeUrlPath(path: string): string {
  return path
    .split('/')
    .map((segment) => decodeUrlSegment(segment))
    .join('/');
}

/**
 * Deux chemins d'article désignent-ils la même page ?
 *
 * Le canonique est encodé (`/tech/caf%C3%A9`), le chemin demandé arrive déjà
 * décodé par Next (`/tech/café`) : comparer les chaînes brutes redirigerait
 * en boucle. La comparaison se fait donc segment par segment, décodée.
 */
export function isSameArticlePath(requested: string, canonical: string): boolean {
  return decodeUrlPath(requested) === decodeUrlPath(canonical);
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
  const slug = sanitizeUrlSegment(category?.slug);
  if (!slug) return DEFAULT_CATEGORY_SLUG;

  const directParent = sanitizeUrlSegment(category?.parentSlug);
  if (directParent) return `${directParent}/${slug}`;

  if (category?.parentId) {
    const parent = allCategories.find(
      (item) => item.id === category.parentId || item.slug === category.parentId
    );
    const parentSlug = sanitizeUrlSegment(parent?.slug);
    if (parentSlug) return `${parentSlug}/${slug}`;
  }

  return slug;
}

/** Chemin public d'une catégorie (ex: « /tech/ia »). */
export function buildCategoryPath(
  category: CategoryUrlNode | null | undefined,
  allCategories: readonly CategoryUrlNode[] = []
): string {
  return `/${encodeUrlPath(resolveCategoryPath(category, allCategories))}`;
}

/** Chemin public canonique d'un article. */
export function buildArticlePath(
  article: { slug: string; category?: CategoryUrlNode | null },
  allCategories: readonly CategoryUrlNode[] = []
): string {
  const categoryPath = encodeUrlPath(resolveCategoryPath(article.category, allCategories));
  const slug = encodeURIComponent(sanitizeUrlSegment(article.slug));
  return slug ? `/${categoryPath}/${slug}` : `/${categoryPath}`;
}
