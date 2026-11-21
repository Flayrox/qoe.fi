// @vitest-environment jsdom
// =====================================================================
// 🧪 grid-view — une vue supprimée n'est supprimée que si le serveur suit
// =====================================================================
// `removeView` retirait la vue localement puis lançait la suppression serveur
// avec un simple `void` : un refus (réseau, droit) partait en rejet non géré,
// et l'opérateur voyait la vue disparaître alors qu'elle était toujours en
// base — elle revenait au rechargement suivant, sans explication.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const fetchSavedViewsAction = vi.fn();
const saveSavedViewAction = vi.fn();
const deleteSavedViewAction = vi.fn();

vi.mock('@/lib/admin-views-actions', () => ({
  fetchSavedViewsAction: (...args: unknown[]) => fetchSavedViewsAction(...args),
  saveSavedViewAction: (...args: unknown[]) => saveSavedViewAction(...args),
  deleteSavedViewAction: (...args: unknown[]) => deleteSavedViewAction(...args),
}));

import { useGridView } from '../grid-view';

const sharedView = {
  id: 'view_1',
  name: 'SLA dépassés',
  state: {
    sort: { column: 'sla', direction: 'ascending' as const },
    facets: {},
    hidden: [],
    order: [],
    density: 'normal' as const,
  },
  isShared: true,
  isMine: true,
};

// Node sans `--localstorage-file` : `window.localStorage` est absent en jsdom.
const store = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  },
});

describe('useGridView — suppression d’une vue partagée', () => {
  beforeEach(() => {
    store.clear();
    fetchSavedViewsAction.mockReset().mockResolvedValue([sharedView]);
    saveSavedViewAction.mockReset();
    deleteSavedViewAction.mockReset();
  });

  it('remet la vue quand la suppression serveur est refusée', async () => {
    deleteSavedViewAction.mockRejectedValue(new Error('unavailable'));
    const { result } = renderHook(() =>
      useGridView('admin.work', { column: 'sla', direction: 'ascending' })
    );

    await waitFor(() => expect(result.current.views).toHaveLength(1));

    await act(async () => {
      result.current.removeView('SLA dépassés');
    });

    await waitFor(() => expect(deleteSavedViewAction).toHaveBeenCalledWith('admin.work', 'view_1'));
    // La base n'a pas supprimé : la barre d'outils ne doit pas prétendre le contraire.
    await waitFor(() => expect(result.current.views).toHaveLength(1));
  });

  it('remet la vue quand le serveur refuse sans lever d’erreur', async () => {
    // `deleteSavedViewAction` ne lève pas : elle rend `false`. Ignorer ce booléen
    // revenait à annoncer une suppression que la base n'a pas faite.
    deleteSavedViewAction.mockResolvedValue(false);
    const { result } = renderHook(() =>
      useGridView('admin.work', { column: 'sla', direction: 'ascending' })
    );

    await waitFor(() => expect(result.current.views).toHaveLength(1));

    await act(async () => {
      result.current.removeView('SLA dépassés');
    });

    await waitFor(() => expect(result.current.views).toHaveLength(1));
  });

  it('retire la vue quand le serveur accepte', async () => {
    // Contrat de `deleteSavedViewAction` : `true` = la base a supprimé.
    deleteSavedViewAction.mockResolvedValue(true);
    const { result } = renderHook(() =>
      useGridView('admin.work', { column: 'sla', direction: 'ascending' })
    );

    await waitFor(() => expect(result.current.views).toHaveLength(1));

    await act(async () => {
      result.current.removeView('SLA dépassés');
    });

    expect(result.current.views).toHaveLength(0);
  });
});
