import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// 🔒 Garde i18n des libellés d'accessibilité et des messages composés.
//
// L'app mobile est bilingue (fr/en via `@qoe/i18n`) : un libellé lu par le
// lecteur d'écran écrit en dur reste français pour un utilisateur anglophone,
// et un message composé autour d'un fragment figé ne se traduit pas non plus.
// Ce test balaie le code source (même approche que `sidebar.wiring.test.ts`)
// et tombe dès qu'un littéral réapparaît.

const SRC = fileURLToPath(new URL('../../', import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function scan(re: RegExp): string[] {
  const hits: string[] = [];
  for (const file of walk(SRC)) {
    const source = readFileSync(file, 'utf8');
    if (re.test(source)) hits.push(file.replace(SRC, 'src/'));
  }
  return hits.sort();
}

describe('i18n mobile — aucun libellé d’interface en dur', () => {
  it('aucun accessibilityLabel littéral (doit passer par t())', () => {
    // `accessibilityLabel={t('clé', 'défaut')}` est accepté, `="Fermer"` non.
    // Le préfixe optionnel couvre `avatarAccessibilityLabel`, `sourceAccessibilityLabel`…
    expect(scan(/[a-zA-Z]*AccessibilityLabel="/)).toEqual([]);
  });

  it('aucun message composé autour d’un fragment non traduit (onStub)', () => {
    expect(scan(/onStub\(\s*'/)).toEqual([]);
  });
});
