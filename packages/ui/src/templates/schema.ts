// =====================================================================
// 🏛️ schema.ts — Contrat AST du Système de Templates Modulaire (Licorne 2026)
// =====================================================================
// Définit l'arbre syntaxique abstrait (AST) universel partagé entre :
// 1. L'Atelier Visuel Studio (apps/studio) pour l'édition en direct
// 2. Le Moteur de Rendu des Tenants (apps/tenants) pour le site public (*.qoe.fi)
//
// Résilience absolue :
// - 100% typé TypeScript strict & Zod-ready
// - Auto-normalisation et tolérance aux pannes
// - Tokens sémantiques (@qoe/theme) intégrés
// =====================================================================

import type { NavigationItem, SocialLink } from '@qoe/sdk/types';

/** Types de blocs modulaires disponibles dans le constructeur */
export type BlockType =
  'navbar' | 'hero' | 'lead-story' | 'bento-grid' | 'article-stream' | 'newsletter-wall' | 'footer';

/** Forme géométrique des cartes et conteneurs (Tokens) */
export type CardCornerShape =
  'rounded-none' | 'rounded-lg' | 'rounded-xl' | 'rounded-2xl' | 'rounded-3xl' | 'rounded-full';

/** Densité spatiale globale du site */
export type DensityMode = 'compact' | 'standard' | 'spacious';

/** Finition de surface des composants */
export type SurfaceStyle = 'flat' | 'bordered' | 'glassmorphic' | 'elevated';

/** Famille typographique globale */
export type TypographyArchetype = 'sans' | 'editorial' | 'serif' | 'mono';

// ─────────────────────────────────────────────────────────────────────
// Propriétés Spécifiques par Type de Bloc
// ─────────────────────────────────────────────────────────────────────

/** Configuration du Bloc En-tête / Barre de Navigation */
export interface NavbarBlockProps {
  brandDisplay: 'logo-and-name' | 'logo-only' | 'name-only';
  layout: 'spread' | 'centered' | 'split';
  sticky: boolean;
  showSocial: boolean;
  showSupport: boolean;
  supportText?: string;
  enableBlur: boolean;
}

/** Configuration du Bloc Bannière / Hero */
export interface HeroBlockProps {
  style: 'cinematic-banner' | 'typographic-minimal' | 'split-featured' | 'floating-card';
  alignment: 'center' | 'left';
  height: 'compact' | 'medium' | 'tall';
  showOverlay: boolean;
  overlayOpacity: number; // 0 to 100
  customTitle?: string;
  customTagline?: string;
  showCoverImage: boolean;
}

/** Configuration du Bloc Article Vedette (Lead Story / À la Une) */
export interface LeadStoryBlockProps {
  aspectRatio: '16:9' | '21:9' | '4:3' | '1:1';
  showExcerpt: boolean;
  showReadTime: boolean;
  showDate: boolean;
  badgeText?: string;
  highlightFirstArticle: boolean;
}

/** Configuration de la Grille Asymétrique Bento */
export interface BentoGridBlockProps {
  columns: 2 | 3 | 4;
  pattern: 'asymmetric-lead' | 'symmetric-triad' | 'highlight-strip';
  maxArticles: number;
  showCategories: boolean;
  showReadingTime: boolean;
}

/** Configuration du Flux d'Articles */
export interface ArticleStreamBlockProps {
  displayMode: 'list' | 'grid-2' | 'grid-3';
  density: DensityMode;
  showAuthor: boolean;
  showReadingTime: boolean;
  showExcerpts: boolean;
  showCategories: boolean;
  pagination: 'infinite' | 'load-more' | 'pages';
}

/** Configuration du Mur d'Abonnement Newsletter */
export interface NewsletterWallBlockProps {
  title?: string;
  subtitle?: string;
  accentGlow: boolean;
  showSubscriberCount: boolean;
  buttonText?: string;
  incentivePill?: string;
}

/** Configuration du Pied de Page */
export interface FooterBlockProps {
  showLegalLinks: boolean;
  showSocialLinks: boolean;
  customCopyright?: string;
  layout: 'columns' | 'minimal-row';
}

/** Union discriminée de toutes les configurations de blocs */
export type AnyBlockProps =
  | NavbarBlockProps
  | HeroBlockProps
  | LeadStoryBlockProps
  | BentoGridBlockProps
  | ArticleStreamBlockProps
  | NewsletterWallBlockProps
  | FooterBlockProps
  | Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────
// Nœud AST Universel
// ─────────────────────────────────────────────────────────────────────

/** Unité atomique de bloc dans l'arbre de mise en page */
export interface TemplateBlock<TProps = AnyBlockProps> {
  id: string;
  type: BlockType;
  label: string;
  visible: boolean;
  locked?: boolean;
  props: TProps;
}

/** Configuration globale de tokens de design pour le site */
export interface DesignTokensConfig {
  cardShape: CardCornerShape;
  density: DensityMode;
  surface: SurfaceStyle;
  fontFamily: string;
  accentColor: string;
}

/** Archétypes signatures pré-packagés */
export type TemplateArchetypeId = 'magazine' | 'broadsheet' | 'bento' | 'minimal' | 'custom';

/**
 * 📦 Arbre Complet de Mise en Page (AST Racine)
 * Stocké sous forme de JSON dans `Publication.layoutStyle` ou résolu à la volée.
 */
export interface LayoutConfig {
  version: number;
  archetype: TemplateArchetypeId;
  tokens: DesignTokensConfig;
  blocks: TemplateBlock[];
}

/** Contexte partagé transmis lors de l'exécution du rendu d'un bloc */
export interface TemplateRenderContext {
  mode: 'live' | 'editable';
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string) => void;
  onUpdateBlockProps?: (blockId: string, newProps: Partial<AnyBlockProps>) => void;
  onMoveBlock?: (blockId: string, direction: 'up' | 'down') => void;
  onDeleteBlock?: (blockId: string) => void;
}

/** Shape minimale d'un article pour l'affichage dans un bloc */
export interface TemplateArticleItem {
  id: string;
  title: string;
  slug: string;
  content?: string;
  excerpt?: string;
  imageUrl?: string | null;
  publishedAt?: string | Date;
  readingTime?: number;
  isPremium?: boolean;
  category?: {
    name: string;
    slug?: string;
  } | null;
  author?: {
    name?: string | null;
    username?: string | null;
    logoUrl?: string | null;
  } | null;
}

/** Shape minimale de la publication requise pour l'affichage */
export interface TemplatePublicationContext {
  id?: string;
  name: string | null;
  slug?: string;
  domain?: string;
  subdomain?: string | null;
  customDomain?: string | null;
  logoUrl?: string | null;
  heroText?: string | null;
  headerImageUrl?: string | null;
  footerText?: string | null;
  accentColor?: string | null;
  fontFamily?: string | null;
  themeMode?: string | null;
  stripeAccountId?: string | null;
  supportUrl?: string | null;
  navigation?: NavigationItem[];
  socialLinks?: SocialLink[];
  subscriberCount?: number;
}
