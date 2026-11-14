// =====================================================================
// 🧭 e2e/lib/tenant-paths.ts — chemins de l'app tenants (apps/tenants)
// =====================================================================
// L'app tenants est servie par sous-domaine en production ; en E2E on passe
// par la forme interne `/tenant/{domaine}/...`. Attention : les routes
// d'ancienne génération (`/article/{slug}`) redirigent vers le chemin
// canonique SANS le préfixe `/tenant/{domaine}` (correct sur un sous-domaine,
// 404 quand on interroge l'app par chemin). Les specs doivent donc viser
// directement la route canonique.
//
// Canonique (cf. packages/utils/src/article-url.ts) :
//   /{categorie}/{slug}  →  ici  /tenant/{domaine}/{categorie}/{slug}
// =====================================================================

/** Catégorie technique des articles sans catégorie (DEFAULT_CATEGORY_SLUG). */
export const DEFAULT_CATEGORY_SLUG = 'uncategorized';

/** Chemin d'un article tel que servi par l'app tenants, sans redirection. */
export function tenantArticlePath(
  domain: string,
  slug: string,
  categorySlug: string = DEFAULT_CATEGORY_SLUG
): string {
  return `/tenant/${domain}/${categorySlug}/${slug}`;
}
