// =====================================================================
// 🧪 Sentry — le rapporteur de requête existe, l'init est attendue
// =====================================================================
// Deux défauts corrigés ici :
//  1. Aucune app n'exportait `onRequestError` depuis `instrumentation.ts` :
//     Next.js 16 ne transmet une erreur de RSC / Server Action / route handler
//     que par cet export — sans lui, ces erreurs n'atteignaient jamais Sentry.
//  2. `initSentryServer()` lançait un import dynamique sans l'attendre :
//     `register()` rendait la main avant `Sentry.init`, et les erreurs du
//     début du démarrage étaient perdues.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureRequestError: vi.fn(async () => undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  init: sentry.init,
  captureRequestError: sentry.captureRequestError,
}));

const { captureRequestError, initSentryServer } = await import('../sentry');

beforeEach(() => {
  sentry.init.mockClear();
  sentry.captureRequestError.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const DSN = 'https://cle@exemple.test/1';

describe('initSentryServer', () => {
  it('n’a pas initialisé Sentry quand la promesse est rendue', async () => {
    const promise = initSentryServer(DSN);
    // Le contrat : tant que la promesse n'est pas attendue, rien n'est initialisé.
    expect(sentry.init).not.toHaveBeenCalled();
    await promise;
    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: DSN, debug: false }));
  });

  it('ne fait rien sans DSN et ne lève pas', async () => {
    await expect(initSentryServer('')).resolves.toBeUndefined();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('signale un échec d’initialisation sans casser le démarrage', async () => {
    sentry.init.mockImplementationOnce(() => {
      throw new Error('transport indisponible');
    });
    await expect(initSentryServer(DSN)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('captureRequestError', () => {
  it('délègue au SDK avec les arguments reçus de Next.js', async () => {
    const error = new Error('échec du rendu');
    const request = { path: '/article/1', method: 'GET' };
    const context = { routerKind: 'App Router', routePath: '/article/[slug]' };

    await captureRequestError(error, request as never, context as never);

    expect(sentry.captureRequestError).toHaveBeenCalledWith(error, request, context);
  });

  it('n’échoue pas quand le SDK refuse de rapporter', async () => {
    sentry.captureRequestError.mockRejectedValueOnce(new Error('quota'));
    await expect(
      captureRequestError(new Error('x'), {} as never, {} as never)
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
