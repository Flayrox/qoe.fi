// =====================================================================
// HeroBlock.tsx — Section bannière
// =====================================================================
// Supporte 4 styles fondamentaux :
// 1. cinematic-banner : Image panoramique immersive avec gradient
// 2. typographic-minimal : Titre percutant et manifeste épuré
// 3. split-featured : Agencement moderne en deux colonnes (titre + visuel)
// 4. floating-card : Carte flottante en verre sur fond texturé
// =====================================================================

import React from 'react';
import { SafeImage } from '../../SafeImage';
import type { HeroBlockProps, TemplatePublicationContext, TemplateRenderContext } from '../schema';
import { BlockWrapper } from './BlockWrapper';
import { EditableText } from './EditableText';
import { NodeRenderer } from './NodeRenderer';
import { SubscribeForm } from '../../SubscribeForm';

interface HeroBlockComponentProps {
  id: string;
  props: HeroBlockProps;
  publication: TemplatePublicationContext;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
  slots?: Record<string, import('../schema').TemplateNode[]>;
  nodes?: import('../schema').TemplateNode[];
  hiddenAt?: ('mobile' | 'tablet')[];
}

export function HeroBlock({
  id,
  props,
  publication,
  context,
  visible = true,
  locked = false,
  slots,
  nodes,
  hiddenAt,
}: HeroBlockComponentProps) {
  const {
    style = 'cinematic-banner',
    alignment = 'center',
    alignMobile,
    height = 'medium',
    showOverlay = true,
    overlayOpacity = 50,
    customTitle,
    customTagline,
    showCoverImage = true,
  } = props;

  const { name, heroText, headerImageUrl, siteOptions } = publication;

  const allowBanner = (siteOptions?.showBanner ?? true) !== false;
  const allowTagline = (siteOptions?.showTagline ?? true) !== false;

  const effectiveHeaderImageUrl = allowBanner ? headerImageUrl : null;
  const effectiveShowCoverImage = showCoverImage && allowBanner;
  const title = customTitle || name || '';
  const tagline = allowTagline ? customTagline || heroText || '' : '';

  const heightClasses =
    height === 'compact'
      ? 'py-12 md:py-16'
      : height === 'tall'
        ? 'py-28 md:py-40'
        : 'py-20 md:py-28';

  const mobileAlign = alignMobile ?? alignment;
  const alignClasses = [
    mobileAlign === 'left' ? 'text-left items-start' : 'text-center items-center',
    alignment === 'left' ? 'md:text-left md:items-start' : 'md:text-center md:items-center',
  ].join(' ');

  return (
    <BlockWrapper
      id={id}
      type="hero"
      label="Bannière"
      visible={visible}
      locked={locked}
      context={context}
      styleBox={
        (
          props as unknown as {
            styleBox?: { pt?: number; pb?: number; maxWidth?: number; opacity?: number };
          }
        ).styleBox
      }
      blockStyle={(props as unknown as { style?: import('../schema').BlockStyleProps }).style}
      hiddenAt={hiddenAt}
    >
      <section
        className={`relative w-full overflow-hidden ${
          style === 'typographic-minimal' ? '' : 'border-b border-border/40'
        }`}
      >
        {/* Style 1 : Bannière Cinématique Panoramique */}
        {style === 'cinematic-banner' && effectiveShowCoverImage && effectiveHeaderImageUrl && (
          <div className="absolute inset-0 w-full h-full -z-10 overflow-hidden">
            {showOverlay && (
              <div
                className="absolute inset-0 z-10 bg-black/50 pointer-events-none"
                style={{ opacity: overlayOpacity / 100 }}
              />
            )}
            <SafeImage
              src={effectiveHeaderImageUrl}
              alt="Bannière de couverture"
              fill
              className="object-cover object-center"
              priority
            />
          </div>
        )}

        {style === 'typographic-minimal' ? (
          /* Style Typographique Minimaliste (Devouring Details / Rauno) */
          <div className="max-w-4xl mx-auto px-4 sm:px-0 py-6 sm:py-10 relative">
            <div className="relative flex flex-col gap-3 sm:gap-4">
              {slots?.subtitle ? (
                <div className="mt-2 max-w-2xl">
                  <NodeRenderer
                    nodes={slots.subtitle}
                    blockId={id}
                    blockProps={props as unknown as Record<string, unknown>}
                    context={context}
                    path="slots/subtitle"
                  />
                </div>
              ) : (
                tagline && (
                  <EditableText
                    blockId={id}
                    propKey="customTagline"
                    value={tagline}
                    context={context}
                    as="p"
                    className="text-base sm:text-lg text-muted-foreground/90 leading-relaxed"
                  />
                )
              )}

              {/* Formulaire d'abonnement épuré relié à l'API et au compte Qoefi */}
              <div
                data-testid="hero-subscribe-box"
                className="mt-6 pt-4 border-t border-border/40 select-none"
              >
                <SubscribeForm
                  publicationId={publication?.id || ''}
                  authorName={title}
                  accentColor={publication?.accentColor || undefined}
                  placeholder="Entrez votre email..."
                  buttonText="S’abonner"
                  helperText={`Rejoignez les lecteurs de ${title}. Désinscription libre en un clic.`}
                  disabled={context.mode === 'editable'}
                  size="compact"
                  className="max-w-md mx-0"
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`container mx-auto px-4 lg:px-8 flex flex-col ${alignClasses} ${heightClasses} relative z-20`}
          >
            {slots?.title ? (
              <NodeRenderer
                nodes={slots.title}
                blockId={id}
                blockProps={props as unknown as Record<string, unknown>}
                context={context}
                path="slots/title"
              />
            ) : (
              <EditableText
                blockId={id}
                propKey="customTitle"
                value={title}
                context={context}
                as="h1"
                className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight max-w-4xl transition-colors ${
                  style === 'cinematic-banner' && effectiveHeaderImageUrl
                    ? 'text-white'
                    : 'text-foreground'
                }`}
              />
            )}

            {slots?.subtitle ? (
              <div className="mt-4 sm:mt-6 max-w-2xl">
                <NodeRenderer
                  nodes={slots.subtitle}
                  blockId={id}
                  blockProps={props as unknown as Record<string, unknown>}
                  context={context}
                  path="slots/subtitle"
                />
              </div>
            ) : (
              tagline && (
                <EditableText
                  blockId={id}
                  propKey="customTagline"
                  value={tagline}
                  context={context}
                  as="p"
                  className={`mt-4 sm:mt-6 text-base sm:text-lg md:text-xl max-w-2xl font-normal leading-relaxed ${
                    style === 'cinematic-banner' && effectiveHeaderImageUrl
                      ? 'text-white/80'
                      : 'text-muted-foreground'
                  }`}
                />
              )
            )}
            {slots?.actions && (
              <div className="mt-6 flex flex-wrap gap-2">
                <NodeRenderer
                  nodes={slots.actions}
                  blockId={id}
                  blockProps={props as unknown as Record<string, unknown>}
                  context={context}
                  path="slots/actions"
                />
              </div>
            )}
            {nodes && nodes.length > 0 && (
              <NodeRenderer
                nodes={nodes}
                blockId={id}
                blockProps={props as unknown as Record<string, unknown>}
                context={context}
                path="nodes"
              />
            )}
          </div>
        )}
      </section>
    </BlockWrapper>
  );
}
