#!/usr/bin/env node
// =====================================================================
// 🛡️ guard-dangerous-html — aucun `dangerouslySetInnerHTML` sans assainisseur
// =====================================================================
// Passe 4 : les trois injections restantes (QR admin, chapitre d'ebook, corps
// d'article) sont fermées, mais une revue humaine ne peut pas relire chaque
// nouvelle surface. Ce garde transforme la règle en test de CI : tout fichier
// qui injecte du HTML brut doit passer par un assainisseur (`sanitize…`) ou
// figurer dans la liste d'exemptions ci-dessous, avec sa raison.
//
// Ce n'est pas un analyseur syntaxique : c'est un garde de surface, volontairement
// simple et lisible. Son rôle est de forcer une décision explicite, pas de
// prouver qu'un assainisseur est correct (les tests unitaires le font).
// =====================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SCAN_DIRS = ['apps', 'packages'];
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.reference',
  'e2e',
  'examples',
  // Projets natifs Expo : rien à voir avec du rendu web, et les Pods
  // contiennent des liens symboliques cassés qui font échouer la marche.
  'ios',
  'android',
  'Pods',
]);

// Exemptions : chacune porte sa raison. Un fichier exempté qui se met à
// accepter du contenu utilisateur doit sortir de cette liste.
const EXEMPTIONS = new Map([
  ['packages/ui/src/seo/JsonLd.tsx', 'JSON.stringify d’un objet typé, jamais de HTML utilisateur'],
  ['packages/theme/src/ThemeStyle.tsx', 'CSS généré depuis un thème validé, pas du HTML'],
  ['packages/theme/src/seed-script.tsx', 'constante compilée du paquet, aucune entrée utilisateur'],
  ['packages/ui/src/sidebar.tsx', 'JSON.stringify des speculation rules, pas du HTML'],
  [
    'apps/hi/src/app/legal/',
    'markdownToHtml échappe le HTML source (test packages/utils markdown : neutralise le HTML brut)',
  ],
]);

/** Vrai si le fichier est exempté (préfixe accepté pour les dossiers). */
function exemptionFor(relPath) {
  for (const [key, reason] of EXEMPTIONS) {
    if (relPath === key || relPath.startsWith(key)) return reason;
  }
  return null;
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      // Lien symbolique cassé ou fichier disparu : on l'ignore plutôt que de
      // faire échouer le garde pour une raison qui n'a rien à voir.
      continue;
    }
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(tsx|jsx|ts|js)$/.test(entry)) out.push(full);
  }
}

const files = [];
for (const dir of SCAN_DIRS) walk(join(ROOT, dir), files);

const offenders = [];
let inspected = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes('dangerouslySetInnerHTML')) continue;
  inspected += 1;
  const relPath = relative(ROOT, file).replace(/\\/g, '/');
  if (exemptionFor(relPath)) continue;
  // Un fichier est conforme dès qu'il passe le contenu par un assainisseur.
  if (/(sanitize[A-Za-z]*|sanitize_|sanitize-)/.test(source)) continue;
  const lines = source.split('\n');
  const at = lines.findIndex((line) => line.includes('dangerouslySetInnerHTML')) + 1;
  offenders.push(`${relPath}:${at}`);
}

if (offenders.length > 0) {
  console.error('❌ HTML brut injecté sans assainisseur :');
  for (const offender of offenders) console.error(`   • ${offender}`);
  console.error(
    '\n   → passez la valeur par sanitizeArticleHtml / sanitizeInlineSvg (@qoe/ui/security),'
  );
  console.error('     ou ajoutez une exemption motivée dans scripts/guard-dangerous-html.mjs.');
  process.exit(1);
}

console.log(
  `✅ guard-dangerous-html : ${inspected} fichier(s) injectant du HTML, tous assainis ou exemptés.`
);
