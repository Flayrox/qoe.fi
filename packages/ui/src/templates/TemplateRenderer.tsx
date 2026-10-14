'use client';

// =====================================================================
// TemplateRenderer.tsx — Moteur de rendu polymorphe
// =====================================================================
// Composant universel consommé par :
// 1. apps/tenants (Site souverain public *.qoe.fi en mode 'live')
// 2. apps/studio (Atelier Visuel On-Canvas en mode 'editable')
//
// Résilience & Performance :
// - Zéro décalage de layout (CLS = 0)
// - Injection dynamique des tokens CSS de design (--tenant-accent, police)
// - Dispatcher modulaire de blocs sans couplage
// =====================================================================

import React from 'react';
import type {
  LayoutConfig,
  TemplatePublicationContext,
  TemplateArticleItem,
  TemplateRenderContext,
  AnyBlockProps,
  NavbarBlockProps,
  HeroBlockProps,
  LeadStoryBlockProps,
  BentoGridBlockProps,
  ArticleStreamBlockProps,
  NewsletterWallBlockProps,
  FooterBlockProps,
  ArticleContentBlockProps,
  CategorySpotlightBlockProps,
} from './schema';
import { NavbarBlock } from './blocks/NavbarBlock';
import { HeroBlock } from './blocks/HeroBlock';
import { LeadStoryBlock } from './blocks/LeadStoryBlock';
import { BentoGridBlock } from './blocks/BentoGridBlock';
import { ArticleStreamBlock } from './blocks/ArticleStreamBlock';
import { NewsletterWallBlock } from './blocks/NewsletterWallBlock';
import { FooterBlock } from './blocks/FooterBlock';
import { ArticleContentBlock } from './blocks/ArticleContentBlock';
import { CategorySpotlightBlock } from './blocks/CategorySpotlightBlock';
import {
  DispatchFeedBlock,
  type DispatchFeedBlockProps,
} from './blocks/dispatch/DispatchFeedBlock';
import {
  DispatchMagazineGrid,
  type DispatchMagazineGridProps,
} from './blocks/dispatch/DispatchMagazineGrid';
import { DEMO_ARTICLES } from './demo';
import { resolveTheme } from './registry';

export interface TemplateRendererProps {
  config: LayoutConfig;
  publication: TemplatePublicationContext;
  articles?: TemplateArticleItem[];
  mode?: 'live' | 'editable';
  selectedBlockId?: string | null;
  selectedOid?: string | null;
  article?: TemplateArticleItem | null;
  standaloneShell?: boolean;
  onSelectBlock?: (blockId: string) => void;
  onSelectNode?: (oid: string, path: string, blockId: string) => void;
  onUpdateBlockProps?: (blockId: string, newProps: Partial<AnyBlockProps>) => void;
  onUpdateNode?: (
    blockId: string,
    oid: string,
    patch: Partial<import('./schema').TemplateNode>
  ) => void;
  onMoveBlock?: (blockId: string, direction: 'up' | 'down') => void;
  onDeleteBlock?: (blockId: string) => void;
  className?: string;
}

