// @vitest-environment node
// =====================================================================
// 🧪 /api/articles/upload — une panne interne ne fuit pas au client
// =====================================================================
// Le catch unique renvoyait `error.message` au navigateur avec un statut 400,
// quel que soit l'échec : une erreur de stockage, de modération ou de base
// remontait donc son message interne (hôte, bucket, clé, requête) et passait
// pour une faute de l'utilisateur. Le détail reste dans les logs serveur.
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const uploadAndProcessMedia = vi.fn();

vi.mock('@qoe/auth/current-user', () => ({
  getCurrentUser: vi.fn(async () => ({ id: 'staff_1', role: 'superadmin' })),
}));
vi.mock('@qoe/config', () => ({ ROLES: { SUPERADMIN: 'superadmin' } }));
vi.mock('@qoe/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@qoe/supabase/media-engine', () => ({
  uploadAndProcessMedia: (...args: unknown[]) => uploadAndProcessMedia(...(args as [])),
  IMAGE_FOLDERS: { articles: 'articles' },
}));
vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch: async () => ({}) }));

import { POST } from '../route';

describe('/api/articles/upload', () => {
  afterEach(() => uploadAndProcessMedia.mockReset());

  it('ne renvoie pas le détail interne et répond 500', async () => {
    uploadAndProcessMedia.mockRejectedValue(
      new Error('r2: bucket=qoe-media key=AKIAEXAMPLE access denied')
    );

    const form = new FormData();
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }));

    const response = await POST(
      new NextRequest('https://admin.test/api/articles/upload', { method: 'POST', body: form })
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).not.toContain('AKIAEXAMPLE');
    expect(body.error).not.toContain('bucket');
  });
});
