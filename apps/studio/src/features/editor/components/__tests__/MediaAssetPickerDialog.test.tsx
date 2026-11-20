import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MediaAssetPickerDialog } from '../MediaAssetPickerDialog';

vi.mock('../../actions/media-assets', () => ({
  listMediaAssetsAction: vi.fn(),
}));

import { listMediaAssetsAction } from '../../actions/media-assets';

const asset = {
  id: 'asset-1',
  url: 'https://cdn.qoe.fi/picker.webp',
  mimeType: 'image/webp',
  width: 1200,
  height: 800,
  sizeBytes: 2048,
  status: 'ATTACHED',
  targetType: 'ARTICLE_BODY',
  createdAt: '2026-01-01T10:00:00Z',
};

describe('MediaAssetPickerDialog', () => {
  beforeEach(() => {
    vi.mocked(listMediaAssetsAction).mockReset();
  });

  it('liste les assets et renvoie celui qui est choisi', async () => {
    vi.mocked(listMediaAssetsAction).mockResolvedValue({
      ok: true,
      items: [asset],
      nextOffset: 1,
      hasMore: false,
    });
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(<MediaAssetPickerDialog open onClose={onClose} onSelect={onSelect} />);

    const choice = await screen.findByRole('button', { name: "Utiliser l'image 1" });
    expect(screen.getByText('1200×800 · 2 Ko')).toBeInTheDocument();

    fireEvent.click(choice);
    expect(onSelect).toHaveBeenCalledWith(asset);
    expect(onClose).toHaveBeenCalled();
  });

  it('ignore la réponse d’une recherche périmée arrivée en retard', async () => {
    const oldAsset = { ...asset, id: 'asset-old', sizeBytes: 2048 };
    const chatAsset = { ...asset, id: 'asset-chat', sizeBytes: 5 * 1024 * 1024 };
    const pendings: Array<(value: unknown) => void> = [];
    vi.mocked(listMediaAssetsAction).mockImplementation(
      () =>
        new Promise((resolve) => {
          pendings.push(resolve as (value: unknown) => void);
        }) as never
    );

    render(<MediaAssetPickerDialog open onClose={() => undefined} onSelect={() => undefined} />);
    // Première requête : la liste complète, à l'ouverture.
    await waitFor(() => expect(pendings).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('Rechercher dans la médiathèque'), {
      target: { value: 'chat' },
    });
    await waitFor(() => expect(pendings).toHaveLength(2), { timeout: 2000 });

    // La recherche « chat » répond d'abord : ses résultats s'affichent.
    await act(async () => {
      pendings[1]({ ok: true, items: [chatAsset], nextOffset: 1, hasMore: false });
    });
    expect(await screen.findByText(/5 Mo/)).toBeInTheDocument();

    // Puis la requête initiale répond en retard : elle ne doit rien écraser.
    await act(async () => {
      pendings[0]({ ok: true, items: [oldAsset], nextOffset: 1, hasMore: false });
    });
    expect(screen.queryByText(/2 Ko/)).not.toBeInTheDocument();
    expect(screen.getByText(/5 Mo/)).toBeInTheDocument();
  });

  it('affiche une erreur sans casser le dialogue', async () => {
    vi.mocked(listMediaAssetsAction).mockResolvedValue({
      ok: false,
      error: 'Non authentifié',
      items: [],
      nextOffset: 0,
      hasMore: false,
    });

    render(<MediaAssetPickerDialog open onClose={() => undefined} onSelect={() => undefined} />);

    await waitFor(() => expect(screen.getByText('Non authentifié')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
