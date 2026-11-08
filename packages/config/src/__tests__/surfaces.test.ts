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

  it('n’utilise que des permissions média réelles', () => {
    const known = new Set([
      'media:manage_members',
      'media:manage_settings',
      'media:manage_billing',
      'media:manage_categories',
      'media:manage_newsletter',
      'media:publish:any',
      'media:edit:any',
      'media:delete:any',
      'media:review',
      'media:view_analytics',
      'media:create_articles',
      'media:edit_own',
      'api_keys:manage',
      'subscribers:import_request',
    ]);
    for (const surface of PLATFORM_SURFACES) {
      if (surface.requiredPermission) {
        expect(known.has(surface.requiredPermission)).toBe(true);
      }
    }
  });
});

describe('getSidebarSurfaces', () => {
  it('respecte l’ordre de la sidebar Studio', () => {
    expect(getSidebarSurfaces('studio').map((s) => s.id)).toEqual([
      'studio.home',
      'studio.articles',
      'studio.notifications',
      'studio.media',
      'studio.newsletters',
      'studio.audience',
      'studio.analytics',
      'studio.developer',
      'studio.settings',
      'studio.pricing',
    ]);
  });

  it('respecte l’ordre de la sidebar lecteur', () => {
    expect(getSidebarSurfaces('reader').map((s) => s.id)).toEqual([
      'reader.home',
      'reader.search',
      'reader.notifications',
      'reader.messages',
      'reader.bookmarks',
      'reader.billing',
      'reader.pricing',
      'reader.settings',
    ]);
  });

  it('ne garde que les surfaces de sidebar du scope demandé', () => {
    const studio = getSidebarSurfaces('studio');
    expect(studio.every((s) => s.scope === 'studio' && s.showInSidebar)).toBe(true);
    expect(studio.map((s) => s.id)).not.toContain('studio.new-article');
    expect(getSidebarSurfaces('reader').map((s) => s.id)).toContain('reader.bookmarks');
  });

  it('masque les surfaces dont la permission média manque', () => {
    const ids = getSidebarSurfaces('studio', ['media:view_analytics']).map((s) => s.id);
    expect(ids).toContain('studio.analytics');
    expect(ids).toContain('studio.audience');
    expect(ids).not.toContain('studio.newsletters');
    expect(ids).not.toContain('studio.developer');
  });

  it('un viewer média ne voit ni newsletters, ni analytics, ni développeur', () => {
    // Base du rôle viewer : aucune permission (parité Go).
    const ids = getSidebarSurfaces('studio', []).map((s) => s.id);
    expect(ids).toEqual([
      'studio.home',
      'studio.articles',
      'studio.notifications',
      'studio.media',
      'studio.settings',
      'studio.pricing',
    ]);
  });

  it('sans liste de permissions, ne filtre rien (compte personnel)', () => {
    const ids = getSidebarSurfaces('studio').map((s) => s.id);
    expect(ids).toContain('studio.pricing');
    expect(ids).toContain('studio.developer');
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
    const ids = getCmdKSurfaces('studio', ['media:create_articles']).map((s) => s.id);
    expect(ids).toContain('studio.new-article');
    expect(ids).not.toContain('studio.analytics');
    expect(ids).not.toContain('studio.import');
    expect(ids).not.toContain('studio.developer');
  });
});

describe('canAccessSurfacePath', () => {
  it('autorise un chemin inconnu du manifeste', () => {
    expect(canAccessSurfacePath('studio', '/route-inconnue', [])).toBe(true);
  });

  it('refuse une surface protégée sans permission', () => {
    expect(canAccessSurfacePath('studio', '/developer', [])).toBe(false);
    expect(canAccessSurfacePath('studio', '/analytics', ['media:create_articles'])).toBe(false);
    expect(canAccessSurfacePath('studio', '/import', [])).toBe(false);
  });

  it('autorise dès que la permission média est présente', () => {
    expect(canAccessSurfacePath('studio', '/analytics', ['media:view_analytics'])).toBe(true);
    expect(canAccessSurfacePath('studio', '/developer', ['api_keys:manage'])).toBe(true);
    expect(canAccessSurfacePath('studio', '/import', ['subscribers:import_request'])).toBe(true);
  });

  it('reconnaît les sous-chemins sans confondre les préfixes', () => {
    expect(canAccessSurfacePath('studio', '/articles/new', [])).toBe(false);
    expect(canAccessSurfacePath('studio', '/articles/new', ['media:create_articles'])).toBe(true);
    expect(canAccessSurfacePath('studio', '/articles-archivees', [])).toBe(true);
  });

  it('ignore la query et l’ancre pour résoudre la surface', () => {
    expect(canAccessSurfacePath('reader', '/library?tab=bookmarks', [])).toBe(true);
    expect(canAccessSurfacePath('reader', '/library?tab=highlights#top', [])).toBe(true);
    expect(canAccessSurfacePath('studio', '/developer?tab=keys', [])).toBe(false);
  });

  it('ne mélange pas les scopes', () => {
    expect(canAccessSurfacePath('reader', '/pricing', [])).toBe(true);
    expect(canAccessSurfacePath('reader', '/developer', [])).toBe(true);
  });
});
