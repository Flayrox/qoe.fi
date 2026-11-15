import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
