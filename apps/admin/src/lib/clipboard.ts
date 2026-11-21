// =====================================================================
// 📋 clipboard — copier sans jamais laisser filer un rejet
// =====================================================================
// `navigator.clipboard.writeText` renvoie une promesse et peut être refusée
// (permission, page non focus, iframe, navigateur ancien). Un `void` sur cet
// appel transforme le refus en rejet non géré : rien à l'écran, une trace en
// console, et l'opérateur croit avoir copié. Un seul point d'entrée, qui dit
// toujours si la copie a eu lieu.
// =====================================================================

/** Copie `text` ; retourne `false` si le navigateur refuse ou ne sait pas faire. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
