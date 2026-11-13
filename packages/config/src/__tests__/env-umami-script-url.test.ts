// =====================================================================
// 🧪 env — NEXT_PUBLIC_UMAMI_SCRIPT_URL (non-régression « This page couldn't load »)
// =====================================================================
// Le build CI injecte `/_q/m.js` (proxy first-party Caddy). Un schéma `z.string().url()`
// rejetait ce chemin relatif : parseEnv() levait côté navigateur et TOUTES les pages
// affichaient « This page couldn't load ». Ce test verrouille le contrat.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseEnv } from '../env';

function stubClientEnv(scriptUrl: string | undefined) {
  vi.stubGlobal('window', {});
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth.example.com');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('NEXT_PUBLIC_UMAMI_SCRIPT_URL', scriptUrl ?? '');
}

describe('parseEnv (navigateur) — NEXT_PUBLIC_UMAMI_SCRIPT_URL', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('accepte le chemin first-party /_q/m.js injecté par le build CI', () => {
    stubClientEnv('/_q/m.js');
    expect(parseEnv().NEXT_PUBLIC_UMAMI_SCRIPT_URL).toBe('/_q/m.js');
  });

  it('accepte une URL absolue https', () => {
    stubClientEnv('https://umami.qoe.fi/script.js');
    expect(parseEnv().NEXT_PUBLIC_UMAMI_SCRIPT_URL).toBe('https://umami.qoe.fi/script.js');
  });

  it('accepte une valeur absente (optionnelle)', () => {
    stubClientEnv(undefined);
    expect(parseEnv().NEXT_PUBLIC_UMAMI_SCRIPT_URL).toBeUndefined();
  });

  it('refuse le protocole-relatif //hôte (script tiers implicite)', () => {
    stubClientEnv('//evil.example/m.js');
    expect(() => parseEnv()).toThrow('Invalid client-side environment variables');
  });

  it('refuse une valeur ni URL ni chemin', () => {
    stubClientEnv('m.js');
    expect(() => parseEnv()).toThrow('Invalid client-side environment variables');
  });
});
