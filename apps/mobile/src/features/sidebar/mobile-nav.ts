import { getSidebarSurfaces, type SurfaceDescriptor } from '@qoe/config';

export interface MobileNavEntry {
  surface: SurfaceDescriptor;
  group: 'main' | 'bottom';
}

/**
 * 🧭 Entrées du tiroir mobile, dans l'ordre du manifeste partagé.
 *
 * La visibilité par rôle est déclarée dans `requiredRole` ; la section
 * (`main` / `bottom`) dans `sidebarGroup`. Le composant ne fait plus que
 * rendre cette sélection et associer les gestes aux identifiants de surface.
 */
export function getMobileNavEntries(isCreatorOrAdmin: boolean): MobileNavEntry[] {
  return getSidebarSurfaces('mobile')
    .filter((surface) => !surface.requiredRole || isCreatorOrAdmin)
    .map((surface) => ({
      surface,
      group: surface.sidebarGroup === 'bottom' ? 'bottom' : 'main',
    }));
}
