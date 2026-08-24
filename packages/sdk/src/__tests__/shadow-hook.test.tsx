// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
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
import { POST_TOMBSTONE, updatePostShadow, getPostShadow, usePostShadow } from '../shadow';

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
