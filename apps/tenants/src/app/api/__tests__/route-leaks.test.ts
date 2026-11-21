// @vitest-environment jsdom
// =====================================================================
// 🧪 Routes API tenants — une panne interne ne fuit pas au client
// =====================================================================
// Rouge mesuré avant correctif : les deux handlers renvoyaient
// `error.message` au navigateur. Une erreur de stockage ou de base remontait
// donc son message (hôte, bucket, requête) et passait pour une faute de
// l'appelant. La seconde route acceptait en plus n'importe quel corps : seule
// la présence d'`articleId` était vérifiée.
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { goFetch, uploadMedia } = vi.hoisted(() => ({
  goFetch: vi.fn(),
  uploadMedia: vi.fn(),
}));

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch }));
vi.mock('@qoe/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@qoe/auth/current-user', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@qoe/supabase/media-engine', () => ({
  uploadAndProcessMedia: uploadMedia,
  IMAGE_FOLDERS: { articles: 'articles' },
}));

import { POST as readingSession } from '../analytics/reading-session/route';
import { POST as upload } from '../articles/upload/route';

describe('routes API tenants', () => {
  afterEach(() => {
    goFetch.mockReset();
    uploadMedia.mockReset();
  });

  it('reading-session ne renvoie pas le détail interne', async () => {
    goFetch.mockRejectedValue(new Error('pgx: relation "reading_sessions" does not exist'));

    const res = await readingSession(
      new NextRequest('https://x.test/api/analytics/reading-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: 'art_1', scrollDepth: 50 }),
      })
    );
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(body.error).not.toContain('reading_sessions');
  });

  it('reading-session refuse un corps sans type stable', async () => {
    const res = await readingSession(
      new NextRequest('https://x.test/api/analytics/reading-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: { $ne: null }, scrollDepth: 'beaucoup' }),
      })
    );

    expect(res.status).toBe(400);
    expect(goFetch).not.toHaveBeenCalled();
  });

  it('upload ne renvoie pas le détail interne', async () => {
    uploadMedia.mockRejectedValue(new Error('r2: bucket=qoe-media key=AKIAEXAMPLE denied'));

    const form = new FormData();
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }));

    const res = await upload(
      new NextRequest('https://x.test/api/articles/upload', { method: 'POST', body: form })
    );
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(body.error).not.toContain('AKIAEXAMPLE');
  });
});
