import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Doublure minimale de la frontière ioredis ─────────────────────────
// On n'imite pas le protocole : on expose uniquement les commandes utilisées
// par `redis.ts` pour vérifier QUELLES commandes le module émet.
const redisMock = vi.hoisted(() => ({
  get: vi.fn<(key: string) => Promise<string | null>>(async () => null),
  set: vi.fn<(key: string, value: string, mode: string, ttlSeconds: number) => Promise<string>>(
    async () => 'OK'
  ),
  del: vi.fn<(keys: string[]) => Promise<number>>(async () => 1),
  scanStream: vi.fn(),
  connect: vi.fn(async () => undefined),
  on: vi.fn<(event: string, handler: (err: Error) => void) => void>(),
}));

vi.mock('ioredis', () => ({
  // Un constructeur qui rend le faux client (ioredis est instancié avec `new`).
  default: function MockIORedis() {
    return redisMock;
  },
}));

function scanBatches(batches: string[][]) {
  return async function* generate() {
    for (const batch of batches) {
      yield batch;
    }
  };
}

describe('@qoe/observability — logger incassable (L16)', () => {
  const consoleSpies = {
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    const { setSentryCapture } = await import('../logger');
    setSentryCapture(null);
  });

  it('ne lève pas sur un contexte circulaire (et journalise quand même)', async () => {
    const { logger } = await import('../logger');
    const circular: Record<string, unknown> = { articleId: 'a-1' };
    circular.self = circular;

    expect(() => logger.error('Contexte circulaire', { circular })).not.toThrow();

    expect(consoleSpies.error).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(consoleSpies.error.mock.calls[0]?.[0])) as {
      message: string;
      context: { circular: { articleId: string } };
    };
    expect(entry.message).toBe('Contexte circulaire');
    // Le contexte reste exploitable : la valeur cyclique est remplacée.
    expect(entry.context.circular.articleId).toBe('a-1');
  });

  it('ne lève pas si le captureur Sentry échoue, et journalise quand même', async () => {
    const { logger, setSentryCapture } = await import('../logger');
    setSentryCapture(() => {
      throw new Error('Sentry indisponible');
    });

    expect(() => logger.error('Capture HS', { articleId: 'a-1' }, { capture: true })).not.toThrow();
    expect(consoleSpies.error).toHaveBeenCalledTimes(1);
  });

  it('sérialise les BigInt sans lever', async () => {
    const { logger } = await import('../logger');
    expect(() => logger.warn('Compteur', { total: BigInt(42) })).not.toThrow();
    expect(consoleSpies.warn).toHaveBeenCalledTimes(1);
  });

  it("conserve le message d'une Error dans le contexte", async () => {
    const { logger } = await import('../logger');
    logger.warn('Échec aval', { err: new Error('DB connection refused') });

    const entry = JSON.parse(String(consoleSpies.warn.mock.calls[0]?.[0])) as {
      context: { err: { message: string } };
    };
    // `JSON.stringify(new Error(...))` rend `{}` : la cause disparaissait du log.
    expect(entry.context.err.message).toBe('DB connection refused');
  });
});

