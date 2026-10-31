// =====================================================================
// ✍️ surlignage ≠ annotation — la nature se dérive de la note
// =====================================================================
// 📖 Une annotation, c'est un surlignage auquel on a AJOUTÉ un texte.
//    Ce fichier verrouille les deux sens de la bascule : sans note, on a
//    un trait (pas de discussion, pas de formulaire vide) ; avec une note,
//    on a une annotation. Une note blanche ne suffit pas.
// =====================================================================

import { describe, expect, it } from 'vitest';

import { annotationKind, isAnnotation } from '../annotation-kind';

describe('annotationKind', () => {
  it('un surlignage sans note reste un surlignage', () => {
    expect(annotationKind({ note: null })).toBe('highlight');
    expect(isAnnotation({ note: null })).toBe(false);
  });

  it('une note, même courte, en fait une annotation', () => {
    expect(annotationKind({ note: 'à relire' })).toBe('annotation');
    expect(isAnnotation({ note: 'à relire' })).toBe(true);
  });

  it('une note faite d’espaces ne promeut rien', () => {
    expect(annotationKind({ note: '   \n\t ' })).toBe('highlight');
  });

  it('accepte un objet absent sans lever', () => {
    expect(annotationKind(null)).toBe('highlight');
    expect(annotationKind(undefined)).toBe('highlight');
  });
});
