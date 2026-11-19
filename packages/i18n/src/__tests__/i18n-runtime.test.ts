import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS, CATALOG_LOCALES, getCatalog } from '../catalogs';

// ── Doublures Next ────────────────────────────────────────────────────
// `unstable_cache` exige le runtime Next ; `next/headers` n'existe pas hors
// requête. Les deux sont remplacés pour exercer la logique réelle.
let cookieValue: string | undefined;
let headerValue: string | null;

vi.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'x-locale' && cookieValue ? { value: cookieValue } : undefined,
  }),
  headers: async () => ({
    get: (name: string) => (name === 'x-locale' ? headerValue : null),
  }),
}));

describe('@qoe/i18n — runtime serveur (L13)', () => {
  beforeEach(() => {
    cookieValue = undefined;
    headerValue = null;
    process.env.QOE_API_URL = 'https://api.test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response)
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.QOE_API_URL;
  });

  it('expose un catalogue par locale et un repli par défaut', () => {
    expect(CATALOG_LOCALES.sort()).toEqual(['en', 'fr']);
    expect(getCatalog('fr')).toBe(CATALOGS.fr);
    // Locale sans catalogue : repli sur la locale par défaut, jamais undefined.
    expect(getCatalog('de')).toBe(CATALOGS.fr);
  });

  it('détecte la langue par cookie, puis par header, puis par défaut', async () => {
    const { getLanguage } = await import('../server');

    cookieValue = 'en';
    headerValue = 'en';
    await expect(getLanguage()).resolves.toBe('en');

    // Cookie inconnu → header valide.
    cookieValue = 'klingon';
    headerValue = 'en';
    await expect(getLanguage()).resolves.toBe('en');

    // Ni cookie ni header exploitables → défaut.
    cookieValue = undefined;
    headerValue = null;
    await expect(getLanguage()).resolves.toBe('fr');
  });

  it('conserve la priorité du cookie sur le header', async () => {
    const { getLanguage } = await import('../server');
    cookieValue = 'fr';
    headerValue = 'en';
    await expect(getLanguage()).resolves.toBe('fr');
  });

  it('applique les overrides chargés dans getTranslate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({
              TRANSLATIONS_OVERRIDE: JSON.stringify({ fr: { 'common.save': 'Perso' } }),
            }),
          }) as unknown as Response
      )
    );
    const { getTranslate } = await import('../server');
    const t = await getTranslate();
    expect(t('common.save', 'Enregistrer')).toBe('Perso');
  });

  it('retombe sur la langue détectée quand aucune n’est fournie', async () => {
    cookieValue = 'en';
    const { getStaticTranslations, initI18n } = await import('../server');

    const { loadTranslations } = await getStaticTranslations();
    const messages = (await loadTranslations()) as Record<string, string>;
    expect(messages['common.save']).toBe(CATALOGS.en['common.save']);

    await expect(initI18n()).resolves.toBe('en');
    cookieValue = undefined;
    await initI18n('fr');
  });

  it('recharge le français si le singleton Lingui a été laissé ailleurs', async () => {
    vi.resetModules();
    const core = await import('../core');
    const { i18n } = await import('@lingui/core');
    i18n.activate('en');
    // `getI18n` doit rattraper l'écart avant de rendre le singleton.
    expect(core.getI18n().locale).toBe('fr');
  });

  it('retombe sur le message par défaut si le message ICU est invalide', async () => {
    // Lingui journalise l'erreur de syntaxe ICU : on la capture pour garder
    // la sortie de test propre, et on vérifie qu'aucune exception ne fuit.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getI18n, createTranslator } = await import('../core');
    const t = createTranslator(getI18n());
    expect(t('icu.casse', 'Bonjour {name')).toBe('Bonjour {name');
    errorSpy.mockRestore();
  });

  it("ignore l'API d'overrides quand l'appel réseau échoue", async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      })
    );
    const { getCachedOverrides } = await import('../server');
    await expect(getCachedOverrides()).resolves.toEqual({});
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('active la locale demandée dans initI18n et la retourne', async () => {
    const { initI18n } = await import('../server');
    const { getI18n } = await import('../core');
    await expect(initI18n('en')).resolves.toBe('en');
    expect(getI18n().locale).toBe('en');
    // Remise en état pour les autres suites.
    await initI18n('fr');
    expect(getI18n().locale).toBe('fr');
  });
});
