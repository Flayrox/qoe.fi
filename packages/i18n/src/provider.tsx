// =====================================================================
// 🌐 Tolgee Provider — Client Component
// =====================================================================
// 📖 Wrap toute l'app pour activer les traductions Tolgee.
//    Utilise le pattern SSR de Tolgee pour Next.js 16.
// =====================================================================

"use client";

import { TolgeeProvider } from "@tolgee/react";
import { Tolgee } from "@tolgee/web";
import { useEffect, useState } from "react";
import { DEFAULT_LANGUAGE, type Language } from "./locales";

/**
 * 🌐 Crée une instance Tolgee côté client.
 */
function createTolgee(language: Language, staticData: Record<string, string>) {
  return Tolgee()
    .use(...)
    .init({
      language,
      staticData,
      fallbackLanguage: DEFAULT_LANGUAGE,
    });
}

/**
 * 🔌 Provider Tolgee à wrap dans le root layout.
 */
export function TolgeeNextProvider({
  language,
  staticData,
  children,
}: {
  language: Language;
  staticData: Record<string, string>;
  children: React.ReactNode;
}) {
  // Tolgee doit être créé côté client uniquement
  const [tolgee, setTolgee] = useState<ReturnType<typeof createTolgee> | null>(null);

  useEffect(() => {
    setTolgee(createTolgee(language, staticData));
  }, [language, staticData]);

  if (!tolgee) return <>{children}</>;

  return <TolgeeProvider tolgee={tolgee}>{children}</TolgeeProvider>;
}
