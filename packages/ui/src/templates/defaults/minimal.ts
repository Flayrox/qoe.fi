// =====================================================================
// minimal.ts — Archétype Signature Minimal Craft (Devouring Details / Rauno)
// =====================================================================

import type {
  LayoutConfig,
  NavbarBlockProps,
  ArticleStreamBlockProps,
  FooterBlockProps,
  ArticleContentBlockProps,
  NewsletterWallBlockProps,
} from '../schema';

/**
 * Archétype Minimal Craft — Page d'Accueil (Portfolio / Carnet de notes)
 * Inspiré par devouringdetails.com et rauno.me
 */
export const MINIMAL_PORTFOLIO_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'minimal',
  tokens: {
    cardShape: 'rounded-xl',
    density: 'spacious',
    surface: 'flat',
    fontFamily: 'sans',
    accentColor: '#F97316',
  },
  blocks: [
    {
      id: 'block_navbar_min',
      type: 'navbar',
      label: 'Navigation & Index Coulissant',
      visible: true,
      locked: false,
      props: {
        brandDisplay: 'name-only',
        layout: 'spread',
        sticky: true,
        showSocial: true,
        showSupport: false,
        enableBlur: true,
      } satisfies NavbarBlockProps,
    },
    {
      id: 'block_stream_min',
      type: 'article-stream',
      label: 'Carnet de Notes & Détails',
      visible: true,
      locked: false,
      props: {
        displayMode: 'craft-notes',
        density: 'spacious',
        showAuthor: false,
        showReadingTime: true,
        showExcerpts: true,
        showCategories: true,
        pagination: 'load-more',
        groupByCategory: false,
      } satisfies ArticleStreamBlockProps,
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

/**
 * Archétype Minimal Craft — Page de Lecture Article
 * Enveloppé par MinimalCraftShell (En-tête souverain z-40, dock contextuel avec % lu)
 */
export const MINIMAL_ARTICLE_CONFIG: LayoutConfig = {
  version: 1,
  archetype: 'minimal',
  tokens: {
    cardShape: 'rounded-xl',
    density: 'spacious',
    surface: 'flat',
    fontFamily: 'sans',
    accentColor: '#F97316',
  },
  blocks: [
    {
      id: 'block_article_content_min',
      type: 'article-content',
      label: 'Contenu article',
      visible: true,
      locked: false,
      props: {
        showTitle: true,
        showMeta: true,
        showAuthor: false,
        showDate: true,
        showReadingTime: true,
        showCover: true,
      } satisfies ArticleContentBlockProps,
    },
    {
      id: 'block_newsletter_article_min',
      type: 'newsletter-wall',
      label: 'Abonnement',
      visible: true,
      locked: false,
      props: {
        title: 'Restez informé',
        subtitle: 'Recevez les prochaines parutions directement par email.',
        accentGlow: false,
        showSubscriberCount: false,
        buttonText: "S'abonner",
      } satisfies NewsletterWallBlockProps,
    },
    {
      id: 'block_footer_article_min',
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
