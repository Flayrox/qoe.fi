// =====================================================================
// 🧩 highlight-queue-core.ts — Cœur PUR de la file de surlignages locaux
// =====================================================================
// Aucune dépendance React Native ici : testable en isolation (vitest).
// Contient :
//   - la shape d'une création en attente (`PendingHighlightCreate`) ;
//   - `computeLocalAnchors` : port TS de `canon.Document.Find` (Go) —
//     localise l'occurrence n° quoteOrdinal du passage dans le texte
//     canonique du document déjà chargé (mêmes offsets en code points
//     que le serveur) ;
//   - `toLocalHighlight` : transforme une création en attente en objet
//     `Highlight` complet pour le rendu optimiste (mark inline + liste).
//
// ⚠️ Les ancres calculées ici sont un OPTIMISTE : le serveur les
//    recalcule de façon autoritaire à la synchro (et retombe sur des
//    variantes tolérantes si le contenu a été remanié). Côté client on
//    garde la correspondance exacte — le document canonique et le
//    passage sélectionné viennent de la même source, donc ça matche.
// =====================================================================

import type { CanonicalDocument, Highlight } from '@qoe/sdk/mobile';
import { computeLocalAnchors, makeLocalId, normalizeCanonical } from '@qoe/content';

/** Création de surlignage en attente de synchro (persistée localement). */
export interface PendingHighlightCreate {
  /** ID local (préfixe `local-`) — remplacé par l'ID serveur à la synchro. */
  localId: string;
  articleId: string;
  /** Texte BRUT du passage (blancs originaux préservés). */
  text: string;
  note: string | null;
  isPublic: boolean;
  /** Occurrence (0-based) du passage dans l'article — `quoteOrdinal` API. */
  quoteOrdinal: number;
  createdAt: string;
}

/** Un surlignage optimiste rendu à partir d'une création en attente. */
export type LocalHighlight = Highlight & { localId: string; pending: true };

export { computeLocalAnchors, makeLocalId, normalizeCanonical };

/**
 * Convertit une création en attente en `Highlight` optimiste prêt à être
 * rendu (mark inline natif/HTML + liste). Les ancres canoniques sont
 * calculées localement si le document canonique est disponible (rendu
 * natif iOS/Android) — sinon le moteur HTML retombe sur text+quoteOrdinal.
 */
export function toLocalHighlight(
  pending: PendingHighlightCreate,
  myId: string | undefined,
  doc?: (Pick<CanonicalDocument, 'text'> & { sha?: string }) | null
): LocalHighlight {
  const anchors = doc ? computeLocalAnchors(doc, pending.text, pending.quoteOrdinal) : null;
  const readerId = myId ?? '';
  return {
    id: pending.localId,
    localId: pending.localId,
    pending: true,
    text: pending.text,
    note: pending.note,
    isPublic: pending.isPublic,
    isOfficial: false,
    upvotesCount: 0,
    readerId,
    articleId: pending.articleId,
    createdAt: pending.createdAt,
    reader: { id: readerId, name: null, username: null, logoUrl: null },
    viewerUpvoted: false,
    commentsCount: 0,
    quoteOrdinal: pending.quoteOrdinal,
    canonicalStart: anchors?.start,
    canonicalEnd: anchors?.end,
    contentSha: anchors && doc?.sha ? doc.sha : undefined,
  };
}
