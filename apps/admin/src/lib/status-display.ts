// =====================================================================
// 🏷️ Statuts affichés — un statut inconnu n'est jamais « En attente »
// =====================================================================
// 📖 Les deux surfaces de demande d'accès (applications OAuth, accès API)
//    reçoivent leur statut du Go sous forme de chaîne libre.
//
// ⚠️ Le jeu de valeurs est fermé côté backend, mais **rien dans l'écran ne le
//    vérifie** : `STATUS_META[c.status] ?? STATUS_META.PENDING` affichait « En
//    attente » pour toute valeur non prévue (une demande refusée par une
//    nouvelle règle Go se lisait comme une demande à traiter), et le badge de
//    l'accès API n'avait aucun repli du tout — la cellule restait vide tout en
//    proposant « Activer l'accès ». On résout donc explicitement : une valeur
//    connue donne son statut, tout le reste donne `UNKNOWN`, que les écrans
//    affichent tel quel et n'accompagnent d'aucune action.
// =====================================================================

export const OAUTH_APP_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'] as const;
export type OAuthAppStatus = (typeof OAUTH_APP_STATUSES)[number];

export const API_ACCESS_STATUSES = ['none', 'pending', 'approved', 'rejected', 'revoked'] as const;
export type ApiAccessStatus = (typeof API_ACCESS_STATUSES)[number];

/** Statut connu, ou `UNKNOWN` quand la valeur n'appartient pas au jeu fermé. */
export type ResolvedStatus<T extends string> = T | 'UNKNOWN';

function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

export function resolveOAuthAppStatus(
  status: string | null | undefined
): ResolvedStatus<OAuthAppStatus> {
  const value = (status ?? '').trim();
  return isOneOf(OAUTH_APP_STATUSES, value) ? value : 'UNKNOWN';
}

export function resolveApiAccessStatus(
  status: string | null | undefined
): ResolvedStatus<ApiAccessStatus> {
  const value = (status ?? '').trim();
  return isOneOf(API_ACCESS_STATUSES, value) ? value : 'UNKNOWN';
}

/**
 * Actions offertes pour une application OAuth : approuver une demande en
 * attente (ou une ancienne décision), rejeter une demande, révoquer un accès
 * actif. Un statut inconnu n'offre **rien** : on ne décide pas sur une valeur
 * qu'on ne comprend pas.
 */
export function oauthAppActions(
  status: ResolvedStatus<OAuthAppStatus>
): ReadonlyArray<'APPROVED' | 'REJECTED' | 'REVOKED'> {
  switch (status) {
    case 'PENDING':
      return ['APPROVED', 'REJECTED'];
    case 'REJECTED':
    case 'REVOKED':
      return ['APPROVED'];
    case 'APPROVED':
      return ['REVOKED'];
    default:
      return [];
  }
}

/**
 * Actions offertes pour une demande d'accès API. Même règle : `UNKNOWN` ne
 * propose ni approbation ni révocation.
 */
export function apiAccessActions(
  status: ResolvedStatus<ApiAccessStatus>
): ReadonlyArray<'approve' | 'reject' | 'revoke'> {
  switch (status) {
    case 'pending':
      return ['approve', 'reject'];
    case 'approved':
      return ['revoke'];
    case 'none':
    case 'rejected':
    case 'revoked':
      return ['approve'];
    default:
      return [];
  }
}
