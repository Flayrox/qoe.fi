// =====================================================================
// L21b — frontière vendor / maison du Stage
// =====================================================================
// `vendor/onlook/README.md` dit : « référence brute, ne pas importer direct ».
// La mesure du 2026-11-20 : 163 fichiers / 19 432 l. vendorisés, **zéro**
// import runtime depuis le code maison (9 mentions, toutes en commentaire
// « Ref brute »). Cette garde empêche la règle de se perdre : le jour où un
// fichier maison importera le vendor, le portage souverain sera fini (ou le
// vendor devra sortir de `src/`).
// =====================================================================

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const STAGE = resolve(process.cwd(), 'src/features/stage');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'vendor') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

describe('Stage — borne vendor/onlook', () => {
  it('aucun fichier maison n’importe le vendor', () => {
    const offenders = walk(STAGE).filter((file) =>
      /(^|\n)\s*import[^;]*from\s+['"][^'"]*vendor\/onlook/.test(readFileSync(file, 'utf-8'))
    );
    expect(offenders).toEqual([]);
  });

  it('le vendor garde sa licence d’attribution', () => {
    expect(() => statSync(join(STAGE, 'vendor/onlook/LICENSE.ONLOOK.md'))).not.toThrow();
  });
});
