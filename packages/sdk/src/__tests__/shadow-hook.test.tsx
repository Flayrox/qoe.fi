// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';

// Le hook renvoie T fusionné avec le shadow : les champs dérivés sont
// ajoutés au runtime sans figurer dans le type d'entrée.
type Derived = {
  likesCount?: number;
  likeCount?: number;
  repostsCount?: number;
  repostCount?: number;
  isDeleted?: boolean;
  isPinned?: boolean;
};
import {
  POST_TOMBSTONE,
  updatePostShadow,
  getPostShadow,
  usePostShadow,
  updateArticleShadow,
  getArticleShadow,
  useArticleShadow,
  updateActorShadow,
  getActorShadow,
  useActorShadow,
  withShadowMutation,
} from '../shadow';

// mergeShadow est privé : on le couvre via usePostShadow, qui fusionne
// l'état serveur du post avec le shadow optimiste à chaque rendu.

describe('usePostShadow — fusion état serveur + état optimiste', () => {
  it('renvoie le post inchangé sans shadow', () => {
    const post = { id: 'm1', liked: false, likesCount: 10 };
    const { result } = renderHook(() => usePostShadow(post));
    expect(result.current).toEqual(post);
    expect(getPostShadow('m1')).toBeUndefined();
  });

  it('dérive likeCount +1 quand le shadow passe à liké', () => {
    updatePostShadow('m2', { liked: true });
    const { result } = renderHook(() => usePostShadow({ id: 'm2', liked: false, likesCount: 10 }));
    expect(result.current.liked).toBe(true);
    expect(result.current.likesCount).toBe(11);
    expect((result.current as Derived).likeCount).toBe(11);
  });

  it('dérive likeCount -1 (plancher 0) quand le shadow se dé-like', () => {
    updatePostShadow('m3', { liked: false });
    const { result } = renderHook(() => usePostShadow({ id: 'm3', liked: true, likesCount: 3 }));
    expect(result.current.likesCount).toBe(2);

    // Plancher : pas de compteur négatif.
    updatePostShadow('m3b', { liked: false });
    const { result: r2 } = renderHook(() =>
      usePostShadow({ id: 'm3b', liked: false, likesCount: 0 })
    );
    expect(r2.current.likesCount).toBe(0);
  });

  it('lit les compteurs alternatifs (likeCount / _count.likes)', () => {
    updatePostShadow('m4', { liked: true });
    const { result } = renderHook(() => usePostShadow({ id: 'm4', liked: false, likeCount: 5 }));
    expect((result.current as Derived).likesCount).toBe(6);

    updatePostShadow('m4b', { liked: true });
    const { result: r2 } = renderHook(() =>
      usePostShadow({ id: 'm4b', liked: false, _count: { likes: 7 } })
    );
    expect((r2.current as Derived).likesCount).toBe(8);
  });

  it('repost : mêmes règles de dérivation que le like', () => {
    updatePostShadow('m5', { reposted: true });
    const { result } = renderHook(() =>
      usePostShadow({ id: 'm5', reposted: false, repostsCount: 2 })
    );
    expect(result.current.reposted).toBe(true);
    expect((result.current as Derived).repostsCount).toBe(3);
  });

  it('propage isDeleted et pinned dans le post fusionné', () => {
    updatePostShadow('m6', { isDeleted: true, pinned: true });
    const { result } = renderHook(() => usePostShadow({ id: 'm6' }));
    expect((result.current as Derived).isDeleted).toBe(true);
    expect((result.current as Derived).isPinned).toBe(true);
  });

  it('ne touche pas au compteur si l’état liké ne change pas', () => {
    updatePostShadow('m7', { liked: true });
    const { result } = renderHook(() => usePostShadow({ id: 'm7', liked: true, likesCount: 4 }));
    expect(result.current.likesCount).toBe(4);
  });

  it('re-rend au notifier le shadow du seul post concerné', () => {
    // Aucun shadow au départ : compteur serveur intact.
    const { result, rerender } = renderHook(() =>
      usePostShadow({ id: 'm9', liked: true, likesCount: 1 })
    );
    expect((result.current as Derived).likesCount).toBe(1);

    // Un autre post est mis à jour : pas d'effet sur celui-ci.
    act(() => updatePostShadow('autre-post', { liked: true }));
    rerender();
    expect((result.current as Derived).likesCount).toBe(1);

    // Le sien passe à dé-liké : la fusion dérive -1.
    act(() => updatePostShadow('m9', { liked: false }));
    rerender();
    expect((result.current as Derived).likesCount).toBe(0);
  });

  it('POST_TOMBSTONE reste exporté pour marquer les suppressions', () => {
    expect(typeof POST_TOMBSTONE).toBe('symbol');
  });
});

