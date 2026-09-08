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

/** Génère un ID local unique (préfixe `local-` pour ne pas collisionner). */
export function makeLocalId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalise un texte comme le serveur (`canon.Normalize`) : les runs de
 * blancs (espaces, tabulations, sauts de ligne, NBSP…) deviennent un
 * espace simple, bordures trimées.
 */
export function normalizeCanonical(s: string): string {
  let out = '';
  let prevSpace = true; // → trim des blancs de tête
  for (const ch of s) {
    if (/\s/.test(ch)) {
      if (prevSpace) continue;
      prevSpace = true;
      out += ' ';
    } else {
      prevSpace = false;
      out += ch;
    }
  }
  return out.trim();
}

/**
 * Localise l'occurrence n° `quoteOrdinal` (0-based) de `target` dans le
 * texte canonique `doc.text`. Retourne les offsets [start, end) en CODE
 * POINTS (comme le serveur) — ou null si introuvable.
 *
 * Miroir de `canon.(*Document).Find` (apps/api/internal/canon/canon.go) :
 * même normalisation, même recherche ordinale SANS chevauchement, même
 * repli sur la première occurrence quand l'ordinal dépasse le compte.
 * (On n'implémente pas les variantes tolérantes « contenu remanié » :
 * le serveur les gère à la synchro.)
 */
export function computeLocalAnchors(
  doc: Pick<CanonicalDocument, 'text'>,
  target: string,
  quoteOrdinal: number
): { start: number; end: number } | null {
  const needle = normalizeCanonical(target);
  if (!needle) return null;

  const text = Array.from(doc.text); // code points
  const needleR = Array.from(needle);
  const wanted = Math.max(0, quoteOrdinal);

  let first = -1;
  let seen = 0;
  for (let i = 0; i + needleR.length <= text.length; i++) {
    let match = true;
    for (let j = 0; j < needleR.length; j++) {
      if (text[i + j] !== needleR[j]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    if (first < 0) first = i;
    if (seen === wanted) {
      return { start: i, end: i + needleR.length };
    }
    seen++;
    i += needleR.length - 1; // occurrences non chevauchantes (comme indexOf)
  }

  if (first >= 0) {
    return { start: first, end: first + needleR.length };
  }
  return null;
}

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
