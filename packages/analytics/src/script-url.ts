// =====================================================================
// 📊 Résolution de l'URL du script Umami — une seule règle, testée
// =====================================================================
// Pourquoi ce module existe : `AnalyticsScript` lisait directement
// `process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL`, donc n'importe quelle URL absolue
// présente dans un `.env` local était injectée telle quelle dans la page. Un
// poste dont le `.env` pointait l'analytics de l'infra partagée
// (`http://116.203.158.47:15411`) faisait donc émettre aux pages tenant des
// requêtes vers la production pendant les e2e — mesuré, puis contourné en
// buildant avec la variable vide. Ici la règle est explicite et unique :
//
//   • chemin first-party (`/_q/m.js`) → toujours accepté ;
//   • URL absolue vers la boucle locale (`http://localhost:15411/script.js`) →
//     acceptée même sur un build local (c'est le conteneur de dev) ;
//   • URL absolue distante sur un build **configuré pour une origine locale**
//     (`NEXT_PUBLIC_APP_URL` = localhost / *.localhost / *.lvh.me / *.qoe.test)
//     → ignorée, repli first-party : un environnement local ne peut pas
//     alimenter l'analytics de la production ;
//   • URL absolue distante sur un build de production → honorée.
//
// La décision est prise à partir de variables **inlinées au build**
// (`NEXT_PUBLIC_*`), identiques côté SSR et côté client : aucun écart
// d'hydratation possible, contrairement à une détection via `window`.
// =====================================================================

/** Chemin servi par le proxy first-party (Caddy / Next) : aucune requête tierce. */
export const FIRST_PARTY_ANALYTICS_PATH = '/_q/m.js';

/** Hôtes considérés comme « poste local » (dev, test, e2e). */
export function isLocalHostname(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const host = hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    return true;
  }
  return (
    host.endsWith('.localhost') ||
    host === 'lvh.me' ||
    host.endsWith('.lvh.me') ||
    host === 'qoe.test' ||
    host.endsWith('.qoe.test')
  );
}

/** Extrait l'hôte d'une URL absolue, `null` si la valeur n'en est pas une. */
export function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/**
 * Résout l'URL du script à charger.
 *
 * @param rawUrl    valeur brute de `NEXT_PUBLIC_UMAMI_SCRIPT_URL` (inlinée au build)
 * @param appUrl    valeur de `NEXT_PUBLIC_APP_URL` de la même build
 */
export function resolveAnalyticsScriptUrl(
  rawUrl: string | undefined | null,
  appUrl?: string | null
): string {
  const value = (rawUrl ?? '').trim();

  // Chemin same-origin explicite (`/_q/m.js`). `//hôte` est refusé : ce serait
  // un script tiers déguisé, et le proxy first-party reste le repli.
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (!value) return FIRST_PARTY_ANALYTICS_PATH;

  const remoteHost = hostnameOf(value);
  if (!remoteHost) return FIRST_PARTY_ANALYTICS_PATH; // valeur non-URL : repli sûr

  // Un conteneur d'analytics local reste joignable depuis un build local.
  if (isLocalHostname(remoteHost)) return value;

  // Build configuré pour une origine locale : jamais d'analytics distante.
  if (isLocalHostname(hostnameOf(appUrl))) return FIRST_PARTY_ANALYTICS_PATH;

  return value;
}
