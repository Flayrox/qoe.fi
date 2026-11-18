#!/usr/bin/env node
// =====================================================================
// 🛡️ audit-guard — cliquet sur `pnpm audit --prod`
// =====================================================================
// Pourquoi un cliquet plutôt qu'un simple `pnpm audit --audit-level high` :
// l'arbre porte déjà des avis connus (Next 16.2, chaîne Expo) dont la
// correction est un changement de version majeur, hors d'un durcissement. Un
// échec permanent serait ignoré en une semaine ; un cliquet, lui, bloque toute
// NOUVELLE vulnérabilité élevée ou critique pendant qu'on planifie les
// existantes.
//
//   pnpm audit:guard           → échoue si un avis high/critical est nouveau
//   pnpm audit:guard --update  → réécrit la référence après triage explicite
// =====================================================================

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const BASELINE = new URL('./audit-baseline.json', import.meta.url);
const SEVERITIES = new Set(['high', 'critical']);

function loadBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch {
    return { advisories: [], note: 'référence initiale' };
  }
}

let raw = '';
try {
  raw = execSync('pnpm audit --prod --json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch (error) {
  // pnpm audit sort en code 1 dès qu'il trouve quelque chose : la sortie JSON
  // reste sur stdout.
  raw = error.stdout?.toString?.() ?? '';
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error(
    '❌ audit-guard : sortie JSON illisible — `pnpm audit --prod --json` a-t-il échoué ?'
  );
  process.exit(2);
}

// pnpm 11 renvoie `advisories` (indexé) ; on tolère aussi la forme `vulnerabilities`.
const advisories = Object.values(report.advisories ?? {});
const found = new Map();
for (const advisory of advisories) {
  if (!SEVERITIES.has(advisory.severity)) continue;
  const id = advisory.github_advisory_id || advisory.url || String(advisory.id);
  const key = `${id} ${advisory.module_name}`;
  found.set(key, {
    key,
    module: advisory.module_name,
    severity: advisory.severity,
    title: advisory.title,
    patched: advisory.patched_versions,
  });
}

const baseline = loadBaseline();
const known = new Set(baseline.advisories ?? []);
const fresh = [...found.values()].filter((item) => !known.has(item.key));
const stale = [...known].filter((key) => !found.has(key));

const update = process.argv.includes('--update');
if (update) {
  const payload = {
    note:
      'Avis high/critical connus et triés. Un nouvel avis fait échouer `pnpm audit:guard`. ' +
      'Après triage, relancer `pnpm audit:guard --update`.',
    updatedAt: new Date().toISOString().slice(0, 10),
    advisories: [...found.keys()].sort(),
  };
  writeFileSync(BASELINE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`✅ audit-guard : référence mise à jour (${found.size} avis high/critical connus).`);
  process.exit(0);
}

if (stale.length > 0) {
  console.warn(
    'ℹ️  audit-guard : avis corrigés depuis la dernière référence (mettre à jour le cliquet) :'
  );
  for (const key of stale) console.warn(`   • ${key}`);
}

if (fresh.length > 0) {
  console.error('❌ audit-guard : NOUVELLE vulnérabilité high/critical en production :');
  for (const item of fresh) {
    console.error(
      `   • [${item.severity}] ${item.module} — ${item.title} (corrigé en ${item.patched})`
    );
  }
  console.error(
    '\n   → mettez à jour la dépendance, ou triez et lancez `pnpm audit:guard --update`.'
  );
  process.exit(1);
}

console.log(
  `✅ audit-guard : aucune nouvelle vulnérabilité high/critical (${found.size} avis connus).`
);
