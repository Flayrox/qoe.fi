// =====================================================================
// 🛡️ server-action-origin — refus des server actions inter-origines
// =====================================================================
// Next.js vérifie déjà l'origine des server actions, mais une seule couche ne
// suffit pas pour les actions de la console (révocation de sessions, octroi de
// capacités, publication juridique) : on ajoute un refus explicite dans le
// middleware, avant toute lecture de session ou de base.
//
// Le contrôle est volontairement strict et minimal :
//   - seules les requêtes POST portant l'en-tête `next-action` sont concernées ;
//   - une `Origin` présente doit désigner le même hôte que `Host` (ou
//     `X-Forwarded-Host` derrière un proxy) ;
//   - sans `Origin`, un `Sec-Fetch-Site: cross-site` suffit à refuser ;
//   - une `Origin` illisible est refusée (pas d'analyse « au mieux »).
//
// Le middleware est le seul endroit où cette règle vit : la dupliquer dans
// chaque action garantirait qu'un fichier oublié ouvre la porte.
// =====================================================================

/** En-tête qui identifie une requête de server action Next.js. */
export const SERVER_ACTION_HEADER = 'next-action';

export interface ServerActionOriginInput {
  method: string;
  headers: Headers;
}

/**
 * Vrai si la requête est une server action dont l'origine n'est pas celle du
 * site : elle doit être refusée (403) avant d'atteindre l'action.
 */
export function isCrossOriginServerAction(request: ServerActionOriginInput): boolean {
  if (request.method.toUpperCase() !== 'POST') return false;
  if (!request.headers.get(SERVER_ACTION_HEADER)) return false;

  const origin = request.headers.get('origin');
  if (origin) {
    const originHost = hostOf(origin);
    if (!originHost) return true; // origine illisible : on refuse
    const expectedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
    if (!expectedHost) return true; // pas de référence : on refuse
    return normalizeHost(originHost) !== normalizeHost(expectedHost);
  }

  // Pas d'`Origin` : un navigateur moderne en envoie toujours pour une server
  // action. L'absence est tolérée seulement si `Sec-Fetch-Site` ne dit pas
  // explicitement « cross-site ».
  const fetchSite = request.headers.get('sec-fetch-site');
  return fetchSite === 'cross-site' || fetchSite === 'same-site';
}

function hostOf(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.host;
  } catch {
    return null;
  }
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}
