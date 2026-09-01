/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, type ThemeColor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHighContrast } from '@/hooks/use-user-settings';

type ThemePalette = { [K in ThemeColor]: string };

/**
 * Surcharges « Contraste renforcé » : texte quasi pur, bordures franches,
 * surfaces de sélection plus marquées — appliquées par-dessus la palette
 * de base quand la préférence serveur highContrast est active.
 */
const HIGH_CONTRAST_OVERRIDES: Record<'light' | 'dark', Partial<ThemePalette>> = {
  light: {
    text: '#000000',
    textSecondary: '#1f1f24',
    border: '#000000',
    backgroundElement: '#d4d4da',
    backgroundSelected: '#b8b8c0',
  },
  dark: {
    text: '#ffffff',
    textSecondary: '#e0e0e6',
    border: '#ffffff',
    backgroundElement: '#26262b',
    backgroundSelected: '#3a3a42',
  },
};

export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? 'dark' : 'light';
  const highContrast = useHighContrast();

  const base = Colors[theme];
  return highContrast ? { ...base, ...HIGH_CONTRAST_OVERRIDES[theme] } : base;
}
