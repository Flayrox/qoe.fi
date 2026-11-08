import { describe, expect, it } from 'vitest';
import { getAdminSurfaces, getMobileSurfaces } from '../surfaces';
import { routes } from '../routes';

describe('🛡️ surfaces admin', () => {
  it('dérive toutes les entrées de la console, dans un ordre stable', () => {
    const surfaces = getAdminSurfaces();
    expect(surfaces).toHaveLength(33);
    expect(surfaces.every((surface) => surface.scope === 'admin')).toBe(true);
    expect(surfaces.every((surface) => surface.path.startsWith('/admin'))).toBe(true);
    expect(new Set(surfaces.map((surface) => surface.path)).size).toBe(surfaces.length);
  });

  it('déclare une capacité admin pour chaque écran', () => {
    for (const surface of getAdminSurfaces()) {
      expect(surface.capability).toMatch(/^admin\.[a-z.]+$/);
      expect(surface.description?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('les chemins viennent du registre de routes', () => {
    const byId = new Map(getAdminSurfaces().map((surface) => [surface.id, surface.path]));
    expect(byId.get('admin.home')).toBe(routes.admin.home());
    expect(byId.get('admin.users')).toBe(routes.admin.users.list());
    expect(byId.get('admin.retention')).toBe(routes.admin.retention());
    expect(byId.get('admin.access-roles')).toBe(routes.admin.access.roles());
  });

  it('les capacités secondaires sont toutes des capacités admin', () => {
    for (const surface of getAdminSurfaces()) {
      for (const capability of surface.alsoUses ?? []) {
        expect(capability).toMatch(/^admin\./);
      }
    }
  });
});

describe('📱 surfaces mobile', () => {
  it('ordonne les onglets natifs depuis le manifeste', () => {
    expect(getMobileSurfaces('native').map((surface) => surface.defaultLabel)).toEqual([
      'Profil',
      'Explorer',
      'Feed',
      'Activité',
    ]);
  });

  it('ordonne les onglets web depuis le même manifeste', () => {
    expect(getMobileSurfaces('web').map((surface) => surface.defaultLabel)).toEqual([
      'Feed',
      'Explorer',
      'Activité',
      'Messages',
    ]);
  });

  it('fournit le nom de route expo-router et le href de chaque onglet', () => {
    const byId = new Map(getMobileSurfaces('native').map((surface) => [surface.id, surface]));
    expect(byId.get('mobile.feed')?.routeName).toBe('index');
    expect(byId.get('mobile.feed')?.path).toBe(routes.mobile.feed());
    expect(byId.get('mobile.profile')?.path).toBe('/profile');
    expect(byId.get('mobile.notifications')?.routeName).toBe('notifications');
  });
});
