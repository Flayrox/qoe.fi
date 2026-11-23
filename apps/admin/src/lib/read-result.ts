// =====================================================================
// 📖 read-result — une lecture serveur réussie, ou déclarée illisible
// =====================================================================
// Défaut mesuré (R161) : chaque lecture de la console retombait sur `[]` en
// cas d'échec. L'écran ne pouvait donc pas distinguer « zéro ligne » de
// « lecture impossible » : une file vide annonçait « aucun dossier » alors que
// l'API Go était en panne, et un refus d'autorisation ressemblait à une base
// vide.
//
// Le contrat est maintenant explicite et impossible à ignorer : une lecture
// rend `Read<T>`, et `ok: false` signifie « je n'ai pas lu », jamais « rien ».
// Le libellé (`what`) nomme l'objet métier — il sert au journal serveur et,
// côté écran, à l'avertissement rédigé par la page elle-même.
//
// Un refus d'autorisation (403) n'est pas une panne : il est relancé pour que
// la page ou la garde de capacité le traite comme tel, au lieu de l'afficher
// comme « illisible ».
// =====================================================================

export type Read<T> = { readonly ok: true; readonly data: T } | { readonly ok: false };

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Exécute une lecture : `ok: true` avec sa donnée, ou `ok: false` si l'API a
 * échoué — le défaut est journalisé avec l'objet métier, jamais avalé.
 */
export async function readOr<T>(what: string, load: () => Promise<T>): Promise<Read<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    if (statusOf(error) === 403) throw error;
    console.error(`[admin] lecture impossible — ${what} :`, error);
    return { ok: false };
  }
}

/** La donnée lue, ou `fallback` quand la lecture a échoué (l'écran le dit). */
export function readData<T>(read: Read<T>, fallback: T): T {
  return read.ok ? read.data : fallback;
}
