import { describe, expect, it } from 'vitest';
import { flattenSettingsTree, settingsTree } from '../settingsTree';

describe('settingsTree — liens profonds', () => {
  const items = flattenSettingsTree(settingsTree);
  const pathOf = (id: string) => items.find((item) => item.id === id)?.path;

  it('pointe chaque section vers /settings avec son ancre, sans doubler le chemin', () => {
    expect(pathOf('navigation-categories')).toBe('/settings#categories');
    expect(pathOf('navigation-links')).toBe('/settings#links');
    expect(pathOf('seo-meta')).toBe('/settings#meta');
    expect(pathOf('seo-indexing')).toBe('/settings#indexing');
    expect(pathOf('seo-social')).toBe('/settings#social');
  });

  it('ne produit jamais de chemin doublé', () => {
    for (const item of items) {
      expect(item.path).not.toContain('/settings/settings');
      expect(item.path.startsWith('/settings')).toBe(true);
    }
  });
});
