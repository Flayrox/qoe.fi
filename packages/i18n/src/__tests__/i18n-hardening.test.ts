import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fallbackTranslate, getI18n } from '../core';
import { buildLocaleCookie } from '../cookie';
import {
  getCachedOverrides,
  getStaticTranslations,
  parseOverridesPayload,
  translateKey,
} from '../server';

// `unstable_cache` exige le runtime Next : on l'identité pour tester la
// logique de chargement (timeout, validation du payload) en node pur.
vi.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn,
}));

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(payload: unknown, ok = true) {
  return { ok, json: async () => payload } as unknown as Response;
}

describe('@qoe/i18n — durcissement (L13)', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    process.env.QOE_API_URL = 'https://api.test';
    fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.QOE_API_URL;
    vi.restoreAllMocks();
  });

  // ── F1 : les overrides DB doivent gagner sur le catalogue ──────────
  it('applique un override plat sur une clé déjà traduite', async () => {
    expect(
      translateKey('fr', 'common.save', 'Enregistrer', undefined, {
        fr: { 'common.save': 'Perso' },
      })
    ).toBe('Perso');
  });

  it('compile les paramètres ICU contenus dans un override', async () => {
    expect(
      translateKey(
        'fr',
        'common.save',
        'Enregistrer',
        { n: 2 },
        { fr: { 'common.save': 'Enreg. {n}' } }
      )
    ).toBe('Enreg. 2');
  });

  // ── F2 : un override imbriqué (format legacy) doit s'aplatir ───────
  it('applique un override imbriqué', async () => {
    expect(
      translateKey('fr', 'common.save', 'Enregistrer', undefined, {
        fr: { common: { save: 'Perso' } },
      })
    ).toBe('Perso');
  });

  // ── F3 : un override ne doit pas contaminer les appels suivants ────
  it("n'écrase pas durablement le catalogue partagé", async () => {
    translateKey('fr', 'common.save', 'Enregistrer', undefined, { fr: { 'common.save': 'Perso' } });
    expect(translateKey('fr', 'common.save', 'Enregistrer')).toBe('Enregistrer');
  });

  // ── F4 : `translateKey` ne doit pas activer la locale globale ──────
  it("ne mute pas la locale de l'instance Lingui partagée", async () => {
    expect(translateKey('en', 'greeting', 'Hello {name}', { name: 'Al' })).toBe('Hello Al');
    expect(getI18n().locale).toBe('fr');
  });

  // ── F5 : payload d'overrides invalide toléré ───────────────────────
  it('tolère des overrides nuls sans lever', async () => {
    expect(translateKey('fr', 'common.save', 'Enregistrer', undefined, null)).toBe('Enregistrer');
  });

  // ── F6 : validation + timeout du fetch d'overrides ─────────────────
  it('valide le payload TRANSLATIONS_OVERRIDE', async () => {
    expect(parseOverridesPayload('null')).toEqual({});
    expect(parseOverridesPayload('[1,2]')).toEqual({});
    expect(parseOverridesPayload('"texte"')).toEqual({});
    expect(parseOverridesPayload('{invalide')).toEqual({});
    expect(parseOverridesPayload(undefined)).toEqual({});
    expect(parseOverridesPayload('{"fr":{"common.save":"Perso"}}')).toEqual({
      fr: { 'common.save': 'Perso' },
    });
  });

  it("borne l'appel réseau des overrides par un AbortSignal", async () => {
    await getCachedOverrides();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("ignore un payload d'overrides non exploitable côté fetch", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ TRANSLATIONS_OVERRIDE: 'null' } as unknown as Record<string, string>)
    );
    await expect(getCachedOverrides()).resolves.toEqual({});
  });

  // ── F7 : une seule source de catalogues ────────────────────────────
  it('ne duplique pas la construction des catalogues', () => {
    const duplicated = ['provider.tsx', 'server.ts'].filter((file) =>
      /const\s+catalogs:\s*Record<string,\s*Record<string,\s*string>>\s*=/.test(
        readFileSync(join(__dirname, '..', file), 'utf8')
      )
    );
    expect(duplicated).toEqual([]);
  });

  // ── F8 : repli hors provider avec interpolation ────────────────────
  it('interpole les params dans le repli sans provider', async () => {
    expect(fallbackTranslate('greeting', 'Bonjour {name}', { name: 'Al' })).toBe('Bonjour Al');
    expect(fallbackTranslate('greeting', 'Bonjour {name}')).toBe('Bonjour {name}');
    expect(fallbackTranslate('greeting')).toBe('greeting');
  });

  // ── F9 : cookie de locale validé ───────────────────────────────────
  it('construit un cookie de locale sûr', async () => {
    expect(buildLocaleCookie('fr', 'qoe.fi', true)).toBe(
      'x-locale=fr;path=/;max-age=31536000;domain=.qoe.fi;SameSite=Lax;Secure'
    );
    expect(buildLocaleCookie('en', 'localhost', false)).toBe(
      'x-locale=en;path=/;max-age=31536000;SameSite=Lax'
    );
    expect(buildLocaleCookie('fr; x-locale=en', 'qoe.fi', true)).toBeNull();
    expect(buildLocaleCookie('de', 'qoe.fi', true)).toBeNull();
    // Le sous-domaine partage le cookie, le domaine sosie non.
    expect(buildLocaleCookie('en', 'studio.qoe.fi', false)).toBe(
      'x-locale=en;path=/;max-age=31536000;domain=.qoe.fi;SameSite=Lax'
    );
    expect(buildLocaleCookie('en', 'evilqoe.fi', false)).toBe(
      'x-locale=en;path=/;max-age=31536000;SameSite=Lax'
    );
  });

  // ── F10 : la traduction ne recharge pas le catalogue à chaque appel ─
  it('ne recharge pas le catalogue à chaque traduction', async () => {
    const loadSpy = vi.spyOn(getI18n(), 'load');
    for (let i = 0; i < 50; i += 1) {
      translateKey('fr', 'common.save', 'Enregistrer');
    }
    expect(loadSpy).toHaveBeenCalledTimes(0);
  });

  // ── F11 : overrides imbriqués pris en compte par le provider client ─
  it('aplatit les overrides imbriqués dans les traductions statiques', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        TRANSLATIONS_OVERRIDE: JSON.stringify({ fr: { common: { save: 'Perso' } } }),
      } as unknown as Record<string, string>)
    );
    const { loadTranslations } = await getStaticTranslations('fr');
    const messages = (await loadTranslations()) as Record<string, unknown>;
    expect(messages['common.save']).toBe('Perso');
    expect(typeof messages.common).toBe('undefined');
  });
});
