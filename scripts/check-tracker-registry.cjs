#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Garde-fou — registre des traceurs (`packages/utils/src/cookie-consent.ts`)
//
// Échoue si :
//   - le registre TRACKER_REGISTRY disparaît ou devient vide ;
//   - un traceur n'a pas de catégorie valide, de finalité ou de durée ;
//   - deux entrées portent le même nom (une preuve en double est une preuve
//     fausse).
//
// Miroir shell du test vitest `cookie-consent.test.ts` (bloc
// « registre des traceurs ») : tient même quand la suite JS ne tourne pas.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('usage: check-tracker-registry.cjs <cookie-consent.ts>');
  process.exit(2);
}

const src = fs.readFileSync(file, 'utf8');

const VALID_CATEGORIES = new Set(['necessary', 'analytics', 'functional', 'marketing']);

const m = src.match(/export const TRACKER_REGISTRY[^=]*= \[([\s\S]*?)\n\];/);
if (!m) {
  console.error('✗ TRACKER_REGISTRY introuvable dans ' + file);
  process.exit(1);
}

// Découpage en blocs d'entrées (une accolade ouvrante = une entrée).
const blocks = m[1].split(/\n\s*\{/).slice(1);

const names = [];
let problems = 0;

for (const block of blocks) {
  const nameMatch = block.match(/name:\s*['"]([^'"]+)['"]/);
  const categoryMatch = block.match(/category:\s*['"]([^'"]+)['"]/);
  const purpose = /purpose:\s*\{/.test(block);
  const retention = /retention:\s*\{/.test(block);

  const name = nameMatch ? nameMatch[1] : '(sans nom)';
  names.push(name);

  if (!categoryMatch || !VALID_CATEGORIES.has(categoryMatch[1])) {
    console.error('✗ catégorie manquante ou invalide : ' + name);
    problems++;
  }
  if (!purpose) {
    console.error('✗ finalité manquante : ' + name);
    problems++;
  }
  if (!retention) {
    console.error('✗ durée de conservation manquante : ' + name);
    problems++;
  }
}

if (names.length === 0) {
  console.error(
    '✗ registre vide : un traceur déposé hors registre est un traceur sans base légale'
  );
  process.exit(1);
}

const seen = new Set();
for (const n of names) {
  if (seen.has(n)) {
    console.error('✗ doublon : ' + n + ' (deux lignes pour un traceur = preuve fausse)');
    problems++;
  }
  seen.add(n);
}

if (problems > 0) process.exit(1);

console.log('registre des traceurs : ' + names.length + ' entrées, toutes complètes et uniques');
