// =====================================================================
// 🔑 Identifiant d'un lien de navigation créé côté client
// =====================================================================
// 📖 `navOrder` et `navigation` sont indexés par le même identifiant : deux
//    liens ajoutés dans la même milliseconde ne doivent pas le partager.
//
// ⚠️ `Date.now()` seul ne garantit rien : deux clics (ou un double-clic)
//    tombent dans le même tick d'horloge, les deux liens reçoivent la même clé
//    et `navOrder` pointe deux fois vers la même entrée — le second lien est
//    alors insupprimable et son ordre est celui du premier. On combine
//    l'horloge, un compteur de session et, quand il existe, un identifiant
//    aléatoire du navigateur : l'unicité ne dépend plus de la vitesse de
//    frappe.
// =====================================================================

export const CLIENT_LINK_ID_PREFIX = 'link_';

let sequence = 0;

/** Identifiant stable et unique pour un lien de navigation non enregistré. */
export function clientNavigationLinkId(): string {
  sequence += 1;

  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `${CLIENT_LINK_ID_PREFIX}${Date.now().toString(36)}_${sequence.toString(36)}_${random}`;
}
