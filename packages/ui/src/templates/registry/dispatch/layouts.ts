// =====================================================================
// layouts.ts — Gabarits et Variantes de Layouts pour le Thème Dispatch
// =====================================================================

import type { LayoutConfig } from '../../schema';
import type { ThemeLayoutVariant } from '../types';

export const DISPATCH_TOKENS = {
  cardShape: 'rounded-lg' as const,
  density: 'standard' as const,
  surface: 'flat' as const,
  fontFamily: 'serif',
  accentColor: '#d9531e', // Teinte terracotta chaude d'édition
};

/**
 * 📰 Variante Newspaper :
 * 2 colonnes asymétriques : flux principal avec vignettes 16:9 à droite et sidebar auteur sticky.
 */
export const DISPATCH_NEWSPAPER_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'dispatch',
  tokens: DISPATCH_TOKENS,
  blocks: [
    {
      id: 'block_dispatch_feed_main',
      type: 'dispatch-feed',
      label: 'Flux de publication (2 colonnes)',
      visible: true,
      locked: false,
      props: {
        showLead: true,
      },
    },
  ],
};

/**
 * 🗞️ Variante Magaziney :
 * 3 colonnes asymétriques : Lead Story panoramique pleine page en tête, suivie du flux 2 colonnes.
 */
export const DISPATCH_MAGAZINEY_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'dispatch',
  tokens: DISPATCH_TOKENS,
  blocks: [
    {
      id: 'block_dispatch_magazine_grid',
      type: 'dispatch-magazine',
      label: 'Grille Magazine (3 colonnes)',
      visible: true,
      locked: false,
      props: {
        heading: 'À la une',
      },
    },
    {
      id: 'block_dispatch_feed_recent',
      type: 'dispatch-feed',
      label: 'Flux d’articles récents',
      visible: true,
      locked: false,
      props: {
        showLead: false,
      },
    },
  ],
};

/**
 * 📄 Gabarit de lecture d'article Dispatch :
 * Image de couverture panoramique 16:9, Dek (sous-titre), byline auteur et colonne de lecture calibrée.
 */
export const DISPATCH_ARTICLE_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'dispatch',
  tokens: DISPATCH_TOKENS,
  blocks: [
    {
      id: 'block_dispatch_article_body',
      type: 'article-content',
      label: 'Corps de l’article',
      visible: true,
      locked: true,
      props: {
        dropCap: false,
        showSocialShare: true,
      },
    },
    {
      id: 'block_dispatch_newsletter_cta',
      type: 'newsletter-wall',
      label: 'Souscription à la publication',
      visible: true,
      locked: false,
      props: {
        title: 'Ne manquez aucune édition',
        description:
          'Rejoignez la communauté et recevez les prochains articles directement dans votre boîte de réception.',
      },
    },
  ],
};

/**
 * Dictionnaire formel des variantes de layouts déclaratives pour le thème Dispatch
 */
export const DISPATCH_LAYOUT_VARIANTS: {
  home: Record<string, ThemeLayoutVariant>;
  article: Record<string, ThemeLayoutVariant>;
} = {
  home: {
    newspaper: {
      id: 'newspaper',
      name: 'Newspaper (2 Colonnes)',
      description:
        'Mise en page éditoriale avec flux de cartes à vignette droite et sidebar auteur profilée.',
      layout: DISPATCH_NEWSPAPER_CONFIG,
    },
    magaziney: {
      id: 'magaziney',
      name: 'Magaziney (3 Colonnes)',
      description:
        'Mise en page grand format avec grande histoire panoramique en une et flux secondaire.',
      layout: DISPATCH_MAGAZINEY_CONFIG,
    },
  },
  article: {
    standard: {
      id: 'standard',
      name: 'Lecture Dispatch Standard',
      description: 'Colonne de lecture 720px épurée avec image de couverture et byline auteur.',
      layout: DISPATCH_ARTICLE_CONFIG,
    },
  },
};
