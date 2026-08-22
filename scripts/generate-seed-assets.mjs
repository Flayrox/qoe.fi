// =====================================================================
// 🎨 Générateur des assets SVG du seed (avatars, logos, bannières)
// =====================================================================
// Génère un corpus local déterministe dans packages/db/prisma/fixtures/
// afin que le seed n'utilise AUCUNE image externe (Unsplash/DiceBear).
//
// Usage : node scripts/generate-seed-assets.mjs
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'packages', 'db', 'prisma', 'fixtures');

const PALETTES = [
  ['#4f46e5', '#06b6d4'],
  ['#7c3aed', '#ec4899'],
  ['#059669', '#84cc16'],
  ['#ea580c', '#facc15'],
  ['#dc2626', '#f97316'],
  ['#0284c7', '#22d3ee'],
  ['#9333ea', '#6366f1'],
  ['#16a34a', '#14b8a6'],
  ['#be123c', '#a21caf'],
  ['#ca8a04', '#65a30d'],
  ['#1d4ed8', '#7c3aed'],
  ['#0f766e', '#0ea5e9'],
];

function pick(arr, i) {
  return arr[i % arr.length];
}

function avatarSvg(i) {
  const [c1, c2] = pick(PALETTES, i);
  const variant = i % 4;
  const shapes =
    variant === 0
      ? `<circle cx="50" cy="40" r="18" fill="#ffffff" fill-opacity="0.92"/>
  <path d="M 22 84 C 22 66, 35 58, 50 58 C 65 58, 78 66, 78 84 Z" fill="#ffffff" fill-opacity="0.92"/>`
      : variant === 1
        ? `<rect x="32" y="26" width="36" height="36" rx="10" fill="#ffffff" fill-opacity="0.9"/>
  <path d="M 24 86 C 24 68, 36 62, 50 62 C 64 62, 76 68, 76 86 Z" fill="#ffffff" fill-opacity="0.9"/>`
        : variant === 2
          ? `<circle cx="50" cy="38" r="16" fill="#ffffff" fill-opacity="0.92"/>
  <rect x="26" y="60" width="48" height="26" rx="13" fill="#ffffff" fill-opacity="0.85"/>`
          : `<circle cx="50" cy="50" r="30" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="6"/>
  <circle cx="50" cy="50" r="12" fill="#ffffff" fill-opacity="0.95"/>`;
  const gid = `av${i}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">
  <defs>
    <linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="50" fill="url(#${gid})"/>
  ${shapes}
</svg>
`;
}

function logoSvg(i) {
  const [c1, c2] = pick(PALETTES, i + 3);
  const variant = i % 4;
  let shape;
  if (variant === 0) {
    shape = `<circle cx="40" cy="40" r="18" fill="${c1}"/>
  <rect x="52" y="52" width="26" height="26" rx="8" fill="${c2}"/>`;
  } else if (variant === 1) {
    shape = `<path d="M 30 66 L 50 26 L 70 66 Z" fill="${c1}"/>
  <path d="M 46 66 L 60 42 L 74 66 Z" fill="${c2}" fill-opacity="0.85"/>`;
  } else if (variant === 2) {
    shape = `<circle cx="38" cy="50" r="16" fill="${c1}"/>
  <circle cx="62" cy="50" r="16" fill="${c2}" fill-opacity="0.8"/>`;
  } else {
    shape = `<rect x="26" y="26" width="22" height="48" rx="6" fill="${c1}"/>
  <rect x="54" y="38" width="22" height="36" rx="6" fill="${c2}" fill-opacity="0.9"/>`;
  }
  const gid = `lg${i}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">
  <defs>
    <linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="20" fill="url(#${gid})"/>
  ${shape}
</svg>
`;
}

function bannerSvg(i) {
  const [c1, c2] = pick(PALETTES, i);
  const gid = `bn${i}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 400" width="1600" height="400">
  <defs>
    <linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="400" fill="url(#${gid})"/>
  <circle cx="1350" cy="80" r="220" fill="#ffffff" fill-opacity="0.08"/>
  <circle cx="1500" cy="330" r="140" fill="#ffffff" fill-opacity="0.06"/>
  <circle cx="180" cy="360" r="160" fill="#000000" fill-opacity="0.06"/>
</svg>
`;
}

function writeDir(name, count, builder, prefix, ext = 'svg') {
  const dir = path.join(FIXTURES, name);
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= count; i++) {
    fs.writeFileSync(path.join(dir, `${prefix}-${i}.${ext}`), builder(i - 1));
  }
  console.log(`✅ ${count} ${name} générés dans ${dir}`);
}

writeDir('avatars', 24, avatarSvg, 'avatar');
writeDir('logos', 12, logoSvg, 'logo');
writeDir('banners', 8, bannerSvg, 'banner');
console.log('\n🎉 Assets SVG du seed générés.');
