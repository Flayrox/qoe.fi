// @vitest-environment jsdom
// =====================================================================
// L21a — socle studio : `lib/utils.ts` doublon mort de `cn`
// =====================================================================
// `@qoe/utils` exporte `cn` (36 imports dans le studio) et `src/lib/utils.ts`
// en recopiait l'implémentation (`clsx` + `twMerge`). Aucun fichier
// n'importait `@/lib/utils` : c'était un second `cn`, donc deux façons de
// fusionner des classes selon l'endroit du code.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('socle studio — un seul `cn`', () => {
  it('ne garde pas un second `cn` local', () => {
    expect(existsSync(join(SRC, 'lib/utils.ts'))).toBe(false);
  });

  it('aucun fichier n’importe `@/lib/utils`', () => {
    const offenders = walk(SRC).filter((file) =>
      /from ['"]@\/lib\/utils['"]/.test(readFileSync(file, 'utf-8'))
    );
    expect(offenders).toEqual([]);
  });
});
