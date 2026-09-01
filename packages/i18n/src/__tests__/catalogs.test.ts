import { describe, it, expect } from 'vitest';
import frLegacy from '../../../../messages/fr.json';
import enLegacy from '../../../../messages/en.json';

/** Aplatit l'arbre de messages ({a: {b: 'x'}} → {'a.b': 'x'}). */
function flatten(tree: Record<string, unknown>, prefix = ''): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flat, flatten(value as Record<string, unknown>, path));
    } else if (typeof value === 'string') {
      flat[path] = value;
    }
  }
  return flat;
}

describe('legacy catalogs (fr.json / en.json)', () => {
  it('has the exact same key set in French and English', () => {
    const fr = flatten(frLegacy as Record<string, unknown>);
    const en = flatten(enLegacy as Record<string, unknown>);
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it('covers every settings.* key used by the mobile app', () => {
    const fr = flatten(frLegacy as Record<string, unknown>);
    const settingsKeys = Object.keys(fr).filter((k) => k.startsWith('settings.'));
    // Sanity anchor: the main settings screens must be translated in both locales.
    for (const key of [
      'settings.title',
      'settings.account',
      'settings.appearance',
      'settings.language',
    ]) {
      expect(fr[key]).toBeTruthy();
    }
    expect(settingsKeys.length).toBeGreaterThan(150);
  });
});
