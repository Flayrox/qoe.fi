#!/usr/bin/env node
// =====================================================================
// 🖼️ Garde CI — l'origine des médias n'est jamais recopiée à la main
// =====================================================================
// 📖 Cinq `next.config.ts` portaient la même liste d'hôtes (`cdn.qoe.fi`,
//    `**.supabase.co`, …) et `packages/ui/src/image-utils.ts` la recopiait
//    une sixième fois. Conséquence : changer `NEXT_PUBLIC_MEDIA_CDN_URL`
//    (Bunny, Cloudflare, imgproxy) ne changeait rien au rendu — les images
//    restaient `unoptimized`, en silence, et le motif manquait dans Next.
//
// 🎯 Le garde échoue si :
//    - un `next.config.ts` déclare un `hostname:` littéral (la liste doit
//      venir de `mediaRemotePatterns()` dans `@qoe/supabase/storage`) ;
//    - un fichier applicatif code en dur un hôte média historique
//      (`cdn.qoe.fi`) au lieu de passer par `resolveMediaCdnBase()`.
//
// 💡 Les tests, snapshots et ce script sont hors périmètre : les fixtures
//    ont le droit d'utiliser une URL absolue pour prouver un comportement.
// =====================================================================

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const APP_CONFIGS = ['core', 'studio', 'admin', 'tenants', 'hi'];
const SOURCE_ROOTS = [
  'packages/ui/src',
  'packages/sdk/src',
  'apps/core/src',
  'apps/tenants/src',
  'apps/studio/src',
  'apps/admin/src',
  'apps/hi/src',
];

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '__tests__', '__snapshots__']);
const SKIP_FILE = /(\.test\.|\.spec\.|\.stories\.|\.snap$)/;

/** Un hôte média codé en dur dans du code de production. */
const FORBIDDEN_HOST = /(^|[^\w.-])cdn\.qoe\.fi([^\w.-]|$)/;

const problems = [];

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

// 1. Les configs Next doivent appeler la source unique.
for (const app of APP_CONFIGS) {
  const path = `apps/${app}/next.config.ts`;
  let content;
  try {
    content = read(path);
  } catch {
    problems.push(`${path} : fichier introuvable (config Next attendue)`);
    continue;
  }
  if (!content.includes('mediaRemotePatterns(')) {
    problems.push(`${path} : doit utiliser mediaRemotePatterns() de @qoe/supabase/storage`);
  }
  const literal = content.match(/hostname:\s*['"][^'"]+['"]/g);
  if (literal) {
    problems.push(
      `${path} : hôte littéral dans remotePatterns (${literal.join(', ')}) — la liste est pilotée par l'environnement`
    );
  }
}

// 2. Aucun hôte média historique en dur dans le code applicatif.
function walk(dir) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    const stats = statSync(join(ROOT, path));
    if (stats.isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(entry) || SKIP_FILE.test(entry)) continue;
    const content = readFileSync(join(ROOT, path), 'utf8');
    content.split('\n').forEach((line, index) => {
      // Les commentaires ont le droit de nommer l'hôte historique : c'est
      // souvent là qu'on explique pourquoi il reste reconnu.
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      if (FORBIDDEN_HOST.test(line)) {
        problems.push(
          `${relative('.', path)}:${index + 1} : hôte média en dur — utiliser resolveMediaCdnBase()`
        );
      }
    });
  }
}

for (const dir of SOURCE_ROOTS) walk(dir);

if (problems.length > 0) {
  console.error('❌ Origine des médias recopiée à la main :\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error(
    '\nRègle (AGENTS.md) : une seule source pour l’origine des médias, pilotée par une variable d’environnement.'
  );
  process.exit(1);
}

console.log(
  '✅ Origine des médias : une seule source (mediaRemotePatterns / resolveMediaCdnBase).'
);
