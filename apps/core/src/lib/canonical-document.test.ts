import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCanonicalDocumentAction } from './canonical-document';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: vi.fn(),
}));

describe('getCanonicalDocumentAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retourne le document canonique complet quand goFetch répond avec succès', async () => {
    const mockDoc = {
      version: 1,
      text: 'Texte intégral de l’article canonique.',
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          startOffset: 0,
          endOffset: 38,
        },
      ],
    };

    vi.mocked(goFetch).mockResolvedValueOnce(mockDoc);

    const res = await getCanonicalDocumentAction('article-123');
    expect(res).toEqual(mockDoc);
    expect(goFetch).toHaveBeenCalledWith('/v1/articles/article-123/document');
  });

  it('retourne null si le document reçu n’a pas de blocks valides ou pas de texte', async () => {
    vi.mocked(goFetch).mockResolvedValueOnce({ text: 'Incomplet', blocks: null });
    const res1 = await getCanonicalDocumentAction('article-123');
    expect(res1).toBeNull();

    vi.mocked(goFetch).mockResolvedValueOnce({ text: '', blocks: [] });
    const res2 = await getCanonicalDocumentAction('article-123');
    expect(res2).toBeNull();
  });

  it('retourne null sans logger si le statut HTTP est 404', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(goFetch).mockRejectedValueOnce({ status: 404 });

    const res = await getCanonicalDocumentAction('article-inexistant');
    expect(res).toBeNull();
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('retourne null et logge l’erreur si une erreur réseau inattendue survient', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(goFetch).mockRejectedValueOnce(new Error('Connexion réseau échouée'));

    const res = await getCanonicalDocumentAction('article-crash');
    expect(res).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[core] getCanonicalDocumentAction:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});
