// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  clearAllShadows,
  getActorShadow,
  getArticleShadow,
  getPostShadow,
  updateActorShadow,
  updateArticleShadow,
  updatePostShadow,
  usePostShadow,
} from '../shadow';

// Durcissement du store d'optimisme : une clé vide ne doit jamais créer
// d'entrée fantôme, et le changement de compte doit purger les trois cartes.

describe('shadow store — clés bornées', () => {
  beforeEach(() => clearAllShadows());

  it('ignore un identifiant de pensée vide', () => {
    updatePostShadow('', { liked: true });
    expect(getPostShadow('')).toBeUndefined();
  });

  it('ignore un identifiant d’article vide', () => {
    updateArticleShadow('', { bookmarked: true });
    expect(getArticleShadow('')).toBeUndefined();
  });

  it('normalise un handle d’acteur et ignore une chaîne blanche', () => {
    updateActorShadow('  @Alice ', { muted: true });
    expect(getActorShadow('alice')?.muted).toBe(true);
    updateActorShadow('   ', { muted: true });
    expect(getActorShadow('   ')).toBeUndefined();
  });
});

describe('clearAllShadows — changement de compte', () => {
  beforeEach(() => clearAllShadows());

  it('vide les trois stores', () => {
    updatePostShadow('p1', { liked: true });
    updateArticleShadow('a1', { bookmarked: true });
    updateActorShadow('u1', { blocked: true });

    clearAllShadows();

    expect(getPostShadow('p1')).toBeUndefined();
    expect(getArticleShadow('a1')).toBeUndefined();
    expect(getActorShadow('u1')).toBeUndefined();
  });

  it('réveille les composants montés pour qu’ils relisent l’état serveur', () => {
    const post = { id: 'p1', liked: false, likesCount: 2 };
    const { result } = renderHook(() => usePostShadow(post));

    act(() => updatePostShadow('p1', { liked: true }));
    expect(result.current.liked).toBe(true);

    // Purge (déconnexion) : le composant revient à la vérité serveur.
    act(() => clearAllShadows());
    expect(result.current.liked).toBe(false);
    expect(result.current.likesCount).toBe(2);
  });
});
