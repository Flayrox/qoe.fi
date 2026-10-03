// =====================================================================
// defaults.ts — Archétypes et gabarits pré-packagés
// =====================================================================
// Fournit les configurations AST par défaut pour chaque style fondamental.
// Utilisé pour :
// - Initialiser les nouveaux sites
// - Régénérer l'arbre lors du choix d'un preset en 1-clic
// - Servir de repli rétrocompatible infaillible si le layout en DB est vide
// =====================================================================

import type {
  LayoutConfig,
  ArticleContentBlockProps,
  CategorySpotlightBlockProps,
  NavbarBlockProps,
  HeroBlockProps,
  LeadStoryBlockProps,
  BentoGridBlockProps,
  ArticleStreamBlockProps,
  NewsletterWallBlockProps,
  FooterBlockProps,
} from './schema';

/**
 *  1. Archétype : Editorial Magazine
 * Inspiré par The New Yorker, Vanity Fair et The Atlantic.
 * Accent sur le storytelling littéraire, grand article vedette et typographie noble.
 */
export const EDITORIAL_MAGAZINE_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'magazine',
  tokens: {
    cardShape: 'rounded-xl',
    density: 'standard',
    surface: 'bordered',
    fontFamily: 'serif',
    accentColor: '#EE4B2B',
  },
  blocks: [
    {
      id: 'block_navbar_mag',
      type: 'navbar',
      label: 'En-tête & Navigation',
      visible: true,
      locked: false,
      props: {
        brandDisplay: 'logo-and-name',
        layout: 'spread',
        sticky: true,
        showSocial: true,
        showSupport: true,
        supportText: 'Soutenir',
        enableBlur: true,
      } satisfies NavbarBlockProps,
    },
    {
      id: 'block_lead_mag',
      type: 'lead-story',
      label: 'Article Vedette (À la Une)',
      visible: true,
      locked: false,
      props: {
        aspectRatio: '21:9',
        showExcerpt: true,
        showReadTime: true,
        showDate: true,

        highlightFirstArticle: true,
      } satisfies LeadStoryBlockProps,
    },
    {
      id: 'block_bento_mag',
      type: 'bento-grid',
      label: 'Mosaïque Éditoriale',
      visible: true,
      locked: false,
      props: {
        columns: 3,
        pattern: 'asymmetric-lead',
        maxArticles: 3,
        showCategories: true,
        showReadingTime: true,
      } satisfies BentoGridBlockProps,
    },
    {
      id: 'block_newsletter_mag',
      type: 'newsletter-wall',
      label: 'Club des Lecteurs',
      visible: true,
      locked: false,
      props: {
        title: 'Enquêtes',
        subtitle: 'Une fois par semaine.',
        accentGlow: false,
        showSubscriberCount: false,
        buttonText: "S'abonner",
      } satisfies NewsletterWallBlockProps,
    },
    {
      id: 'block_stream_mag',
      type: 'article-stream',
      label: 'Flux de Publications',
      visible: true,
      locked: false,
      props: {
        displayMode: 'grid-2',
        density: 'standard',
        showAuthor: true,
        showReadingTime: true,
        showExcerpts: true,
        showCategories: true,
        pagination: 'load-more',
      } satisfies ArticleStreamBlockProps,
    },
    {
      id: 'block_footer_mag',
      type: 'footer',
      label: 'Pied de Page',
      visible: true,
      locked: false,
      props: {
        showLegalLinks: true,
        showSocialLinks: true,
        customCopyright: 'Tous droits réservés.',
        layout: 'columns',
      } satisfies FooterBlockProps,
    },
  ],
};

/**
 *  2. Archétype : Broadsheet Contemporain
 * Inspiré par Financial Times et Substack Pro.
 * Formes tranchées ('rounded-none'), densité typographique élevée, clarté absolue.
 */
