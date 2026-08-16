/**
 * Thème mobile — piloté par le package partagé @qoe/theme (le même que
 * les apps web). Aucune couleur n'est hardcodée ici : on mappe les tokens
 * sémantiques du web vers les noms consommés par les composants mobile.
 *
 * Choix de mapping (décision produit mobile) :
 *   - La « page » mobile (deck/feed) = la surface `card` du web (blanche).
 *   - La sidebar mobile = le `background` du web (#f5f5f7, gris très léger).
 */

import '@/global.css';

import { Platform } from 'react-native';

import { nativeTokens, type NativeTokens } from '@qoe/theme/native';

function toMobileTheme(t: NativeTokens) {
  return {
    text: t.foreground,
    background: t.card,
    backgroundElement: t.secondary,
    backgroundSelected: t.muted,
    textSecondary: t.textSecondary,
    sidebar: t.background,
    primary: t.primary,
    link: t.primary,
    border: t.border,
    destructive: t.destructive,
    success: t.success,
  };
}

export const Colors = {
  light: toMobileTheme(nativeTokens.light),
  dark: toMobileTheme(nativeTokens.dark),
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
