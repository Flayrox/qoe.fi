// ═══════════════════════════════════════════════════════════════════
// 👤 @qoe/brand — avatars.ts
// Registry universel des avatars par défaut et helpers cross-platform.
// ═══════════════════════════════════════════════════════════════════

export interface DefaultAvatar {
  id: number;
  filename: string;
  kind: 'illustrated_avatar' | 'pixel_avatar';
  alt: string;
  publicPath: string;
  accentColor: string;
}

/**
 * 🎨 Liste canonique des 10 avatars génériques de qoe.fi.
 * Source de vérité partagée entre Web, Mobile et Seed Backend Go.
 */
export const DEFAULT_AVATARS: readonly DefaultAvatar[] = [
  {
    id: 1,
    filename: 'avatar-1.svg',
    kind: 'illustrated_avatar',
    alt: 'Avatar illustré Ambre',
    publicPath: '/avatars/avatar-1.svg',
    accentColor: '#4f46e5',
  },
  {
    id: 2,
    filename: 'avatar-2.svg',
    kind: 'illustrated_avatar',
    alt: 'Avatar illustré Noé',
    publicPath: '/avatars/avatar-2.svg',
    accentColor: '#06b6d4',
  },
  {
    id: 3,
    filename: 'avatar-3.svg',
    kind: 'pixel_avatar',
    alt: 'Avatar pixel Clara',
    publicPath: '/avatars/avatar-3.svg',
    accentColor: '#10b981',
  },
  {
    id: 4,
    filename: 'avatar-4.svg',
    kind: 'illustrated_avatar',
    alt: 'Avatar illustré Raphaël',
    publicPath: '/avatars/avatar-4.svg',
    accentColor: '#f59e0b',
  },
  {
    id: 5,
    filename: 'avatar-5.svg',
    kind: 'illustrated_avatar',
    alt: 'Avatar illustré Maya',
    publicPath: '/avatars/avatar-5.svg',
    accentColor: '#ee4b2b',
  },
  {
    id: 6,
    filename: 'avatar-6.svg',
    kind: 'illustrated_avatar',
    alt: 'Avatar illustré Lucas',
    publicPath: '/avatars/avatar-6.svg',
    accentColor: '#8b5cf6',
  },
  {
    id: 7,
    filename: 'avatar-7.svg',
    kind: 'illustrated_avatar',
    alt: 'Avatar illustré Sarah',
    publicPath: '/avatars/avatar-7.svg',
    accentColor: '#ec4899',
  },
  {
    id: 8,
    filename: 'avatar-8.svg',
    kind: 'illustrated_avatar',
    alt: 'Avatar illustré Thomas',
    publicPath: '/avatars/avatar-8.svg',
    accentColor: '#14b8a6',
  },
  {
    id: 9,
    filename: 'avatar-9.svg',
    kind: 'illustrated_avatar',
    alt: 'Avatar illustré Emma',
    publicPath: '/avatars/avatar-9.svg',
    accentColor: '#3b82f6',
  },
  {
    id: 10,
    filename: 'avatar-10.svg',
    kind: 'illustrated_avatar',
    alt: 'Avatar illustré Gabriel',
    publicPath: '/avatars/avatar-10.svg',
    accentColor: '#f97316',
  },
] as const;

/**
 * Récupère un avatar par son identifiant (1 à 10).
 */
export function getDefaultAvatar(idOrIndex: number | string): DefaultAvatar {
  const numericId = typeof idOrIndex === 'string' ? parseInt(idOrIndex, 10) : idOrIndex;
  const normalizedIndex = isNaN(numericId) ? 1 : Math.max(1, Math.min(10, numericId));
  return DEFAULT_AVATARS[normalizedIndex - 1] || DEFAULT_AVATARS[0];
}

/**
 * Détermine si une URL correspond à l'un des avatars par défaut de qoe.fi.
 */
export function isDefaultAvatarUrl(url?: string | null): boolean {
  if (!url) return false;
  return /^\/avatars\/avatar-(?:[1-9]|10)\.svg$/.test(url.trim());
}
