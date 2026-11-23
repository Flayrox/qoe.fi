// =====================================================================
// 📋 clipboard — copier sans jamais laisser filer un rejet
// =====================================================================
// `navigator.clipboard.writeText` renvoie une promesse et peut être refusée
// (permission, page non focus, iframe, navigateur ancien). Un `void` sur cet
// appel transforme le refus en rejet non géré : rien à l'écran, une trace en
// console, et l'opérateur croit avoir copié. Un seul point d'entrée, qui dit
// toujours si la copie a eu lieu.
// =====================================================================

import { toast } from '@qoe/ui/toast';

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

/**
 * Copie **avec retour** : le cas d'usage des menus de ligne (R155).
 *
 * `copyToClipboard` dit seulement si la copie a eu lieu ; les onze écrans qui
 * l'appelaient depuis un menu jetaient ce booléen (`void copyToClipboard(id)`)
 * — l'opérateur ne savait ni si l'identifiant était dans son presse-papiers, ni
 * qu'un navigateur avait refusé. On garde le helper pur (WorkTable et
 * `CopyableId` ont leur propre retour) et on expose une variante qui annonce.
 */
export async function copyWithToast(text: string, label = 'Valeur'): Promise<boolean> {
  const copied = await copyToClipboard(text);
  if (copied) {
    toast.success(`${label} copié`);
  } else {
    toast.error(`Copie impossible — ${label} reste lisible dans la ligne`);
  }
  return copied;
}
