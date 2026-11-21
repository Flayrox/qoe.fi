// @vitest-environment jsdom
// =====================================================================
// 🧪 Widgets — un refus de suppression se dit
// =====================================================================
// Supprimer une tendance (ou un encart) retirait la ligne à l'écran puis, en
// cas de refus, la remettait sans un mot : la ligne réapparaissait comme par
// enchantement, sans motif, et pour un basculement d'encart l'état affiché
// restait même faux. Un refus doit dire pourquoi.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const deleteTrendMock = vi.fn();

vi.mock('@/lib/admin-aux-actions', () => ({
  toggleFeaturedArticle: async () => ({ success: true }),
  addTrend: async () => ({ success: true }),
  deleteTrend: (id: string) => deleteTrendMock(id),
  updateTrendCount: async () => ({ success: true }),
  savePromo: async () => ({ success: true }),
  deletePromo: async () => ({ success: true }),
  togglePromoActive: async () => ({ success: true }),
}));
vi.mock('@qoe/supabase/storage', () => ({
  uploadImageToRoute: async () => 'https://cdn.qoe.fi/x.png',
  IMAGE_FOLDERS: { articles: 'articles' },
}));
vi.mock('@qoe/ui/ui/ImageUploader', () => ({ ImageUploader: () => null }));

import { WidgetsCMS } from '../components/WidgetsCMS';

describe('WidgetsCMS — refus de suppression', () => {
  afterEach(() => {
    cleanup();
    deleteTrendMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('dit pourquoi la tendance n’a pas été supprimée', async () => {
    vi.stubGlobal('confirm', () => true);
    deleteTrendMock.mockResolvedValue({ success: false, error: 'Tendance introuvable' });

    render(
      <WidgetsCMS
        articles={[]}
        trends={[{ id: 'tr_1', hashtag: '#attention', count: 120 }]}
        promos={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Tendances/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(deleteTrendMock).toHaveBeenCalledWith('tr_1'));
    expect(await screen.findByText(/Tendance introuvable/)).toBeTruthy();
    expect(await screen.findByText('#attention')).toBeTruthy();
  });
});
