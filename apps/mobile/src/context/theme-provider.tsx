// =====================================================================
// 🎨 ThemePreferenceProvider — préférence de thème persistée (mobile)
// =====================================================================
// La préférence vit en local (AsyncStorage) : 'system' | 'light' | 'dark'.
// Le hook `useColorScheme` (apps/mobile/src/hooks) délègue ici pour que
// TOUTE l'app (composants + expo-router ThemeProvider) suive le choix
// utilisateur, avec fallback sur le thème système quand « system ».
// =====================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Appearance } from 'react-native';

const STORAGE_KEY = 'qoe_theme_preference_v1';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface ThemePreferenceContextValue {
  /** Choix utilisateur persisté (défaut : 'system'). */
  preference: ThemePreference;
  /** Thème effectif résolu ('light' | 'dark'). */
  scheme: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

function systemScheme(): 'light' | 'dark' {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export function ThemePreferenceProvider({ children }: PropsWithChildren) {
  // Pendant le chargement, on suit le système (évite un flash de thème).
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active) return;
        if (raw === 'light' || raw === 'dark' || raw === 'system') {
          setPreferenceState(raw);
        }
      })
      .catch(() => {
        // lecture échouée → 'system' par défaut
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Suit le thème système quand la préférence est 'system' (changement live).
  const [systemSchemeState, setSystemSchemeState] = useState<'light' | 'dark'>(() =>
    systemScheme()
  );
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemSchemeState(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, []);

  const scheme: 'light' | 'dark' =
    !hydrated || preference === 'system' ? systemSchemeState : preference;

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // persistance en échec → le choix reste valide pour la session
    });
  }, []);

  const value = useMemo(
    () => ({ preference, scheme, setPreference }),
    [preference, scheme, setPreference]
  );

  return (
    <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreferenceContextValue {
  const context = useContext(ThemePreferenceContext);
  if (!context) {
    // Fallback hors provider (tests, rendus isolés) : système.
    return { preference: 'system', scheme: systemScheme(), setPreference: () => {} };
  }
  return context;
}