describe('@qoe/observability — DSN résolu à l’exécution (L16)', () => {
  const originalDsn = process.env.SENTRY_DSN;
  const originalPublicDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  afterEach(() => {
    vi.resetModules();
    if (originalDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = originalDsn;
    if (originalPublicDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = originalPublicDsn;
  });

  it('prend en compte un DSN défini après le chargement du module', async () => {
    vi.resetModules();
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    const sentry = await import('../sentry');
    expect(sentry.sentryEnabled()).toBe(false);

    process.env.SENTRY_DSN = 'https://server@o1.ingest.sentry.io/1';

    expect(sentry.sentryDsn()).toBe('https://server@o1.ingest.sentry.io/1');
    expect(sentry.sentryEnabled()).toBe(true);
  });

  it('accepte le DSN public pour le navigateur', async () => {
    vi.resetModules();
    delete process.env.SENTRY_DSN;
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://public@o2.ingest.sentry.io/2';
    const sentry = await import('../sentry');

    // Sans `NEXT_PUBLIC_*`, Next.js ne transmet RIEN au navigateur :
    // `initSentryClient()` ne pouvait donc jamais s'initialiser en production.
    expect(sentry.sentryDsn()).toBe('https://public@o2.ingest.sentry.io/2');
  });
});

describe('@qoe/observability — initialisation Sentry (L16)', () => {
  it('reste no-op sans DSN, puis initialise avec le DSN fourni', async () => {
    const nextInit = vi.fn();
    vi.doMock('@sentry/nextjs', () => ({ init: nextInit }));
    vi.resetModules();
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    const sentry = await import('../sentry');
    sentry.initSentryServer();
    await Promise.resolve();
    expect(nextInit).not.toHaveBeenCalled();

    sentry.initSentryServer('https://k@o3.ingest.sentry.io/3');
    await vi.waitFor(() => expect(nextInit).toHaveBeenCalledTimes(1));
    expect(nextInit.mock.calls[0]?.[0]).toMatchObject({
      dsn: 'https://k@o3.ingest.sentry.io/3',
      debug: false,
    });
  });

  it('initialise le client avec les options de replay', async () => {
    const nextInit = vi.fn();
    vi.doMock('@sentry/nextjs', () => ({ init: nextInit }));
    vi.resetModules();

    const sentry = await import('../sentry');
    sentry.initSentryClient('https://public@o4.ingest.sentry.io/4');

    await vi.waitFor(() => expect(nextInit).toHaveBeenCalledTimes(1));
    expect(nextInit.mock.calls[0]?.[0]).toMatchObject({
      dsn: 'https://public@o4.ingest.sentry.io/4',
      replaysOnErrorSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
    });
  });

  it('initialise le runtime Node pur', async () => {
    const nodeInit = vi.fn();
    vi.doMock('@sentry/node', () => ({ init: nodeInit }));
    vi.resetModules();

    const sentry = await import('../sentry');
    sentry.initSentryNode('https://node@o5.ingest.sentry.io/5');

    await vi.waitFor(() => expect(nodeInit).toHaveBeenCalledTimes(1));
  });

  afterEach(() => {
    vi.doUnmock('@sentry/nextjs');
    vi.doUnmock('@sentry/node');
    vi.resetModules();
  });
});

describe('@qoe/observability — cache Redis : commandes émises (L16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.get.mockResolvedValue(null);
  });

  afterEach(async () => {
    const { setCacheDisabled } = await import('../redis');
    setCacheDisabled(false);
    vi.resetModules();
  });

  it('sérialise les Date en ISO avant écriture', async () => {
    const { cacheSet } = await import('../redis');
    const at = new Date('2026-11-19T10:00:00.000Z');

    await cacheSet('feed:last', { at }, 60);

    expect(redisMock.set).toHaveBeenCalledWith(
      'feed:last',
      JSON.stringify({ at: '2026-11-19T10:00:00.000Z' }),
      'EX',
      60
    );
  });

  it('rend null sur valeur absente ou JSON corrompu', async () => {
    const { cacheGet } = await import('../redis');

    redisMock.get.mockResolvedValueOnce(null);
    await expect(cacheGet('absent')).resolves.toBeNull();

    redisMock.get.mockResolvedValueOnce('{pas du json');
    await expect(cacheGet('corrompu')).resolves.toBeNull();

    redisMock.get.mockResolvedValueOnce(JSON.stringify([1, 2]));
    await expect(cacheGet<number[]>('liste')).resolves.toEqual([1, 2]);
  });

  it('supprime les clés demandées, et rien sans clé', async () => {
    const { cacheDel } = await import('../redis');

    await cacheDel();
    expect(redisMock.del).not.toHaveBeenCalled();

    await cacheDel('a', 'b');
    expect(redisMock.del).toHaveBeenCalledTimes(1);
  });

  it('écrit le résultat dans le cache après un miss', async () => {
    const { withCache } = await import('../redis');

    await withCache('feed:new', 30, async () => ({ posts: [] }));

    expect(redisMock.set).toHaveBeenCalledTimes(1);
    expect(String(redisMock.set.mock.calls[0]?.[0])).toBe('feed:new');
  });
});

describe('@qoe/observability — garde-fous du cache Redis (L16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Un générateur NEUF par appel : un générateur partagé s'épuise au premier scan.
    redisMock.scanStream.mockImplementation(() => scanBatches([['feed:a', 'feed:b']])());
  });

  afterEach(async () => {
    const { setCacheDisabled } = await import('../redis');
    setCacheDisabled(false);
    vi.resetModules();
  });

  it("n'efface pas tout Redis avec un préfixe vide", async () => {
    const { cacheInvalidateNamespace } = await import('../redis');

    await cacheInvalidateNamespace('');
    await cacheInvalidateNamespace('   ');

    expect(redisMock.scanStream).not.toHaveBeenCalled();
    expect(redisMock.del).not.toHaveBeenCalled();
  });

  it('invalide bien un namespace non vide', async () => {
    const { cacheInvalidateNamespace } = await import('../redis');

    await cacheInvalidateNamespace('feed:');

    expect(redisMock.scanStream).toHaveBeenCalledWith({ match: 'feed:*', count: 100 });
    expect(redisMock.del).toHaveBeenCalledTimes(1);
  });

  it('sert la valeur cachée sans rappeler la fonction', async () => {
    redisMock.get.mockResolvedValueOnce(JSON.stringify({ posts: [7] }));
    const { withCache } = await import('../redis');
    const fn = vi.fn(async () => ({ posts: [1] }));

    const result = await withCache('feed:trending:20', 30, fn);

    expect(result).toEqual({ posts: [7] });
    expect(fn).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});
