// =====================================================================
// 🔗 URLs publiques — résolution sans domaine propriétaire en dur
// =====================================================================
// Deux formes coexistent, et elles ne sont PAS interchangeables :
//
//   • tenant (domaine propre ou `media.qoe.fi`) :
//       /{categorie}/{sous-categorie?}/{slug}   → canonique (slug peut finir
//                                                 par le code court : `…-928488`)
//       /{code}            (code court seul, ex. 928488)
//       /l/{code}          (lien court explicite)
//       /article/{slug}    (ANCIENNE forme, redirigée en 308 — ne plus générer)
//
//   • core (qoe.fi) :
//       /{proprietaire}/a/{slug}                → canonique
//       /l/{code}                               → lien court
//
// La hiérarchie de catégories vit dans `@qoe/utils` (`buildArticlePath`) :
// une seule implémentation pour le web, le mobile et les actions serveur.
// =====================================================================

import { buildArticlePath, type CategoryUrlNode } from '@qoe/utils';

/** Retire le schéma et les slashs de fin d'un hôte saisi en configuration. */
function cleanHost(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

export interface SharePublisher {
  subdomain?: string | null;
  customDomain?: string | null;
}

export interface ShareArticle {
  slug: string;
  /** Code court numérique : suffixe du slug et/ou lien `/l/{code}`. */
  shortCode?: string | null;
  /** Catégorie (et parent) pour reconstituer `/{parent}/{categorie}`. */
  category?: CategoryUrlNode | null;
}

/** Origine publique d'une publication (sans slash final, sans chemin). */
export function resolvePublisherOrigin(
  publisher: SharePublisher | null | undefined,
  rootDomain: string = process.env.NEXT_PUBLIC_TENANT_DOMAIN ?? 'qoe.fi'
): string {
  const root = cleanHost(rootDomain) || 'qoe.fi';
  const custom = publisher?.customDomain ? cleanHost(publisher.customDomain) : '';
  if (custom) return `https://${custom}`;

  const subdomain = publisher?.subdomain ? cleanHost(publisher.subdomain) : '';
  if (!subdomain) return `https://${root}`;
  // Un sous-domaine déjà qualifié (`media.exemple.com`) ne reçoit pas la racine.
  return subdomain.includes('.') ? `https://${subdomain}` : `https://${subdomain}.${root}`;
}

/** Chemin canonique d'un article sur son site tenant. */
export function resolveTenantArticlePath(
  article: ShareArticle,
  allCategories: readonly CategoryUrlNode[] = []
): string {
  return buildArticlePath(article, allCategories);
}

/**
 * URL publique d'un article sur son site tenant.
 *
 * `preferShortCode` renvoie le lien court `/l/{code}` : stable même si le slug
 * ou la catégorie change à la publication suivante. Par défaut on renvoie le
 * chemin canonique (SEO), jamais l'ancienne forme `/article/{slug}`.
 */
export function resolveArticleShareUrl(
  publisher: SharePublisher | null | undefined,
  article: ShareArticle,
  options?: {
    rootDomain?: string;
    preferShortCode?: boolean;
    categories?: readonly CategoryUrlNode[];
  }
): string {
  const origin = resolvePublisherOrigin(publisher, options?.rootDomain);
  const shortCode = article.shortCode?.trim();
  if (options?.preferShortCode && shortCode) {
    return `${origin}/l/${encodeURIComponent(shortCode)}`;
  }
  return `${origin}${resolveTenantArticlePath(article, options?.categories)}`;
}
