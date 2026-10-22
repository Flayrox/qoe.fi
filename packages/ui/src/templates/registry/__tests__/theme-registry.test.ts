import { describe, it, expect } from 'vitest';
import { resolveTheme, THEME_REGISTRY } from '../index';

describe('Theme Archetype Registry', () => {
  it('expose uniquement le thème minimal', () => {
    const minimal = resolveTheme('minimal');
    expect(minimal.id).toBe('minimal');
    expect(minimal.name).toBe('Minimal Craft');
    expect(minimal.suppressInternalNavbar).toBe(true);
    expect(minimal.Shell).toBeDefined();
    expect(Object.keys(THEME_REGISTRY)).toEqual(['minimal']);
  });

  it('force minimal pour tous les identifiants historiques ou inconnus', () => {
    for (const id of [
      null,
      undefined,
      'editorial',
      'magazine',
      'standard',
      'dispatch',
      'inconnu',
    ]) {
      expect(resolveTheme(id).id).toBe('minimal');
    }
  });

  it('contient un layout home et article valide', () => {
    Object.values(THEME_REGISTRY).forEach((theme) => {
      expect(theme.defaultLayouts.home.blocks.length).toBeGreaterThan(0);
      expect(theme.defaultLayouts.article.blocks.length).toBeGreaterThan(0);
    });
  });
});
