// =====================================================================
// 🧪 Résolution de la cible d'écriture d'un profil
// =====================================================================
// `resolveMediaIdByPublisher` décide si une édition doit passer par
// /v1/media/{id}/settings ou par le profil du compte. Une panne Go n'est pas
// une réponse « ce n'est pas un média » : la confondre réécrit le profil
// personnel depuis une page média (incident du 19/09).
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGoFetch } = vi.hoisted(() => ({ mockGoFetch: vi.fn() }));

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch: mockGoFetch }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { resolveMediaIdByPublisher } from '../profile-edit-actions';

function httpError(status: number, message = `Go API ${status}`) {
  return Object.assign(new Error(message), { status });
}

beforeEach(() => {
  mockGoFetch.mockReset();
});

describe('resolveMediaIdByPublisher', () => {
  it('rend l’id du média quand la publication en est un', async () => {
    mockGoFetch.mockResolvedValue({ mediaId: 'media-1' });
    await expect(resolveMediaIdByPublisher('pub-1')).resolves.toBe('media-1');
  });

  it('rend null quand la publication n’est pas un média (404)', async () => {
    mockGoFetch.mockRejectedValue(httpError(404));
    await expect(resolveMediaIdByPublisher('pub-1')).resolves.toBeNull();
  });

  it('rend null quand le lecteur n’a pas la main dessus (403)', async () => {
    mockGoFetch.mockRejectedValue(httpError(403));
    await expect(resolveMediaIdByPublisher('pub-1')).resolves.toBeNull();
  });

  it('propage une panne Go au lieu de la lire comme « pas un média »', async () => {
    mockGoFetch.mockRejectedValue(httpError(503));
    await expect(resolveMediaIdByPublisher('pub-1')).rejects.toThrow('Go API 503');
  });

  it('propage une panne réseau (aucun statut) au lieu de la lire comme « pas un média »', async () => {
    mockGoFetch.mockRejectedValue(new Error('fetch failed'));
    await expect(resolveMediaIdByPublisher('pub-1')).rejects.toThrow('fetch failed');
  });
});