export const BROADSHEET_MODERN_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'broadsheet',
  tokens: {
    cardShape: 'rounded-none',
    density: 'compact',
    surface: 'bordered',
    fontFamily: 'serif',
    accentColor: '#10B981',
  },
  blocks: [
    {
      id: 'block_navbar_broad',
      type: 'navbar',
      label: 'En-tête Broadsheet',
      visible: true,
      locked: false,
      props: {
        brandDisplay: 'name-only',
        layout: 'centered',
        sticky: false,
        showSocial: true,
        showSupport: true,
        supportText: 'Soutenir',
        enableBlur: false,
      } satisfies NavbarBlockProps,
    },
    {
      id: 'block_hero_broad',
      type: 'hero',
      label: 'Manifeste & Slogan',
      visible: true,
      locked: false,
      props: {
        style: 'typographic-minimal',
        alignment: 'center',
        height: 'compact',
        showOverlay: false,
        overlayOpacity: 0,
        showCoverImage: false,
      } satisfies HeroBlockProps,
    },
    {
      id: 'block_lead_broad',
      type: 'lead-story',
      label: 'Dépêche Principale',
      visible: true,
      locked: false,
      props: {
        aspectRatio: '16:9',
        showExcerpt: true,
        showReadTime: true,
        showDate: true,

        highlightFirstArticle: true,
      } satisfies LeadStoryBlockProps,
    },
    {
      id: 'block_stream_broad',
      type: 'article-stream',
      label: 'Chronique des Dépêches',
      visible: true,
      locked: false,
      props: {
        displayMode: 'list',
        density: 'compact',
        showAuthor: true,
        showReadingTime: true,
        showExcerpts: true,
        showCategories: true,
        pagination: 'load-more',
      } satisfies ArticleStreamBlockProps,
    },
    {
      id: 'block_newsletter_broad',
      type: 'newsletter-wall',
      label: 'Abonnement Dépêche',
      visible: true,
      locked: false,
      props: {
        title: 'La dépêche matinale directe',
        subtitle: 'Synthèse claire et indépendante chaque matin à 7h.',
        accentGlow: false,
        showSubscriberCount: false,
        buttonText: "S'abonner",
      } satisfies NewsletterWallBlockProps,
    },
    {
      id: 'block_footer_broad',
      type: 'footer',
      label: 'Pied de Page',
      visible: true,
      locked: false,
      props: {
        showLegalLinks: true,
        showSocialLinks: true,
        customCopyright: 'Publication souveraine et libre.',
        layout: 'minimal-row',
      } satisfies FooterBlockProps,
    },
  ],
};

/**
 *  3. Archétype : Bento Creator & Tech
 * Inspiré par Apple Newsroom, Linear et Framer.
 * Rayons généreux ('rounded-2xl'), cartes asymétriques 'glassmorphic', modern-sans.
 */
export const BENTO_TECH_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'bento',
  tokens: {
    cardShape: 'rounded-2xl',
    density: 'standard',
    surface: 'glassmorphic',
    fontFamily: 'outfit',
    accentColor: '#3B82F6',
  },
  blocks: [
    {
      id: 'block_navbar_bento',
      type: 'navbar',
      label: 'Dock Supérieur',
      visible: true,
      locked: false,
      props: {
        brandDisplay: 'logo-and-name',
        layout: 'split',
        sticky: true,
        showSocial: true,
        showSupport: true,
        supportText: 'Soutenir',
        enableBlur: true,
      } satisfies NavbarBlockProps,
    },
    {
      id: 'block_hero_bento',
      type: 'hero',
      label: 'Bannière Panoramique',
      visible: true,
      locked: false,
      props: {
        style: 'cinematic-banner',
        alignment: 'center',
        height: 'medium',
        showOverlay: true,
        overlayOpacity: 50,
        showCoverImage: true,
      } satisfies HeroBlockProps,
    },
    {
      id: 'block_bento_main',
      type: 'bento-grid',
      label: 'Grille Bento Dynamique',
      visible: true,
      locked: false,
      props: {
        columns: 3,
        pattern: 'asymmetric-lead',
        maxArticles: 4,
        showCategories: true,
        showReadingTime: true,
      } satisfies BentoGridBlockProps,
    },
    {
      id: 'block_newsletter_bento',
      type: 'newsletter-wall',
      label: 'Mur d’Adhésion',
      visible: true,
      locked: false,
      props: {
        title: 'Suivre ce média',
        subtitle: 'Une fois par semaine.',
        accentGlow: false,
        showSubscriberCount: false,
        buttonText: "S'abonner",
      } satisfies NewsletterWallBlockProps,
    },
    {
      id: 'block_stream_bento',
      type: 'article-stream',
      label: 'Archives & Flux',
      visible: true,
      locked: false,
      props: {
        displayMode: 'grid-3',
        density: 'standard',
        showAuthor: false,
        showReadingTime: true,
        showExcerpts: true,
        showCategories: true,
        pagination: 'infinite',
      } satisfies ArticleStreamBlockProps,
    },
    {
      id: 'block_footer_bento',
      type: 'footer',
      label: 'Pied de Page',
      visible: true,
      locked: false,
      props: {
        showLegalLinks: true,
        showSocialLinks: true,
        customCopyright: 'Propulsé par Qoefi Core.',
        layout: 'columns',
      } satisfies FooterBlockProps,
    },
  ],
};

