import type { CanonicalBlockKind, CanonicalDocument } from '../canonical/types';

export type NativeInlineStyle =
  'bold' | 'italic' | 'underline' | 'code' | 'link' | 'bullet' | 'number';

export interface NativeInlineRun {
  /** [startCp, endCp) — offsets en CODE POINTS du texte d'affichage. */
  startCp: number;
  endCp: number;
  style: NativeInlineStyle;
  href?: string;
  /** Liste ordonnée : numéro affiché du marqueur (1-based). */
  number?: number;
}

/** Région de paragraphe d'un bloc texte (styles de bloc au rendu natif). */
export interface NativeParagraph {
  blockIdx: number;
  kind: CanonicalBlockKind;
  /** [startCp, endCp) de l'ITEM (liste : un paragraphe par item). */
  startCp: number;
  endCp: number;
  /** Vrai si item de liste — le rendu applique l'indentation. */
  listItem?: boolean;
  /** Liste ordonnée : index 1-based du marqueur. */
  orderedIndex?: number;
}

/** Bloc non-texte rendu en attachment inline dans le flux texte. */
export interface NativeAttachment {
  blockIdx: number;
  kind: 'img' | 'hr';
  /** Code point du marqueur U+FFFC dans le texte d'affichage. */
  cp: number;
  src?: string;
  alt?: string;
}

/** Marque à peindre (classe sémantique web + éventuel spotlight). */
export interface NativeMark {
  kind: 'private' | 'public' | 'official' | 'spotlight';
  /** [startCp, endCp) — offsets en CODE POINTS du texte d'affichage. */
  startCp: number;
  endCp: number;
}

export interface ArticleTextModel {
  doc: CanonicalDocument;
  /** Texte d'affichage continu (chaîne JS = UTF-16). */
  text: string;
  /**
   * Mapping par CODE POINT du texte d'affichage : offset canonique
   * (code point dans doc.text) du caractère, ou -1 si synthétique.
   */
  canonicalCp: number[];
  paragraphs: NativeParagraph[];
  runs: NativeInlineRun[];
  attachments: NativeAttachment[];
  /** Marques officielles du document (spans du créateur), déjà converties. */
  officialMarks: NativeMark[];
}
