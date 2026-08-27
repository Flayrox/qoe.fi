// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSaveArticle } from '../useAutoSaveArticle';

describe('useAutoSaveArticle module', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('1. Exports the useAutoSaveArticle hook function correctly', () => {
    expect(typeof useAutoSaveArticle).toBe('function');
  });

  it('2. Flushe le debounce au démontage (navigation) — ne perd pas les frappes', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'art-1' });
    const { result, unmount } = renderHook(() => useAutoSaveArticle({ delay: 1000, onSave }));

    act(() => {
      result.current.scheduleAutoSave({ title: 'Titre', content: '<p>a</p>', slug: 'titre' });
    });

    // Debounce de 1s : rien n'a encore été sauvegardé…
    expect(onSave).not.toHaveBeenCalled();

    // …mais le démontage (navigation) flushe immédiatement le payload.
    unmount();
    await act(async () => {});

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Titre', content: '<p>a</p>' })
    );
  });

  it('3. Sérialise : aucune requête en chevauchement, la suivante est rejouée', async () => {
    let resolveFirst!: (v: { id: string }) => void;
    const first = new Promise<{ id: string }>((res) => {
      resolveFirst = res;
    });

    let concurrent = 0;
    let maxConcurrent = 0;
    const track = (impl: () => Promise<{ id: string }>) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      return impl().finally(() => {
        concurrent -= 1;
      });
    };

    const onSave = vi
      .fn()
      .mockImplementationOnce(() => track(() => first))
      .mockImplementationOnce(() => track(() => Promise.resolve({ id: 'art-1' })));

    const { result } = renderHook(() => useAutoSaveArticle({ delay: 1000, onSave }));

    // 1re sauvegarde (lente, promise non résolue).
    act(() => {
      void result.current.saveNow({ title: 'A', content: '<p>A</p>' });
    });
    await act(async () => {});
    expect(onSave).toHaveBeenCalledTimes(1);

    // Pendant qu'elle est en vol, une nouvelle sauvegarde est mise en attente.
    act(() => {
      void result.current.saveNow({ title: 'B', content: '<p>B</p>' });
    });
    await act(async () => {});
    expect(onSave).toHaveBeenCalledTimes(1); // pas de chevauchement

    // La 1re se termine → la 2e est rejouée automatiquement.
    resolveFirst({ id: 'art-1' });
    await act(async () => {});
    await act(async () => {});

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(maxConcurrent).toBe(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ title: 'A' });
    expect(onSave.mock.calls[1][0]).toMatchObject({ title: 'B' });
  });

  it('4. Le statut passe par saving → saved avec l’id réutilisé pour les PATCH suivants', async () => {
    const onSave = vi
      .fn()
      .mockResolvedValueOnce({ id: 'art-100', updatedAt: new Date().toISOString() })
      .mockResolvedValueOnce({ id: 'art-100', updatedAt: new Date().toISOString() });

    const { result } = renderHook(() => useAutoSaveArticle({ delay: 1000, onSave }));

    act(() => {
      void result.current.saveNow({ title: 'Titre de Test', content: '<p>Contenu</p>' });
    });
    expect(result.current.status).toBe('saving');
    await act(async () => {});

    expect(result.current.status).toBe('saved');
    expect(result.current.articleId).toBe('art-100');

    // Le 2e save passe bien l'id déjà connu (PATCH au lieu de POST).
    act(() => {
      void result.current.saveNow({ title: 'Titre de Test', content: '<p>Édité</p>' });
    });
    await act(async () => {});
    expect(onSave.mock.calls[1][0]).toMatchObject({ id: 'art-100', title: 'Titre de Test' });
  });
});
