import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chunkText,
  fastPathScan,
  isDisposableEmail,
  normalizeEmail,
  OpenAiModerator,
  validateRegistrationEmail,
  validateUsername,
} from '../index';

// =====================================================================
// 🔒 L14 — durcissement @qoe/moderation
// =====================================================================
// Chaque test de cette suite décrit le comportement ATTENDU et échouait
// contre l'implémentation d'origine (voir fiche L14).
// =====================================================================

describe('@qoe/moderation — réservés non contournables (L14)', () => {
  it('refuse les homoglyphes non-ASCII dès le format (première barrière)', () => {
    // « mоderator » : le « о » est U+043E (cyrillique), pas U+006F.
    // Candidat examiné puis ABANDONNÉ comme défaut de réservation : le format
    // ASCII (`USERNAME_REGEX`) rejette déjà ces pseudos, donc aucun compte ne
    // peut être créé. Test conservé comme garde de non-régression.
    const attempts = ['mоderator', 'аdmin', 'qое'];
    for (const attempt of attempts) {
      const result = validateUsername(attempt);
      expect(result.valid, `« ${attempt} » devrait être refusé`).toBe(false);
      expect(result.reason).toBe('format');
    }
  });

  it('refuse un réservé déguisé en leetspeak', () => {
    const attempts = ['adm1n', 'm0derator', '5upport'];
    for (const attempt of attempts) {
      const result = validateUsername(attempt);
      expect(result.valid, `« ${attempt} » devrait être refusé`).toBe(false);
      expect(result.reason).toBe('reserved');
    }
  });
});

describe('@qoe/moderation — options du chunker (L14)', () => {
  it('ne perd pas le texte quand chunkSize est invalide', () => {
    const text = 'Un texte court mais non vide.';
    expect(chunkText(text, { chunkSize: 0 })).toHaveLength(1);
    expect(chunkText(text, { chunkSize: -10 })[0]?.text).toBe(text);
    expect(chunkText(text, { chunkSize: Number.NaN })[0]?.text).toBe(text);
  });

  it('borne le chevauchement pour ne pas dégénérer en fenêtres de 1 caractère', () => {
    const text = 'Phrase de contrôle. '.repeat(100); // 2 000 caractères
    // overlap (5 000) > chunkSize (100) : chaque fenêtre doit avancer
    // d'au moins la moitié de sa taille, sinon on produit des milliers de
    // chunks quasi identiques.
    const chunks = chunkText(text, { chunkSize: 100, overlap: 5000 });
    expect(chunks.length).toBeLessThan(200);
    expect(chunks.length).toBeGreaterThan(1);
    // Aucun chunk vide, et le dernier atteint bien la fin du texte.
    expect(chunks.every((chunk) => chunk.text.length > 0)).toBe(true);
    expect(chunks.at(-1)?.endChar).toBe(text.length);
  });
});

describe('@qoe/moderation — format email RFC (L14)', () => {
  it('refuse les points en tête, en queue et doublés dans la partie locale', () => {
    for (const email of ['.a@qoe.fi', 'a.@qoe.fi', 'a..b@qoe.fi']) {
      expect(validateRegistrationEmail(email).valid, `« ${email} » devrait être rejeté`).toBe(
        false
      );
    }
  });

  it('refuse une partie locale de plus de 64 caractères', () => {
    const email = `${'a'.repeat(65)}@qoe.fi`;
    expect(validateRegistrationEmail(email).valid).toBe(false);
  });
});

describe('@qoe/moderation — chemins non couverts (L14)', () => {
  it('transmet bien les images (URL et base64) au modérateur', async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => ({ ok: true, json: async () => ({ results: [] }) }) as unknown as Response
    );
    vi.stubGlobal('fetch', fetchMock);
    const moderator = new OpenAiModerator({ apiKey: 'sk-real-test-key-123' });

    await moderator.moderate({
      text: '  Article  ',
      imageUrls: ['https://cdn.qoe.fi/a.jpg', ''] as string[],
      imageBase64List: [{ base64: 'QUJD', mimeType: 'image/png' }],
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as {
      input: Array<{ type: string; text?: string; image_url?: { url: string } }>;
    };
    expect(body.input[0]).toEqual({ type: 'text', text: 'Article' });
    // Une URL vide est ignorée, les deux vraies images sont envoyées.
    expect(body.input.filter((item) => item.type === 'image_url')).toEqual([
      { type: 'image_url', image_url: { url: 'https://cdn.qoe.fi/a.jpg' } },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
    ]);
    vi.unstubAllGlobals();
  });

  it("n'appelle pas l'API quand il n'y a rien à modérer", async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: true, json: async () => ({ results: [] }) }) as unknown as Response
    );
    vi.stubGlobal('fetch', fetchMock);
    const moderator = new OpenAiModerator({ apiKey: 'sk-real-test-key-123' });

    const result = await moderator.moderate({ text: '   ' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.safe).toBe(true);
    vi.unstubAllGlobals();
  });

  it('laisse passer une entrée vide du fast-path', () => {
    expect(fastPathScan('')).toEqual({ clean: true, action: 'allow' });
  });

  it('normalise une saisie sans arobase sans lever', () => {
    expect(normalizeEmail('  PasUnEmail  ')).toEqual({
      raw: '  PasUnEmail  ',
      normalized: 'pasunemail',
      canonical: 'pasunemail',
      domain: '',
      localPart: 'pasunemail',
      isDisposable: false,
    });
  });

  it('rend les erreurs explicites pour les saisies vides ou trop courtes', () => {
    expect(validateRegistrationEmail('').error).toContain('requise');
    expect(validateRegistrationEmail('a@b').error).toContain('longueur');
    expect(isDisposableEmail('')).toBe(false);
  });
});

describe('@qoe/moderation — aucun minuteur ne fuit (L14)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("nettoie le timeout quand l'appel réseau échoue", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      })
    );
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const moderator = new OpenAiModerator({ apiKey: 'sk-real-test-key-123', timeoutMs: 4000 });

    await moderator.moderate({ text: 'Bonjour' });

    expect(vi.getTimerCount()).toBe(0);
    warn.mockRestore();
  });

  it("abandonne l'appel au-delà du délai configuré (fail-open documenté)", async () => {
    vi.useRealTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError'))
            );
          })
      )
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const moderator = new OpenAiModerator({ apiKey: 'sk-real-test-key-123', timeoutMs: 20 });

    const startedAt = Date.now();
    const result = await moderator.moderate({ text: 'Bonjour' });

    expect(Date.now() - startedAt).toBeLessThan(2_000);
    // Indisponibilité du modérateur = service non bloqué (choix produit existant).
    expect(result.safe).toBe(true);
    expect(result.flagged).toBe(false);
    errorSpy.mockRestore();
  });

  it('nettoie le timeout quand l’API répond une erreur HTTP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response)
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const moderator = new OpenAiModerator({ apiKey: 'sk-real-test-key-123', timeoutMs: 4000 });

    await moderator.moderate({ text: 'Bonjour' });

    expect(vi.getTimerCount()).toBe(0);
    warn.mockRestore();
  });
});
