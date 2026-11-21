import { describe, expect, it } from 'vitest';
import { repliesMoreLabel } from './replies-more-label';

/** Traducteur de test : renvoie toujours le repli français. */
const translate = (_key: string, fallback: string) => fallback;

describe('repliesMoreLabel', () => {
  it('accorde au singulier quand une seule réponse est repliée', () => {
    expect(repliesMoreLabel(1, translate)).toBe('Afficher une autre réponse');
  });

  it('accorde au pluriel au-delà d’une réponse', () => {
    expect(repliesMoreLabel(2, translate)).toBe('Afficher 2 autres réponses');
    expect(repliesMoreLabel(7, translate)).toBe('Afficher 7 autres réponses');
  });

  it('ne produit jamais la forme fautive « 1 autres réponses »', () => {
    expect(repliesMoreLabel(1, translate)).not.toContain('autres réponses');
  });
});
