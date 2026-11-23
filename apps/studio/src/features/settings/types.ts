// =====================================================================
// ⚡ QOE Studio — apps/studio/src/features/settings/types.ts
// =====================================================================

import { t } from '@lingui/core/macro';

export interface ClientNavigationItem {
  id?: string;
  label: string;
  url: string | null;
  order: number;
  isExternal: boolean;
  parentId?: string | null;
}

export interface ClientSocialLink {
  id?: string;
  platform: string;
  url: string;
  order: number;
}

export interface StudioArticle {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  published: boolean;
  isPremium: boolean;
  categoryId: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  createdAt: string;
}

export interface ClientCategory {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
}

export interface CreatorProfile {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  heroText: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  themeMode: string | null;
  layoutStyle: string | null;
  logoUrl: string | null;
  headerImageUrl: string | null;
  footerText: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  allowIndexing: boolean;
  supportUrl: string | null;
  subdomain: string | null;
  customDomain: string | null;
  navigation: ClientNavigationItem[];
  socialLinks: ClientSocialLink[];
  articles: StudioArticle[];
  categories: ClientCategory[];
  advancedSettingsMode: boolean;
  siteOptions?: Record<string, unknown> | null;
  /** Contexte média (lorsque le workspace actif est un Média) */
  isMedia?: boolean;
  mediaRole?: string;
}

export const ACCENT_SWATCHES = () => [
  { id: 'vermilion', name: t`Vermillon`, hex: '#EE4B2B' },
  { id: 'emerald', name: t`Émeraude`, hex: '#10B981' },
  { id: 'royal', name: t`Bleu Royal`, hex: '#3B82F6' },
  { id: 'orchid', name: t`Orchidée`, hex: '#D946EF' },
  { id: 'amber', name: t`Ambre`, hex: '#F59E0B' },
  { id: 'charcoal', name: t`Anthracite`, hex: '#3F3F46' },
];

export const SITE_FONTS = () => [
  { id: 'sans', name: t`Inter (Sans-serif)`, family: "'Inter', sans-serif" },
  { id: 'outfit', name: t`Outfit (Moderne)`, family: "'Outfit', sans-serif" },
  { id: 'space-grotesk', name: t`Space Grotesk (Tech)`, family: "'Space Grotesk', sans-serif" },
  { id: 'serif', name: t`Playfair Display (Serif)`, family: "'Playfair Display', serif" },
];

export const SUPPORTED_SOCIAL_PLATFORMS = [
  { id: 'twitter', name: 'X (Twitter)' },
  { id: 'github', name: 'GitHub' },
  { id: 'substack', name: 'Substack' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'linkedin', name: 'LinkedIn' },
  { id: 'instagram', name: 'Instagram' },
  { id: 'bluesky', name: 'Bluesky' },
  { id: 'mastodon', name: 'Mastodon' },
  { id: 'threads', name: 'Threads' },
];

export interface SiteOptionItem {
  key: string;
  label: string;
  description: string;
}

export const SITE_OPTION_ITEMS = (): SiteOptionItem[] => [
  {
    key: 'showBanner',
    label: t`Logo / Wordmark d'en-tête (ou bannière)`,
    description: t`Affiche le logotype ou l'image d'en-tête en haut de la publication`,
  },
  {
    key: 'showLogo',
    label: 'Logo / Avatar de marque',
    description: t`Affiche l'avatar du créateur ou média dans le header`,
  },
  {
    key: 'logoShapeSquare',
    label: t`Logo carré aux coins adoucis`,
    description: t`Bascule la forme du logo de rond à carré dans le header`,
  },
  {
    key: 'showCategoryTabs',
    label: t`Onglets de rubriques dans l'en-tête`,
    description: t`Affiche les onglets de rubriques et sous-rubriques sous l'en-tête`,
  },
  {
    key: 'showTagline',
    label: t`Slogan éditorial`,
    description: t`Affiche le sous-titre sous le nom du média`,
  },
  {
    key: 'showSubscribeButton',
    label: t`Bouton S’abonner dans l’en-tête`,
    description: t`Accès direct à la modal d’inscription`,
  },
  {
    key: 'showSocialLinks',
    label: t`Réseaux sociaux`,
    description: t`Affiche la barre de liens sociaux configurés`,
  },
  {
    key: 'showCraftIndex',
    label: 'Sommaire interactif Craft',
    description: t`Axe vertical discret façon Devouring Details`,
  },
  {
    key: 'showProgressiveBlur',
    label: t`Dégradé progressif de bordure`,
    description: t`Estompe élégamment le haut et le bas de la vue`,
  },
  {
    key: 'showNewsletterWall',
    label: t`Encart adhésion & newsletter`,
    description: t`Bloc d'inscription en pied d'article`,
  },
  {
    key: 'featuredTrio',
    label: t`Grille à la une 3 colonnes`,
    description: t`Affiche un grand article vedette au centre encadré par les parutions secondaires`,
  },
  {
    key: 'showPinnedBadge',
    label: t`Badge Article Épinglé`,
    description: t`Affiche un badge sur l’article épinglé à la une`,
  },
];
