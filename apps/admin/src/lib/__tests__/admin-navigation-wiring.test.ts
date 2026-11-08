import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAdminSurfaces } from '@qoe/config';

import { ADMIN_ACTIONS } from '../admin-actions-index';
import { SETTINGS_CATALOG } from '../admin-settings-catalog';

// 🔒 Les catalogues admin ne sont pas des sidebars, mais ce sont des
// consommateurs de navigation : chaque `href` doit désigner un écran réel du
// manifeste, et aucun ne doit recoder `/admin/...`. La palette et la sidebar
// doivent, elles, dériver leurs écrans de `visibleNav` / `navByDomain`.
const read = (file: string) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');

const ACTIONS_SOURCE = read('../admin-actions-index.ts');
const SETTINGS_SOURCE = read('../admin-settings-catalog.ts');
const PALETTE_SOURCE = read('../../app/(admin)/admin/components/CommandPalette.tsx');
const SIDEBAR_SOURCE = read('../../app/(admin)/admin/components/AdminSidebar.tsx');

const ADMIN_PATHS = new Set(getAdminSurfaces().map((surface) => surface.path));

describe('catalogues admin dérivés des routes', () => {
  it('chaque action de la palette pointe un écran du manifeste', () => {
    expect(ADMIN_ACTIONS.length).toBeGreaterThan(0);
    for (const action of ADMIN_ACTIONS) {
      expect(ADMIN_PATHS.has(action.href), `${action.id} → ${action.href}`).toBe(true);
    }
  });

  it('chaque levier de réglage pointe un écran du manifeste', () => {
    expect(SETTINGS_CATALOG.length).toBeGreaterThan(0);
    for (const lever of SETTINGS_CATALOG) {
      expect(ADMIN_PATHS.has(lever.href), `${lever.id} → ${lever.href}`).toBe(true);
    }
  });

  it('les deux catalogues importent routes et ne codent aucun /admin', () => {
    for (const source of [ACTIONS_SOURCE, SETTINGS_SOURCE]) {
      expect(source).toContain("from '@qoe/config/routes'");
      expect(source).toContain('routes.admin.');
      expect(source).not.toMatch(/href:\s*['"`]\/admin/);
    }
  });
});

describe('palette et sidebar admin dérivées du manifeste', () => {
  it('la palette construit ses écrans avec visibleNav, jamais une liste locale', () => {
    expect(PALETTE_SOURCE).toContain('visibleNav(caps)');
    expect(PALETTE_SOURCE).toContain('visibleActions(caps)');
    expect(PALETTE_SOURCE).not.toMatch(/const\s+(screens|actions)\s*[:=]\s*\[/);
    expect(PALETTE_SOURCE).not.toMatch(/['"`]\/admin\//);
  });

  it('la sidebar passe par navByDomain et ne reconstruit pas ses sections', () => {
    expect(SIDEBAR_SOURCE).toContain('navByDomain(capabilities)');
    expect(SIDEBAR_SOURCE).not.toMatch(/const\s+sections\s*=\s*\[/);
  });
});
