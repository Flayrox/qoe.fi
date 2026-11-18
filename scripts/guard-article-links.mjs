#!/usr/bin/env node
// =====================================================================
// 🔗 Garde CI — plus aucun lien d'article ne pointe vers l'ancien chemin
// =====================================================================
// 📖 Trois formes d'URL d'article coexistent, et elles ne sont pas
//    interchangeables :
//
//      tenant (domaine propre / sous-domaine)
//        /{categorie}/{sous-categorie?}/{slug}      ← canonique
//        /{code}  et  /l/{code}                     ← codes courts
//        /article/{slug}                            ← ANCIEN, redirigé 308
//
//      core (qoe.fi)
//        /{proprietaire}/a/{slug}                   ← canonique
//        /l/{code}                                  ← code court
//
// 🎯 Le garde échoue dès qu'un fichier applicatif régénère `/article/{…}`
//    (forme obsolète) ou un hôte `qoe.fi` en dur dans une URL d'article.
//    Ces liens « marchent » en développement grâce à la redirection, puis
//    cassent sur un domaine personnalisé ou après migration de domaine — le
//    genre d'anomalie qu'on ne veut plus redécouvrir en production.
//
// 💡 Les routes legacy elles-mêmes (redirections) sont explicitement listées.
// =====================================================================

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['packages/ui/src', 'packages/sdk/src', 'apps/core/src', 'apps/tenants/src'];

/** Fichiers autorisés : les redirections legacy et les replis documentés. */
const ALLOWLIST = new Set([
  'apps/tenants/src/app/tenant/[domain]/article/[slug]/page.tsx',
  'apps/tenants/src/app/tenant/[domain]/articles/[slug]/page.tsx',
  'apps/tenants/src/app/tenant/[domain]/[categorySlug]/[slug]/page.tsx',
  // Sa cible « article » reste ambiguë (notification lue dans le core ou le
  // studio) : le serveur doit fournir `url`. Suivi : tâche R47 de la checklist.
  'packages/ui/src/notifications/NotificationItem.tsx',
]);

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '__tests__', '__snapshots__']);
const SKIP_FILE = /(\.test\.|\.spec\.|\.stories\.)/;

/** Motifs interdits : ancienne forme de lien et hôte propriétaire en dur. */
const FORBIDDEN = [
  {
    // `/article/${…}` dans un template (lien généré), hors route legacy.
    regex: /\/article\/\$\{/,
    label: 'ancien chemin `/article/{slug}`',
  },
  {
    // `https://media.qoe.fi/article/…` ou `… .qoe.fi/article/…`.
    regex: /\.qoe\.fi\/article\//,
    label: 'hôte qoe.fi en dur dans une URL d’article',
  },
  {
    // URL absolue littérale vers l'ancienne forme.
    regex: /https?:\/\/[^"'`\s]+\/article\//,
    label: 'URL absolue `/article/…`',
  },
];

const violations = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(entry) || SKIP_FILE.test(entry)) continue;
    scan(path);
  }
}

function scan(path) {
  const rel = relative(process.cwd(), path);
  if (ALLOWLIST.has(rel)) return;
  const content = readFileSync(path, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    // Les commentaires décrivent l'ancienne forme sans la générer.
    if (/^\s*(\*|\/\/|\/\*)/.test(line)) return;
    // Les routes de l'API Go contiennent aussi « /article/ » : ce ne sont pas
    // des liens publics, seul le chemin rendu à l'utilisateur compte.
    if (line.includes('/v1/') || line.includes('/search/')) return;
    for (const { regex, label } of FORBIDDEN) {
      if (regex.test(line)) {
        violations.push({ rel, line: index + 1, label, excerpt: line.trim().slice(0, 120) });
      }
    }
  });
}

for (const root of ROOTS) walk(root);

if (violations.length > 0) {
  console.error('\n❌ guard:article-links — lien d’article obsolète détecté\n');
  for (const v of violations) {
    console.error(`  ${v.rel}:${v.line} — ${v.label}`);
    console.error(`    ${v.excerpt}`);
  }
  console.error(
    '\nUtilisez les résolveurs canoniques :\n' +
      '  • tenant : resolveArticleShareUrl() (packages/sdk/src/lib/shareUrl.ts)\n' +
      '  • core   : getArticleUrl() / getCanonicalArticlePath() (@qoe/config/routes)\n' +
      '  • carte  : buildArticlePath() (@qoe/utils) + hôte configuré\n'
  );
  process.exit(1);
}

console.log('✅ guard:article-links — aucun lien d’article obsolète.');