/**
 *  4. Archétype : Minimaliste Épuré
 * Inspiré par Ghost, Medium et Bear Blog.
 * Focus intégral sur le contenu et le confort visuel.
 */
export const MINIMAL_PORTFOLIO_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'minimal',
  tokens: {
    cardShape: 'rounded-xl',
    density: 'spacious',
    surface: 'flat',
    fontFamily: 'sans',
    accentColor: '#18181B',
  },
  blocks: [
    {
      id: 'block_navbar_min',
      type: 'navbar',
      label: 'Navigation Épurée',
      visible: true,
      locked: false,
      props: {
        brandDisplay: 'name-only',
        layout: 'spread',
        sticky: false,
        showSocial: true,
        showSupport: false,
        enableBlur: false,
      } satisfies NavbarBlockProps,
    },
    {
      id: 'block_hero_min',
      type: 'hero',
      label: 'Présentation de l’Auteur',
      visible: true,
      locked: false,
      props: {
        style: 'typographic-minimal',
        alignment: 'left',
        height: 'compact',
        showOverlay: false,
        overlayOpacity: 0,
        showCoverImage: false,
      } satisfies HeroBlockProps,
    },
    {
      id: 'block_stream_min',
      type: 'article-stream',
      label: 'Carnet de Notes',
      visible: true,
      locked: false,
      props: {
        displayMode: 'list',
        density: 'spacious',
        showAuthor: false,
        showReadingTime: true,
        showExcerpts: true,
        showCategories: false,
        pagination: 'load-more',
      } satisfies ArticleStreamBlockProps,
    },
    {
      id: 'block_newsletter_min',
      type: 'newsletter-wall',
      label: 'Boîte aux Lettres',
      visible: true,
      locked: false,
      props: {
        title: 'Rester en contact',
        subtitle: 'Mes réflexions directement dans votre boîte mail, sans spam.',
        accentGlow: false,
        showSubscriberCount: false,
        buttonText: "S'abonner",
      } satisfies NewsletterWallBlockProps,
    },
    {
      id: 'block_footer_min',
      type: 'footer',
      label: 'Pied de Page',
      visible: true,
      locked: false,
      props: {
        showLegalLinks: true,
        showSocialLinks: true,
        customCopyright: '',
        layout: 'minimal-row',
      } satisfies FooterBlockProps,
    },
  ],
};

/** Gabarit par défaut du scope article (page article) */
export const ARTICLE_DEFAULT_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'custom',
  tokens: {
    cardShape: 'rounded-xl',
    density: 'standard',
    surface: 'flat',
    fontFamily: 'serif',
    accentColor: '#EE4B2B',
  },
  blocks: [
    {
      id: 'block_article_content',
      type: 'article-content',
      label: 'Contenu article',
      visible: true,
      locked: false,
      props: {
        showTitle: true,
        showMeta: true,
        showAuthor: true,
        showDate: true,
        showReadingTime: true,
        showCover: true,
      } satisfies ArticleContentBlockProps,
    },
    {
      id: 'block_article_newsletter',
      type: 'newsletter-wall',
      label: 'Abonnement',
      visible: true,
      locked: false,
      props: {
        title: 'Newsletter',
        subtitle: 'Un email par semaine.',
        accentGlow: false,
        showSubscriberCount: false,
        buttonText: "S'abonner",
      } satisfies NewsletterWallBlockProps,
    },
    {
      id: 'block_article_footer',
      type: 'footer',
      label: 'Pied de Page',
      visible: true,
      locked: false,
      props: {
        showLegalLinks: true,
        showSocialLinks: true,
        customCopyright: '',
        layout: 'minimal-row',
      } satisfies FooterBlockProps,
    },
  ],
};

