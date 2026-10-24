/**
 * 🔁 Anciennes URLs françaises → routes canoniques anglaises.
 *
 * Ces alias ne sont plus des routes du filesystem : ils sont déclarés une
 * seule fois ici et consommés par `next.config.ts`. Les liens externes et le
 * référencement continuent donc de fonctionner, sans segment français codé
 * en dur dans l'arborescence de l'app.
 *
 * ⚠️ Un alias reste un segment de premier niveau réservé pour les catégories
 * (voir `RESERVED_TENANT_ROUTES`) : ne pas en ajouter sans mettre à jour la
 * liste côté `@qoe/config` et côté Go.
 */
export interface LegacyTenantRedirect {
  source: string;
  destination: string;
}

export const LEGACY_TENANT_REDIRECTS: readonly LegacyTenantRedirect[] = [
  { source: '/a-propos', destination: '/about' },
  { source: '/equipe', destination: '/team' },
  { source: '/pensees', destination: '/thoughts' },
  { source: '/notes', destination: '/thoughts' },
  { source: '/auteur/:username', destination: '/author/:username' },
];

/** Premier segment occupé par un alias (`/auteur/:username` → `auteur`). */
export function legacyRedirectRootSegment(redirect: LegacyTenantRedirect): string {
  return redirect.source.replace(/^\//, '').split('/')[0];
}
