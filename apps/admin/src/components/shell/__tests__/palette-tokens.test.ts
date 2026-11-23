// =====================================================================
// 🧪 Palette brute — aucune couleur de marque en dur dans la coquille
// =====================================================================
// La coquille admin peignait l'accent de marque en hexadécimal
// (`border-[#EE4B2B]/40`, `text-[#B5371C]`) et le fond d'une carte en
// `bg-white`. Ces valeurs ignorent les tokens de thème (`highlight`,
// `card`, `background`) : thème sombre illisible et changement de palette
// impossible sans toucher au code (axe 8 : la marque est une variable).
//
// Ce test lit les sources des lots déjà audités (L22a pour la coquille, L22c
// pour les surfaces d'accès, de sécurité et de bac à sable, L22d pour les files
// de décision) — pas de rendu, pas
// de faux positif de classe générée — et interdit les littéraux de couleur.
// Aucune exception : la marque se règle dans les tokens de thème, jamais dans un
// composant. Les lots suivants étendent `ROOTS` au fur et à mesure.
// =====================================================================

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../../', import.meta.url));
const ROOTS = [
  // La racine du groupe `(admin)/admin` porte le tableau de bord : elle a
  // échappé à tous les sous-lots, qui n'énuméraient que ses sous-dossiers.
  join(SRC, 'app/(admin)/admin'),
  join(SRC, 'components/shell'),
  join(SRC, 'components/queue'),
  join(SRC, 'components/security'),
  join(SRC, 'app/(admin)/admin/components'),
  join(SRC, 'app/(admin)/admin/access'),
  join(SRC, 'app/(admin)/admin/security'),
  join(SRC, 'app/(admin)/admin/sandbox'),
  join(SRC, 'app/(admin)/admin/reports'),
  join(SRC, 'app/(admin)/admin/appeals'),
  join(SRC, 'app/(admin)/admin/abuse'),
  join(SRC, 'app/(admin)/admin/approvals'),
  join(SRC, 'app/(admin)/admin/support'),
  join(SRC, 'app/(admin)/admin/work'),
  join(SRC, 'app/(admin)/admin/incidents'),
  join(SRC, 'app/(admin)/admin/users'),
  join(SRC, 'app/(admin)/admin/notifications'),
  join(SRC, 'app/(admin)/admin/config'),
  join(SRC, 'app/(admin)/admin/features'),
  join(SRC, 'app/(admin)/admin/frontend'),
  join(SRC, 'app/(admin)/admin/translations'),
  join(SRC, 'app/(admin)/admin/imports'),
  join(SRC, 'app/(admin)/admin/campaigns'),
  join(SRC, 'app/(admin)/admin/oauth'),
  join(SRC, 'app/(admin)/admin/api'),
  join(SRC, 'app/(admin)/admin/widgets'),
  join(SRC, 'app/(admin)/admin/settings'),
  join(SRC, 'app/(admin)/admin/storage'),
  join(SRC, 'app/(admin)/admin/system'),
  join(SRC, 'app/(admin)/admin/legal'),
  join(SRC, 'app/(admin)/admin/health'),
  join(SRC, 'app/(admin)/admin/compliance'),
  join(SRC, 'app/(admin)/admin/retention'),
  join(SRC, 'app/(admin)/admin/audit'),
  join(SRC, 'app/(admin)/admin/subscriptions'),
  join(SRC, 'app/(admin)/admin/forbidden'),
  join(SRC, 'features/editor'),
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

describe('console admin — palette de couleurs', () => {
  const sources = ROOTS.flatMap(files).map((path) => ({
    path,
    screen: relative(SRC, path).replaceAll('\\', '/'),
  }));

  it('couvre la coquille, les surfaces d’accès et les files de décision', () => {
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