/** 5. Encre : contraste maximal, serif, angles vifs */
export const ENCRE_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'encre',
  tokens: {
    cardShape: 'rounded-none',
    density: 'compact',
    surface: 'bordered',
    fontFamily: 'serif',
    accentColor: '#18181B',
  },
  blocks: [
    {
      id: 'block_navbar_encre',
      type: 'navbar',
      label: 'En-tête',
      visible: true,
      locked: false,
      props: {
        brandDisplay: 'name-only',
        layout: 'spread',
        sticky: true,
        showSocial: false,
        showSupport: true,
        supportText: 'Soutenir',
        enableBlur: false,
      } satisfies NavbarBlockProps,
    },
    {
      id: 'block_hero_encre',
      type: 'hero',
      label: 'Bannière',
      visible: true,
      locked: false,
      props: {
        style: 'typographic-minimal',
        alignment: 'left',
        height: 'compact',
        showOverlay: false,
        overlayOpacity: 0,
        showCoverImage: false,
      } satisfies HeroBlockProps,
    },
    {
      id: 'block_lead_encre',
      type: 'lead-story',
      label: 'Article vedette',
      visible: true,
      locked: false,
      props: {
        aspectRatio: '21:9',
        showExcerpt: true,
        showReadTime: true,
        showDate: false,
        highlightFirstArticle: true,
      } satisfies LeadStoryBlockProps,
    },
    {
      id: 'block_stream_encre',
      type: 'article-stream',
      label: 'Flux',
      visible: true,
      locked: false,
      props: {
        displayMode: 'list',
        density: 'compact',
        showAuthor: false,
        showReadingTime: true,
        showExcerpts: false,
        showCategories: true,
        pagination: 'load-more',
      } satisfies ArticleStreamBlockProps,
    },
    {
      id: 'block_footer_encre',
      type: 'footer',
      label: 'Pied de Page',
      visible: true,
      locked: false,
      props: {
        showLegalLinks: true,
        showSocialLinks: false,
        customCopyright: '',
        layout: 'minimal-row',
      } satisfies FooterBlockProps,
    },
  ],
};

/** 6. Papier : minimal chaleureux, généreux en blanc */
export const PAPIER_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'papier',
  tokens: {
    cardShape: 'rounded-lg',
    density: 'spacious',
    surface: 'flat',
    fontFamily: 'serif',
    accentColor: '#9A3412',
  },
  blocks: [
    {
      id: 'block_navbar_papier',
      type: 'navbar',
      label: 'En-tête',
      visible: true,
      locked: false,
      props: {
        brandDisplay: 'name-only',
        layout: 'spread',
        sticky: false,
        showSocial: false,
        showSupport: false,
        enableBlur: false,
      } satisfies NavbarBlockProps,
    },
    {
      id: 'block_hero_papier',
      type: 'hero',
      label: 'Bannière',
      visible: true,
      locked: false,
      props: {
        style: 'typographic-minimal',
        alignment: 'left',
        height: 'compact',
        showOverlay: false,
        overlayOpacity: 0,
        showCoverImage: false,
      } satisfies HeroBlockProps,
    },
    {
      id: 'block_stream_papier',
      type: 'article-stream',
      label: 'Carnet',
      visible: true,
      locked: false,
      props: {
        displayMode: 'list',
        density: 'spacious',
        showAuthor: false,
        showReadingTime: false,
        showExcerpts: true,
        showCategories: false,
        pagination: 'load-more',
      } satisfies ArticleStreamBlockProps,
    },
    {
      id: 'block_newsletter_papier',
      type: 'newsletter-wall',
      label: 'Abonnement',
      visible: true,
      locked: false,
      props: {
        title: 'Lettre',
        subtitle: 'De temps en temps, sans bruit.',
        accentGlow: false,
        showSubscriberCount: false,
        buttonText: "S'abonner",
      } satisfies NewsletterWallBlockProps,
    },
    {
      id: 'block_footer_papier',
      type: 'footer',
      label: 'Pied de Page',
      visible: true,
      locked: false,
      props: {
        showLegalLinks: true,
        showSocialLinks: false,
        customCopyright: '',
        layout: 'minimal-row',
      } satisfies FooterBlockProps,
    },
  ],
};

