// =====================================================================
// 🧩 feed-pill.ts — Noyau PUR de la pill « X nouvelles pensées »
// =====================================================================
// Aucune dépendance React Native ni React : testable en `node` (vitest).
// Contient la déduplication des tranches reçues par le polling et la fusion
// des tranches ADOPTÉES (celles que l'utilisateur a décidé d'afficher en
// tapant la pill) dans la liste rendue.
//
// Pourquoi ce module : en tapant la pill, les pensées en attente doivent
// RESTER visibles en tête de liste. Les déverser dans le cache react-query
// n'est pas possible (le feed paginé est déjà en cache) — on les garde donc
// dans un état local borné, fusionné au rendu.
// =====================================================================

import type { FeedSlice } from '@qoe/sdk/mobile';

/** Nombre maximal de pensées adoptées conservées en mémoire. */
export const MAX_ADOPTED_SLICES = 40;

/** Identité d'une tranche : le post ciblé prime sur l'id de la tranche. */
export function feedSliceId(slice: FeedSlice): string {
  return slice.targetPost?.id || slice.id;
}

/**
 * Tranches réellement NOUVELLES : ni déjà connues (`knownIds` : visibles ou
 * en attente) ni dupliquées dans le lot reçu.
 */
export function pickNewSlices(incoming: FeedSlice[], knownIds: Iterable<string>): FeedSlice[] {
  const seen = new Set(knownIds);
  const fresh: FeedSlice[] = [];
  for (const slice of incoming) {
    const id = feedSliceId(slice);
    if (seen.has(id)) continue;
    seen.add(id);
    fresh.push(slice);
  }
  return fresh;
}

/**
 * Fusionne des tranches adoptées dans la liste déjà adoptée : ordre conservé
 * (les plus récentes d'abord), déduplication par identité, plafond
 * `MAX_ADOPTED_SLICES`.
 */
export function mergeAdoptedSlices(current: FeedSlice[], incoming: FeedSlice[]): FeedSlice[] {
  const seen = new Set<string>();
  const merged: FeedSlice[] = [];
  for (const slice of [...incoming, ...current]) {
    const id = feedSliceId(slice);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(slice);
    if (merged.length >= MAX_ADOPTED_SLICES) break;
  }
  return merged;
}
