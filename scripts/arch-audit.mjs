#!/usr/bin/env node
// =====================================================================
// 🛡️ scripts/arch-audit.mjs — Architecture Fitness Functions & Ratchet
// =====================================================================
// 📖 Garde-fou automatique qui empêche toute régression d'architecture :
//    1. Zéro toast sauvage "bientôt disponible" hors de feature-catalog
//    2. Zéro route en dur '/article/a/' (doit passer par routes/getArticleUrl)
//    3. Zéro fichier doublon usePostShadow
//    4. Ratchet sur les 'as unknown as' dans apps/core et packages/ui
//
// 🔧 Usage :
//    node scripts/arch-audit.mjs                  # vérification CI
//    node scripts/arch-audit.mjs --json           # sortie machine
//    node scripts/arch-audit.mjs --update         # fige les baisses
//    node scripts/arch-audit.mjs --allow-increase # exception explicite
// =====================================================================

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const BUDGET_FILE = join(ROOT, 'arch-budget.json');

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const update = args.has('--update');
const allowIncrease = args.has('--allow-increase');

function walk(dir, fileCallback) {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.next' ||
        entry.name === 'dist' ||
        entry.name === '.turbo'
      ) {
        continue;
      }
      walk(fullPath, fileCallback);
    } else if (entry.isFile()) {
      fileCallback(fullPath);
    }
  }
}

// ─── CHECK 1 : Toasts "bientôt disponible" sauvages ────────────────────
const rogueToasts = [];
const TOAST_REGEX = /toast\.(info|message|error|success)\([^)]*bientôt/i;

walk(join(ROOT, 'apps'), checkToastFile);
walk(join(ROOT, 'packages'), checkToastFile);

function checkToastFile(path) {
  if (
    path.includes('node_modules') ||
    path.includes('__tests__') ||
    path.endsWith('.test.ts') ||
    path.endsWith('.test.tsx')
  )
    return;
  if (path.includes('feature-catalog.ts') || path.includes('feature-interstitial.tsx')) return;
  if (!/\.(tsx?|jsx?)$/.test(path)) return;

  const content = readFileSync(path, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (TOAST_REGEX.test(line)) {
      rogueToasts.push({
        file: relative(ROOT, path),
        line: idx + 1,
        code: line.trim(),
      });
    }
  });
}

// ─── CHECK 2 : URLs '/article/a/' en dur ─────────────────────────────
const rogueArticleUrls = [];
const ARTICLE_URL_REGEX = /['"`]\/article\/a\/[a-zA-Z0-9_\-]/;

walk(join(ROOT, 'apps'), checkArticleUrlFile);
walk(join(ROOT, 'packages'), checkArticleUrlFile);

function checkArticleUrlFile(path) {
  if (
    path.includes('node_modules') ||
    path.includes('__tests__') ||
    path.endsWith('.test.ts') ||
    path.endsWith('.test.tsx')
  )
    return;
  if (
    path.includes('/routes.ts') ||
    path.includes('routes/index.ts') ||
    path.includes('article-url.ts') ||
    path.includes('getArticleUrl')
  )
    return;
  if (!/\.(tsx?|jsx?)$/.test(path)) return;

  const content = readFileSync(path, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (ARTICLE_URL_REGEX.test(line)) {
      rogueArticleUrls.push({
        file: relative(ROOT, path),
        line: idx + 1,
        code: line.trim(),
      });
    }
  });
}

// ─── CHECK 3 : Fichier doublon usePostShadow ──────────────────────────
const duplicateShadowFiles = [];
const rogueShadowPath = join(ROOT, 'packages/ui/src/social/usePostShadow.ts');
if (existsSync(rogueShadowPath)) {
  duplicateShadowFiles.push('packages/ui/src/social/usePostShadow.ts');
}

// ─── CHECK 4 : Ratchet sur 'as unknown as' ───────────────────────────
let asUnknownCount = 0;
const targetDirs = [join(ROOT, 'apps/core'), join(ROOT, 'packages/ui')];

targetDirs.forEach((dir) => {
  walk(dir, (path) => {
    if (
      path.includes('node_modules') ||
      path.includes('__tests__') ||
      path.endsWith('.test.ts') ||
      path.endsWith('.test.tsx') ||
      path.includes('vitest.setup')
    )
      return;
    if (!/\.(tsx?)$/.test(path)) return;

    const content = readFileSync(path, 'utf8');
    const matches = content.match(/as\s+unknown\s+as/g);
    if (matches) {
      asUnknownCount += matches.length;
    }
  });
});

