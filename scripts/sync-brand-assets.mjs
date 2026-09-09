#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════════
// 🔄 scripts/sync-brand-assets.mjs
// Synchronise les assets de marque canoniques depuis @qoe/brand/assets
// vers les répertoires publics des applications et les seeds Go.
// ═══════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SOURCE_AVATARS_DIR = path.join(ROOT_DIR, 'packages/brand/assets/avatars');
const SOURCE_LOGOS_DIR = path.join(ROOT_DIR, 'packages/brand/assets/logos');

const TARGET_AVATAR_DIRS = [
  path.join(ROOT_DIR, 'apps/core/public/avatars'),
  path.join(ROOT_DIR, 'apps/studio/public/avatars'),
  path.join(ROOT_DIR, 'apps/tenants/public/avatars'),
];

console.log('🔄 Synchronisation des assets @qoe/brand en cours...\n');

// 1. Synchronisation des 10 avatars génériques SVG
if (fs.existsSync(SOURCE_AVATARS_DIR)) {
  const avatarFiles = fs.readdirSync(SOURCE_AVATARS_DIR).filter((f) => f.endsWith('.svg'));
  console.log(
    `📦 ${avatarFiles.length} avatars sources trouvés dans packages/brand/assets/avatars`
  );

  for (const targetDir of TARGET_AVATAR_DIRS) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let syncedCount = 0;
    for (const file of avatarFiles) {
      const srcFile = path.join(SOURCE_AVATARS_DIR, file);
      const dstFile = path.join(targetDir, file);
      fs.copyFileSync(srcFile, dstFile);
      syncedCount++;
    }

    const relTarget = path.relative(ROOT_DIR, targetDir);
    console.log(`   ✅ ${syncedCount} avatars synchronisés vers ${relTarget}`);
  }
} else {
  console.warn('⚠️ Répertoire source packages/brand/assets/avatars introuvable.');
}

console.log('\n✨ Synchronisation terminée avec succès !');
