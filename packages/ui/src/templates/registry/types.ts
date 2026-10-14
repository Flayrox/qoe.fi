// =====================================================================
// types.ts — Contrat formel du Registre de Thèmes (Qoefi Engine 2026)
// =====================================================================

import type React from 'react';
import type {
  LayoutConfig,
  TemplatePublicationContext,
  TemplateArticleItem,
  DesignTokensConfig,
} from '../schema';

/** Propriétés passées à l'enveloppe souveraine (Shell) d'un thème */
export interface ThemeShellProps {
  publication: TemplatePublicationContext;
  article?: TemplateArticleItem | null;
  articles?: TemplateArticleItem[];
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** Définition d'une variante de mise en page (ex: 'newspaper' vs 'magaziney') */
export interface ThemeLayoutVariant {
  id: string;
  name: string;
  description: string;
  layout: LayoutConfig;
}

/** Définition déclarative complète d'un thème / archétype */
export interface ThemeDefinition {
  /** Identifiant unique de l'archétype (ex: 'minimal', 'magazine', 'standard', 'dispatch') */
  id: string;
  /** Nom d'affichage lisible */
  name: string;
  /** Courte description de la signature visuelle */
  description: string;
  /** Tokens de design par défaut */
  defaultTokens: DesignTokensConfig;
  /** Composant Shell souverain enveloppant le contenu */
  Shell: React.ComponentType<ThemeShellProps>;
  /** Variantes de mise en page optionnelles par scope (ex: presets home 'newspaper', 'magaziney') */
  variants?: {
    home: Record<string, ThemeLayoutVariant>;
    article?: Record<string, ThemeLayoutVariant>;
  };
  /** Gabarits de blocs par défaut par scope */
  defaultLayouts: {
    home: LayoutConfig;
    article: LayoutConfig;
  };
  /**
   * Indique si l'en-tête est géré directement par le Shell souverain.
   * Si true, le BlockDispatcher ignore le bloc générique 'navbar' pour éviter les doublons.
   */
  suppressInternalNavbar?: boolean;
}
