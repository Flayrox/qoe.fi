/**
 * ⚡ Protocole Universal Server Action Result (Silicon Valley Standard)
 */
export type ActionResult<T = unknown> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/**
 * ⚡ Retourne une réponse Server Action réussie avec les données d'action.
 */
export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

/**
 * ❌ Retourne un échec Server Action structuré avec message et code d'erreur.
 */
export function actionErr<T = never>(
  message: string,
  code: string = 'ACTION_ERROR'
): ActionResult<T> {
  return { ok: false, error: { code, message } };
}

/**
 * 📦 Extrait les données d'un ActionResult ou lève une erreur explicite.
 */
export function unwrapAction<T>(result: ActionResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data;
}

/**
 * 🛰️ Signature d'une Server Action périmée après un déploiement.
 *
 * Quand le JS en cache appelle une Server Action d'un build précédent, Next
 * répond « Failed to find Server Action … » : il faut proposer un rechargement
 * au lieu de laisser l'action échouer silencieusement.
 */
export const STALE_SERVER_ACTION_MESSAGE = 'Failed to find Server Action';

function staleCauseChain(value: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current = value;
  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    if (typeof current === 'object' && 'cause' in current) {
      current = (current as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return chain;
}

/**
 * 🛰️ Détecte une Server Action périmée, y compris quand Next l'enveloppe dans
 * une erreur parente (`cause`).
 */
export function isStaleServerActionError(error: unknown): boolean {
  return staleCauseChain(error).some((item) => {
    if (typeof item === 'string') {
      return item.includes(STALE_SERVER_ACTION_MESSAGE);
    }
    if (typeof item === 'object' && item !== null && 'message' in item) {
      const message = (item as { message?: unknown }).message;
      return typeof message === 'string' && message.includes(STALE_SERVER_ACTION_MESSAGE);
    }
    return false;
  });
}
