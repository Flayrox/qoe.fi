import { useColorScheme as useRNColorScheme } from 'react-native';

import { useThemePreference } from '@/context/theme-provider';

/**
 * useColorScheme — thème effectif piloté par la préférence persistée
 * ('system' | 'light' | 'dark'). Délègue au ThemePreferenceProvider :
 * tout l'arbre (y compris expo-router ThemeProvider) suit le choix
 * utilisateur au lieu du seul réglage système.
 */
export function useColorScheme() {
  useRNColorScheme(); // souscrit aux changements système (re-render)
  const { scheme } = useThemePreference();
  return scheme;
}