export function TemplateRenderer({
  config,
  publication,
  articles = [],
  mode = 'live',
  selectedBlockId = null,
  selectedOid = null,
  article = null,
  standaloneShell = true,
  onSelectBlock,
  onSelectNode,
  onUpdateBlockProps,
  onUpdateNode,
  onMoveBlock,
  onDeleteBlock,
  className = '',
}: TemplateRendererProps) {
  // En édition : placeholders démo neutres (jamais les vrais articles).
  // En preview/live : les vrais articles.
  const effectiveArticles = mode === 'editable' ? DEMO_ARTICLES : articles;

  const context: TemplateRenderContext = {
    mode,
    selectedBlockId,
    selectedOid,
    article: article ?? (mode === 'editable' ? (DEMO_ARTICLES[0] ?? null) : null),
    onSelectBlock,
    onSelectNode,
    onUpdateBlockProps,
    onUpdateNode,
    onMoveBlock,
    onDeleteBlock,
  };

  const accentColor =
    config.tokens?.accentColor || publication.accentColor || 'hsl(var(--primary))';
  const fontFamily = config.tokens?.fontFamily || publication.fontFamily || 'inherit';

  const customStyle: React.CSSProperties = {
    '--tenant-accent': accentColor,
    fontFamily: fontFamily !== 'inherit' ? `var(--font-${fontFamily}, inherit)` : 'inherit',
    ...(publication.themeMode === 'dark' && { colorScheme: 'dark' }),
  } as React.CSSProperties;

  const cardShape = config.tokens?.cardShape || 'rounded-xl';
  const surface = config.tokens?.surface || 'bordered';

  const theme = resolveTheme(config.archetype);
  const Shell = theme.Shell;
  const showNewsletterWall = (publication.siteOptions?.showNewsletterWall ?? true) !== false;

  const renderedBlocks = config.blocks.map((block) => {
    // En mode live, on ignore les blocs invisibles
    if (mode === 'live' && !block.visible) return null;

    switch (block.type) {
      case 'navbar':
        // Si le Shell souverain du thème gère déjà l'en-tête (ex: Minimal Craft), on évite le doublon
        if (theme.suppressInternalNavbar) return null;
        return (
          <NavbarBlock
            key={block.id}
            id={block.id}
            props={block.props as NavbarBlockProps}
            publication={publication}
            context={context}
            visible={block.visible}
            locked={block.locked}
            slots={block.slots}
            nodes={block.nodes}
            hiddenAt={block.hiddenAt}
          />
        );

      case 'hero':
        return (
          <HeroBlock
            key={block.id}
            id={block.id}
            props={block.props as HeroBlockProps}
            publication={publication}
            context={context}
            visible={block.visible}
            locked={block.locked}
            slots={block.slots}
            nodes={block.nodes}
            hiddenAt={block.hiddenAt}
          />
        );

      case 'lead-story':
        return (
          <LeadStoryBlock
            key={block.id}
            id={block.id}
            props={block.props as LeadStoryBlockProps}
            articles={effectiveArticles}
            publication={publication}
            cardShape={cardShape}
            context={context}
            visible={block.visible}
            locked={block.locked}
            slots={block.slots}
            nodes={block.nodes}
            hiddenAt={block.hiddenAt}
          />
        );

      case 'bento-grid':
        return (
          <BentoGridBlock
            key={block.id}
            id={block.id}
            props={block.props as BentoGridBlockProps}
            articles={effectiveArticles}
            publication={publication}
            cardShape={cardShape}
            surface={surface}
            context={context}
            visible={block.visible}
            locked={block.locked}
            slots={block.slots}
            nodes={block.nodes}
            hiddenAt={block.hiddenAt}
          />
        );

      case 'article-stream':
        return (
          <ArticleStreamBlock
            key={block.id}
            id={block.id}
            props={block.props as ArticleStreamBlockProps}
            articles={effectiveArticles}
            publication={publication}
            cardShape={cardShape}
            context={context}
            visible={block.visible}
            locked={block.locked}
            slots={block.slots}
            nodes={block.nodes}
            hiddenAt={block.hiddenAt}
          />
        );

      case 'newsletter-wall':
        if (mode === 'live' && !showNewsletterWall) return null;
        return (
          <NewsletterWallBlock
            key={block.id}
            id={block.id}
            props={block.props as NewsletterWallBlockProps}
            publication={publication}
            cardShape={cardShape}
            context={context}
            visible={block.visible}
            locked={block.locked}
            slots={block.slots}
            nodes={block.nodes}
            hiddenAt={block.hiddenAt}
          />
        );

      case 'footer':
        return (
          <FooterBlock
            key={block.id}
            id={block.id}
            props={block.props as FooterBlockProps}
            publication={publication}
            context={context}
            visible={block.visible}
            locked={block.locked}
            slots={block.slots}
            nodes={block.nodes}
            hiddenAt={block.hiddenAt}
          />
        );

      case 'article-content':
        return (
          <ArticleContentBlock
            key={block.id}
            id={block.id}
            props={block.props as ArticleContentBlockProps}
            publication={publication}
            article={context.article}
            context={context}
            visible={block.visible}
            locked={block.locked}
            slots={block.slots}
            nodes={block.nodes}
            hiddenAt={block.hiddenAt}
          />
        );

      case 'category-spotlight':
        return (
          <CategorySpotlightBlock
            key={block.id}
            id={block.id}
            props={block.props as CategorySpotlightBlockProps}
            articles={effectiveArticles}
            publication={publication}
            cardShape={cardShape}
            context={context}
            visible={block.visible}
            locked={block.locked}
            slots={block.slots}
            nodes={block.nodes}
            hiddenAt={block.hiddenAt}
          />
        );

      case 'dispatch-feed':
        return (
          <DispatchFeedBlock
            key={block.id}
            id={block.id}
            props={block.props as DispatchFeedBlockProps}
            articles={effectiveArticles}
            publication={publication}
            context={context}
            visible={block.visible}
            locked={block.locked}
            hiddenAt={block.hiddenAt}
          />
        );

      case 'dispatch-magazine':
        return (
          <DispatchMagazineGrid
            key={block.id}
            id={block.id}
            props={block.props as DispatchMagazineGridProps}
            articles={effectiveArticles}
            publication={publication}
            context={context}
            visible={block.visible}
            locked={block.locked}
            hiddenAt={block.hiddenAt}
          />
        );

      default:
        return null;
    }
  });

  if (standaloneShell === false) {
    return <>{renderedBlocks}</>;
  }

  return (
    <Shell
      publication={publication}
      article={context.article}
      articles={effectiveArticles}
      className={className}
      style={customStyle}
    >
      {renderedBlocks}
    </Shell>
  );
}
