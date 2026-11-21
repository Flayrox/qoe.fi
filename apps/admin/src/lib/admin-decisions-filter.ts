// =====================================================================
// 🚦 Filtre des décisions d'autorisation, lu depuis l'URL
// =====================================================================

/**
 * « Refus uniquement ? » — lu depuis l'URL.
 *
 * Une case à cocher ne s'envoie que COCHÉE : c'est donc l'état « tout afficher »
 * qu'il faut transporter (`denied=all`), et non l'état par défaut. Écrit dans
 * l'autre sens (`denied=1` pour « refus seuls »), le filtre ne pouvait jamais se
 * relâcher — l'écran de préparation au mode refus ne montrait aucun accord.
 *
 * Un lien partagé sans paramètre garde le défaut historique : refus seuls.
 * `denied=0` reste compris pour les liens déjà partagés avec l'ancienne case.
 */
export function parseOnlyDenied(raw: string | string[] | undefined): boolean {
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return !(values.includes('all') || values.includes('0'));
}
