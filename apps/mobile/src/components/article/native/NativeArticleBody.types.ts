import type { CanonicalDocument } from '@qoe/sdk/mobile';
import type { MarkHighlightInput } from './marks';
import type { SelectionInfo } from '../html-blocks-core';

export interface NativeArticleBodyProps {
  /** Document canonique (source de vérité unique du texte et des ancres). */
  document: CanonicalDocument;
  /** Surlignages de l'article (publics, privés, officiels). */
  highlights?: (MarkHighlightInput | null | undefined)[];
  /** Sélection courante affichée. */
  selection?: SelectionInfo | null;
  /** Callback lors d'une sélection de texte (ou dé-sélection si null). */
  onSelect: (info: SelectionInfo | null) => void;
  /** Verrouillage du scroll parent (si nécessaire). */
  onScrollLock?: (locked: boolean) => void;
  /** 🔦 Passage à mettre en avant (deep-link citation → article). */
  spotlight?: { start: number; end: number; sha: string } | null;
  /** Notification quand la position du spotlight a été mesurée (pour scrollTo). */
  onSpotlightMeasured?: (tokenWindowY: number) => void;
}
