import { requireNativeViewManager } from 'expo-modules-core';
import type { HostComponent, ViewProps } from 'react-native';

/** Un run homogène de peinture (sortie partagée de buildPaintSpans), en
 *  offsets UTF-16 du texte plat. `bg` = couleur ARGB du fond, ou null. */
export type ArticleTextViewSpan = {
  start: number;
  end: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  mono?: boolean;
  link?: boolean;
  href?: string;
  bg?: number | null;
};

/** Layout d'un paragraphe (sortie partagée de buildParagraphLayouts), en
 *  offsets UTF-16. `kind` ∈ h1..h4, p, blockquote, code, list. */
export type ArticleTextViewParagraph = {
  start: number;
  end: number;
  kind: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote' | 'code' | 'list';
  listItem?: boolean;
  orderedIndex?: number;
  markerText?: string;
};

/** Payload natif de onSelectionChange (UTF-16). location=-1 ⇒ désélection. */
export type ArticleTextViewSelection = {
  location: number;
  length: number;
};

/** Hauteur de contenu mesurée nativement (dp). */
export type ArticleTextViewContentHeight = {
  height: number;
};

export type ArticleTextViewProps = ViewProps & {
  /** Texte plat continu (sortie du modèle C1). */
  text: string;
  /** Runs homogènes de peinture (attributs + fond ARGB unique par run). */
  spans: ArticleTextViewSpan[];
  /** Layout de bloc par paragraphe (titres/blockquote/code/listes). */
  paragraphs: ArticleTextViewParagraph[];
  /** Couleur du texte (ARGB). */
  textColor?: number;
  /** Taille de police en sp. */
  fontSize?: number;
  /** Hauteur de ligne en sp (0 = défaut système). */
  lineHeight?: number;
  /** Largeur (dp) utilisée par la mesure native de la hauteur du contenu. */
  measureWidth?: number;
  /** Changement de sélection native (offsets UTF-16 du texte affiché). */
  onSelectionChange?: (event: { nativeEvent: ArticleTextViewSelection }) => void;
  /** Hauteur de contenu mesurée par le natif (dp) — alimente le style. */
  onContentHeight?: (event: { nativeEvent: ArticleTextViewContentHeight }) => void;
};

export const ArticleTextView = requireNativeViewManager<ArticleTextViewProps>(
  'ArticleTextView'
) as HostComponent<ArticleTextViewProps>;
