#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════════
// 🔍 scripts/audit-brand-assets.mjs
// Audit et détection de tous les logos, SVGs, badges et icônes
// dispersés dans le monorepo (pour suivi de la centralisation).
// ═══════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SCAN_DIRS = ['apps', 'packages'];
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.git',
  '.reference',
  'coverage',
  '.preview',
];

/** @type {{ file: string, type: string, detail: string }[]} */
const findings = [];

function isExcluded(filePath) {
  return EXCLUDE_PATTERNS.some(
    (pattern) => filePath.includes(`/${pattern}/`) || filePath.includes(`\\${pattern}\\`)
  );
}

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (isExcluded(fullPath)) continue;

    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.isFile()) {
      analyzeFile(fullPath);
    }
  }
}

function analyzeFile(filePath) {
  const relPath = path.relative(ROOT_DIR, filePath);
  const ext = path.extname(filePath).toLowerCase();

  // 1. Détection des fichiers .svg dispersés
  if (ext === '.svg') {
    if (relPath.includes('packages/brand/assets')) {
      // Déjà dans la source de vérité !
      return;
    }
    findings.push({
      file: relPath,
      type: 'SVG_FILE',
      detail: `Fichier SVG brut hors @qoe/brand`,
    });
    return;
  }

  // 2. Détection du code TSX / TS
  if (ext === '.tsx' || ext === '.ts') {
    if (relPath.startsWith('packages/brand/')) return; // Ne pas analyser le package brand lui-même

    const content = fs.readFileSync(filePath, 'utf-8');

    // A. Inline SVG <svg ...>
    const svgMatches = content.match(/<svg[\s\S]*?>/g);
    if (svgMatches && !relPath.includes('packages/brand')) {
      findings.push({
        file: relPath,
        type: 'INLINE_SVG',
        detail: `${svgMatches.length} balise(s) <svg> inline trouvée(s)`,
      });
    }

    // B. Détection de faux badges de certification / texte ✓
    if (content.includes('>✓<') || content.includes('{"✓"}') || content.includes("'✓'")) {
      findings.push({
        file: relPath,
        type: 'HACK_CERTIFIED_TEXT',
        detail: `Caractère texte brut ✓ utilisé pour la certification`,
      });
    }

    // C. Détection de SymbolView / expo-symbols de certification
    if (content.includes('checkmark.seal.fill')) {
      findings.push({
        file: relPath,
        type: 'SF_SYMBOL_CERTIFIED',
        detail: `SymbolView checkmark.seal.fill (certification iOS)`,
      });
    }

    // D. Détection d'imports directs de logos bruts
    if (
      content.includes('qoefi_logo.svg') ||
      content.includes('qoefie_svg.svg') ||
      content.includes('qoefi_letters.svg')
    ) {
      findings.push({
        file: relPath,
        type: 'RAW_LOGO_IMPORT',
        detail: `Import direct d'un SVG de logo sans passer par @qoe/brand`,
      });
    }

    // E. SocialIcon locale
    if (content.includes('switch (normalizedPlatform)') || content.includes("case 'twitter':")) {
      findings.push({
        file: relPath,
        type: 'HARDCODED_SOCIAL_ICONS',
        detail: `Tracés d'icônes sociales codés en dur`,
      });
    }
  }
}

// Lancement du scan
console.log('🔍 Scan du monorepo en cours pour les assets de marque / logos / icônes...');
for (const dir of SCAN_DIRS) {
  scanDir(path.join(ROOT_DIR, dir));
}

// Regroupement par catégorie
const byType = findings.reduce((acc, f) => {
  acc[f.type] = acc[f.type] || [];
  acc[f.type].push(f);
  return acc;
}, {});

console.log('\n📊 ─── RÉSULTATS DE L’AUDIT DES ASSETS ───\n');

for (const [type, items] of Object.entries(byType)) {
  console.log(`📌 [${type}] : ${items.length} occurrence(s)`);
  items.slice(0, 8).forEach((item) => {
    console.log(`   - ${item.file} (${item.detail})`);
  });
  if (items.length > 8) {
    console.log(`   ... et ${items.length - 8} autre(s)`);
  }
  console.log('');
}

console.log(`✨ Total : ${findings.length} points d'attention détectés.`);
