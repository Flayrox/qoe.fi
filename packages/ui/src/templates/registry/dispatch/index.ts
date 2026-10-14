// =====================================================================
// index.ts — Définition et Enregistrement du Thème Dispatch
// =====================================================================

import { DispatchShell } from './DispatchShell';
import {
  DISPATCH_TOKENS,
  DISPATCH_NEWSPAPER_CONFIG,
  DISPATCH_ARTICLE_CONFIG,
  DISPATCH_LAYOUT_VARIANTS,
} from './layouts';
import type { ThemeDefinition } from '../types';

export * from './DispatchShell';
export * from './layouts';

export const dispatchTheme: ThemeDefinition = {
  id: 'dispatch',
  name: 'Dispatch Publication',
  description:
    'Mise en page éditoriale indépendante avec flux asymétrique 2 colonnes, vignettes 16:9 à droite et sidebar auteur profilée.',
  defaultTokens: DISPATCH_TOKENS,
  Shell: DispatchShell,
  variants: DISPATCH_LAYOUT_VARIANTS,
  defaultLayouts: {
    home: DISPATCH_NEWSPAPER_CONFIG,
    article: DISPATCH_ARTICLE_CONFIG,
  },
  suppressInternalNavbar: true,
};
