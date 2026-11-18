// =====================================================================
// 🔗 URLs publiques — résolution sans domaine propriétaire en dur
// =====================================================================
// Un article partagé (citation dans le feed, e-mail, embed) doit pointer vers
// l'origine réelle de sa publication :
//   - domaine personnalisé → `https://exemple.com/article/…`
//   - sous-domaine        → `https://media.<domaine racine>/article/…`
//   - publication nue     → `https://<domaine racine>/article/…`
//
// Le domaine racine vient de `NEXT_PUBLIC_TENANT_DOMAIN` (défaut inchangé
// `qoe.fi`) : un auto-hébergement ou un futur CDN d'apps ne demande aucune
// modification de code.
// =====================================================================

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

/** URL publique d'un article, slug encodé. */
export function resolveArticleShareUrl(
  publisher: SharePublisher | null | undefined,
  slug: string,
  rootDomain?: string
): string {
  return `${resolvePublisherOrigin(publisher, rootDomain)}/article/${encodeURIComponent(slug)}`;
}
