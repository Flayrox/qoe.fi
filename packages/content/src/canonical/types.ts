// =====================================================================
// 📄 canonical/types.ts — Types du document canonique d'article
// =====================================================================
// Contrat standardisé pour le document canonique produit par le serveur
// (GET /v1/articles/{id}/document) et consommé par le Web et le Mobile.
// Les offsets sont des CODE POINTS Unicode dans `document.text`.
// =====================================================================

export type CanonicalBlockKind =
  'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote' | 'list' | 'img' | 'hr' | 'code';

export interface CanonicalInlineSpan {
  start: number;
  end: number;
  style: 'bold' | 'italic' | 'underline' | 'code' | 'link' | string;
  href?: string;
}

/** Marque officielle du créateur / annotation intégrée au document. */
export interface CanonicalSpan {
  start: number;
  end: number;
  note?: string;
}

export interface CanonicalListItem {
  text: string;
  inline?: CanonicalInlineSpan[];
}

export interface CanonicalBlock {
  kind: CanonicalBlockKind;
  text?: string;
  items?: CanonicalListItem[];
  ordered?: boolean;
  src?: string;
  alt?: string;
  spans?: CanonicalSpan[];
  inline?: CanonicalInlineSpan[];
}

/** Segment mesurable : un bloc texte ou un item de liste. */
export interface CanonicalSegment {
  blockIdx: number;
  itemIdx: number;
  text: string;
  start: number;
  end: number;
}

export interface CanonicalDocument {
  blocks: CanonicalBlock[];
  segments: CanonicalSegment[];
  text: string;
  sha: string;
}
