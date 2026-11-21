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
// classe générée — et interdit les littéraux de couleur. Aucune exception :
// la marque se règle dans les tokens de thème, jamais dans un composant.
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
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RAW_PALETTE = /\b(?:bg|text|border)-(?:white|black)\b/;

/** Code seul : un commentaire qui cite une couleur n'en peint aucune. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('coquille admin — palette de couleurs', () => {
  const sources = ROOTS.flatMap(files).map((path) => ({
    path,
    screen: relative(SRC, path).replaceAll('\\', '/'),
  }));

  it('couvre la coquille', () => {
    expect(sources.length).toBeGreaterThanOrEqual(10);
  });

  it('n’écrit aucune couleur hexadécimale dans un composant', () => {
    const offenders = sources
      .filter((file) => HEX.test(code(file.path)))
      .map((file) => file.screen);

    expect(offenders).toEqual([]);
  });

  it('n’utilise ni bg-white ni text-black', () => {
    const offenders = sources
      .filter((file) => RAW_PALETTE.test(code(file.path)))
      .map((file) => file.screen);

    expect(offenders).toEqual([]);
  });
});
