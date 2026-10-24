import { describe, expect, it } from 'vitest';
import { normalizeLinkUrl } from '../link';

describe('normalizeLinkUrl', () => {
  it('accepte les URLs absolues HTTP(S) et les normalise', () => {
    expect(normalizeLinkUrl('https://qoe.fi/article')).toBe('https://qoe.fi/article');
    expect(normalizeLinkUrl('  http://example.com  ')).toBe('http://example.com/');
  });

  it('ajoute HTTPS à un domaine saisi sans schéma', () => {
    expect(normalizeLinkUrl('example.com/source')).toBe('https://example.com/source');
    expect(normalizeLinkUrl('www.lemonde.fr')).toBe('https://www.lemonde.fr/');
  });

  it('transforme une adresse e-mail en mailto', () => {
    expect(normalizeLinkUrl('auteur@exemple.fr')).toBe('mailto:auteur@exemple.fr');
    expect(normalizeLinkUrl('mailto:auteur@exemple.fr')).toBe('mailto:auteur@exemple.fr');
  });

  it('conserve les liens internes', () => {
    expect(normalizeLinkUrl('/rubrique/article')).toBe('/rubrique/article');
    expect(normalizeLinkUrl('#section-2')).toBe('#section-2');
  });

  it('refuse les schémas dangereux et les saisies inexploitables', () => {
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(normalizeLinkUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(normalizeLinkUrl('pas un lien')).toBeNull();
    expect(normalizeLinkUrl('   ')).toBeNull();
  });
});
