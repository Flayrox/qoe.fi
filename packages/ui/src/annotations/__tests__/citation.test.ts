import { describe, expect, it } from 'vitest';

import { citationFromAnnotation, isCitableAnnotation, type CitableAnnotation } from '../citation';

const publicAnnotation: CitableAnnotation = {
  id: 'hl-1',
  text: 'ce qu’il relirait deux fois',
  note: '  Ici la formule revient comme une conclusion.  ',
  isPublic: true,
  isOfficial: false,
  quoteOrdinal: 1,
  canonicalStart: 420,
  canonicalEnd: 450,
  contentSha: 'sha-1',
  reader: { id: 'reader-2', name: 'Camille', username: 'camille', logoUrl: null },
};

describe('citationFromAnnotation — ce qui peut être publié', () => {
  it('cite la note (nettoyée), le passage, l’auteur et les ancres', () => {
    const citation = citationFromAnnotation(publicAnnotation);

    expect(citation).toEqual({
      id: 'hl-1',
      note: 'Ici la formule revient comme une conclusion.',
      excerpt: 'ce qu’il relirait deux fois',
      quoteOrdinal: 1,
      canonicalStart: 420,
      canonicalEnd: 450,
      contentSha: 'sha-1',
      reader: { id: 'reader-2', name: 'Camille', username: 'camille', logoUrl: null },
    });
  });

  it('refuse un surlignage nu : un trait reste un trait', () => {
    const highlight = { ...publicAnnotation, note: '   ' };

    expect(isCitableAnnotation(highlight)).toBe(false);
    expect(citationFromAnnotation(highlight)).toBeNull();
  });

  it('refuse une annotation privée', () => {
    const privateAnnotation = { ...publicAnnotation, isPublic: false };

    expect(isCitableAnnotation(privateAnnotation)).toBe(false);
    expect(citationFromAnnotation(privateAnnotation)).toBeNull();
  });

  it('accepte une annotation officielle même non publique', () => {
    const official = { ...publicAnnotation, isPublic: false, isOfficial: true };

    expect(citationFromAnnotation(official)?.id).toBe('hl-1');
  });

  it('suit la visibilité VIVANTE du tiroir (bascule pas encore confirmée)', () => {
    const privateAnnotation = { ...publicAnnotation, isPublic: false };

    expect(citationFromAnnotation(privateAnnotation, { isPublic: true })?.id).toBe('hl-1');
    expect(
      citationFromAnnotation({ ...publicAnnotation, isPublic: true }, { isPublic: false })
    ).toBeNull();
  });

  it('garde les ancres absentes comme absentes (pas de 0 inventé)', () => {
    const citation = citationFromAnnotation({
      ...publicAnnotation,
      quoteOrdinal: undefined,
      canonicalStart: undefined,
      canonicalEnd: undefined,
      contentSha: undefined,
    });

    expect(citation).not.toBeNull();
    expect(citation).not.toHaveProperty('canonicalStart');
    expect(citation).not.toHaveProperty('canonicalEnd');
    expect(citation).not.toHaveProperty('contentSha');
  });

  it('refuse un objet nul', () => {
    expect(citationFromAnnotation(null)).toBeNull();
    expect(isCitableAnnotation(undefined)).toBe(false);
  });
});
