import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { useThemePreference } from '@/context/theme-provider';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 * Le thème effectif suit la préférence persistée (ThemePreferenceProvider) ;
 * le portail d'hydratation reste pour éviter un mismatch SSR.
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    // Deliberate hydration gate for static web rendering: flipping this flag
    // after mount makes the client re-render with the real color scheme,
    // avoiding a hydration mismatch with the server-rendered HTML.

    setHasHydrated(true);
  }, []);

  useRNColorScheme(); // souscrit aux changements système
  const { scheme } = useThemePreference();

  if (hasHydrated) {
    return scheme;
  }

  return 'light';
}
