import { describe, it, expect } from 'vitest';
import { filterFaq } from './help-faq';

// Centre d'aide : la recherche trouve dans les deux langues, vide = tout.

describe('filterFaq', () => {
  it('vide = toutes les entrées', () => {
    const all = filterFaq('');
    expect(all.length).toBeGreaterThan(5);
  });

  it('trouve en français', () => {
    const res = filterFaq('désabonner');
    expect(res.length).toBeGreaterThanOrEqual(1);
    expect(res[0].id).toBe('desabonnement');
  });

  it('trouve en anglais sur le même corpus', () => {
    const res = filterFaq('unsubscribe');
    expect(res.length).toBeGreaterThanOrEqual(1);
    expect(res[0].id).toBe('desabonnement');
  });

  it('insensible à la casse et aux espaces', () => {
    expect(filterFaq('  COMPTE PERDU ').length).toBeGreaterThanOrEqual(1);
  });

  it('sans match = vide (le formulaire prend le relais)', () => {
    expect(filterFaq('xyzzy-inexistant')).toEqual([]);
  });
});
