// =====================================================================
// 🌟 HeroBlock.tsx — Section Bannière & Manifeste (Licorne 2026)
// =====================================================================
// Supporte 4 styles fondamentaux :
// 1. cinematic-banner : Image panoramique immersive avec gradient
// 2. typographic-minimal : Titre percutant et manifeste épuré
// 3. split-featured : Agencement moderne en deux colonnes (titre + visuel)
// 4. floating-card : Carte flottante en verre sur fond texturé
// =====================================================================

import React from 'react';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import type { HeroBlockProps, TemplatePublicationContext, TemplateRenderContext } from '../schema';
import { BlockWrapper } from './BlockWrapper';

interface HeroBlockComponentProps {
  id: string;
  props: HeroBlockProps;
  publication: TemplatePublicationContext;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
}

export function HeroBlock({
  id,
  props,
  publication,
  context,
  visible = true,
  locked = false,
}: HeroBlockComponentProps) {
  const {
    style = 'cinematic-banner',
    alignment = 'center',
    height = 'medium',
    showOverlay = true,
    overlayOpacity = 50,
    customTitle,
    customTagline,
    showCoverImage = true,
  } = props;

  const { name, heroText, headerImageUrl } = publication;

  const title = customTitle || name || 'Bienvenue sur notre site';
  const tagline =
    customTagline ||
    heroText ||
    'Analyses approfondies, réflexions indépendantes et récits captivants.';

  const heightClasses =
    height === 'compact'
      ? 'py-12 md:py-16'
      : height === 'tall'
        ? 'py-28 md:py-40'
        : 'py-20 md:py-28';

  const alignClasses = alignment === 'left' ? 'text-left items-start' : 'text-center items-center';

  return (
    <BlockWrapper
      id={id}
      type="hero"
      label="Bannière & Manifeste"
      visible={visible}
      locked={locked}
      context={context}
    >
      <section className="relative w-full overflow-hidden border-b border-border/40">
        {/* Style 1 : Bannière Cinématique Panoramique */}
        {style === 'cinematic-banner' && showCoverImage && headerImageUrl && (
          <div className="absolute inset-0 w-full h-full -z-10 overflow-hidden">
            {showOverlay && (
              <div
                className="absolute inset-0 z-10 bg-gradient-to-b from-black/70 via-black/40 to-background pointer-events-none"
                style={{ opacity: overlayOpacity / 100 }}
              />
            )}
            <Image
              src={headerImageUrl}
              alt="Bannière de couverture"
              fill
              className="object-cover object-center"
              priority
            />
          </div>
        )}

        <div
          className={`container mx-auto px-4 lg:px-8 flex flex-col ${alignClasses} ${heightClasses} relative z-20`}
        >
          {/* Style 2 : Typographique Minimal */}
          {style === 'typographic-minimal' && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground mb-4">
              <Sparkles className="w-3 h-3 text-[var(--tenant-accent,hsl(var(--primary)))]" />
              <span>Manifeste</span>
            </div>
          )}

          <h1
            className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight max-w-4xl transition-colors ${
              style === 'cinematic-banner' && headerImageUrl
                ? 'text-white drop-shadow-sm'
                : 'text-foreground'
            }`}
          >
            {title}
          </h1>

          {tagline && (
            <p
              className={`mt-4 sm:mt-6 text-base sm:text-lg md:text-xl max-w-2xl font-normal leading-relaxed ${
                style === 'cinematic-banner' && headerImageUrl
                  ? 'text-white/80 drop-shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              {tagline}
            </p>
          )}
        </div>
      </section>
    </BlockWrapper>
  );
}
