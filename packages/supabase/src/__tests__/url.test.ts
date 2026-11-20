// =====================================================================
// 🔐 resolveSupabaseUrl — garde « un build local ne vise pas la prod »
// =====================================================================
// Ces tests verrouillent la règle qui empêche une page servie en local (dev,
// test, e2e) d'émettre des requêtes vers le Supabase de l'infra partagée
// (`http://116.203.158.47:54321`), exactement comme
// `@qoe/analytics/script-url` le fait pour l'analytics.
// =====================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LOCAL_SUPABASE_URL, resolveSupabaseUrl } from '../url';

const LOCAL_APP = 'http://localhost:3000';
const PROD_APP = 'https://qoe.fi';
const VPS = 'http://116.203.158.47:54321';
const LOCAL_SUPABASE = 'http://localhost:54321';

describe('resolveSupabaseUrl', () => {
  it('remplace une origine Supabase distante sur un build local (régression VPS)', () => {
    expect(resolveSupabaseUrl(VPS, LOCAL_APP)).toBe(LOCAL_SUPABASE_URL);
  });

  it('remplace aussi une origine distante nommée (self-hosted public)', () => {
    expect(resolveSupabaseUrl('https://supabase.qoe.fi', LOCAL_APP)).toBe(LOCAL_SUPABASE_URL);
  });

  it('conserve la valeur fournie sur un build de production', () => {
    expect(resolveSupabaseUrl('https://supabase.qoe.fi', PROD_APP)).toBe('https://supabase.qoe.fi');
  });

  it('conserve un stack Supabase local même sur un build de production', () => {
    expect(resolveSupabaseUrl(LOCAL_SUPABASE, PROD_APP)).toBe(LOCAL_SUPABASE);
    expect(resolveSupabaseUrl('http://127.0.0.1:54321', LOCAL_APP)).toBe('http://127.0.0.1:54321');
  });

  it('replie sur le local quand la valeur est absente, vide ou non-URL', () => {
    for (const value of [undefined, null, '', '   ', 'supabase', '//116.203.158.47:54321']) {
      expect(resolveSupabaseUrl(value, LOCAL_APP)).toBe(LOCAL_SUPABASE_URL);
      expect(resolveSupabaseUrl(value, PROD_APP)).toBe(LOCAL_SUPABASE_URL);
    }
  });

  it('reconnaît les domaines de développement comme des origines locales', () => {
    for (const app of [
      'http://127.0.0.1:8091',
      'http://qoe.test:3000',
      'http://media-clair.qoe.test',
      'http://app.lvh.me:3000',
      'http://editor.localhost:3010',
    ]) {
      expect(resolveSupabaseUrl(VPS, app)).toBe(LOCAL_SUPABASE_URL);
    }
  });

  it("n'inline jamais l'IP publique de l'infra partagée pour un build local", () => {
    const resolved = resolveSupabaseUrl(VPS, LOCAL_APP);
    expect(resolved).not.toContain('116.203.158.47');
    expect(new URL(resolved).hostname).toBe('127.0.0.1');
  });
});

// =====================================================================
// 🚧 Garde structurelle : aucun client ne lit l'URL Supabase en direct
// =====================================================================
// Le défaut d'origine n'était pas une valeur fausse dans `resolveSupabaseUrl`
// mais des lectures brutes dispersées (`createServerClient(process.env…)` dans
// 10 fichiers) qui contournaient toute règle. Ce test échoue dès qu'une de ces
// lectures réapparaît : la protection ne peut plus être court-circuitée par un
// nouveau client.
const ROOT = resolve(__dirname, '../../../..');
// Seuls le schéma de configuration (validation) et ce module (documentation de
// la variable) peuvent nommer la variable.
const ALLOWED = new Set(['packages/config/src/env.ts', 'packages/supabase/src/url.ts']);

/** Vrai si la lecture est passée à `resolveSupabaseUrl` (appel direct). */
function isWrappedReading(content: string, index: number): boolean {
  return content.slice(Math.max(0, index - 160), index).includes('resolveSupabaseUrl(');
}

// Parcours sans `stat` : les arbres natifs (`apps/mobile/ios/Pods`) contiennent
// des liens symboliques cassés qui feraient échouer une marche naïve.
const SKIPPED_DIRS = new Set(['node_modules', '.next', 'dist', 'Pods', 'ios', 'android']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      sourceFiles(full, out);
      continue;
    }
    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/(\.test\.|\.spec\.|vitest\.)/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

describe('lecture de NEXT_PUBLIC_SUPABASE_URL', () => {
  it('passe toujours par resolveSupabaseUrl (aucune lecture brute dans apps/ et packages/)', () => {
    const offenders: string[] = [];
    for (const dir of ['apps', 'packages']) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const rel = relative(ROOT, file).replaceAll('\\', '/');
        if (!rel.includes('/src/')) continue;
        if (ALLOWED.has(rel)) continue;
        const content = readFileSync(file, 'utf8');
        const needle = 'process.env.NEXT_PUBLIC_SUPABASE_URL';
        for (let i = content.indexOf(needle); i !== -1; i = content.indexOf(needle, i + 1)) {
          if (!isWrappedReading(content, i)) {
            offenders.push(rel);
            break;
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
