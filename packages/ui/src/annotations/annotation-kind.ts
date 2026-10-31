// =====================================================================
// ✍️ annotation-kind — un surlignage n'est pas une annotation
// =====================================================================
// 📖 Deux gestes, deux objets :
//    - SURLIGNER pose un trait sur un passage. C'est un repère de lecture,
//      il n'a rien à dire : pas de discussion, pas de « note » vide qui
//      s'affiche comme un formulaire inachevé.
//    - ANNOTER ajoute un texte à ce trait. Le même objet devient alors une
//      annotation, avec sa note, sa discussion et son vote.
//
// 🎯 La nature n'est PAS un champ stocké : elle se dérive de la note. Un
//    booléen `kind` séparé finirait par diverger (`kind: 'annotation'` avec
//    une note vide après un échec d'enregistrement, ou l'inverse après une
//    promotion), et l'interface mentirait sur l'un des deux.
//
// ✅ Conséquence : ajouter une note plus tard promeut le surlignage, la
//    retirer le ramène à un simple trait. Aucune migration de données.
// =====================================================================

import type { AnnotationItem, HighlightItem } from './types';

export type AnnotationKind = 'highlight' | 'annotation';

/** Tout ce qui porte (ou non) une note — annotation comme surlignage. */
type Notable =
  Pick<AnnotationItem, 'note'> | Pick<HighlightItem, 'note'> | { note?: string | null };

/**
 * Nature d'un objet annoté, dérivée de sa note.
 *
 * Une note faite uniquement d'espaces ne compte pas : elle ne s'affiche
 * nulle part et ne doit pas transformer un trait en annotation.
 */
export function annotationKind(item: Notable | null | undefined): AnnotationKind {
  const note = item?.note;
  return typeof note === 'string' && note.trim().length > 0 ? 'annotation' : 'highlight';
}

/** Vrai si l'objet porte un texte : c'est une annotation, pas un trait. */
export function isAnnotation(item: Notable | null | undefined): boolean {
  return annotationKind(item) === 'annotation';
}
