import { requireNativeViewManager } from 'expo-modules-core';
import type { HostComponent, ViewProps } from 'react-native';

/** Un run de style en offsets UTF-16 du texte plat (style C1). */
export type ArticleTextViewRun = {
  start: number;
  end: number;
  style?: 'bold' | 'italic' | 'bold-italic' | 'underline' | 'code' | 'link';
};

/** Une marque (fond continu) en offsets UTF-16 + couleur ARGB. */
export type ArticleTextViewMark = {
  start: number;
  end: number;
  color: number;
};

/** Payload natif de onSelectionChange (UTF-16). location=-1 ⇒ désélection. */
export type ArticleTextViewSelection = {
  location: number;
  length: number;
};

export type ArticleTextViewProps = ViewProps & {
  /** Texte plat continu (sortie du modèle C1). */
  text: string;
  /** Runs de style en offsets UTF-16 du texte plat. */
  runs: ArticleTextViewRun[];
  /** Marques continues (highlights / officielles / spotlight) en ARGB. */
  marks: ArticleTextViewMark[];
  /** Couleur du texte (ARGB). */
  textColor?: number;
  /** Taille de police en sp. */
  fontSize?: number;
  /** Hauteur de ligne en sp (0 = défaut système). */
  lineHeight?: number;
  /** Changement de sélection native (offsets UTF-16 du texte affiché). */
  onSelectionChange?: (event: { nativeEvent: ArticleTextViewSelection }) => void;
};

export const ArticleTextView = requireNativeViewManager<ArticleTextViewProps>(
  'ArticleTextView'
) as HostComponent<ArticleTextViewProps>;
