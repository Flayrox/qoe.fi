// =====================================================================
// 🧪 Points d'entrée `@qoe/ui` — la console n'importe pas le bootstrap
// =====================================================================
// Le défaut mesuré (R162) : huit fichiers importaient `@qoe/ui/ui/input` (et
// la racine de l'app `@qoe/ui/ui/tooltip`) alors que `packages/ui` expose des
// points d'entrée dédiés (`./input`, `./tooltip`). `src/ui/` n'est qu'un
// ré-export des primitives : même comportement, mais deux chemins pour un
// même composant — un renommage dans `src/ui/` casserait une moitié de la
// console sans que l'autre bouge.
//
// Trois composants restent importés via `@qoe/ui/ui/*`, et ce n'est pas un
// reste de migration : `packages/ui` ne les publie pas autrement.
// `ImageUploader` et `ImageEditorDialog` n'ont aucun point d'entrée dédié, et
// `./tooltip` pointe sur `src/primitives/tooltip/tooltip.tsx`, qui n'exporte
// pas `TooltipProvider` (il vit dans `src/ui/tooltip.tsx`, l'autre
// implémentation). La garde ne liste donc que `input`, seul cas où les deux
// chemins mènent au même code ; le doublon de `tooltip` est une dette de
// `packages/ui` (lot L07), pas de la console.
// =====================================================================

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const CANONICAL = /from '@qoe\/ui\/ui\/input'/;

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('console admin — points d’entrée du design system', () => {
  it('n’importe `input` que par son point d’entrée publié', () => {
    const offenders = files(SRC)
      .filter((path) => CANONICAL.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path).replaceAll('\\', '/'));

    expect(offenders).toEqual([]);
  });
});
