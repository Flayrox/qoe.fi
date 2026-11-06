// =====================================================================
// 🧪 admin-screen-guards — aucun écran ne charge avant d’avoir vérifié
// =====================================================================
// Les pages serveur sont des points d’entrée : le layout ne suffit pas, car
// une page peut être rendue hors navigation ou après un changement d’identité.
// Ce test relit TOUS les `page.tsx` de la console et vérifie que
// `requireCapability(...)` précède le premier chargement de données.
//
// Seule exception volontaire : `/admin/forbidden`, qui doit rester lisible
// même sans la capacité demandée — c’est l’écran qui explique le refus. Elle
// est nommée ici pour qu’une nouvelle exception ne puisse pas être ajoutée
// silencieusement.
// =====================================================================

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ADMIN_ROOT = fileURLToPath(new URL('../../app/(admin)/admin/', import.meta.url));
const UNGUARDED_BY_DESIGN = new Set(['forbidden/page.tsx']);

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return entry.name === 'page.tsx' ? [path] : [];
  });
}

const pages = pageFiles(ADMIN_ROOT);

/** Premier chargement de données après le début du composant (identité exclue). */
const DATA_LOAD =
  /await\s+(?:Promise\.all\s*\(|(?:get(?!AdminIdentity\b)|load|fetch|list|verify)[A-Z]\w*\s*\()/;

describe('gardes des écrans admin', () => {
  it('couvre un nombre significatif d’écrans', () => {
    expect(pages.length).toBeGreaterThanOrEqual(30);
  });

  it('vérifie la capacité avant chaque chargement de données', () => {
    for (const file of pages) {
      const screen = relative(ADMIN_ROOT, file).replaceAll('\\', '/');
      if (UNGUARDED_BY_DESIGN.has(screen)) continue;

      const source = readFileSync(file, 'utf8');
      const component = source.indexOf('export default async function');
      expect(component, `${screen}: composant serveur introuvable`).toBeGreaterThanOrEqual(0);

      const body = source.slice(component);
      const guard = body.indexOf('requireCapability(');
      expect(guard, `${screen}: requireCapability absent`).toBeGreaterThanOrEqual(0);

      const load = DATA_LOAD.exec(body);
      if (load) {
        expect(guard, `${screen}: chargement avant garde (${load[0]})`).toBeLessThan(load.index);
      }
    }
  });

  it('garde explicitement Reports, Legal et Compliance avec leur capacité', () => {
    const expected: Record<string, string> = {
      'reports/page.tsx': 'admin.reports.read',
      'legal/page.tsx': 'admin.legal.read',
      'compliance/page.tsx': 'admin.compliance.read',
    };

    for (const [screen, capability] of Object.entries(expected)) {
      const source = readFileSync(join(ADMIN_ROOT, screen), 'utf8');
      expect(source, `${screen}: capacité ${capability} absente`).toContain(`'${capability}'`);
      expect(source, `${screen}: requireCapability absent`).toMatch(
        new RegExp(`requireCapability\\([\\s\\S]*?'${capability.replace(/\./g, '\\.')}'`)
      );
    }
  });

  it('documente l’unique écran laissé sans garde', () => {
    const forbidden = readFileSync(join(ADMIN_ROOT, 'forbidden/page.tsx'), 'utf8');
    expect(forbidden).not.toContain('requireCapability(');
    expect(forbidden).toContain('AccessDenied');
  });
});
