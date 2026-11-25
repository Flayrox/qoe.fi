#!/usr/bin/env node
// =====================================================================
// 🔢 Garde CI — tout tri métier sur createdAt reste un ordre TOTAL
// =====================================================================
// Un `ORDER BY "createdAt"` seul n'est pas déterministe : la colonne est un
// TIMESTAMP(3), deux lignes de la même milliseconde peuvent sortir dans
// n'importe quel ordre (liste qui « saute », pagination qui duplique ou perd
// une ligne). La règle du dépôt : tout tri temporel se termine par un
// départage unique — `id` (ou `seq` quand la table en a un).
//
// Le garde lit les requêtes sqlc et les requêtes Go brutes, et échoue sur une
// clause ORDER BY qui contient createdAt sans id/seq. Les seeds de données de
// démonstration et les tests sont hors périmètre (aucune pagination).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['apps/api/sql/queries', 'apps/api/internal'];
const SKIP_DIRS = new Set(['database', 'testutil', 'node_modules', '.git']);
const ALLOW = new Set(['apps/api/internal/seed/world.go']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.sql') || (p.endsWith('.go') && !p.endsWith('_test.go'))) out.push(p);
  }
  return out;
}

const violations = [];
for (const file of ROOTS.flatMap((r) => walk(r))) {
  const rel = relative('.', file);
  if (ALLOW.has(rel)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') || trimmed.startsWith('//')) return;
    const at = line.search(/ORDER\s+BY/i);
    if (at < 0) return;
    // Clause sur la même ligne ou poursuivie sur les suivantes jusqu'au
    // point-virgule / fin de chaîne Go.
    let clause = line.slice(at);
    for (let j = i + 1; j < lines.length && !/[;`]/.test(clause); j++) clause += ' ' + lines[j];
    clause = clause.split(/[;`]/)[0];
    if (!/createdAt/i.test(clause)) return;
    // Départage exigé : une clé secondaire après createdAt (id/seq, ou une
    // clé unique dans le périmètre de la requête : email, featureKey…).
    const tail = clause.replace(/^[\s\S]*?createdAt/i, '');
    if (/\b(id|seq)\b/i.test(clause) || tail.includes(',')) return;
    violations.push(`${rel}:${i + 1} ${clause.trim().replace(/\s+/g, ' ')}`);
  });
}

if (violations.length) {
  console.error('❌ guard:order-total — tri createdAt sans départage unique :');
  for (const v of violations) console.error('   ' + v);
  console.error('\nAjoutez `, id` (ou `, seq`) comme dernière clé de tri.');
  process.exit(1);
}
console.log('✅ guard:order-total — tous les tris createdAt ont un départage total.');
