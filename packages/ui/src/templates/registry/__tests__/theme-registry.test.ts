import { describe, it, expect } from 'vitest';
import { resolveTheme, THEME_REGISTRY } from '../index';

describe('Theme Archetype Registry', () => {
  it('resolves registered themes correctly', () => {
    const minimal = resolveTheme('minimal');
    expect(minimal.id).toBe('minimal');
    expect(minimal.name).toBe('Minimal Craft');
    expect(minimal.suppressInternalNavbar).toBe(true);
    expect(minimal.Shell).toBeDefined();

    const standard = resolveTheme('standard');
    expect(standard.id).toBe('standard');
    expect(standard.Shell).toBeDefined();

    const magazine = resolveTheme('magazine');
    expect(magazine.id).toBe('magazine');

    const dispatch = resolveTheme('dispatch');
    expect(dispatch.id).toBe('dispatch');
    expect(dispatch.name).toBe('Dispatch Publication');
    expect(dispatch.suppressInternalNavbar).toBe(true);
    expect(dispatch.variants?.home.newspaper).toBeDefined();
    expect(dispatch.variants?.home.magaziney).toBeDefined();
  });

  it('falls back to standard theme when archetype is missing or unknown', () => {
    expect(resolveTheme(null).id).toBe('standard');
    expect(resolveTheme(undefined).id).toBe('standard');
    expect(resolveTheme('unknown_nonexistent_theme').id).toBe('standard');
  });

  it('contains valid defaultLayouts for home and article in each theme', () => {
    Object.values(THEME_REGISTRY).forEach((theme) => {
      expect(theme.defaultLayouts).toBeDefined();
      expect(theme.defaultLayouts.home).toBeDefined();
      expect(theme.defaultLayouts.article).toBeDefined();
      expect(theme.defaultLayouts.home.blocks.length).toBeGreaterThan(0);
      expect(theme.defaultLayouts.article.blocks.length).toBeGreaterThan(0);
    });
  });
});
