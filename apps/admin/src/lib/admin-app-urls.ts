// =====================================================================
// 🔗 admin-app-urls — les sorties de la console vers les autres apps
// =====================================================================
// Le layout de la console avait ses propres URL : `lvh.me:3010` (hôte et port
// qui n'existent pas), `localhost:3010` (le lecteur écoute sur 15402),
// `https://qoe.fi` en dur. Résultat : la connexion renvoyait hors du domaine
// qui sert la console, et la sortie « sans accès » changeait de domaine.
//
// Toute origine passe donc par le Domain Hub (`@qoe/config`), comme les autres
// applications : même environnement en dev, domaine officiel en production, et
// jamais un hôte construit à la main.
// =====================================================================

import { getMonorepoUrl } from '@qoe/config';

/** Écran de connexion du lecteur, avec retour vers la console de cet hôte. */
export function adminLoginUrl(host: string): string {
  const feed = getMonorepoUrl('feed', host);
  const target = `${getMonorepoUrl('admin', host)}/admin`;
  return `${feed}/login?redirect=${encodeURIComponent(target)}`;
}

/** Accueil du lecteur, pour une session sans accès à la console. */
export function adminHomeUrl(host: string): string {
  return `${getMonorepoUrl('feed', host)}/home`;
}
