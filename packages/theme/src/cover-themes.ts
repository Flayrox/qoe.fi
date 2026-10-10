// ═══════════════════════════════════════════════════════════════════
// 🎨 @qoe/theme — cover-themes.ts
// Couvertures déterministes vectorielles SVG 100% autonomes (Web & Mobile).
// Génération locale sans aucune dépendance externe (zéro appel Unsplash).
// Format 16:9 (1200x675) haute fidélité pour previews, vitrines et Stage.
// ═══════════════════════════════════════════════════════════════════

export interface CoverTheme {
  id: string;
  name: string;
  generateSvg: (seed: string) => string;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const encodeSvg = (svg: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;

/**
 * 1. Terracotta & Obsidian (Culture, Essais, Littérature)
 */
function createTerracottaSvg(seed: string): string {
  const h = hashString(seed);
  const cx = 750 + (h % 150);
  const cy = 250 + ((h >> 2) % 100);
  const r = 220 + ((h >> 4) % 60);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="100%" height="100%">
  <defs>
    <linearGradient id="bg-terra" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#18181b" />
      <stop offset="60%" stop-color="#1c1917" />
      <stop offset="100%" stop-color="#292524" />
    </linearGradient>
    <radialGradient id="sun-terra" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.9" />
      <stop offset="70%" stop-color="#c2410c" stop-opacity="0.6" />
      <stop offset="100%" stop-color="#c2410c" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="arc-grad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ea580c" />
      <stop offset="100%" stop-color="#fbbf24" />
    </linearGradient>
    <pattern id="grid-terra" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.05" />
    </pattern>
  </defs>
  <rect width="1200" height="675" fill="url(#bg-terra)" />
  <rect width="1200" height="675" fill="url(#grid-terra)" />
  <circle cx="${cx}" cy="${cy}" r="${r * 1.5}" fill="url(#sun-terra)" />
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-opacity="0.3" stroke-dasharray="6 6" />
  <path d="M 100 550 C 350 480, 500 200, 950 250" fill="none" stroke="url(#arc-grad)" stroke-width="3" stroke-linecap="round" opacity="0.8" />
  <circle cx="280" cy="480" r="14" fill="#fbbf24" />
  <circle cx="280" cy="480" r="32" fill="none" stroke="#fbbf24" stroke-width="1" opacity="0.4" />
  <path d="M 0 580 Q 400 480, 800 620 T 1200 560" fill="none" stroke="#44403c" stroke-width="1.5" opacity="0.4" />
  <rect x="80" y="80" width="80" height="4" rx="2" fill="#ea580c" opacity="0.9" />
</svg>`;
}

/**
 * 2. Astral Sapphire & Violet (Tech, Futur, Innovation)
 */
function createAstralSvg(seed: string): string {
  const h = hashString(seed);
  const offset = (h % 100) - 50;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="100%" height="100%">
  <defs>
    <linearGradient id="bg-astral" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e1b4b" />
    </linearGradient>
    <radialGradient id="glow-astral" cx="70%" cy="30%" r="60%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35" />
      <stop offset="60%" stop-color="#818cf8" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="wave-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg-astral)" />
  <rect width="1200" height="675" fill="url(#glow-astral)" />
  <!-- Courbes dynamiques onde -->
  <path d="M -50 ${400 + offset} Q 300 ${200 + offset}, 650 ${450 + offset} T 1250 ${300 + offset}" fill="none" stroke="url(#wave-cyan)" stroke-width="2.5" opacity="0.75" />
  <path d="M -50 ${440 + offset} Q 320 ${240 + offset}, 670 ${490 + offset} T 1250 ${340 + offset}" fill="none" stroke="#818cf8" stroke-width="1.5" opacity="0.4" stroke-dasharray="8 6" />
  <circle cx="650" cy="${450 + offset}" r="8" fill="#38bdf8" />
  <circle cx="650" cy="${450 + offset}" r="22" fill="none" stroke="#38bdf8" stroke-width="1" opacity="0.5" />
  <!-- Étoiles géométriques discrètes -->
  <circle cx="200" cy="180" r="2.5" fill="#e0f2fe" opacity="0.6" />
  <circle cx="340" cy="120" r="2" fill="#e0f2fe" opacity="0.4" />
  <circle cx="980" cy="220" r="3" fill="#e0f2fe" opacity="0.7" />
  <circle cx="1060" cy="140" r="1.5" fill="#e0f2fe" opacity="0.5" />
  <rect x="80" y="80" width="80" height="4" rx="2" fill="#38bdf8" opacity="0.9" />
</svg>`;
}

/**
 * 3. Emerald & Sage (Société, Nature, Écologie)
 */
function createEmeraldSvg(seed: string): string {
  const h = hashString(seed);
  const cx = 700 + (h % 180);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="100%" height="100%">
  <defs>
    <linearGradient id="bg-emerald" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#052e16" />
      <stop offset="60%" stop-color="#064e3b" />
      <stop offset="100%" stop-color="#022c22" />
    </linearGradient>
    <radialGradient id="sun-sage" cx="60%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#34d399" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#052e16" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="leaf-grad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#a7f3d0" />
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg-emerald)" />
  <rect width="1200" height="675" fill="url(#sun-sage)" />
  <ellipse cx="${cx}" cy="320" rx="260" ry="260" fill="none" stroke="#10b981" stroke-width="1.5" opacity="0.25" stroke-dasharray="4 8" />
  <path d="M 120 600 C 400 450, 600 580, 1100 280" fill="none" stroke="url(#leaf-grad)" stroke-width="3" stroke-linecap="round" opacity="0.8" />
  <circle cx="520" cy="480" r="12" fill="#34d399" />
  <circle cx="520" cy="480" r="28" fill="none" stroke="#34d399" stroke-width="1" opacity="0.4" />
  <rect x="80" y="80" width="80" height="4" rx="2" fill="#34d399" opacity="0.9" />
</svg>`;
}

/**
 * 4. Obsidian & Crimson (Presse souveraine, Enquêtes, Économie)
 */
function createCrimsonSvg(seed: string): string {
  const h = hashString(seed);
  const slant = (h % 40) - 20;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="100%" height="100%">
  <defs>
    <linearGradient id="bg-crimson" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#09090b" />
      <stop offset="70%" stop-color="#18181b" />
      <stop offset="100%" stop-color="#27272a" />
    </linearGradient>
    <linearGradient id="red-glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ef4444" />
      <stop offset="100%" stop-color="#991b1b" />
    </linearGradient>
    <pattern id="dots-crimson" width="30" height="30" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.5" fill="#ffffff" fill-opacity="0.06" />
    </pattern>
  </defs>
  <rect width="1200" height="675" fill="url(#bg-crimson)" />
  <rect width="1200" height="675" fill="url(#dots-crimson)" />
  <path d="M 0 520 L 1200 ${360 + slant}" fill="none" stroke="#3f3f46" stroke-width="1.5" stroke-dasharray="10 6" opacity="0.5" />
  <path d="M 0 460 L 1200 ${300 + slant}" fill="none" stroke="url(#red-glow)" stroke-width="3" stroke-linecap="round" opacity="0.85" />
  <circle cx="780" cy="${340 + slant}" r="16" fill="#ef4444" />
  <circle cx="780" cy="${340 + slant}" r="38" fill="none" stroke="#ef4444" stroke-width="1" opacity="0.4" />
  <rect x="80" y="80" width="80" height="4" rx="2" fill="#ef4444" opacity="0.9" />
</svg>`;
}

/**
 * 5. Ocean Deep & Cyan (Regard critique, Horizons, Géopolitique)
 */
function createOceanSvg(seed: string): string {
  const h = hashString(seed);
  const cx = 800 + (h % 120);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="100%" height="100%">
  <defs>
    <linearGradient id="bg-ocean" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#082f49" />
      <stop offset="60%" stop-color="#0c4a6e" />
      <stop offset="100%" stop-color="#031f33" />
    </linearGradient>
    <linearGradient id="ocean-beam" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg-ocean)" />
  <circle cx="${cx}" cy="280" r="280" fill="none" stroke="#38bdf8" stroke-width="1.5" opacity="0.2" stroke-dasharray="8 8" />
  <circle cx="${cx}" cy="280" r="180" fill="none" stroke="#38bdf8" stroke-width="1" opacity="0.3" />
  <path d="M 80 560 Q 500 380, 1150 420" fill="none" stroke="url(#ocean-beam)" stroke-width="3" stroke-linecap="round" opacity="0.8" />
  <circle cx="420" cy="460" r="12" fill="#38bdf8" />
  <rect x="80" y="80" width="80" height="4" rx="2" fill="#38bdf8" opacity="0.9" />
</svg>`;
}

/**
 * 6. Solar Bronze & Ochre (Philosophie, Idées, Débats)
 */
function createSolarSvg(seed: string): string {
  const h = hashString(seed);
  const cx = 680 + (h % 140);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="100%" height="100%">
  <defs>
    <linearGradient id="bg-solar" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1c1917" />
      <stop offset="50%" stop-color="#292524" />
      <stop offset="100%" stop-color="#44403c" />
    </linearGradient>
    <radialGradient id="sun-warm" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.7" />
      <stop offset="60%" stop-color="#d97706" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#1c1917" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="line-gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#fef3c7" />
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg-solar)" />
  <circle cx="${cx}" cy="300" r="260" fill="url(#sun-warm)" />
  <path d="M 120 540 C 450 320, 750 600, 1100 360" fill="none" stroke="url(#line-gold)" stroke-width="3" stroke-linecap="round" opacity="0.85" />
  <circle cx="600" cy="440" r="14" fill="#fbbf24" />
  <circle cx="600" cy="440" r="34" fill="none" stroke="#fbbf24" stroke-width="1" opacity="0.4" />
  <rect x="80" y="80" width="80" height="4" rx="2" fill="#fbbf24" opacity="0.9" />
</svg>`;
}

