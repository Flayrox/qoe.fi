#!/usr/bin/env node
// =====================================================================
// 📇 ui-catalog.mjs — Inventaire exhaustif de l'UI du monorepo
// =====================================================================
// 📖 Scanne les composants réels (packages/ui + apps), calcule pour
//    chaque module partagé combien de fichiers d'app l'importent, et
//    écrit apps/studio/src/app/dev/ui-lab/catalog.json.
//
// 🎯 Deux raisons de générer au lieu d'écrire une liste à la main :
//    - une liste manuelle dérive en 2 semaines ;
//    - le compteur d'usage est la seule mesure honnête de « est-ce
//      qu'on utilise nos composants ? ». Il se calcule, il ne se
//      déclare pas.
//
// 🔧 Usage : pnpm ui:catalog
// =====================================================================

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, relative, basename, extname, dirname } from 'node:path';

import { ROOT, walk, appSources, measure, countUsages, linesOf } from './lib/ui-scan.mjs';

const OUT = join(ROOT, 'apps/studio/src/app/dev/ui-lab/catalog.json');

const SOURCES = [
  { dir: 'packages/ui/src', app: 'ui' },
  // Les primitives du nouveau contrat vivent hors de `src/ui/` (hérité) :
  // sans cette ligne, l'inventaire du lab ignorerait tout le système neuf.
  { dir: 'packages/ui/src/primitives', app: 'primitives' },
  { dir: 'apps/studio/src/features', app: 'studio' },
  { dir: 'apps/core/src/components', app: 'core' },
  { dir: 'apps/tenants/src/components', app: 'tenants' },
  { dir: 'apps/hi/src/components', app: 'hi' },
  { dir: 'apps/admin/src/components', app: 'admin' },
];

const FAMILIES = [
  // Le système neuf et l'héritage restent séparés : mélanger les deux
  // ferait croire que le contrat est aussi mort que l'ancien dossier.
  { id: 'contract', label: 'Primitives du contrat (@qoe/ui)' },
  { id: 'primitives', label: 'Primitives héritées (@qoe/ui/ui)' },
  { id: 'composed', label: 'Composés partagés (@qoe/ui)' },
  { id: 'reading', label: 'Lecture & annotations' },
  { id: 'templates', label: 'Templates & blocs de page' },
  { id: 'studio', label: 'Patterns Studio' },
  { id: 'feed', label: 'Patterns Feed' },
  { id: 'tenants', label: 'Patterns Tenants' },
  { id: 'admin', label: 'Patterns Admin' },
  { id: 'marketing', label: 'Patterns Marketing' },
];

const APP_TO_FAMILY = {
  primitives: 'contract',
  core: 'feed',
  hi: 'marketing',
  studio: 'studio',
  tenants: 'tenants',
  admin: 'admin',
};

function familyOf(relPath, app) {
  if (app === 'primitives') return 'contract';
  if (app === 'ui') {
    if (relPath.startsWith('packages/ui/src/ui/')) return 'primitives';
    if (relPath.startsWith('packages/ui/src/reader/')) return 'reading';
    if (relPath.startsWith('packages/ui/src/annotations/')) return 'reading';
    if (relPath.startsWith('packages/ui/src/templates/')) return 'templates';
    return 'composed';
  }
  return APP_TO_FAMILY[app] ?? app;
}

// ─── Inventaire ──────────────────────────────────────────────────────
const buckets = new Map(FAMILIES.map((family) => [family.id, []]));

for (const source of SOURCES) {
  for (const file of walk(join(ROOT, source.dir))) {
    const rel = relative(ROOT, file);
    const family = familyOf(rel, source.app);
    if (!buckets.has(family)) continue;
    const name = basename(file, extname(file));
    buckets.get(family).push({
      name,
      path: rel,
      lines: linesOf(file),
      source: source.app,
      usages: source.app === 'ui' || source.app === 'primitives' ? countUsages(file) : null,
    });
  }
}

const families = FAMILIES.map((family) => ({
  ...family,
  items: (buckets.get(family.id) ?? []).sort((a, b) => a.path.localeCompare(b.path)),
})).filter((family) => family.items.length > 0);

const total = families.reduce((sum, family) => sum + family.items.length, 0);

// ─── Signaux de duplication (mesurés, pas déclarés) ──────────────────
// Les règles de comptage vivent dans `lib/ui-scan.mjs` : `ui-audit.mjs`
// utilise exactement les mêmes, sinon les deux outils se contredisent.
const primitives = families.find((family) => family.id === 'primitives')?.items ?? [];
const raw = measure(appSources);
const signals = {
  primitivesNeverImported: primitives.filter((item) => item.usages === 0).length,
  primitivesTotal: primitives.length,
  rawButtons: raw.rawButtons,
  rawButtonFiles: raw.rawButtonFiles,
  nativeSelectFiles: raw.rawSelectFiles,
  rawInputFiles: raw.rawInputFiles,
  handRolledOverlays: raw.handRolledOverlays,
};

mkdirSync(dirname(OUT), { recursive: true });
// ♻️ Idempotence : le timestamp n'avance que si le catalogue change réellement.
// Sans cela, `pnpm ui:catalog` produisait un diff à chaque exécution.
const payload = { total, signals, families };
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const unchanged =
  previous &&
  JSON.stringify({
    total: previous.total,
    signals: previous.signals,
    families: previous.families,
  }) === JSON.stringify(payload);
const generatedAt = unchanged ? previous.generatedAt : new Date().toISOString();
writeFileSync(OUT, JSON.stringify({ generatedAt, ...payload }, null, 2) + '\n');

console.log(`✔ catalog.json — ${total} composants dans ${families.length} familles`);
for (const family of families) console.log(`  · ${family.label}: ${family.items.length}`);
console.log(
  `  ↳ ${signals.primitivesNeverImported}/${signals.primitivesTotal} primitives jamais importées · ${signals.rawButtons} <button> natifs`
);