// ─── CHECK 5 : Réversibilité et intégrité des migrations Goose ─────────
const gooseIssues = [];
const migrationsDir = join(ROOT, 'apps/api/sql/migrations');
if (existsSync(migrationsDir)) {
  const seenVersions = new Map();
  const sqlFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of sqlFiles) {
    const fullPath = join(migrationsDir, file);
    const content = readFileSync(fullPath, 'utf8');

    // Vérifie le préfixe numérique
    const prefixMatch = file.match(/^(\d+)_/);
    if (!prefixMatch) {
      gooseIssues.push(`Fichier sans préfixe de version : ${file}`);
    } else {
      const ver = prefixMatch[1];
      if (seenVersions.has(ver)) {
        gooseIssues.push(`Version dupliquée ${ver} : ${file} et ${seenVersions.get(ver)}`);
      } else {
        seenVersions.set(ver, file);
      }
    }

    // Vérifie Up & Down
    const hasUp = content.includes('+goose Up');
    const hasDown = content.includes('+goose Down');
    if (!hasUp || !hasDown) {
      gooseIssues.push(
        `Migration non réversible (manque ${!hasUp ? 'Up' : ''} ${!hasDown ? 'Down' : ''}) : ${file}`
      );
    }
  }
}

// ─── CHECK 6 : Discipline Shadow Store UI ─────────────────────────────
const rogueSocialMutations = [];
const uiSrcDir = join(ROOT, 'packages/ui/src');
if (existsSync(uiSrcDir)) {
  walk(uiSrcDir, (path) => {
    if (
      path.includes('node_modules') ||
      path.includes('__tests__') ||
      path.endsWith('.test.ts') ||
      path.endsWith('.test.tsx')
    )
      return;
    if (!/\.(tsx?)$/.test(path)) return;

    const content = readFileSync(path, 'utf8');
    const hasSocialAction =
      content.includes('toggleFollowCreatorHomeAction') ||
      content.includes('toggleBookmarkArticleHomeAction');
    const hasShadowMutation =
      content.includes('withShadowMutation') || content.includes('usePostShadow');
    if (hasSocialAction && !hasShadowMutation) {
      rogueSocialMutations.push(relative(ROOT, path));
    }
  });
}

// ─── CHECK 7 : Discipline Next.js 'use server' (Exports async uniquement) ──
const nonAsyncServerActionExports = [];
walk(join(ROOT, 'apps'), checkUseServerFile);
walk(join(ROOT, 'packages'), checkUseServerFile);

function checkUseServerFile(path) {
  if (
    path.includes('node_modules') ||
    path.includes('__tests__') ||
    path.endsWith('.test.ts') ||
    path.endsWith('.test.tsx') ||
    path.includes('.next') ||
    path.includes('dist')
  )
    return;
  if (!/\.(tsx?)$/.test(path)) return;

  const content = readFileSync(path, 'utf8');
  const lines = content.split('\n');
  const firstCodeLine = lines.find(
    (l) => l.trim() !== '' && !l.trim().startsWith('//') && !l.trim().startsWith('/*')
  );
  if (!firstCodeLine || !/^['"]use server['"];?/.test(firstCodeLine.trim())) return;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (/^export\s+function\s+/.test(trimmed) && !/^export\s+async\s+function\s+/.test(trimmed)) {
      nonAsyncServerActionExports.push({
        file: relative(ROOT, path),
        line: idx + 1,
        code: trimmed,
      });
    }
  });
}

// ─── BUDGET & RATCHET ────────────────────────────────────────────────
let budget = { asUnknownMax: 50 };
if (existsSync(BUDGET_FILE)) {
  try {
    budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
  } catch {
    // utilise défaut
  }
}

if (update || !existsSync(BUDGET_FILE)) {
  budget.asUnknownMax = asUnknownCount;
  writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2) + '\n', 'utf8');
  if (!asJson) {
    console.log(`[arch:audit] Budget mis à jour : asUnknownMax = ${asUnknownCount}`);
  }
}

// ─── RAPPORT ──────────────────────────────────────────────────────────
const errors = [];

if (rogueToasts.length > 0) {
  errors.push(
    `🚨 ${rogueToasts.length} toast(s) 'bientôt disponible' sauvages détectés !\n` +
      `   Règle : toute fonctionnalité à venir doit être déclarée dans packages/ui/src/ui/feature-catalog.ts et ouverte via useFeatureAnnouncement().open('key').\n` +
      rogueToasts.map((t) => `   - ${t.file}:${t.line} : ${t.code}`).join('\n')
  );
}

if (rogueArticleUrls.length > 0) {
  errors.push(
    `🚨 ${rogueArticleUrls.length} route(s) en dur '/article/a/' détectées !\n` +
      `   Règle : utilisez routes.feed.article(...) ou getArticleUrl(...).\n` +
      rogueArticleUrls.map((u) => `   - ${u.file}:${u.line} : ${u.code}`).join('\n')
  );
}

