import { describe, it, expect } from 'vitest';
import { getI18n, setActiveLanguage, flattenMessages, createTranslator } from '../core';
import frMessages from '../../../../messages/fr.json';

describe('@qoe/i18n core (Lingui)', () => {
  it('flattens nested messages', () => {
    const flat = flattenMessages({ common: { save: 'Enregistrer' } });
    expect(flat['common.save']).toBe('Enregistrer');
  });

  it('translates from the catalogue by key', () => {
    const i18n = getI18n();
    setActiveLanguage('fr', flattenMessages(frMessages as Record<string, unknown>));
    const t = createTranslator(i18n);
    expect(t('common.save')).toBe('Enregistrer');
  });

  it('falls back to default FR text when key is missing', () => {
    const i18n = getI18n();
    setActiveLanguage('fr', {});
    const t = createTranslator(i18n);
    expect(t('nonexistent.key', 'Texte par défaut')).toBe('Texte par défaut');
  });

  it('interpolates ICU params', () => {
    const i18n = getI18n();
    setActiveLanguage('fr', {});
    const t = createTranslator(i18n);
    expect(t('hello', 'Bonjour {name}', { name: 'Alice' })).toBe('Bonjour Alice');
  });

  it('supports ICU plurals', () => {
    const i18n = getI18n();
    setActiveLanguage('fr', {});
    const t = createTranslator(i18n);
    const msg = '{count, plural, one {# article} other {# articles}}';
    expect(t('plur', msg, { count: 1 })).toBe('1 article');
    expect(t('plur', msg, { count: 3 })).toBe('3 articles');
  });
});