/** 7. Signal : tech, bento dense, bleu franc */
export const SIGNAL_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'signal',
  tokens: {
    cardShape: 'rounded-2xl',
    density: 'standard',
    surface: 'bordered',
    fontFamily: 'sans',
    accentColor: '#2563EB',
  },
  blocks: [
    {
      id: 'block_navbar_signal',
      type: 'navbar',
      label: 'En-tête',
      visible: true,
      locked: false,
      props: {
        brandDisplay: 'logo-and-name',
        layout: 'split',
        sticky: true,
        showSocial: true,
        showSupport: true,
        supportText: 'Soutenir',
        enableBlur: false,
      } satisfies NavbarBlockProps,
    },
    {
      id: 'block_hero_signal',
      type: 'hero',
      label: 'Bannière',
      visible: true,
      locked: false,
      props: {
        style: 'cinematic-banner',
        alignment: 'center',
        height: 'medium',
        showOverlay: true,
        overlayOpacity: 50,
        showCoverImage: true,
      } satisfies HeroBlockProps,
    },
    {
      id: 'block_bento_signal',
      type: 'bento-grid',
      label: 'Grille',
      visible: true,
      locked: false,
      props: {
        columns: 3,
        pattern: 'asymmetric-lead',
        maxArticles: 4,
        showCategories: true,
        showReadingTime: true,
      } satisfies BentoGridBlockProps,
    },
    {
      id: 'block_spot_signal',
      type: 'category-spotlight',
      label: 'Encadré rubrique',
      visible: true,
      locked: false,
      props: {
        layout: 'framed',
        maxArticles: 3,
        showReadingTime: true,
      } satisfies CategorySpotlightBlockProps,
    },
    {
      id: 'block_stream_signal',
      type: 'article-stream',
      label: 'Flux',
      visible: true,
      locked: false,
      props: {
        displayMode: 'grid-3',
        density: 'standard',
        showAuthor: false,
        showReadingTime: true,
        showExcerpts: true,
        showCategories: true,
        pagination: 'infinite',
      } satisfies ArticleStreamBlockProps,
    },
    {
      id: 'block_footer_signal',
      type: 'footer',
      label: 'Pied de Page',
      visible: true,
      locked: false,
      props: {
        showLegalLinks: true,
        showSocialLinks: true,
        customCopyright: '',
        layout: 'columns',
      } satisfies FooterBlockProps,
    },
  ],
};

/** 8. Kiosque : presse dense, rouge franc */
export const KIOSQUE_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'kiosque',
  tokens: {
    cardShape: 'rounded-none',
    density: 'compact',
    surface: 'bordered',
    fontFamily: 'sans',
    accentColor: '#B91C1C',
  },
  blocks: [
    {
      id: 'block_navbar_kiosque',
      type: 'navbar',
      label: 'En-tête',
      visible: true,
      locked: false,
      props: {
        brandDisplay: 'name-only',
        layout: 'centered',
        sticky: false,
        showSocial: false,
        showSupport: true,
        supportText: 'Soutenir',
        enableBlur: false,
      } satisfies NavbarBlockProps,
    },
    {
      id: 'block_lead_kiosque',
      type: 'lead-story',
      label: 'Article vedette',
      visible: true,
      locked: false,
      props: {
        aspectRatio: '16:9',
        showExcerpt: true,
        showReadTime: true,
        showDate: true,
        highlightFirstArticle: true,
      } satisfies LeadStoryBlockProps,
    },
    {
      id: 'block_spot_kiosque',
      type: 'category-spotlight',
      label: 'Encadré rubrique',
      visible: true,
      locked: false,
      props: {
        layout: 'plain',
        maxArticles: 4,
        showReadingTime: true,
      } satisfies CategorySpotlightBlockProps,
    },
    {
      id: 'block_stream_kiosque',
      type: 'article-stream',
      label: 'Dépêches',
      visible: true,
      locked: false,
      props: {
        displayMode: 'list',
        density: 'compact',
        showAuthor: true,
        showReadingTime: true,
        showExcerpts: true,
        showCategories: true,
        pagination: 'load-more',
      } satisfies ArticleStreamBlockProps,
    },
    {
      id: 'block_footer_kiosque',
      type: 'footer',
      label: 'Pied de Page',
      visible: true,
      locked: false,
      props: {
        showLegalLinks: true,
        showSocialLinks: false,
        customCopyright: '',
        layout: 'minimal-row',
      } satisfies FooterBlockProps,
    },
  ],
};

