// =====================================================================
// 📮 action-result — un échec d'action doit rester EXPLICABLE
// =====================================================================
// Les server-actions de la console attrapent les erreurs de `goFetch` et
// rendent `{ ok:false, error }` ou `{ success:false, error }`. Le message part
// bien à l'écran, mais le CODE du refus d'autorisation était perdu au passage —
// impossible dès lors de distinguer « il manque une preuve forte récente »
// (step-up) d'une erreur métier, et donc de proposer le parcours qui débloque.
//
// `authzTrailers` récupère ce que `goFetch` attache à l'erreur (`code`, `level`,
// et `action` quand le noyau nomme l'action) et le fait voyager dans le
// résultat d'action, où l'interface le lit (`@/lib/authz-feedback`).
// =====================================================================

/** Enveloppe d'autorisation transportée par un échec d'action. */
export interface AuthzTrailers {
  /** Code du garde (`needs_step_up`, `deny_weak_auth`, `deny_missing_capability`…). */
  code?: string;
  /** Niveau de preuve exigé (N0–N3), quand la route en déclare un. */
  level?: string;
  /** Action du noyau visée, quand elle est nommée. */
  action?: string;
}

/**
 * Extrait les enveloppes d'autorisation d'une erreur remontée par `goFetch`.
 * Rend un objet vide si l'erreur n'en porte pas : un échec métier reste un
 * échec métier, sans faux code d'autorisation.
 */
export function authzTrailers(err: unknown): AuthzTrailers {
  if (!err || typeof err !== 'object') return {};
  const value = err as { code?: unknown; level?: unknown; action?: unknown };
  const out: AuthzTrailers = {};
  if (typeof value.code === 'string' && value.code) out.code = value.code;
  if (typeof value.level === 'string' && value.level) out.level = value.level;
  if (typeof value.action === 'string' && value.action) out.action = value.action;
  return out;
}
