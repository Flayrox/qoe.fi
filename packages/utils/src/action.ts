/**
 * ⚡ Protocole Universal Server Action Result (Silicon Valley Standard)
 */
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

/**
 * ⚡ Retourne une réponse Server Action réussie avec les données d'action.
 */
export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

/**
 * ❌ Retourne un échec Server Action structuré avec message et code d'erreur.
 */
export function actionErr<T = never>(
  message: string,
  code: string = "ACTION_ERROR"
): ActionResult<T> {
  return { ok: false, error: { code, message } }
}
