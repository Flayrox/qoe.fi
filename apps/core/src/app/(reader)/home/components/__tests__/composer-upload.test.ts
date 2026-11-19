// L20b2b2b — l'envoi d'images doit dire non proprement quand la route répond
// autre chose que `{ url }`, et ne jamais attendre indéfiniment.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadComposerImages } from '../composer-upload';

const png = () => new File(['x'], 'a.png', { type: 'image/png' });
const image = () => ({ id: 'i1', url: 'blob:preview', file: png() });

describe('uploadComposerImages (L20b2b2b)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuse une réponse sans URL avec un message métier, pas un TypeError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => null }));

    await expect(uploadComposerImages([image()])).rejects.toThrow("L'upload de l'image a échoué.");
  });

  it('borne l’attente de la route d’upload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://cdn.test/a.jpg' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadComposerImages([image()])).resolves.toEqual(['https://cdn.test/a.jpg']);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('renvoie les URLs déjà distantes sans les re-téléverser', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadComposerImages([{ url: 'https://cdn.test/existing.jpg' }])).resolves.toEqual(
      ['https://cdn.test/existing.jpg']
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
