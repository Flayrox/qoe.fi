// ═══════════════════════════════════════════════════════════════════
// 🎨 @qoe/theme — avatar-themes.ts
// Thèmes déterministes universels (Web & Mobile) style Discord 2026.
// Attribution stable au rechargement basée sur l'identifiant du compte.
// Distinction claire : Utilisateurs (Personal) vs Médias (Media/Presse).
// ═══════════════════════════════════════════════════════════════════

export interface AvatarTheme {
  id: string;
  name: string;
  lightBg: string;
  lightIcon: string;
  darkBg: string;
  darkIcon: string;
  borderLight: string;
  borderDark: string;
}

/**
 * 🧑 Thèmes déterministes pour Utilisateurs / Créateurs individuels
 * 8 variantes poétiques & riches : Sakura, Matcha, Astral, Classique, Ambre, Océan, Crépuscule, Menthe.
 */
export const USER_AVATAR_THEMES: AvatarTheme[] = [
  {
    id: 'sakura',
    name: 'Sakura',
    lightBg: '#fce7f3', // Rose poudré délicat
    lightIcon: '#db2777', // Rose fuchsia profond
    darkBg: '#4c0519', // Fond vin/framboise sombre
    darkIcon: '#f472b6', // Rose pastel lumineux
    borderLight: '#fbcfe8',
    borderDark: '#831843',
  },
  {
    id: 'matcha',
    name: 'Matcha',
    lightBg: '#dcfce7', // Vert thé doux
    lightIcon: '#16a34a', // Vert matcha vif
    darkBg: '#052e16', // Vert forêt profond
    darkIcon: '#4ade80', // Vert feuille lumineux
    borderLight: '#bbf7d0',
    borderDark: '#14532d',
  },
  {
    id: 'astral',
    name: 'Astral',
    lightBg: '#ede9fe', // Lavande cosmique
    lightIcon: '#7c3aed', // Violet électrique
    darkBg: '#2e1065', // Fond nuit stellaire
    darkIcon: '#a78bfa', // Lilas astral lumineux
    borderLight: '#ddd6fe',
    borderDark: '#581c87',
  },
  {
    id: 'classique',
    name: 'Classique',
    lightBg: '#f4f4f5', // Titane neutre
    lightIcon: '#52525b', // Ardoise graphite
    darkBg: '#18181b', // Carbone sombre
    darkIcon: '#d4d4d8', // Argent clair
    borderLight: '#e4e4e7',
    borderDark: '#27272a',
  },
  {
    id: 'ambre',
    name: 'Ambre',
    lightBg: '#fef3c7', // Miel d'été
    lightIcon: '#d97706', // Ocre chaud
    darkBg: '#451a03', // Terre de sienne sombre
    darkIcon: '#fbbf24', // Ambre doré
    borderLight: '#fde68a',
    borderDark: '#78350f',
  },
  {
    id: 'ocean',
    name: 'Océan',
    lightBg: '#e0f2fe', // Ciel / Lagon azur
    lightIcon: '#0284c7', // Bleu céruléen
    darkBg: '#082f49', // Abysse marine
    darkIcon: '#38bdf8', // Bleu cyan lumineux
    borderLight: '#bae6fd',
    borderDark: '#0c4a6e',
  },
  {
    id: 'crepuscule',
    name: 'Crépuscule',
    lightBg: '#ffedd5', // Pêche douce
    lightIcon: '#ea580c', // Orange coucher de soleil
    darkBg: '#431407', // Nuit rougeoyante
    darkIcon: '#fb923c', // Corail vibrant
    borderLight: '#fed7aa',
    borderDark: '#7c2d12',
  },
  {
    id: 'menthe',
    name: 'Menthe',
    lightBg: '#ccfbf1', // Menthe claire
    lightIcon: '#0d9488', // Teal minéral
    darkBg: '#042f2e', // Vert émeraude sombre
    darkIcon: '#2dd4bf', // Menthe néon
    borderLight: '#99f6e4',
    borderDark: '#134e4a',
  },
];

/**
 * 📰 Thèmes déterministes pour Médias / Publications / Revues
 * Palettes éditoriales sophistiquées : Gazette, Tribune, Revue, Studio, Édition, Chronique.
 */
export const MEDIA_AVATAR_THEMES: AvatarTheme[] = [
  {
    id: 'gazette',
    name: 'Gazette',
    lightBg: '#fef2f2', // Papier de presse léger
    lightIcon: '#dc2626', // Rouge éditorial / presse
    darkBg: '#450a0a', // Rouge pourpre presse
    darkIcon: '#f87171', // Rouge carmin clair
    borderLight: '#fecaca',
    borderDark: '#7f1d1d',
  },
  {
    id: 'tribune',
    name: 'Tribune',
    lightBg: '#eff6ff', // Bleu institutionnel
    lightIcon: '#1d4ed8', // Bleu cobalt officiel
    darkBg: '#172554', // Bleu nuit diplomatique
    darkIcon: '#60a5fa', // Bleu azur institution
    borderLight: '#dbeafe',
    borderDark: '#1e3a8a',
  },
  {
    id: 'edition',
    name: 'Édition',
    lightBg: '#faf5ff', // Teinte littéraire
    lightIcon: '#6b21a8', // Encre pourpre
    darkBg: '#3b0764', // Reliure cuir sombre
    darkIcon: '#c084fc', // Lilas éditorial
    borderLight: '#f3e8ff',
    borderDark: '#581c87',
  },
  {
    id: 'revue',
    name: 'Revue',
    lightBg: '#f0fdf4', // Vert académique
    lightIcon: '#15803d', // Vert reliure
    darkBg: '#052e16', // Vert bibliothèque
    darkIcon: '#86efac', // Sauge papier
    borderLight: '#dcfce7',
    borderDark: '#166534',
  },
  {
    id: 'chronique',
    name: 'Chronique',
    lightBg: '#fff7ed', // Parchemin ambré
    lightIcon: '#c2410c', // Terre cuite éditoriale
    darkBg: '#431407', // Havane sombre
    darkIcon: '#fdba74', // Ambre papier
    borderLight: '#ffedd5',
    borderDark: '#9a3412',
  },
  {
    id: 'studio',
    name: 'Studio',
    lightBg: '#f8fafc', // Titane studio moderne
    lightIcon: '#0f172a', // Encre de chine
    darkBg: '#0f172a', // Studio darkroom
    darkIcon: '#f1f5f9', // Blanc studio
    borderLight: '#e2e8f0',
    borderDark: '#334155',
  },
];

/**
 * Fonction de hachage djb2 simple, rapide et stable.
 * Garantit que la même graine (ID ou username) produira toujours le même indice.
 */
function hashString(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }
  return Math.abs(hash >>> 0);
}

/**
 * Renvoie le thème déterministe pour un utilisateur ou un média donné.
 * @param seed user.id, user.username, ou publication.id
 * @param type 'PERSONAL' (par défaut) ou 'MEDIA'
 */
export function getAvatarTheme(
  seed?: string | null,
  type?: 'PERSONAL' | 'MEDIA' | string | null
): AvatarTheme {
  const cleanSeed = (seed || '').trim().toLowerCase() || 'qoe-default';
  const isMedia = type === 'MEDIA';
  const themes = isMedia ? MEDIA_AVATAR_THEMES : USER_AVATAR_THEMES;
  const index = hashString(cleanSeed) % themes.length;
  return themes[index]!;
}
