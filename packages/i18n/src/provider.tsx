// =====================================================================
// 🌐 Tolgee Provider — Client Component
// =====================================================================
// 📖 Wrap toute l'app pour activer les traductions Tolgee.
//    Utilise le pattern SSR de Tolgee pour Next.js 16.
// =====================================================================

"use client";

import { TolgeeProvider } from "@tolgee/react";
import { Tolgee } from "@tolgee/web";
import { DEFAULT_LANGUAGE, type Language } from "./locales";

// 🌐 Singleton instance de Tolgee initialisée une seule fois
const tolgeeInstance = Tolgee().init({
  fallbackLanguage: DEFAULT_LANGUAGE,
});

/**
 * 🔌 Provider Tolgee à wrap dans le root layout.
 */
export function TolgeeNextProvider({
  language,
  staticData,
  children,
}: {
  language: Language;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  staticData: any;
  children: React.ReactNode;
}) {
  return (
    <TolgeeProvider
      tolgee={tolgeeInstance}
      ssr={{
        language,
        staticData: staticData as never,
      }}
    >
      {children}
    </TolgeeProvider>
  );
}
