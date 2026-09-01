'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// =====================================================================
// 📖 ReadingPreferencesProvider — préférences de lecture APPLIQUÉES
// =====================================================================
// Parité mobile (`useUserSettings` dans apps/mobile) : les préférences
// serveur (GET/PATCH /v1/settings/preferences) sont appliquées RÉELLEMENT
// au DOM, de façon RÉACTIVE :
//   - reduceMotion  → <html data-qoe-reduce-motion>   (CSS : animations
//                     et transitions neutralisées, cf. globals.css)
//   - highContrast  → <html data-qoe-high-contrast>   (CSS : contraste)
//   - autoplayMedia → <html data-qoe-autoplay-media>  (consommé par les
//                     futurs composants média/vidéo)
//   - fontScale     → font-size racine du <body>      (échelle lecture)
// Le SSR pose les attributs initiaux (layout.tsx) ; ce provider les
// resynchronise côté client et les met à jour INSTANTANÉMENT quand un
// réglage change (sans recharger la page).
// =====================================================================

export interface ReadingPreferences {
  fontScale: number;
  reduceMotion: boolean;
  highContrast: boolean;
  autoplayMedia: boolean;
}

// Défauts alignés sur le Go (autoplayMedia: true, reduceMotion: false,
// highContrast: false, fontScale: 100).
export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  fontScale: 100,
  reduceMotion: false,
  highContrast: false,
  autoplayMedia: true,
};

interface ReadingPreferencesContextValue {
  preferences: ReadingPreferences;
  update: (patch: Partial<ReadingPreferences>) => void;
}

const ReadingPreferencesContext = createContext<ReadingPreferencesContextValue>({
  preferences: DEFAULT_READING_PREFERENCES,
  update: () => {},
});

export function ReadingPreferencesProvider({
  initial,
  children,
}: {
  initial: Partial<ReadingPreferences> | null;
  children: ReactNode;
}) {
  const [preferences, setPreferences] = useState<ReadingPreferences>(() => ({
    ...DEFAULT_READING_PREFERENCES,
    ...(initial ?? {}),
  }));

  // Synchronise le DOM : les attributs posés au SSR sont re-posés
  // (idempotent) puis suivent les changements locaux instantanément.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.qoeReduceMotion = String(preferences.reduceMotion);
    root.dataset.qoeHighContrast = String(preferences.highContrast);
    root.dataset.qoeAutoplayMedia = String(preferences.autoplayMedia);
    document.body.style.fontSize = `${preferences.fontScale}%`;
  }, [preferences]);

  const value = useMemo<ReadingPreferencesContextValue>(
    () => ({
      preferences,
      update: (patch) => setPreferences((current) => ({ ...current, ...patch })),
    }),
    [preferences]
  );

  return (
    <ReadingPreferencesContext.Provider value={value}>
      {children}
    </ReadingPreferencesContext.Provider>
  );
}

export function useReadingPreferences(): ReadingPreferencesContextValue {
  return useContext(ReadingPreferencesContext);
}
