// =====================================================================
// 🧭 Éligibilité par surface (lot L43) — types et helpers purs
// =====================================================================
// Le serveur Go décide (`eligibility.Decide`/`Rank`) et renvoie, pour chaque
// contenu retenu ou exclu, une raison machine (`reason`), une raison lisible
// (`why`) et un score transparent. Ce module ne rejoue PAS les règles métier :
// il valide une surface demandée, filtre les décisions déjà tranchées et
// garantit un ordre stable quand plusieurs pages sont fusionnées côté client.
//
// Une surface inconnue est refusée (null) plutôt que rabattue sur un défaut :
// un écran de debug qui interrogerait « home » ne doit pas afficher les
// décisions de « following » sans le dire.
// =====================================================================

/** Surfaces réellement servies par l'API (noms identiques côté Go). */
export const ELIGIBILITY_SURFACES = [
  'following',
  'discover',
  'recommended',
  'thread',
  'profile',
  'replies',
] as const;

export type EligibilitySurface = (typeof ELIGIBILITY_SURFACES)[number];

/** Raisons machine d'une décision d'éligibilité. */
export type EligibilityReason =
  | 'eligible'
  | 'deleted'
  | 'draft'
  | 'moderated'
  | 'hidden_by_author'
  | 'suspended'
  | 'restricted'
  | 'blocked'
  | 'muted'
  | 'muted_word'
  | 'private_profile'
  | 'not_following'
  | 'out_of_surface'
  | 'too_old'
  | 'low_score';

/** Pondération transparente du ranking, telle que lue dans SystemConfig. */
export interface EligibilityWeights {
  fresh: number;
  engagement: number;
  affinity: number;
  minScore: number;
  maxAgeDays: number;
}

/** Décision pour un contenu sur une surface. */
export interface EligibilityDecision {
  surface: EligibilitySurface;
  postId: string;
  eligible: boolean;
  reason: EligibilityReason;
  /** Raison lisible, prête à afficher (état vide, debug, admin). */
  why: string;
  score: number;
}

/** Réponse de GET /v1/feed/eligibility : retenus classés + exclus motivés. */
export interface SurfaceEligibilityResult {
  surface: EligibilitySurface;
  weights: EligibilityWeights;
  items: EligibilityDecision[];
  excluded: EligibilityDecision[];
}

/** Valide une surface demandée par un écran (casse et espaces tolérés). */
export function parseEligibilitySurface(raw: string): EligibilitySurface | null {
  const normalized = raw.trim().toLowerCase();
  return (ELIGIBILITY_SURFACES as readonly string[]).includes(normalized)
    ? (normalized as EligibilitySurface)
    : null;
}

/**
 * Réordonne des décisions **déjà notées par le serveur** : score décroissant,
 * puis `postId` décroissant. Le second critère tranche les égalités de façon
 * déterministe, donc fusionner deux pages ne duplique ni ne perd de contenu.
 * Aucune règle d'éligibilité n'est recalculée ici.
 */
export function sortEligibilityDecisions(decisions: EligibilityDecision[]): EligibilityDecision[] {
  return [...decisions].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.postId < b.postId ? 1 : a.postId > b.postId ? -1 : 0;
  });
}

/** Ne garde que les contenus effectivement éligibles. */
export function filterEligibleDecisions(decisions: EligibilityDecision[]): EligibilityDecision[] {
  return decisions.filter((d) => d.eligible);
}
