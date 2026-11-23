#!/usr/bin/env node
// Garde R150 : aucune confirmation native bloquante dans le studio.
//
// `window.confirm` / `alert` gèlent l'onglet, ignorent le clavier et le focus,
// et ne peuvent pas porter d'état d'attente : le studio passe par
// `useConfirmAction` + `<ConfirmDialog>` (ou un abandon en deux temps quand le
// dialogue s'ouvrirait par-dessus une modale déjà ouverte).
//
// Usage: node scripts/guard-native-confirm.mjs [--list]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
// `app/dev` est l'atelier interne exempté de catalogue (R142) : ses specimens
// citent `window.confirm()` dans du texte de démonstration.
const ROOTS = ['apps/studio/src'];
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'vendor', '.next', 'dev']);
const NATIVE = /(?<![\w.$])(?:window\.)?(?:confirm|alert)\s*\(/;

const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(full) || /\.test\./.test(full)) continue;
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    lines.forEach((line, index) => {
      // Un commentaire de ligne qui cite le motif n'est pas un appel.
      const code = line.replace(/\/\/.*$/, '');
      if (NATIVE.test(code)) {
        findings.push({ file: path.relative(ROOT, full), line: index + 1, text: line.trim() });
      }
    });
  }
}

for (const root of ROOTS) walk(path.join(ROOT, root));

if (findings.length > 0) {
  console.error(`\n${findings.length} confirmation(s) native(s) bloquante(s) :`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.text.slice(0, 90)}`);
  console.error('\nUtilisez `useConfirmAction` + `<ConfirmDialog>`.');
  console.error('Voir apps/studio/src/lib/use-confirm-action.ts.\n');
  process.exit(1);
}

console.log('0 confirmation native bloquante dans le studio');
