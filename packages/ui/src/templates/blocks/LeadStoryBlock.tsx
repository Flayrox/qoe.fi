// =====================================================================
// 🏆 LeadStoryBlock.tsx — Grand Format & Article Vedette (Licorne 2026)
// =====================================================================
// Met en lumière l'article phare (le premier article ou sélectionné).
// Supporte :
// - Ratios d'aspect cinéma (21:9, 16:9, 4:3)
// - Badge éditorial "À LA UNE"
// - Temps de lecture, auteur et date
// - Respect des tokens de surface et d'arrondis
// =====================================================================

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Clock, Calendar, Lock } from 'lucide-react';
import type {
  LeadStoryBlockProps,
  TemplateArticleItem,
  TemplatePublicationContext,
  TemplateRenderContext,
  CardCornerShape,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';

interface LeadStoryBlockComponentProps {
  id: string;
  props: LeadStoryBlockProps;
  articles?: TemplateArticleItem[];
  publication?: TemplatePublicationContext;
  cardShape?: CardCornerShape;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
}

export function LeadStoryBlock({
  id,
  props,
  articles = [],
  cardShape = 'rounded-2xl',
  context,
  visible = true,
  locked = false,
}: LeadStoryBlockComponentProps) {
  const {
    aspectRatio = '21:9',
    showExcerpt = true,
    showReadTime = true,
    showDate = true,
    badgeText = 'À LA UNE',
  } = props;

  const leadArticle = articles[0];

  // Placeholder élégant si aucun article n'a encore été publié
  const displayArticle: TemplateArticleItem = leadArticle || {
    id: 'placeholder_lead',
    title: 'Les frontières invisibles de la pensée moderne',
    slug: 'frontieres-invisibles',
    excerpt:
      'Une analyse approfondie sur les dynamiques culturelles et technologiques qui redéfinissent notre rapport au savoir et à la souveraineté numérique.',
    imageUrl:
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1600&auto=format&fit=crop',
    readingTime: 6,
    publishedAt: new Date().toISOString(),
    category: { name: 'Essai' },
    isPremium: false,
  };

  const ratioClass =
    aspectRatio === '21:9'
      ? 'aspect-[21/9]'
      : aspectRatio === '16:9'
        ? 'aspect-[16/9]'
        : aspectRatio === '4:3'
          ? 'aspect-[4/3]'
          : 'aspect-square';

  return (
    <BlockWrapper
      id={id}
      type="lead-story"
      label="Article Vedette (À la Une)"
      visible={visible}
      locked={locked}
      context={context}
    >
      <section className="container mx-auto px-4 lg:px-8 py-10 md:py-16">
        <Link
          href={`/article/${displayArticle.slug}`}
          onClick={(e) => context.mode === 'editable' && e.preventDefault()}
          className="group block"
        >
          <div
            className={`relative overflow-hidden bg-card border border-border shadow-sm transition-all duration-300 group-hover:shadow-xl group-hover:border-border/80 ${cardShape}`}
          >
            {/* Image de couverture avec ratio contrôlé */}
            {displayArticle.imageUrl && (
              <div className={`relative w-full ${ratioClass} overflow-hidden bg-muted`}>
                <Image
                  src={displayArticle.imageUrl}
                  alt={displayArticle.title}
                  fill
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-102"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

                {/* Badge éditorial supérieur */}
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                  {badgeText && (
                    <span
                      className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider text-white shadow-sm"
                      style={{ backgroundColor: 'var(--tenant-accent, hsl(var(--primary)))' }}
                    >
                      {badgeText}
                    </span>
                  )}
                  {displayArticle.category && (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-black/60 backdrop-blur-md text-white border border-white/20">
                      {displayArticle.category.name}
                    </span>
                  )}
                  {displayArticle.isPremium && (
                    <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-warning/90 text-warning-foreground flex items-center gap-1 shadow-sm">
                      <Lock className="w-3 h-3" /> Membre
                    </span>
                  )}
                </div>

                {/* Titre & extrait superposés sur grands écrans */}
                <div className="absolute bottom-0 inset-x-0 p-6 md:p-10 text-white z-10">
                  <div className="flex items-center gap-4 text-xs md:text-sm text-white/80 mb-3 font-medium">
                    {showDate && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(displayArticle.publishedAt || Date.now()).toLocaleDateString(
                          'fr-FR',
                          {
                            month: 'long',
                            day: 'numeric',
                          }
                        )}
                      </span>
                    )}
                    {showReadTime && displayArticle.readingTime && (
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {displayArticle.readingTime} min de lecture
                      </span>
                    )}
                  </div>

                  <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight group-hover:text-white transition-colors">
                    {displayArticle.title}
                  </h2>

                  {showExcerpt && displayArticle.excerpt && (
                    <p className="mt-3 text-sm md:text-base text-white/85 line-clamp-2 max-w-3xl leading-relaxed">
                      {displayArticle.excerpt}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </Link>
      </section>
    </BlockWrapper>
  );
}
