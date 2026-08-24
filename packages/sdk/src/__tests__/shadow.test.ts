import { describe, it, expect, beforeEach } from 'vitest';
import { POST_TOMBSTONE, updatePostShadow, getPostShadow } from '../shadow';

describe('post shadow store (état optimiste par pensée)', () => {
  beforeEach(() => {
    // Le store est module-level : on repart d'un état vide à chaque test
    // en supprimant les entrées connues.
    for (const id of ['p1', 'p2']) {
      updatePostShadow(id, { liked: undefined, reposted: undefined, isDeleted: undefined });
    }
  });

  it('POST_TOMBSTONE est un symbol unique (marqueur de suppression)', () => {
    expect(typeof POST_TOMBSTONE).toBe('symbol');
  });

  it('getPostShadow renvoie undefined pour une pensée inconnue', () => {
    expect(getPostShadow('inconnu')).toBeUndefined();
  });

  it('updatePostShadow fusionne les patches sans écraser les champs absents', () => {
    updatePostShadow('p1', { liked: true });
    updatePostShadow('p1', { reposted: true });

    expect(getPostShadow('p1')).toEqual({ liked: true, reposted: true });
  });

  it('updatePostShadow écrase un champ déjà présent', () => {
    updatePostShadow('p2', { liked: true });
    updatePostShadow('p2', { liked: false });

    expect(getPostShadow('p2')?.liked).toBe(false);
  });
});
