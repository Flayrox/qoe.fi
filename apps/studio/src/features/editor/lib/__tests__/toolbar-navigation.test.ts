import { describe, expect, it } from 'vitest';

import { nextToolbarIndex } from '../toolbar-navigation';

describe('nextToolbarIndex', () => {
  it('avance et recule en bouclant', () => {
    expect(nextToolbarIndex(0, 4, 'ArrowRight')).toBe(1);
    expect(nextToolbarIndex(3, 4, 'ArrowRight')).toBe(0);
    expect(nextToolbarIndex(0, 4, 'ArrowLeft')).toBe(3);
    expect(nextToolbarIndex(1, 4, 'ArrowUp')).toBe(0);
    expect(nextToolbarIndex(0, 4, 'ArrowDown')).toBe(1);
  });

  it('gère Home et End', () => {
    expect(nextToolbarIndex(2, 4, 'Home')).toBe(0);
    expect(nextToolbarIndex(1, 4, 'End')).toBe(3);
  });

  it('ignore les autres touches et une barre vide', () => {
    expect(nextToolbarIndex(1, 4, 'Tab')).toBeNull();
    expect(nextToolbarIndex(1, 0, 'ArrowRight')).toBeNull();
  });

  it('repart du début si l’index courant est hors bornes', () => {
    expect(nextToolbarIndex(-1, 4, 'ArrowRight')).toBe(1);
    expect(nextToolbarIndex(9, 4, 'ArrowLeft')).toBe(3);
  });
});
