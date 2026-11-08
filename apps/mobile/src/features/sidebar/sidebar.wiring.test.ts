import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// 🔒 La sélection pure est couverte par `mobile-nav.test.ts`. Ici on vérifie
// que le composant RÉEL la consomme : s'il réintroduit une liste locale, un
// libellé de navigation ou une route de navigation figée, ce test tombe.
const source = readFileSync(fileURLToPath(new URL('./sidebar.tsx', import.meta.url)), 'utf8');

describe('sidebar mobile branchée sur la sélection du manifeste', () => {
  it('construit ses entrées avec getMobileNavEntries', () => {
    expect(source).toContain('getMobileNavEntries(isCreatorOrAdmin)');
    expect(source).toContain('label: surface.defaultLabel');
    expect(source).toContain('router.push(surface.path as Href)');
  });

  it('ne recopie ni libellé de navigation ni route de navigation', () => {
    expect(source).not.toMatch(/label:\s*t\(['"`]sidebar\./);
    expect(source).not.toMatch(/defaultLabel:\s*['"`]/);
    expect(source).not.toMatch(/router\.push\(\s*['"`]\//);
  });
});