if (duplicateShadowFiles.length > 0) {
  errors.push(
    `🚨 Fichier doublon usePostShadow détecté !\n` +
      `   Règle : n'utilisez que @qoe/sdk/shadow pour le shadow store réactif.\n` +
      duplicateShadowFiles.map((f) => `   - ${f}`).join('\n')
  );
}

if (asUnknownCount > budget.asUnknownMax && !allowIncrease) {
  errors.push(
    `🚨 Dépassement du budget 'as unknown as' !\n` +
      `   Actuel : ${asUnknownCount} | Plafond autorisé : ${budget.asUnknownMax}\n` +
      `   Règle : alignez les types DTO plutôt que de forcer le typage avec 'as unknown as'.`
  );
}

if (gooseIssues.length > 0) {
  errors.push(
    `🚨 ${gooseIssues.length} anomalie(s) de migrations Goose détectée(s) !\n` +
      `   Règle : chaque fichier dans apps/api/sql/migrations doit avoir un préfixe unique et contenir '-- +goose Up' et '-- +goose Down'.\n` +
      gooseIssues.map((g) => `   - ${g}`).join('\n')
  );
}

if (rogueSocialMutations.length > 0) {
  errors.push(
    `🚨 ${rogueSocialMutations.length} composant(s) UI déclenchant des mutations sociales hors du Shadow Store !\n` +
      `   Règle : utilisez withShadowMutation pour garantir le verrouillage in-flight et le rollback automatique.\n` +
      rogueSocialMutations.map((m) => `   - ${m}`).join('\n')
  );
}

if (nonAsyncServerActionExports.length > 0) {
  errors.push(
    `🚨 ${nonAsyncServerActionExports.length} export(s) synchrone(s) détecté(s) dans un module 'use server' !\n` +
      `   Règle : Next.js/Turbopack exige que TOUTES les fonctions exportées d'un fichier 'use server' soient async.\n` +
      `   Déplacez les fonctions synchrones de mapping/transformation dans un fichier séparé (ex: mappers.ts).\n` +
      nonAsyncServerActionExports.map((e) => `   - ${e.file}:${e.line} : ${e.code}`).join('\n')
  );
}

if (asJson) {
  console.log(
    JSON.stringify({
      passed: errors.length === 0,
      stats: {
        rogueToasts: rogueToasts.length,
        rogueArticleUrls: rogueArticleUrls.length,
        duplicateShadowFiles: duplicateShadowFiles.length,
        asUnknownCount,
        asUnknownMax: budget.asUnknownMax,
        gooseIssues: gooseIssues.length,
        rogueSocialMutations: rogueSocialMutations.length,
        nonAsyncServerActionExports: nonAsyncServerActionExports.length,
      },
      errors,
    })
  );
} else {
  console.log(`\n🛡️  Architecture Audit — Qoefi Fitness Functions`);
  console.log(`─────────────────────────────────────────────────`);
  console.log(
    `• Toasts 'bientôt' sauvages   : ${rogueToasts.length === 0 ? '✅ 0' : `❌ ${rogueToasts.length}`}`
  );
  console.log(
    `• URLs '/article/a/' en dur   : ${rogueArticleUrls.length === 0 ? '✅ 0' : `❌ ${rogueArticleUrls.length}`}`
  );
  console.log(
    `• Doublons Shadow Store       : ${duplicateShadowFiles.length === 0 ? '✅ 0' : `❌ ${duplicateShadowFiles.length}`}`
  );
  console.log(
    `• Casts 'as unknown as'       : ${asUnknownCount <= budget.asUnknownMax ? `✅ ${asUnknownCount}/${budget.asUnknownMax}` : `❌ ${asUnknownCount} (max ${budget.asUnknownMax})`}`
  );
  console.log(
    `• Réversibilité Goose (Up/Down): ${gooseIssues.length === 0 ? '✅ 0 anomalie' : `❌ ${gooseIssues.length}`}`
  );
  console.log(
    `• Discipline Shadow Store UI  : ${rogueSocialMutations.length === 0 ? '✅ 0 violation' : `❌ ${rogueSocialMutations.length}`}`
  );
  console.log(
    `• Next.js 'use server' async  : ${nonAsyncServerActionExports.length === 0 ? '✅ 0 fonction non-async' : `❌ ${nonAsyncServerActionExports.length}`}`
  );
  console.log(`─────────────────────────────────────────────────\n`);

  if (errors.length > 0) {
    console.error(errors.join('\n\n'));
    console.error(`\n❌ Échec de l'audit architectural.\n`);
    process.exit(1);
  } else {
    console.log(`✅ Tous les gardes d'architecture sont au vert !\n`);
  }
}
