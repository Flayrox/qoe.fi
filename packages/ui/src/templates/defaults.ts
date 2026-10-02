// =====================================================================
// 🎨 defaults.ts — Les 4 Archétypes Signatures Pré-packagés (Licorne 2026)
// =====================================================================
// Fournit les configurations AST par défaut pour chaque style fondamental.
// Utilisé pour :
// - Initialiser les nouveaux sites
// - Régénérer l'arbre lors du choix d'un preset en 1-clic
// - Servir de repli rétrocompatible infaillible si le layout en DB est vide
// =====================================================================

import type {
  LayoutConfig,
  NavbarBlockProps,
  HeroBlockProps,
  LeadStoryBlockProps,
  BentoGridBlockProps,
  ArticleStreamBlockProps,
  NewsletterWallBlockProps,
  FooterBlockProps,
} from './schema';

/**
 * 👑 1. Archétype : Editorial Magazine
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
        supportText: 'Soutenir la revue',
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
        badgeText: 'À LA UNE',
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
        title: 'Recevez nos grandes enquêtes',
        subtitle: 'Une immersion hebdomadaire dans les coulisses de nos reportages.',
        accentGlow: true,
        showSubscriberCount: true,
        buttonText: "Rejoindre l'édition",
        incentivePill: '100% Indépendant',
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
 * 📰 2. Archétype : Broadsheet Contemporain
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
        supportText: "S'abonner",
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
        badgeText: 'ÉDITION DU JOUR',
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
        showSubscriberCount: true,
        buttonText: "S'inscrire",
        incentivePill: 'Sans intermédiaire',
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
 * ⚡ 3. Archétype : Bento Creator & Tech
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
        supportText: 'Rejoindre',
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
        title: 'Restez branché sur le futur',
        subtitle: 'Rejoignez notre réseau privé et recevez nos analyses avant tout le monde.',
        accentGlow: true,
        showSubscriberCount: true,
        buttonText: 'Connexion Directe',
        incentivePill: 'Réseau Décentralisé',
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
 * 🍃 4. Archétype : Minimaliste Épuré
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
        buttonText: "M'abonner",
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

/** Dictionnaire indexé des archétypes */
export const ARCHETYPES_REGISTRY: Record<string, LayoutConfig> = {
  magazine: EDITORIAL_MAGAZINE_CONFIG,
  broadsheet: BROADSHEET_MODERN_CONFIG,
  bento: BENTO_TECH_CONFIG,
  minimal: MINIMAL_PORTFOLIO_CONFIG,
};
