// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutoSaveArticle } from '../hooks/useAutoSaveArticle';

// L06b : la déduplication de l'auto-save comparait une empreinte qui ignorait
// le texte alternatif (et la décorativité) de la couverture — modifier seulement
// l'accessibilité ne déclenchait aucune sauvegarde.

describe('useAutoSaveArticle — empreinte de payload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sauvegarde quand seul le texte alternatif de couverture change', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'article-1' });
    const { result } = renderHook(() => useAutoSaveArticle({ delay: 100, onSave }));

    const base = { title: 'Titre', content: 'Corps', imageUrl: '/img.webp' };

    act(() => {
      result.current.scheduleAutoSave({ ...base, coverAlt: 'Un chat sur un clavier' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.scheduleAutoSave({ ...base, coverAlt: 'Un chat endormi' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('ne renvoie pas un payload identique à la dernière sauvegarde réussie', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'article-1' });
    const { result } = renderHook(() => useAutoSaveArticle({ delay: 50, onSave }));
    const payload = { title: 'Titre', content: 'Corps', coverAlt: 'Alt', coverDecorative: false };

    act(() => result.current.scheduleAutoSave(payload));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80);
    });
    act(() => result.current.scheduleAutoSave(payload));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saved');
  });
});
