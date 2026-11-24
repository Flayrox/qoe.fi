import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { IMAGE_FOLDERS } from '../storage';
import { MediaValidationError, moderateImageBuffer } from '../media-engine';
import { createUploadHandler } from '../next-upload-handler';

const PROCESSED = {
  url: 'https://cdn.qoe.fi/articles/user_1/photo.webp',
  storagePath: 'articles/user_1/photo.webp',
  sha256: 'a'.repeat(64),
  width: 800,
  height: 600,
  sizeBytes: 1234,
  blurhash: 'data:image/webp;base64,AA==',
  mimeType: 'image/webp',
  isExistingAsset: false,
};

function makeRequest(form: FormData): NextRequest {
  return { formData: async () => form } as unknown as NextRequest;
}

function pngForm(folder?: string): FormData {
  const form = new FormData();
  form.append(
    'file',
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])], 'photo.png', {
      type: 'image/png',
    })
  );
  if (folder) form.append('folder', folder);
  return form;
}

describe('createUploadHandler (@qoe/supabase/next-upload-handler)', () => {
  type FakeSupabase = { auth: { getUser: ReturnType<typeof vi.fn> } };
  const createClient = vi.fn<() => Promise<FakeSupabase>>();
  const uploadAndProcessMedia =
    vi.fn<
      (
        supabase: FakeSupabase,
        buf: Buffer,
        mime: string,
        opts?: { folder?: string; ownerId?: string }
      ) => Promise<typeof PROCESSED>
    >();
  const goFetch =
    vi.fn<(path: string, init?: { method?: string; body?: unknown }) => Promise<unknown>>();
  const resolveUser = vi.fn<() => Promise<{ id: string; role?: string | null } | null>>();

  beforeEach(() => {
    vi.restoreAllMocks();
    createClient.mockResolvedValue({ auth: { getUser: vi.fn() } });
    uploadAndProcessMedia.mockResolvedValue(PROCESSED);
    goFetch.mockResolvedValue({ allowed: true });
    resolveUser.mockResolvedValue({ id: 'user_1', role: 'superadmin' });
  });

  function buildHandler(overrides: Record<string, unknown> = {}) {
    return createUploadHandler<FakeSupabase>({
      createClient,
      uploadAndProcessMedia,
      goFetch: <T = Record<string, unknown>>(
        path: string,
        init?: { method?: string; body?: unknown }
      ) => goFetch(path, init) as Promise<T>,
      resolveUser,
      defaultFolder: IMAGE_FOLDERS.articles,
      allowedFolders: Object.values(IMAGE_FOLDERS),
      resolveTargetType: (folder) =>
        folder === IMAGE_FOLDERS.banners ? 'PUBLISHER_BANNER' : 'ARTICLE_BODY',
      logLabel: 'Upload Test',
      errorMessage500: 'Erreur serveur générique',
      ...overrides,
    });
  }

  it('refuse un appelant non authentifié (401)', async () => {
    resolveUser.mockResolvedValue(null);
    const res = await buildHandler()(makeRequest(pngForm()));
    expect(res.status).toBe(401);
    expect(uploadAndProcessMedia).not.toHaveBeenCalled();
  });

  it('refuse un rôle insuffisant (403)', async () => {
    resolveUser.mockResolvedValue({ id: 'user_1', role: 'user' });
    const res = await buildHandler({ requiredRole: 'superadmin' })(makeRequest(pngForm()));
    expect(res.status).toBe(403);
    expect(uploadAndProcessMedia).not.toHaveBeenCalled();
  });

  it('refuse un champ file non-File et un dossier invalide (400)', async () => {
    const badFileForm = new FormData();
    badFileForm.append('file', 'texte-brut');
    expect((await buildHandler()(makeRequest(badFileForm))).status).toBe(400);

    expect((await buildHandler()(makeRequest(pngForm('hacker/path')))).status).toBe(400);
    expect(uploadAndProcessMedia).not.toHaveBeenCalled();
  });

  it.each([
    { status: 429, msg: "Trop d'uploads, réessayez plus tard" },
    { status: 413, msg: 'Quota de stockage dépassé' },
  ])(
    'coupe immédiatement sur refus preflight Go ($status) avant Sharp/OpenAI',
    async ({ status, msg }) => {
      const err = Object.assign(new Error(msg), { status });
      goFetch.mockRejectedValueOnce(err);

      const res = await buildHandler()(makeRequest(pngForm()));
      const body = (await res.json()) as { error?: string };

      expect(res.status).toBe(status);
      expect(body.error).toBe(msg);
      expect(uploadAndProcessMedia).not.toHaveBeenCalled();
    }
  );

  it('poursuit en fail-open si le preflight Go est temporairement indisponible (500)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = Object.assign(new Error('timeout upstream'), { status: 503 });
    goFetch.mockRejectedValueOnce(err).mockResolvedValueOnce({ id: 'asset_1' });

    const res = await buildHandler()(makeRequest(pngForm()));
    const body = (await res.json()) as { url?: string };

    expect(res.status).toBe(200);
    expect(body.url).toBe(PROCESSED.url);
    expect(uploadAndProcessMedia).toHaveBeenCalledTimes(1);
    expect(goFetch).toHaveBeenCalledTimes(2);
  });

  it('relaie le statut d’une MediaValidationError (413/400) sans masquer le motif', async () => {
    uploadAndProcessMedia.mockRejectedValue(
      new MediaValidationError('Fichier trop volumineux. Maximum 12 Mo.', 413)
    );

    const res = await buildHandler()(makeRequest(pngForm()));
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(413);
    expect(body.error).toContain('12 Mo');
  });

  it('masque les erreurs internes du moteur média sous 500 sans fuite', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    uploadAndProcessMedia.mockRejectedValue(new Error('r2: key=AKIAEXAMPLE bucket=secret'));

    const res = await buildHandler()(makeRequest(pngForm()));
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(500);
    expect(body.error).toBe('Erreur serveur générique');
    expect(JSON.stringify(body)).not.toContain('AKIAEXAMPLE');
  });

  it('enchaîne preflight Go → moteur média → enregistrement Go → 200', async () => {
    const res = await buildHandler()(makeRequest(pngForm(IMAGE_FOLDERS.banners)));
    const body = (await res.json()) as typeof PROCESSED;

    expect(res.status).toBe(200);
    expect(body.url).toBe(PROCESSED.url);
    expect(goFetch).toHaveBeenNthCalledWith(
      1,
      '/v1/media-assets/preflight',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ targetType: 'PUBLISHER_BANNER', mimeType: 'image/png' }),
      })
    );
    expect(goFetch).toHaveBeenNthCalledWith(
      2,
      '/v1/media-assets',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ sha256: PROCESSED.sha256, targetType: 'PUBLISHER_BANNER' }),
      })
    );
  });
});

describe('moderateImageBuffer — AbortSignal timeout (P2)', () => {
  it('passe un AbortSignal borné à fetch OpenAI', async () => {
    const prevKey = process.env.OPENAI_API_KEY;
    const prevEnv = process.env.NODE_ENV;
    process.env.OPENAI_API_KEY = 'sk-valid-test-key';
    process.env.NODE_ENV = 'production';
    const originalFetch = globalThis.fetch;
    let seenSignal: AbortSignal | null | undefined;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      seenSignal = init?.signal;
      return new Response(JSON.stringify({ results: [{ flagged: false }] }), { status: 200 });
    }) as typeof fetch;

    try {
      const mod = await moderateImageBuffer(Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg');
      expect(mod.safe).toBe(true);
      expect(seenSignal).toBeInstanceOf(AbortSignal);
    } finally {
      globalThis.fetch = originalFetch;
      if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevKey;
      if (prevEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevEnv;
    }
  });
});
