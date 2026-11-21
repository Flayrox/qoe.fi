// =====================================================================
// 🧪 /api/articles/upload — un champ non-File et un registre en panne
// =====================================================================
// 1. `formData.get('file') as File` est un mensonge de type : un champ texte
//    nommé `file` faisait lever `file.arrayBuffer is not a function`, et le
//    `catch` renvoyait ce détail interne au navigateur.
// 2. Le registre Go des médias (TTL des orphelins) était dans le même essai
//    que l'envoi : une panne du registre renvoyait 400 alors que l'image
//    était déjà stockée — l'utilisateur relançait l'envoi, et le message
//    d'erreur Go partait tel quel dans la réponse.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const mediaEngine = vi.hoisted(() => ({
  uploadAndProcessMedia: vi.fn(),
  IMAGE_FOLDERS: {
    avatars: 'avatars',
    banners: 'banners',
    articles: 'articles',
    thoughts: 'thoughts',
  },
}));
const goClient = vi.hoisted(() => ({ goFetch: vi.fn() }));

vi.mock('@qoe/auth/current-user', () => auth);
vi.mock('@qoe/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock('@qoe/supabase/media-engine', () => mediaEngine);
vi.mock('@qoe/sdk/actions/utils/go-client', () => goClient);

import { POST } from '../route';

const USER = { id: 'user_1' };

// Le contrat du handler est `request.formData()` ; on le fournit directement
// plutôt que de traverser l'encodeur multipart d'undici, qui refuse un
// `FormData` jsdom.
function uploadRequest(body: FormData) {
  return { formData: async () => body } as unknown as NextRequest;
}

function pngForm() {
  const body = new FormData();
  body.append(
    'file',
    new window.File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'photo.png', { type: 'image/png' })
  );
  return body;
}

const PROCESSED = {
  url: 'https://cdn.qoe.fi/articles/user_1/photo.webp',
  storagePath: 'articles/user_1/photo.webp',
  mimeType: 'image/webp',
  width: 800,
  height: 600,
  sizeBytes: 1234,
  sha256: 'a'.repeat(64),
  blurhash: 'LEHV6nWB2yk8',
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue(USER);
  mediaEngine.uploadAndProcessMedia.mockResolvedValue(PROCESSED);
  goClient.goFetch.mockResolvedValue({});
});

describe('POST /api/articles/upload', () => {
  it('refuse un champ `file` qui n’est pas un fichier, sans fuiter de détail', async () => {
    const body = new FormData();
    body.append('file', 'pas-un-fichier');

    const response = await POST(uploadRequest(body));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Aucun fichier fourni');
    expect(payload.error).not.toMatch(/arrayBuffer/);
    expect(mediaEngine.uploadAndProcessMedia).not.toHaveBeenCalled();
  });

  it('rend l’image quand le registre Go des médias est en panne', async () => {
    goClient.goFetch.mockRejectedValue(new Error('postgres: relation media_assets absente'));

    const response = await POST(uploadRequest(pngForm()));
    const payload = (await response.json()) as { url?: string; error?: string };

    expect(response.status).toBe(200);
    expect(payload.url).toBe(PROCESSED.url);
    expect(payload.error).toBeUndefined();
  });

  it('garde les messages du moteur média, seuls exploitables par l’utilisateur', async () => {
    mediaEngine.uploadAndProcessMedia.mockRejectedValue(
      new Error('Fichier trop volumineux. La taille maximale autorisée est de 12 Mo.')
    );

    const response = await POST(uploadRequest(pngForm()));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/Fichier trop volumineux/);
  });

  it('ne renvoie pas le détail interne d’une panne inattendue', async () => {
    const request = {
      formData: async () => {
        throw new Error(
          'Unexpected end of form at Busboy.parse (/app/node_modules/busboy/lib/types/multipart.js:1)'
        );
      },
    } as unknown as NextRequest;

    const response = await POST(request);
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(500);
    expect(payload.error).toBe('Import impossible. Réessayez dans un instant.');
  });
});
