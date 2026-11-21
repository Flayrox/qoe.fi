import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage } from 'node:http';
import * as configModule from './config';
import * as serverModule from './server';

describe('extractClientIp (anti-spoofing)', () => {
  const makeRequest = (headers: Record<string, string>, remoteAddress = '10.1.2.3') =>
    ({
      headers,
      socket: { remoteAddress },
    }) as unknown as IncomingMessage;

  it('ignore x-forwarded-for et x-real-ip quand trustProxy=false (défaut)', () => {
    const fn = (
      serverModule as unknown as {
        extractClientIp?: (req?: IncomingMessage, trustProxy?: boolean) => string;
      }
    ).extractClientIp;
    expect(fn).toBeTypeOf('function');

    const req = makeRequest(
      {
        'x-forwarded-for': '198.51.100.99, 203.0.113.1',
        'x-real-ip': '198.51.100.77',
      },
      '10.1.2.3'
    );
    expect(fn!(req, false)).toBe('10.1.2.3');
    expect(fn!(req)).toBe('10.1.2.3');
  });

  it('utilise x-real-ip sinon le dernier saut de x-forwarded-for quand trustProxy=true', () => {
    const fn = (
      serverModule as unknown as {
        extractClientIp?: (req?: IncomingMessage, trustProxy?: boolean) => string;
      }
    ).extractClientIp!;

    const reqReal = makeRequest({
      'x-real-ip': '203.0.113.50',
      'x-forwarded-for': '198.51.100.99, 203.0.113.10',
    });
    expect(fn(reqReal, true)).toBe('203.0.113.50');

    const reqXff = makeRequest({
      'x-forwarded-for': '198.51.100.99, 203.0.113.10',
    });
    expect(fn(reqXff, true)).toBe('203.0.113.10');
  });
});

describe('loadConfig et validateProductionConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.COLLAB_PORT;
    delete process.env.DATABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.COLLAB_TRUST_PROXY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('retombe sur 15406 si COLLAB_PORT est invalide ou hors [1, 65535]', () => {
    for (const bad of ['abc', '0', '-5', '99999']) {
      process.env.COLLAB_PORT = bad;
      expect(configModule.loadConfig().port).toBe(15406);
    }
    process.env.COLLAB_PORT = '15500';
    expect(configModule.loadConfig().port).toBe(15500);
  });

  it('n’expose jamais SUPABASE_SERVICE_ROLE_KEY dans supabaseAnonKey', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret-role-key';
    const cfg = configModule.loadConfig();
    expect(cfg.supabaseAnonKey).toBe('');
  });

  it('lit COLLAB_TRUST_PROXY=true dans trustProxy', () => {
    expect((configModule.loadConfig() as unknown as { trustProxy?: boolean }).trustProxy).toBe(
      false
    );
    process.env.COLLAB_TRUST_PROXY = 'true';
    expect((configModule.loadConfig() as unknown as { trustProxy?: boolean }).trustProxy).toBe(
      true
    );
  });

  it('validateProductionConfig échoue en production si DATABASE_URL ou SUPABASE_URL manque', () => {
    const validate = (
      configModule as unknown as {
        validateProductionConfig?: (cfg: configModule.CollabConfig, nodeEnv?: string) => string[];
      }
    ).validateProductionConfig;
    expect(validate).toBeTypeOf('function');

    const cfg = configModule.loadConfig();
    expect(validate!(cfg, 'development')).toEqual([]);

    const prodErrors = validate!(cfg, 'production');
    // Trois exigences en production : base, URL d'introspection, clé anon.
    expect(prodErrors).toHaveLength(3);
    expect(prodErrors.join('\n')).toContain('DATABASE_URL');
    expect(prodErrors.join('\n')).toContain('SUPABASE_URL');
    expect(prodErrors.join('\n')).toContain('SUPABASE_ANON_KEY');

    expect(
      validate!(
        {
          ...cfg,
          databaseUrl: 'postgresql://db',
          supabaseUrl: 'https://supa.local',
          supabaseAnonKey: 'anon-key',
        },
        'production'
      )
    ).toEqual([]);
  });

  it('validateProductionConfig exige la clé anon (sinon toute connexion est refusée)', () => {
    // Sans clé anon, l'introspection part avec le JWT du client en `apikey`,
    // que Supabase refuse : le serveur démarre et refuse **toutes** les
    // connexions avec un message trompeur (« token invalide »).
    const cfg = configModule.loadConfig();
    const errors = configModule.validateProductionConfig(
      {
        ...cfg,
        databaseUrl: 'postgresql://db',
        supabaseUrl: 'https://supa.local',
        supabaseAnonKey: '',
      },
      'production'
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('SUPABASE_ANON_KEY');
  });
});
