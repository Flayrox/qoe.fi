// =====================================================================
// 🔁 settings/lib/canonical-profile — une seule vérité après enregistrement
// =====================================================================
// La page settings n'enregistre plus quatre morceaux séparément : elle envoie
// un patch, Go l'applique dans une transaction et renvoie l'état relu en base.
// Ces deux fonctions font le pont dans un seul sens :
//   pickProfile    → ne garde que les champs que Go accepte d'écrire ;
//   mergeCanonical → réinjecte la réponse serveur dans le profil local.
// Aucune fusion « intelligente » côté client : ce que Go renvoie est ce qui est
// enregistré, y compris les identifiants serveur des liens.
// =====================================================================

import type {
  PublisherSettingsPatchInput,
  PublisherSettingsSnapshot,
} from '@qoe/sdk/actions/dashboard';

import type { CreatorProfile } from '../types';

/**
 * Sous-ensemble du profil envoyé au serveur — miroir exact de
 * `profileStringColumns` + `allowIndexing` + `siteOptions` côté Go. Typé à
 * partir du contrat du patch : un champ ajouté d'un seul côté casse la
 * compilation, pas la sauvegarde.
 */
export function pickProfile(
  profile: CreatorProfile
): NonNullable<PublisherSettingsPatchInput['profile']> {
  return {
    name: profile.name,
    heroText: profile.heroText,
    accentColor: profile.accentColor,
    fontFamily: profile.fontFamily,
    themeMode: profile.themeMode,
    layoutStyle: profile.layoutStyle,
    logoUrl: profile.logoUrl,
    headerImageUrl: profile.headerImageUrl,
    footerText: profile.footerText,
    seoTitle: profile.seoTitle,
    seoDescription: profile.seoDescription,
    allowIndexing: profile.allowIndexing,
    supportUrl: profile.supportUrl,
    siteOptions: profile.siteOptions ?? {},
  };
}

/** Le profil local porte-t-il une modification par rapport à l'original ? */
export function profileChanged(current: CreatorProfile, original: CreatorProfile): boolean {
  return JSON.stringify(pickProfile(current)) !== JSON.stringify(pickProfile(original));
}

/**
 * Réinjecte l'état canonique renvoyé par Go. Les champs que la page settings
 * n'édite pas (email, rôles média, articles, catégories) sont conservés tels
 * quels : ils viennent d'une autre lecture et ne sont pas dans la réponse.
 */
export function mergeCanonical(
  current: CreatorProfile,
  server: PublisherSettingsSnapshot
): CreatorProfile {
  return {
    ...current,
    id: server.id,
    name: server.name,
    subdomain: server.subdomain,
    customDomain: server.customDomain,
    heroText: server.heroText,
    accentColor: server.accentColor,
    fontFamily: server.fontFamily,
    themeMode: server.themeMode,
    layoutStyle: server.layoutStyle,
    logoUrl: server.logoUrl,
    headerImageUrl: server.headerImageUrl,
    footerText: server.footerText,
    seoTitle: server.seoTitle,
    seoDescription: server.seoDescription,
    allowIndexing: server.allowIndexing,
    supportUrl: server.supportUrl,
    siteOptions: server.siteOptions ?? {},
    navigation: server.navigation.map((item) => ({
      id: item.id,
      label: item.label,
      url: item.url,
      order: item.order,
      isExternal: item.isExternal,
    })),
    socialLinks: server.socialLinks.map((link) => ({
      id: link.id,
      platform: link.platform,
      url: link.url,
      order: link.order,
    })),
  };
}
