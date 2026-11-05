// =====================================================================
// ✅ table/selection — une sélection qui reste une sélection
// =====================================================================
// 📖 react-aria ne renvoie pas toujours un Set : quand l'utilisateur coche
//    « tout sélectionner », `onSelectionChange` reçoit la CHAÎNE `'all'`.
//    `new Set(keys)` la découpe alors en lettres — `{'a','l'}` — donc deux
//    clés fantômes, aucune ligne réellement cochée, et une barre d'actions
//    qui annonce « 2 sélectionnés » sur une table vide de sélection.
//
// 🎯 L'écran sait quelles clés il affiche : la matérialisation de `'all'`
//    lui revient. Ce module le fait une fois, pour tous les appelants.
// =====================================================================

import type { Key } from 'react-aria-components';

/** Ce que react-aria passe à `onSelectionChange`. */
export type SelectionLike = 'all' | Iterable<Key>;

/**
 * Convertit une sélection react-aria en clés concrètes (`Set<string>`).
 *
 * @param selection la valeur reçue de react-aria (`'all'` ou un Set)
 * @param allKeys   les clés actuellement affichées (l'ordre du tableau)
 */
export function selectionToKeySet(selection: SelectionLike, allKeys: Iterable<Key>): Set<string> {
  const source = selection === 'all' ? allKeys : selection;
  return new Set(Array.from(source, String));
}
