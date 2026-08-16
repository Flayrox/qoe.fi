// ═══════════════════════════════════════════════════════════════════
// 🎨 @qoe/theme — native.ts
// Tokens de thème pour React Native (et toute cible sans DOM/CSS).
//
// Miroir des valeurs résolues de tokens.css + themes.css (source de
// vérité), pré-résolues en hex/rgba : RN ne supporte ni les CSS custom
// properties ni oklch(), on livre donc les valeurs concrètes.
//
// Import :  import { nativeTokens } from '@qoe/theme/native';
// ═══════════════════════════════════════════════════════════════════

export const nativeTokens = {
  light: {
    // ── Layer 1 — Primitives (zinc / vermillon), identiques en clair/sombre
    zinc: {
      '0': '#ffffff',
      '50': '#fafafa',
      '100': '#f4f4f5',
      '200': '#e4e4e7',
      '300': '#d4d4d8',
      '400': '#a1a1aa',
      '500': '#71717a',
      '600': '#52525b',
      '700': '#3f3f46',
      '800': '#27272a',
      '900': '#18181b',
      '950': '#09090b',
    },
    vermillion: {
      '400': '#e55a2e',
      '500': '#ee4b2b',
      '600': '#c7331a',
    },
    // Accents fonctionnels — oklch() converti en hex
    highlight: '#fbbf24', // oklch(0.78 0.13 75)
    success: '#34d399', // oklch(0.72 0.15 155)
    neural: {
      emerald: '#10b981', // oklch(0.68 0.15 152)
      rose: '#ee4b2b', // = var(--vermillion-500)
      amber: '#f59e0b', // oklch(0.75 0.12 75)
      blue: '#3b82f6', // oklch(0.65 0.14 240)
    },

    // ── Layer 2 — Sémantiques résolues (tokens.css, thème light)
    background: '#f5f5f7',
    foreground: '#09090b',
    card: '#ffffff',
    cardForeground: '#09090b',
    popover: '#ffffff',
    popoverForeground: '#09090b',
    primary: '#ee4b2b',
    primaryForeground: '#ffffff',
    secondary: '#f4f4f5',
    secondaryForeground: '#09090b',
    muted: '#f4f4f5',
    mutedForeground: '#71717a',
    accent: '#f4f4f5',
    accentForeground: '#09090b',
    destructive: '#c7331a',
    border: '#e4e4e7',
    input: '#e4e4e7',
    ring: '#09090b',

    // Sidebar — Style Apple Music Web (verre dépoli blanc)
    sidebar: 'rgba(255, 255, 255, 0.85)',
    sidebarForeground: '#18181b',
    sidebarPrimary: '#ee4b2b',
    sidebarPrimaryForeground: '#ffffff',
    sidebarAccent: 'rgba(0, 0, 0, 0.05)',
    sidebarAccentForeground: '#09090b',
    sidebarBorder: 'rgba(0, 0, 0, 0.08)',
    sidebarRing: '#ee4b2b',

    // Surfaces superposées (Layered Paper)
    surface0: '#ffffff',
    surface1: '#fafafa',
    surface2: '#f4f4f5',
    surface3: '#e4e4e7',

    // Hiérarchie de texte
    textPrimary: '#09090b',
    textSecondary: '#52525b',
    textTertiary: '#a1a1aa',
    textQuaternary: '#d4d4d8',

    // Bordures
    borderSubtle: 'rgba(0, 0, 0, 0.04)',
    borderDefault: 'rgba(0, 0, 0, 0.08)',
    borderStrong: 'rgba(0, 0, 0, 0.14)',
  },
  dark: {
    zinc: {
      '0': '#ffffff',
      '50': '#fafafa',
      '100': '#f4f4f5',
      '200': '#e4e4e7',
      '300': '#d4d4d8',
      '400': '#a1a1aa',
      '500': '#71717a',
      '600': '#52525b',
      '700': '#3f3f46',
      '800': '#27272a',
      '900': '#18181b',
      '950': '#09090b',
    },
    vermillion: {
      '400': '#e55a2e',
      '500': '#ee4b2b',
      '600': '#c7331a',
    },
    highlight: '#fbbf24',
    success: '#34d399',
    neural: {
      emerald: '#10b981',
      rose: '#ee4b2b',
      amber: '#f59e0b',
      blue: '#3b82f6',
    },

    // ── Layer 2 — Sémantiques résolues (themes.css, mode .dark)
    background: '#0a0a0c',
    foreground: '#fafafa',
    card: '#121215',
    cardForeground: '#fafafa',
    popover: '#121215',
    popoverForeground: '#fafafa',
    primary: '#ee4b2b',
    primaryForeground: '#ffffff',
    secondary: '#1c1c20',
    secondaryForeground: '#fafafa',
    muted: '#1c1c20',
    mutedForeground: '#a1a1aa',
    accent: '#1c1c20',
    accentForeground: '#fafafa',
    destructive: '#e55a2e', // vermillion-400, éclairci en dark
    border: 'rgba(255, 255, 255, 0.06)',
    input: 'rgba(255, 255, 255, 0.08)',
    ring: '#fafafa',

    sidebar: 'rgba(10, 10, 12, 0.85)',
    sidebarForeground: '#fafafa',
    sidebarPrimary: '#ee4b2b',
    sidebarPrimaryForeground: '#ffffff',
    sidebarAccent: 'rgba(255, 255, 255, 0.04)',
    sidebarAccentForeground: '#fafafa',
    sidebarBorder: 'rgba(255, 255, 255, 0.06)',
    sidebarRing: '#ee4b2b',

    surface0: '#0a0a0c',
    surface1: '#121215',
    surface2: '#1c1c20',
    surface3: '#27272a',

    textPrimary: '#fafafa',
    textSecondary: '#a1a1aa',
    textTertiary: '#71717a',
    textQuaternary: '#52525b',

    borderSubtle: 'rgba(255, 255, 255, 0.04)',
    borderDefault: 'rgba(255, 255, 255, 0.06)',
    borderStrong: 'rgba(255, 255, 255, 0.12)',
  },
} as const;

export type NativeThemeMode = keyof typeof nativeTokens;
export type NativeTokens = (typeof nativeTokens)[NativeThemeMode];
