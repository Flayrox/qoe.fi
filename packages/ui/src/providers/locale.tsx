'use client';

import type { ReactNode } from 'react';
import { I18nProvider } from 'react-aria-components';

// =====================================================================
// 🌐 LocaleProvider — la langue de l'application, vue par react-aria
// =====================================================================
// 📖 react-aria formate ce qu'il rend (segments de date, tri, calendrier)
//    avec la locale qu'on lui donne, ou à défaut celle du navigateur côté
//    client et `en-US` côté serveur. Ce défaut est intenable en SSR : le
//    serveur produit « mm/dd/yyyy » et le client « jj/mm/aaaa », React
//    jette l'arbre rendu par le serveur et signale une erreur d'hydratation.
//
// 🎯 La locale vient donc du serveur (cookie, en-tête, route localisée),
//    jamais d'une découverte ambiante : les deux rendus partent du même
//    point, et une date se lit dans la langue choisie par la personne.
// =====================================================================

export interface LocaleProviderProps {
  /** Locale BCP 47, telle que rendue par l'application (`fr-FR`, `en-US`…). */
  locale: string;
  children: ReactNode;
}

export function LocaleProvider({ locale, children }: LocaleProviderProps) {
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}