/** Variantes de vue article (scope article) */
export interface ArticleVariant {
  id: string;
  name: string;
  description: string;
  config: LayoutConfig;
}

function articleVariantConfig(
  id: string,
  contentProps: ArticleContentBlockProps,
  withNewsletter: boolean
): LayoutConfig {
  return {
    version: 1,
    archetype: 'custom',
    tokens: {
      cardShape: 'rounded-xl',
      density: 'standard',
      surface: 'flat',
      fontFamily: 'serif',
      accentColor: '#EE4B2B',
    },
    blocks: [
      {
        id: `block_article_content_${id}`,
        type: 'article-content',
        label: 'Contenu article',
        visible: true,
        locked: false,
        props: { ...contentProps },
      },
      ...(withNewsletter
        ? [
            {
              id: `block_article_newsletter_${id}`,
              type: 'newsletter-wall' as const,
              label: 'Abonnement',
              visible: true,
              locked: false,
              props: {
                title: 'Newsletter',
                subtitle: 'Un email par semaine.',
                accentGlow: false,
                showSubscriberCount: false,
                buttonText: "S'abonner",
              } satisfies NewsletterWallBlockProps,
            },
          ]
        : []),
      {
        id: `block_article_footer_${id}`,
        type: 'footer',
        label: 'Pied de Page',
        visible: true,
        locked: false,
        props: {
          showLegalLinks: true,
          showSocialLinks: true,
          customCopyright: '',
          layout: 'minimal-row',
        } satisfies FooterBlockProps,
      },
    ],
  };
}

export const ARTICLE_VARIANTS: ArticleVariant[] = [
  {
    id: 'longform',
    name: 'Long format',
    description: 'Titre, méta complètes, couverture, newsletter.',
    config: articleVariantConfig(
      'longform',
      {
        showTitle: true,
        showMeta: true,
        showAuthor: true,
        showDate: true,
        showReadingTime: true,
        showCover: true,
      },
      true
    ),
  },
  {
    id: 'magazine',
    name: 'Magazine',
    description: 'Couverture large, méta resserrées, newsletter.',
    config: articleVariantConfig(
      'magazine',
      {
        showTitle: true,
        showMeta: true,
        showAuthor: true,
        showDate: false,
        showReadingTime: true,
        showCover: true,
      },
      true
    ),
  },
  {
    id: 'note',
    name: 'Note',
    description: 'Titre seul, sans couverture ni newsletter.',
    config: articleVariantConfig(
      'note',
      {
        showTitle: true,
        showMeta: false,
        showAuthor: false,
        showDate: false,
        showReadingTime: false,
        showCover: false,
      },
      false
    ),
  },
];

/** Dictionnaire indexé des archétypes */
export const ARCHETYPES_REGISTRY: Record<string, LayoutConfig> = {
  magazine: EDITORIAL_MAGAZINE_CONFIG,
  broadsheet: BROADSHEET_MODERN_CONFIG,
  bento: BENTO_TECH_CONFIG,
  minimal: MINIMAL_PORTFOLIO_CONFIG,
  encre: ENCRE_CONFIG,
  papier: PAPIER_CONFIG,
  signal: SIGNAL_CONFIG,
  kiosque: KIOSQUE_CONFIG,
};
