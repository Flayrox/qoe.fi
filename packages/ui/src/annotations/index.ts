// =====================================================================
// 📦 @qoe/ui/annotations — Package Entry Point
// =====================================================================

export * from './types';
export { TextHighlighter } from './TextHighlighter';
export { AnnotationSideDrawer } from './AnnotationSideDrawer';
export { TextSelectionPopover } from './TextSelectionPopover';
export { findQuoteOccurrence, type QuoteMatch } from './quote-anchor';
export {
  markSkin,
  markSkinFor,
  markKindFor,
  MARK_ACCENT_TOKENS,
  MARK_KINDS,
  MARK_STYLE_CLASSES,
  type MarkIdentity,
  type MarkKind,
} from './mark-skin';
export { appendAnnotation, dedupeAnnotations } from './annotation-list';
export { annotationKind, isAnnotation, type AnnotationKind } from './annotation-kind';
export {
  citationFromAnnotation,
  isCitableAnnotation,
  type AnnotationCitation,
  type AnnotationCitationReader,
  type CitableAnnotation,
} from './citation';
export { CanonicalArticleBody } from './CanonicalArticleBody';
export { AnnotationFilterPill } from './AnnotationFilterPill';
export * from './canonical-document';
export * from './callbacks';
