// =====================================================================
// 🧪 Dialogues natifs et rechargements — interdits dans la console
// =====================================================================
// Le défaut mesuré (R154/R163/R164) : treize `window.prompt`, `confirm()` et
// `alert()` plus cinq `window.location.reload()`. Les premiers bloquent
// l'onglet, ne se mettent pas en forme et ne laissent aucune trace ; les
// seconds jettent filtres, recherche et position. Le design system fournit
// `@qoe/ui/confirm-dialog`, `@qoe/ui/toast` et `router.refresh()` : la console
// ne doit plus avoir besoin des primitives du navigateur.
//
// ⚠️ Les commentaires qui documentent cette migration citent les mêmes
// identifiants : comme pour la garde de palette, on juge le code, pas la prose.
// =====================================================================

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const NATIVE = /\b(?:window\.prompt|window\.confirm|window\.alert|confirm\(|alert\()/;
const RELOAD = /location\.reload\s*\(/;
// Copie muette : le booléen est jeté, donc un refus du navigateur ne se voit pas.
const SILENT_COPY = /void copyToClipboard\(/;

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Code seul : les lignes de commentaire sont retirées avant le test. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !(trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'));
    })
    .join('\n');
}

function offenders(pattern: RegExp): string[] {
  return files(SRC)
    .filter((path) => pattern.test(code(path)))
    .map((path) => relative(SRC, path).replaceAll('\\', '/'));
}

describe('console admin — primitives du navigateur', () => {
  it('n’ouvre plus de dialogue natif (prompt, confirm, alert)', () => {
    expect(offenders(NATIVE)).toEqual([]);
  });

  it('ne recharge plus la page entière pour relire le serveur', () => {
    expect(offenders(RELOAD)).toEqual([]);
  });

  it('annonce chaque copie lancée depuis un menu de ligne', () => {
    // `WorkTable` et `CopyableId` gardent le helper pur : ils affichent leur
    // propre retour (barre de statut, coche) et ne jettent pas le booléen.
    expect(offenders(SILENT_COPY)).toEqual([]);
  });
});
