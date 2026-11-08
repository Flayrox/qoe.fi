import { describe, expect, it } from 'vitest';
import {
  PLATFORM_SURFACES,
  canAccessSurfacePath,
  getCmdKSurfaces,
  getHotkeySurfaces,
  getSidebarSurfaces,
} from '../surfaces';
import { routes } from '../routes';

describe('PLATFORM_SURFACES', () => {
  it('ne déclare aucun identifiant en double', () => {
    const ids = PLATFORM_SURFACES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tous les chemins sont absolus', () => {
    for (const surface of PLATFORM_SURFACES) {
      expect(surface.path.startsWith('/')).toBe(true);
    }
  });

  it('les chemins viennent du registre de routes', () => {
    const byId = new Map(PLATFORM_SURFACES.map((s) => [s.id, s.path]));
    expect(byId.get('studio.articles')).toBe(routes.studio.articles.list());
    expect(byId.get('studio.new-article')).toBe(routes.studio.articles.new());
    expect(byId.get('reader.home')).toBe(routes.feed.home());
    expect(byId.get('reader.bookmarks')).toBe(routes.feed.library('bookmarks'));
    expect(byId.get('reader.settings')).toBe(routes.feed.settings());
  });

  it('chaque surface a une section et au moins un mot-clé', () => {
    for (const surface of PLATFORM_SURFACES) {
      expect(surface.section.length).toBeGreaterThan(0);
      expect(surface.keywords.length).toBeGreaterThan(0);
      expect(surface.defaultLabel.length).toBeGreaterThan(0);
    }
  });

  it('un raccourci clavier est unique dans un même scope', () => {
    for (const scope of ['studio', 'reader'] as const) {
      const keys = getHotkeySurfaces(scope).map((s) => s.hotkey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('getSidebarSurfaces', () => {
  it('ne garde que les surfaces de sidebar du scope demandé', () => {
    const studio = getSidebarSurfaces('studio');
    expect(studio.every((s) => s.scope === 'studio' && s.showInSidebar)).toBe(true);
    expect(studio.map((s) => s.id)).not.toContain('studio.new-article');
    expect(getSidebarSurfaces('reader').map((s) => s.id)).toContain('reader.bookmarks');
  });

  it('masque les surfaces dont la permission manque', () => {
    const ids = getSidebarSurfaces('studio', ['articles:read']).map((s) => s.id);
    expect(ids).toContain('studio.articles');
    expect(ids).not.toContain('studio.pricing');
    expect(ids).not.toContain('studio.developer');
    expect(ids).not.toContain('studio.settings');
  });

  it('sans liste de permissions, ne filtre rien', () => {
    const ids = getSidebarSurfaces('studio').map((s) => s.id);
    expect(ids).toContain('studio.pricing');
  });
});

describe('getCmdKSurfaces', () => {
  it('inclut les actions hors sidebar mais exclut les surfaces non Cmd+K', () => {
    const ids = getCmdKSurfaces('studio').map((s) => s.id);
    expect(ids).toContain('studio.new-article');
    expect(ids).toContain('studio.import');
    expect(ids.every((id) => PLATFORM_SURFACES.some((s) => s.id === id && s.showInCmdK))).toBe(
      true
    );
  });

  it('applique le RBAC quand les permissions sont fournies', () => {
    const ids = getCmdKSurfaces('studio', ['articles:write']).map((s) => s.id);
    expect(ids).toContain('studio.new-article');
    expect(ids).not.toContain('studio.analytics');
  });
});

describe('canAccessSurfacePath', () => {
  it('autorise un chemin inconnu du manifeste', () => {
    expect(canAccessSurfacePath('studio', '/route-inconnue', [])).toBe(true);
  });

  it('refuse une surface protégée sans permission', () => {
    expect(canAccessSurfacePath('studio', '/pricing', [])).toBe(false);
    expect(canAccessSurfacePath('studio', '/developer', ['articles:read'])).toBe(false);
  });

  it('autorise dès que la permission est présente', () => {
    expect(canAccessSurfacePath('studio', '/pricing', ['billing:manage'])).toBe(true);
    expect(canAccessSurfacePath('studio', '/articles', ['articles:read'])).toBe(true);
  });

  it('reconnaît les sous-chemins sans confondre les préfixes', () => {
    expect(canAccessSurfacePath('studio', '/articles/new', [])).toBe(false);
    expect(canAccessSurfacePath('studio', '/articles/new', ['articles:write'])).toBe(true);
    expect(canAccessSurfacePath('studio', '/articles-archivees', [])).toBe(true);
  });

  it('ne mélange pas les scopes', () => {
    expect(canAccessSurfacePath('reader', '/pricing', [])).toBe(true);
  });
});
