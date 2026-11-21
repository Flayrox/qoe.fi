import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MediaApiKeysTab } from '../MediaApiKeysTab';
import * as actions from '../actions';

vi.mock('../actions', () => ({
  listMediaApiKeysAction: vi.fn(),
  createMediaApiKeyAction: vi.fn(),
  updateMediaApiKeyAction: vi.fn(),
  rotateMediaApiKeyAction: vi.fn(),
  revokeMediaApiKeyAction: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('@qoe/ui/toast', () => ({ toast: toastMock }));

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockImplementation(() => Promise.resolve()),
  },
});

describe('MediaApiKeysTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when media has no API keys', async () => {
    vi.mocked(actions.listMediaApiKeysAction).mockResolvedValue({
      success: true,
      keys: [],
    });

    render(<MediaApiKeysTab mediaId="media_1" mediaName="La Gazette" />);

    await waitFor(() => {
      expect(screen.getByText(/Aucune clé API active pour ce média/i)).toBeDefined();
    });
    expect(screen.getByText('0 / 10 clés')).toBeDefined();
  });

  it('renders table of keys when keys exist', async () => {
    vi.mocked(actions.listMediaApiKeysAction).mockResolvedValue({
      success: true,
      keys: [
        {
          id: 'key_1',
          name: 'Zapier Bot',
          keyPrefix: 'qoe_live_abc1',
          scopes: ['READ', 'WRITE'],
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          createdByName: 'Alice',
        },
      ],
    });

    render(<MediaApiKeysTab mediaId="media_1" mediaName="La Gazette" />);

    await waitFor(() => {
      expect(screen.getByText('Zapier Bot')).toBeDefined();
      expect(screen.getByText(/qoe_live_abc1/)).toBeDefined();
      expect(screen.getByText('Alice')).toBeDefined();
    });
    expect(screen.getByText('1 / 10 clés')).toBeDefined();
  });

  it('allows creating a new key and displays secret modal', async () => {
    vi.mocked(actions.listMediaApiKeysAction).mockResolvedValue({
      success: true,
      keys: [],
    });

    vi.mocked(actions.createMediaApiKeyAction).mockResolvedValue({
      success: true,
      key: {
        id: 'key_new',
        name: 'CMS Integration',
        keyPrefix: 'qoe_live_new1',
        scopes: ['READ', 'WRITE'],
        createdAt: new Date().toISOString(),
        secret: 'qoe_live_fullsecretkey123456789',
      },
    });

    render(<MediaApiKeysTab mediaId="media_1" mediaName="La Gazette" />);

    await waitFor(() => {
      expect(screen.getByText(/Nouvelle clé API/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Nouvelle clé API/i));

    const input = screen.getByPlaceholderText(/Ex: Zapier Sync/i);
    fireEvent.change(input, { target: { value: 'CMS Integration' } });

    fireEvent.click(screen.getByText('Générer la clé'));

    await waitFor(() => {
      expect(actions.createMediaApiKeyAction).toHaveBeenCalledWith('media_1', 'CMS Integration', [
        'READ',
        'WRITE',
      ]);
      expect(screen.getByText('qoe_live_fullsecretkey123456789')).toBeDefined();
      expect(screen.getByText(/Clé API générée avec succès/i)).toBeDefined();
    });
  });

  it('n’annonce pas une copie réussie quand le presse-papiers refuse', async () => {
    vi.mocked(actions.listMediaApiKeysAction).mockResolvedValue({ success: true, keys: [] });
    vi.mocked(actions.createMediaApiKeyAction).mockResolvedValue({
      success: true,
      key: {
        id: 'key_new',
        name: 'Secret unique',
        keyPrefix: 'qoe_live_a',
        scopes: ['READ'],
        createdAt: new Date().toISOString(),
        secret: 'qoe_live_one_time_secret',
      },
    });
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<MediaApiKeysTab mediaId="media_1" mediaName="La Gazette" />);

    fireEvent.click(await screen.findByText(/Nouvelle clé API/i));
    fireEvent.change(screen.getByPlaceholderText(/Ex: Zapier Sync/i), {
      target: { value: 'Secret unique' },
    });
    fireEvent.click(screen.getByText('Générer la clé'));

    const copyButton = await screen.findByLabelText('Copier la clé');
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('qoe_live_one_time_secret'));
    // Le secret n'est affiché qu'une fois : annoncer une copie qui a échoué
    // laisse l'utilisateur fermer la fenêtre sans l'avoir conservé.
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.success).not.toHaveBeenCalledWith('Clé copiée dans le presse-papiers.');
  });
});
