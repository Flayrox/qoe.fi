// =====================================================================
// schema.ts — Contrat AST du Système de Templates Modulaire (Licorne 2026)
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
  | 'navbar'
  | 'hero'
  | 'lead-story'
  | 'bento-grid'
  | 'article-stream'
  | 'newsletter-wall'
  | 'footer'
  | 'article-content'
  | 'category-spotlight'
  | 'dispatch-feed'
  | 'dispatch-magazine';

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
  /** Alignement sur mobile (défaut : alignment) */
  alignMobile?: 'center' | 'left';
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
  /** Slug de rubrique : vide = tous les articles */
  categoryFilter?: string;
}

/** Configuration de la Grille Asymétrique Bento */
export interface BentoGridBlockProps {
  columns: 2 | 3 | 4;
  /** Colonnes sur mobile (défaut : 1) */
  columnsMobile?: 1 | 2;
  pattern: 'asymmetric-lead' | 'symmetric-triad' | 'highlight-strip';
  maxArticles: number;
  showCategories: boolean;
  showReadingTime: boolean;
  /** Slug de rubrique : vide = tous les articles */
  categoryFilter?: string;
}

/** Configuration du Flux d'Articles */
export interface ArticleStreamBlockProps {
  displayMode: 'list' | 'grid-2' | 'grid-3' | 'craft-notes' | 'featured-trio';
  /** Disposition de la zone à la une : trio (1 grand au centre + 2 sur les côtés), single (1 seul grand) ou none */
  featuredLayout?: 'single' | 'trio' | 'none';
  /** Colonnes sur mobile en mode grille (défaut : 1) */
  columnsMobile?: 1 | 2;
  density: DensityMode;
  showAuthor: boolean;
  showReadingTime: boolean;
  showExcerpts: boolean;
  showCategories: boolean;
  pagination: 'infinite' | 'load-more' | 'pages';
  /** Slug de rubrique : vide = tous les articles */
  categoryFilter?: string;
  /** Regrouper les articles par rubriques / catégories */
  groupByCategory?: boolean;
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

/** Configuration de l'Encadré Rubrique */
export interface CategorySpotlightBlockProps {
  /** Slug de rubrique mise en avant */
  categorySlug?: string;
  title?: string;
  layout: 'framed' | 'plain';
  maxArticles: number;
  showReadingTime: boolean;
}

/** Configuration du Contenu Article (scope article) */
export interface ArticleContentBlockProps {
  showTitle: boolean;
  showMeta: boolean;
  showAuthor: boolean;
  showDate: boolean;
  showReadingTime: boolean;
  showCover: boolean;
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
  | ArticleContentBlockProps
  | CategorySpotlightBlockProps
  | Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────
// Styles fins par bloc (portés d'Onlook editor-bar, souverains)
// ─────────────────────────────────────────────────────────────────────

/** Boîte 4 côtés avec unité (px | %) */
export interface BoxSides {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  unit?: 'px' | '%';
}

/** Rayons indépendants par coin */
export interface CornerRadii {
  topLeft?: number;
  topRight?: number;
  bottomRight?: number;
  bottomLeft?: number;
}

/** Dimensions Hug/Fill/Fixed (porté de width.tsx/height.tsx) */
export type LayoutSizingMode = 'hug' | 'fill' | 'fixed';

export interface SizingValue {
  mode?: LayoutSizingMode;
  value?: number;
  min?: number;
  max?: number;
}

/** Typographie fine par bloc */
export interface BlockFontStyle {
  family?: string;
  size?: number;
  weight?: number | string;
  color?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: number;
  letterSpacing?: number;
  transform?: 'none' | 'uppercase' | 'capitalize' | 'lowercase';
  decoration?: 'none' | 'underline' | 'overline' | 'line-through';
}

/** Fond uni / alpha / gradient (porté de color-background.tsx) */
export interface BlockBackground {
  color?: string;
  alpha?: number;
  gradientCss?: string;
}

/** Props de style génériques intersectées aux props métier de chaque bloc */
export interface BlockStyleProps {
  padding?: BoxSides;
  margin?: BoxSides & { auto?: boolean };
  borderWidth?: number | BoxSides;
  borderColor?: string;
  radius?: number | CornerRadii;
  display?: 'block' | 'flex' | 'grid';
  flexDirection?: 'row' | 'column';
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between';
  gap?: number;
  width?: SizingValue;
  height?: SizingValue;
  opacity?: number;
  background?: BlockBackground;
  font?: BlockFontStyle;
  objectFit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
  /** Réservé canvas : espacements + largeur contrainte issus des poignées N/S/E/W */
  styleBox?: { pt?: number; pb?: number; maxWidth?: number; opacity?: number };
}

// ─────────────────────────────────────────────────────────────────────
// Nœuds récursifs (AST v2 — Phase 6 NodeRenderer, rétrocompat v1)
// ─────────────────────────────────────────────────────────────────────

export type TemplateNodeKind =
  'box' | 'flex' | 'stack' | 'text' | 'button' | 'badge' | 'image' | 'slot';

export interface TemplateNode {
  oid: string;
  kind: TemplateNodeKind;
  tag?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'a' | 'img' | 'div';
  textKey?: string;
  textFallback?: string;
  overrides?: Record<string, unknown>;
  sx?: { hiddenAt?: Array<'mobile' | 'tablet'>; order?: number };
  children?: TemplateNode[];
}

// ─────────────────────────────────────────────────────────────────────
// Nœud AST Universel
// ─────────────────────────────────────────────────────────────────────

/** Unité atomique de bloc dans l'arbre de mise en page */
export interface TemplateBlock<TProps = AnyBlockProps> {
  id: string;
  /** Équivalent Figma/Onlook oid — égal à id après migration */
  oid?: string;
  type: BlockType;
  label: string;
  visible: boolean;
  locked?: boolean;
  /** Masqué sur ces formats (personnalisation par appareil) */
  hiddenAt?: ('mobile' | 'tablet')[];
  props: TProps;
  /** Slots nommés v2 (ex. hero: { title, actions }) */
  slots?: Record<string, TemplateNode[]>;
  /** Nœuds génériques v2 */
  nodes?: TemplateNode[];
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
export type TemplateArchetypeId =
  | 'magazine'
  | 'broadsheet'
  | 'bento'
  | 'minimal'
  | 'dispatch'
  | 'encre'
  | 'papier'
  | 'signal'
  | 'kiosque'
  | 'custom';

/**
 * Arbre complet de mise en page (AST racine)
 * Stocké sous forme de JSON dans `Publication.layoutStyle` ou résolu à la volée.
 */
export interface LayoutConfig {
  version: number;
  archetype: TemplateArchetypeId;
  tokens: DesignTokensConfig;
  blocks: TemplateBlock[];
}

/** Scopes de pages éditables dans Stage */
export type SiteScopeId = 'home' | 'article';

/** Fichier multi-scopes persisté dans `Publication.layoutStyle` (v2) */
export interface SiteLayoutsFile {
  version: 2;
  scopes: {
    home: LayoutConfig;
    article?: LayoutConfig;
    /** Gabarits article par slug de rubrique (prioritaire sur article) */
    articleByCategory?: Record<string, LayoutConfig>;
  };
}

/** Contexte partagé transmis lors de l'exécution du rendu d'un bloc */
export interface TemplateRenderContext {
  mode: 'live' | 'editable';
  selectedBlockId?: string | null;
  /** Sélection sub-élément v2 (oid stable type Figma) */
  selectedOid?: string | null;
  selectedPath?: string | null;
  /** Article courant (scope article, bloc article-content) */
  article?: TemplateArticleItem | null;
  onSelectBlock?: (blockId: string) => void;
  onSelectNode?: (oid: string, path: string, blockId: string) => void;
  onUpdateBlockProps?: (blockId: string, newProps: Partial<AnyBlockProps>) => void;
  onUpdateNode?: (blockId: string, oid: string, patch: Partial<TemplateNode>) => void;
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
  subtitle?: string;
  imageUrl?: string | null;
  publishedAt?: string | Date;
  readingTime?: number;
  isPremium?: boolean;
  isPinned?: boolean;
  isEditorPick?: boolean;
  likesCount?: number;
  commentsCount?: number;
  repostsCount?: number;
  isLiked?: boolean;
  isReposted?: boolean;
  category?: {
    name: string;
    slug?: string;
  } | null;
  author?: {
    name?: string | null;
    username?: string | null;
    logoUrl?: string | null;
  } | null;
  authors?: Array<{
    id?: string;
    name?: string | null;
    username?: string | null;
    logoUrl?: string | null;
  }> | null;
}

export interface TemplateCategoryItem {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  children?: TemplateCategoryItem[];
}

export interface TemplateRecommendationItem {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  customDomain?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  authorName?: string | null;
  authorHandle?: string | null;
  authorAvatarUrl?: string | null;
  articlesCount?: number;
  subscribersCount?: number;
}

export interface TemplateTeamMember {
  id: string;
  name: string;
  username?: string | null;
  logoUrl?: string | null;
  bio?: string | null;
  role: string;
  isCertified: boolean;
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
  bio?: string | null;
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
  categories?: TemplateCategoryItem[];
  activeCategory?: TemplateCategoryItem | null;
  subscriberCount?: number;
  layoutStyle?: string | null;
  siteOptions?: Record<string, unknown> | null;
  recommendations?: TemplateRecommendationItem[] | null;
  team?: TemplateTeamMember[];
  author?: {
    name?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    bio?: string | null;
  } | null;
}
