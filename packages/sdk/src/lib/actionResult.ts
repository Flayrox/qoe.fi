// =====================================================================
// 📦 ActionResult — déballage pour les hooks React Query
// =====================================================================
// Une `safeAction` **résout** toujours : un refus (401, 403, 500) n'est pas
// une exception. Un `queryFn` qui renvoie `[]` ou `0` sur `ok: false` affiche
// donc « aucun résultat » là où il faudrait un état d'erreur (et masque une
// session expirée). Ces helpers transforment le refus en exception, ce qui
// alimente `isError` / `error` côté React Query.
// =====================================================================

type ActionResultLike<T> =
  { ok: true; data: T } | { ok: false; error: string | { message?: string; code?: string } };

/** Message affichable d'un refus d'action, sans jamais jeter. */
export function actionErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

/**
 * Rend `data` d'une action réussie, lève une `Error` explicite sinon.
 * Usage : `queryFn: async () => unwrapActionResult(await getXAction(), '…')`.
 */
export function unwrapActionResult<T>(result: ActionResultLike<T>, fallback: string): T {
  if (result.ok) return result.data;
  throw new Error(actionErrorMessage(result.error, fallback));
}
