#!/usr/bin/env node
// =====================================================================
// 🚩 Garde CI — parité du registre des feature flags (TS ↔ Go)
// =====================================================================
// 📖 Le registre existe deux fois : `packages/flags/src/flags.ts` (client,
//    SSR, workers Next.js) et `apps/api/internal/flags/flags.go` (API, workers
//    asynq). Un flag déclaré d'un seul côté est invisible — ou pire, éteint —
//    pour l'autre moitié de la plateforme, sans aucune erreur visible.
//
// 🎯 Le garde compare clé par clé ET valeur par défaut, puis sort en erreur :
//    - clé absente d'un côté
//    - défaut divergent (true/false)
//    - coupe-feu listé dans PROTECTIVE_FLAGS mais absent du registre TS
// =====================================================================

import { readFileSync } from 'node:fs';

const TS_FILE = 'packages/flags/src/flags.ts';
const GO_FILE = 'apps/api/internal/flags/flags.go';

function fail(message) {
  console.error(`\n❌ guard:flags-parity — ${message}\n`);
  process.exit(1);
}

function read(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    fail(`fichier introuvable : ${file}`);
  }
}

/** Extrait `clé → défaut` du registre TypeScript. */
function parseTypeScriptRegistry(source) {
  const start = source.indexOf('const FLAG_DEFINITIONS');
  const end = source.indexOf('} as const satisfies');
  if (start === -1 || end === -1) {
    fail(`bloc FLAG_DEFINITIONS introuvable dans ${TS_FILE}`);
  }

  const block = source.slice(start, end);
  const registry = new Map();
  const re = /^\s*'([^']+)':\s*(true|false),/gm;
  for (const match of block.matchAll(re)) {
    registry.set(match[1], match[2] === 'true');
  }
  if (registry.size === 0) fail(`aucun flag lu dans ${TS_FILE}`);
  return registry;
}

/** Extrait les constantes de clés Go (`Nom = "clé"`). */
function parseGoKeys(source) {
  const keys = new Map();
  const re = /^\s*([A-Z]\w*)\s*=\s*"([^"]+)"/gm;
  for (const match of source.matchAll(re)) {
    keys.set(match[1], match[2]);
  }
  if (keys.size === 0) fail(`aucune constante de flag lue dans ${GO_FILE}`);
  return keys;
}

/** Extrait `constante → défaut` du map `defaults`. */
function parseGoDefaults(source) {
  const start = source.indexOf('var defaults = map[string]bool{');
  const end = source.indexOf('\n}', start);
  if (start === -1 || end === -1) {
    fail(`map defaults introuvable dans ${GO_FILE}`);
  }

  const block = source.slice(start, end);
  const defaults = new Map();
  const re = /^\t([A-Z]\w*):\s*(true|false),/gm;
  for (const match of block.matchAll(re)) {
    defaults.set(match[1], match[2] === 'true');
  }
  if (defaults.size === 0) fail(`map defaults vide dans ${GO_FILE}`);
  return defaults;
}

const tsSource = read(TS_FILE);
const ts = parseTypeScriptRegistry(tsSource);
const goSource = read(GO_FILE);
const goKeys = parseGoKeys(goSource);
const goDefaults = parseGoDefaults(goSource);

const go = new Map();
for (const [constName, enabled] of goDefaults) {
  const key = goKeys.get(constName);
  if (!key) fail(`constante Go inconnue dans defaults : ${constName}`);
  go.set(key, enabled);
}

const errors = [];

for (const [key, def] of ts) {
  if (!go.has(key)) {
    errors.push(`« ${key} » existe côté TS mais pas côté Go (ajoute la constante + le défaut)`);
  } else if (go.get(key) !== def) {
    errors.push(`« ${key} » : défaut TS=${def} ≠ Go=${go.get(key)}`);
  }
}

for (const key of go.keys()) {
  if (!ts.has(key)) {
    errors.push(`« ${key} » existe côté Go mais pas côté TS (le client ne peut pas le lire)`);
  }
}

// Les coupe-feux doivent exister dans le registre : une faute de frappe dans
// PROTECTIVE_FLAGS désactiverait silencieusement l'exemption de bypass admin.
const protectiveBlock = tsSource.slice(
  tsSource.indexOf('export const PROTECTIVE_FLAGS'),
  tsSource.indexOf('] as const satisfies readonly FlagKey[]')
);
if (protectiveBlock === '') fail('PROTECTIVE_FLAGS introuvable');
for (const match of protectiveBlock.matchAll(/'([^']+)'/g)) {
  if (!ts.has(match[1])) {
    errors.push(`coupe-feu « ${match[1]} » absent de FLAG_DEFINITIONS`);
  }
}

if (errors.length > 0) {
  console.error('\n❌ guard:flags-parity — registre désynchronisé :');
  for (const error of errors) console.error(`   • ${error}`);
  console.error('');
  process.exit(1);
}

console.log(`✅ guard:flags-parity — ${ts.size} flags alignés entre TS et Go.`);
