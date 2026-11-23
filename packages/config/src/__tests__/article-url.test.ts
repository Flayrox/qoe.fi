import { describe, expect, it } from 'vitest';
import {
  buildArticlePath,
  buildCategoryPath,
  decodeUrlPath,
  decodeUrlSegment,
  isSameArticlePath,
} from '../article-url';

// Ces cas verrouillent les deux propriétés qui manquaient à l'implémentation
// partagée : le chemin canonique est **encodé** (il part directement dans un
// `href`, une balise `<link rel="canonical">` ou un `permanentRedirect`), et un
// segment déjà décodé par le routeur ne doit **jamais** faire lever.

describe('article-url — canonique encodé', () => {
  it('encode le slug et conserve la hiérarchie de sous-catégorie', () => {
    expect(
      buildArticlePath({ slug: 'café au lait', category: { slug: 'ia', parentSlug: 'tech' } })
    ).toBe('/tech/ia/caf%C3%A9%20au%20lait');
  });

  it('encode chaque segment de catégorie, pas le séparateur', () => {
    expect(buildCategoryPath({ slug: 'café', parentSlug: 'vie privée' })).toBe(
      '/vie%20priv%C3%A9e/caf%C3%A9'
    );
  });

  it('assainit un slug hostile avant de l’encoder', () => {
    expect(buildArticlePath({ slug: '../../etc/passwd', category: { slug: 'tech' } })).toBe(
      '/tech/etcpasswd'
    );
  });
});

describe('decodeUrlSegment — un segment décodé par le routeur', () => {
  it('décode un segment encodé', () => {
    expect(decodeUrlSegment('caf%C3%A9')).toBe('café');
  });

  it('ne lève pas sur un pourcentage isolé', () => {
    // `decodeURIComponent` jette une URIError : 500 au lieu d'une page.
    expect(() => decodeURIComponent('100%-pure')).toThrow();
    expect(decodeUrlSegment('100%-pure')).toBe('100%-pure');
  });

  it('ne décode qu’une fois', () => {
    expect(decodeUrlSegment('a%2520b')).toBe('a%20b');
  });

  it('traite une valeur absente comme vide', () => {
    expect(decodeUrlSegment(undefined)).toBe('');
    expect(decodeUrlSegment(null)).toBe('');
  });
});

describe('isSameArticlePath — comparaison décodée', () => {
  it('reconnaît le canonique accentué', () => {
    expect(isSameArticlePath('/tech/café', '/tech/caf%C3%A9')).toBe(true);
  });

  it('reconnaît le pourcentage littéral', () => {
    expect(isSameArticlePath('/tech/100%-pure', '/tech/100%25-pure')).toBe(true);
  });

  it('refuse une autre catégorie', () => {
    expect(isSameArticlePath('/tech/x', '/sport/x')).toBe(false);
  });

  it('décode un chemin entier segment par segment', () => {
    expect(decodeUrlPath('/vie%20priv%C3%A9e/caf%C3%A9')).toBe('/vie privée/café');
  });
});
