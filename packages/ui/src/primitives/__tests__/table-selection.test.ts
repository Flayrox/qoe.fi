import { describe, expect, it } from 'vitest';

import { selectionToKeySet } from '../table/selection';

describe('selectionToKeySet — la sélection react-aria devient des clés réelles', () => {
  it('matérialise « tout sélectionner » avec les lignes affichées', () => {
    const keys = selectionToKeySet('all', ['sub-1', 'sub-2', 'sub-3']);
    expect(keys).toEqual(new Set(['sub-1', 'sub-2', 'sub-3']));
  });

  it("ne découpe pas la chaîne 'all' en lettres (le bug des clés fantômes)", () => {
    const keys = selectionToKeySet('all', ['a', 'b']);
    expect(keys.has('a')).toBe(true);
    expect(keys.size).toBe(2);
    // Avant : new Set('all') donnait {'a', 'l'} — une clé qui n'existe pas.
    expect(keys.has('l')).toBe(false);
  });

  it('copie une sélection partielle sans perdre son type', () => {
    const keys = selectionToKeySet(new Set([1, 'deux']), ['1', '2', 'deux']);
    expect(keys).toEqual(new Set(['1', 'deux']));
  });

  it('renvoie un ensemble vide quand rien n’est sélectionné', () => {
    expect(selectionToKeySet(new Set(), ['x']).size).toBe(0);
  });
});