export const COVER_THEMES: CoverTheme[] = [
  { id: 'terracotta', name: 'Terre cuite', generateSvg: createTerracottaSvg },
  { id: 'astral', name: 'Astral', generateSvg: createAstralSvg },
  { id: 'emerald', name: 'Émeraude', generateSvg: createEmeraldSvg },
  { id: 'crimson', name: 'Carmin', generateSvg: createCrimsonSvg },
  { id: 'ocean', name: 'Océan', generateSvg: createOceanSvg },
  { id: 'solar', name: 'Solaire', generateSvg: createSolarSvg },
];

/**
 * 🖼️ getCoverPlaceholder — Génère une couverture SVG vectorielle déterministe
 * basée sur le slug, titre, ID ou index de l'article / post.
 * Renvoie une Data-URI prête à l'emploi (zéro réseau, zéro Unsplash).
 */
export function getCoverPlaceholder(seed?: string | number | null): string {
  const cleanSeed = String(seed || 'qoe-article')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  const index = hashString(cleanSeed) % COVER_THEMES.length;
  const theme = COVER_THEMES[index]!;
  return encodeSvg(theme.generateSvg(cleanSeed));
}

// Couvertures statiques exportées pour raccourcis direct
export const PLACEHOLDER_COVER_1 = encodeSvg(createTerracottaSvg('art-1'));
export const PLACEHOLDER_COVER_2 = encodeSvg(createAstralSvg('art-2'));
export const PLACEHOLDER_COVER_3 = encodeSvg(createEmeraldSvg('art-3'));
export const PLACEHOLDER_COVER_4 = encodeSvg(createCrimsonSvg('art-4'));
export const PLACEHOLDER_COVER_5 = encodeSvg(createOceanSvg('art-5'));
export const PLACEHOLDER_COVER_6 = encodeSvg(createSolarSvg('art-6'));
