// =====================================================================
// 🧪 Palette brute — aucune couleur de marque en dur dans la coquille
// =====================================================================
// La coquille admin peignait l'accent de marque en hexadécimal
// (`border-[#EE4B2B]/40`, `text-[#B5371C]`) et le fond d'une carte en
// `bg-white`. Ces valeurs ignorent les tokens de thème (`highlight`,
// `card`, `background`) : thème sombre illisible et changement de palette
// impossible sans toucher au code (axe 8 : la marque est une variable).
//
// Ce test lit les sources de L22a — pas de rendu, pas de faux positif de
// classe générée — et interdit les littéraux de couleur. `tokens.ts` est
// exclu nommément : c'est le seul fichier qui a le droit de nommer la marque.
// =====================================================================

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../../', import.meta.url));
const ROOTS = [
  join(SRC, 'components/shell'),
  join(SRC, 'components/queue'),
  join(SRC, 'app/(admin)/admin/components'),
];
const ALLOWED = new Set(['components/shell/tokens.ts']);
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RAW_PALETTE = /\b(?:bg|text|border)-(?:white|black)\b/;

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('coquille admin — palette de couleurs', () => {
  const sources = ROOTS.flatMap(files)
    .map((path) => ({ path, screen: relative(SRC, path).replaceAll('\\', '/') }))
    .filter((file) => !ALLOWED.has(file.screen));

  it('couvre la coquille', () => {
    expect(sources.length).toBeGreaterThanOrEqual(10);
  });

  it('n’écrit aucune couleur hexadécimale dans un composant', () => {
    const offenders = sources
      .filter((file) => HEX.test(readFileSync(file.path, 'utf8')))
      .map((file) => file.screen);

    expect(offenders).toEqual([]);
  });

  it('n’utilise ni bg-white ni text-black', () => {
    const offenders = sources
      .filter((file) => RAW_PALETTE.test(readFileSync(file.path, 'utf8')))
      .map((file) => file.screen);

    expect(offenders).toEqual([]);
  });
});
