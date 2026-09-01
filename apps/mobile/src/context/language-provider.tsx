// =====================================================================
// 🌍 LanguagePreferenceProvider — langue persistée (mobile)
// =====================================================================
// La préférence vit en local (AsyncStorage). Au montage on applique la
// langue choisie sinon la langue de l'appareil (fr par défaut).
// `setLanguage` persiste + active le catalogue Lingui ; le bump d'état
// re-rend l'arbre, et `t()` (singleton) re-traduit au prochain render.
// =====================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CATALOGS } from '@qoe/i18n/catalogs';
import { setActiveLanguage } from '@qoe/i18n/core';
import { getLocales } from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

const STORAGE_KEY = 'qoe_language_v1';

export type AppLanguage = 'fr' | 'en';

export interface LanguageContextValue {
  /** Langue active résolue ('fr' | 'en'). */
  language: AppLanguage;
  /** true une fois la préférence chargée depuis le stockage. */
  isReady: boolean;
  setLanguage: (language: AppLanguage) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function deviceLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode;
  return code === 'en' ? 'en' : 'fr';
}

export function LanguagePreferenceProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<AppLanguage>('fr');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const next: AppLanguage = raw === 'en' ? 'en' : raw === 'fr' ? 'fr' : deviceLanguage();
        if (!active) return;
        setLanguageState(next);
        setActiveLanguage(next, CATALOGS[next] ?? CATALOGS.fr);
      })
      .catch(() => {
        if (!active) return;
        const next = deviceLanguage();
        setLanguageState(next);
        setActiveLanguage(next, CATALOGS[next] ?? CATALOGS.fr);
      })
      .finally(() => {
        if (active) setIsReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next);
    setActiveLanguage(next, CATALOGS[next] ?? CATALOGS.fr);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // persistance en échec → la langue reste active pour la session
    });
  }, []);

  const value = useMemo(
    () => ({ language, isReady, setLanguage }),
    [language, isReady, setLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useAppLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    return { language: deviceLanguage(), isReady: true, setLanguage: () => {} };
  }
  return context;
}
