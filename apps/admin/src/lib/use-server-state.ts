'use client';

// =====================================================================
// 🔄 useServerState — l'état local suit la vérité serveur
// =====================================================================
// 📖 Les écrans qui rechargent la page après une mutation (R164) le faisaient
//    parce que `useState(initialItems)` ne se réinitialise jamais : après un
//    `revalidatePath` + `router.refresh()`, le serveur renvoie des props
//    neuves… que l'état local ignorait. D'où `window.location.reload()` : une
//    page entière rechargée, filtres, recherche et position perdus.
//
// 🎯 Ici, l'état local reste modifiable (optimisme, retour arrière) mais se
//    **réaligne** dès que la charge serveur change réellement. La comparaison
//    porte sur la valeur serveur (JSON), jamais sur l'état local : pas de
//    boucle, et une saisie non enregistrée n'est pas écrasée par un rendu
//    identique.
// =====================================================================

import { useState, type Dispatch, type SetStateAction } from 'react';

export function useServerState<T>(serverValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(serverValue);
  const [seen, setSeen] = useState(() => JSON.stringify(serverValue));

  const signature = JSON.stringify(serverValue);
  if (signature !== seen) {
    // Ajustement pendant le rendu : React documente ce motif pour un état qui
    // dérive d'une prop, sans frame intermédiaire ni effet.
    setSeen(signature);
    setValue(serverValue);
  }

  return [value, setValue];
}