describe('useArticleShadow — synchronisation réactive des articles', () => {
  it('renvoie l’article inchangé sans shadow', () => {
    const article = {
      id: 'art-1',
      liked: false,
      likesCount: 5,
      reposted: false,
      repostsCount: 2,
      isBookmarked: false,
    };
    const { result } = renderHook(() => useArticleShadow(article));
    expect(result.current).toEqual(article);
    expect(getArticleShadow('art-1')).toBeUndefined();
  });

  it('dérive likesCount et repostsCount lors des mises à jour shadow', () => {
    updateArticleShadow('art-2', { liked: true, reposted: true, bookmarked: true });
    const { result } = renderHook(() =>
      useArticleShadow({
        id: 'art-2',
        liked: false,
        likesCount: 10,
        reposted: false,
        repostsCount: 3,
        isBookmarked: false,
      })
    );
    expect(result.current.liked).toBe(true);
    expect(result.current.likesCount).toBe(11);
    expect(result.current.reposted).toBe(true);
    expect(result.current.repostsCount).toBe(4);
    expect(result.current.isBookmarked).toBe(true);
  });

  it('accepte les compteurs explicites dans le patch', () => {
    updateArticleShadow('art-3', { liked: true, likesCount: 99 });
    const { result } = renderHook(() =>
      useArticleShadow({ id: 'art-3', liked: false, likesCount: 0 })
    );
    expect(result.current.liked).toBe(true);
    expect(result.current.likesCount).toBe(99);
  });
});

describe('useActorShadow — synchronisation réactive des acteurs (par id ou handle)', () => {
  it('synchronise le statut d’abonnement par id', () => {
    updateActorShadow('user-1', { followed: true });
    const { result } = renderHook(() =>
      useActorShadow({ id: 'user-1', username: 'alice', isFollowed: false, viewerFollows: false })
    );
    expect(result.current.isFollowed).toBe(true);
    expect(result.current.viewerFollows).toBe(true);
  });

  it('synchronise le statut d’abonnement par username / handle', () => {
    updateActorShadow('@bob', { followed: true, followRequested: true });
    const { result } = renderHook(() =>
      useActorShadow({ id: 'user-2', username: 'bob', isFollowed: false, followRequested: false })
    );
    expect(result.current.isFollowed).toBe(true);
    expect(result.current.followRequested).toBe(true);
    expect(getActorShadow('bob')?.followed).toBe(true);
  });
});

describe('withShadowMutation — mutations optimistes avec rollback et lock anti double-clic', () => {
  it('succès de la mutation (optimisticUpdate exécuté, onSuccess appelé, pas de rollback)', async () => {
    const optimisticUpdate = vi.fn();
    const rollback = vi.fn();
    const mutation = vi.fn().mockResolvedValue({ id: 'res-1', success: true });
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const result = await withShadowMutation({
      lockKey: 'mutation:test:success',
      optimisticUpdate,
      rollback,
      mutation,
      onSuccess,
      onError,
    });

    expect(optimisticUpdate).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ id: 'res-1', success: true });
    expect(rollback).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'res-1', success: true });
  });

  it('échec de la mutation (rollback exécuté automatiquement, onError appelé)', async () => {
    const optimisticUpdate = vi.fn();
    const rollback = vi.fn();
    const testError = new Error('Réseau indisponible');
    const mutation = vi.fn().mockRejectedValue(testError);
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const result = await withShadowMutation({
      lockKey: 'mutation:test:failure',
      optimisticUpdate,
      rollback,
      mutation,
      onSuccess,
      onError,
    });

    expect(optimisticUpdate).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(testError);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('verrouillage in-flight (deuxième appel concurrent ignoré tant que le premier tourne, puis déverrouillé à la fin)', async () => {
    let resolveFirstMutation!: (value: string) => void;
    const firstMutationPromise = new Promise<string>((resolve) => {
      resolveFirstMutation = resolve;
    });

    const optUpdate1 = vi.fn();
    const optUpdate2 = vi.fn();
    const optUpdate3 = vi.fn();

    const lockKey = 'mutation:concurrent:lock';

    // Premier appel qui reste en vol (in-flight)
    const promise1 = withShadowMutation({
      lockKey,
      optimisticUpdate: optUpdate1,
      rollback: vi.fn(),
      mutation: () => firstMutationPromise,
    });

    expect(optUpdate1).toHaveBeenCalledTimes(1);

    // Deuxième appel concurrent avec le même lockKey
    const res2 = await withShadowMutation({
      lockKey,
      optimisticUpdate: optUpdate2,
      rollback: vi.fn(),
      mutation: vi.fn().mockResolvedValue('second-result'),
    });

    // Le deuxième appel doit être ignoré immédiatement (undefined) sans exécuter optimisticUpdate
    expect(res2).toBeUndefined();
    expect(optUpdate2).not.toHaveBeenCalled();

    // On résout le premier appel
    resolveFirstMutation('first-result');
    const res1 = await promise1;
    expect(res1).toBe('first-result');

    // Troisième appel après libération du lock : doit s'exécuter normalement
    const res3 = await withShadowMutation({
      lockKey,
      optimisticUpdate: optUpdate3,
      rollback: vi.fn(),
      mutation: vi.fn().mockResolvedValue('third-result'),
    });

    expect(optUpdate3).toHaveBeenCalledTimes(1);
    expect(res3).toBe('third-result');
  });
});
