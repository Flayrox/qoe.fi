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
} from './schema';
import { NavbarBlock } from './blocks/NavbarBlock';
import { HeroBlock } from './blocks/HeroBlock';
import { LeadStoryBlock } from './blocks/LeadStoryBlock';
import { BentoGridBlock } from './blocks/BentoGridBlock';
import { ArticleStreamBlock } from './blocks/ArticleStreamBlock';
import { NewsletterWallBlock } from './blocks/NewsletterWallBlock';
import { FooterBlock } from './blocks/FooterBlock';
import { DEMO_ARTICLES } from './demo';

export interface TemplateRendererProps {
  config: LayoutConfig;
  publication: TemplatePublicationContext;
  articles?: TemplateArticleItem[];
  mode?: 'live' | 'editable';
  selectedBlockId?: string | null;
  selectedOid?: string | null;
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

  return (
    <div
      style={customStyle}
      className={`min-h-screen bg-background text-foreground transition-colors selection:bg-[var(--tenant-accent)] selection:text-white ${className}`}
    >
      {config.blocks.map((block) => {
        // En mode live, on ignore les blocs invisibles
        if (mode === 'live' && !block.visible) return null;

        switch (block.type) {
          case 'navbar':
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
              />
            );

          case 'newsletter-wall':
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
              />
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
