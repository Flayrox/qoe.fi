import { describe, it, expect } from 'vitest';
import { ADMIN_RESOURCES, getAdminResource, type AdminResourceId } from '../admin-resources';
import { ADMIN_CAPABILITIES } from '../admin-console';

describe('admin-resources (ResourceSpec C1)', () => {
  const resourceKeys = Object.keys(ADMIN_RESOURCES) as AdminResourceId[];

  it('fournit au moins les ressources majeures de l’administration', () => {
    expect(resourceKeys).toContain('reports');
    expect(resourceKeys).toContain('appeals');
    expect(resourceKeys).toContain('abuse');
    expect(resourceKeys).toContain('support');
    expect(resourceKeys).toContain('approvals');
    expect(resourceKeys).toContain('deliveries');
    expect(resourceKeys).toContain('users');
    expect(resourceKeys).toContain('triage');
  });

  it('chaque ressource référence une capacité valide existante dans ADMIN_CAPABILITIES', () => {
    const validCaps = new Set(ADMIN_CAPABILITIES);
    for (const key of resourceKeys) {
      const res = getAdminResource(key);
      expect(validCaps.has(res.capability)).toBe(true);
      expect(res.path).toMatch(/^\/admin/);
      expect(res.viewKey).toMatch(/^admin\./);
      expect(res.facets.length).toBeGreaterThan(0);
    }
  });

  it('les valeurs de facettes possèdent un identifiant et un libellé non vide', () => {
    for (const key of resourceKeys) {
      const res = getAdminResource(key);
      for (const facet of res.facets) {
        expect(facet.id).toBeTruthy();
        expect(facet.label).toBeTruthy();
        expect(facet.values.length).toBeGreaterThan(0);
        for (const val of facet.values) {
          expect(val.id).toBeTruthy();
          expect(val.label).toBeTruthy();
        }
      }
    }
  });
});
