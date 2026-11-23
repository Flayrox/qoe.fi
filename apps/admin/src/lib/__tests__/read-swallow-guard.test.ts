// =====================================================================
// 🧪 Garde statique — aucune lecture serveur ne convertit une erreur en vide
// =====================================================================
// R161 mesurait vingt-trois lectures qui retombaient sur `[]` en cas d'échec
// (`catch { return [] }`, `return { items: [], total: 0 }`, `return EMPTY_…`).
// L'écran ne pouvait alors pas distinguer « zéro ligne » de « lecture
// impossible ». Ce test lit les modules de données de la console et refuse
// tout `catch` qui rend une collection vide : la seule sortie d'échec
// autorisée est `readOr` (`ok: false`), qui laisse l'écran le dire.
//
// C'est la version permanente du défaut : remettre un `return []` dans un
// `catch` fait rougir ce fichier, même si les pages compilent.
// =====================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const LIB_DIR = fileURLToPath(new URL('..', import.meta.url));

/** Corps de chaque `catch` du fichier, accolades équilibrées. */
export function catchBodies(source: string): string[] {
  const bodies: string[] = [];
  const pattern = /catch\s*(?:\([^)]*\))?\s*\{/g;
  for (const match of source.matchAll(pattern)) {
    let depth = 1;
    let index = (match.index ?? 0) + match[0].length;
    const start = index;
    while (index < source.length && depth > 0) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') depth -= 1;
      index += 1;
    }
    bodies.push(source.slice(start, index - 1));
  }
  return bodies;
}

/** Un `catch` qui rend une collection vide avale une panne de lecture. */
const AVALEMENT =
  /(\breturn\s*(\[\]|\{\}|empty\b|EMPTY_[A-Z_]+\b)|\bitems:\s*\[\s*\]|\bgroups:\s*\[\s*\]|\btopUsers:\s*\[\s*\]|\bdata:\s*\[\s*\]|\bdata:\s*\{\s*\})/;

const DATA_MODULES = readdirSync(LIB_DIR)
  .filter((name) => name.endsWith('-data.ts'))
  .sort();

describe('lectures serveur de la console', () => {
  it('n’avale aucune panne en liste vide', () => {
    expect(DATA_MODULES.length).toBeGreaterThanOrEqual(5);

    const avalements: string[] = [];
    for (const file of DATA_MODULES) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const body of catchBodies(source)) {
        const match = body.match(AVALEMENT);
        if (match) avalements.push(`${file} : catch → ${match[0]}`);
      }
    }

    expect(avalements).toEqual([]);
  });

  it('déclare ses échecs par readOr, ou les relance — jamais un catch muet', () => {
    const muets: string[] = [];
    for (const file of DATA_MODULES) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      if (source.includes('readOr(')) continue;
      // Un module sans readOr doit relancer chaque panne qu'il attrape.
      for (const body of catchBodies(source)) {
        if (!/\bthrow\b/.test(body)) muets.push(file);
      }
    }

    expect(muets).toEqual([]);
  });
});
