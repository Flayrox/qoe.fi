import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// =====================================================================
// 🔒 Garde R70 — une seule implémentation de `formatDuration`
// =====================================================================
// `@qoe/utils` exporte `formatDuration`. Deux apps en tenaient une copie
// locale, avec des sorties incompatibles :
//   - studio : 3700 s → « 61m 40s » (pas d'heure, flottants non arrondis) ;
//   - admin  : 90 s   → « 1 min »   (secondes perdues).
// Ce garde échoue dès qu'une définition locale réapparaît hors de
// `packages/utils/src/format.ts`.
// =====================================================================

const ROOT = join(__dirname, '../../../..');
const IGNORED = new Set(['node_modules', '.next', 'dist', 'coverage', '.turbo', 'build']);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Les liens symboliques (Pods iOS, stores natifs) sont ignorés : ils
    // pointent hors du dépôt et cassent la marche sur un lien mort.
    if (entry.isSymbolicLink()) continue;
    const name = entry.name;
    if (IGNORED.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      files.push(full);
    }
  }
  return files;
}

describe('R70 — formatDuration unique', () => {
  it('aucune app ne redéfinit formatDuration', () => {
    // Seules les sources sont scannées : `apps/*/src` et `packages/*/src`.
    const sourceDirs = ['apps', 'packages'].flatMap((group) =>
      readdirSync(join(ROOT, group), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
        .map((entry) => join(ROOT, group, entry.name, 'src'))
        .filter((dir) => {
          try {
            readdirSync(dir);
            return true;
          } catch {
            return false;
          }
        })
    );

    const offenders = sourceDirs
      .flatMap((dir) => walk(dir))
      .filter((file) => !file.endsWith(join('packages', 'utils', 'src', 'format.ts')))
      .filter((file) =>
        /function\s+formatDuration\b|const\s+formatDuration\s*=/.test(readFileSync(file, 'utf8'))
      )
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});
