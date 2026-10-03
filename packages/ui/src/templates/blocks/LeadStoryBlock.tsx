// =====================================================================
// LeadStoryBlock.tsx — Article vedette
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
import { EditableText } from './EditableText';
import { NodeRenderer } from './NodeRenderer';

interface LeadStoryBlockComponentProps {
  id: string;
  props: LeadStoryBlockProps;
  articles?: TemplateArticleItem[];
  publication?: TemplatePublicationContext;
  cardShape?: CardCornerShape;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
  slots?: Record<string, import('../schema').TemplateNode[]>;
  nodes?: import('../schema').TemplateNode[];
}

export function LeadStoryBlock({
  id,
  props,
  articles = [],
  cardShape = 'rounded-2xl',
  context,
  visible = true,
  locked = false,
  slots,
  nodes,
}: LeadStoryBlockComponentProps) {
  const {
    aspectRatio = '21:9',
    showExcerpt = true,
    showReadTime = true,
    showDate = true,
    badgeText,
  } = props;

  const leadArticle = articles[0];

  // Placeholder élégant si aucun article n'a encore été publié
  const displayArticle: TemplateArticleItem = leadArticle || {
    id: 'placeholder_lead',
    title: "Titre de l'article",
    slug: 'frontieres-invisibles',
    excerpt: '',
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
      label="Article vedette"
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
    >
      <section className="container mx-auto px-4 lg:px-8 py-10 md:py-16">
        <div className="group relative block">
          <div
            className={`relative overflow-hidden bg-card border border-border shadow-xs transition-colors duration-300 ${cardShape}`}
          >
            {/* Image de couverture avec ratio contrôlé */}
            {displayArticle.imageUrl && (
              <div className={`relative w-full ${ratioClass} overflow-hidden bg-muted`}>
                <Image
                  src={displayArticle.imageUrl}
                  alt={displayArticle.title}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

                {/* Badge éditorial supérieur */}
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                  {badgeText && (
                    <span
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-primary-foreground"
                      style={{ backgroundColor: 'var(--tenant-accent, hsl(var(--primary)))' }}
                    >
                      <EditableText
                        blockId={id}
                        propKey="badgeText"
                        value={badgeText}
                        context={context}
                        as="span"
                        multiline={false}
                      />
                    </span>
                  )}
                  {displayArticle.category &&
                    (displayArticle.category.slug ? (
                      <Link
                        href={`/categorie/${displayArticle.category.slug}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (context.mode === 'editable') e.preventDefault();
                        }}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-background/90 text-foreground hover:underline"
                      >
                        {displayArticle.category.name}
                      </Link>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-background/90 text-foreground">
                        {displayArticle.category.name}
                      </span>
                    ))}
                  {displayArticle.isPremium && (
                    <span className="px-2 py-1 rounded-md text-[11px] font-medium border border-border bg-background text-muted-foreground flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Réservé
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

                  <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight">
                    <Link
                      href={`/article/${displayArticle.slug}`}
                      onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                      className="after:absolute after:inset-0"
                    >
                      {displayArticle.title}
                    </Link>
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
        </div>
        {(slots?.actions || (nodes && nodes.length > 0)) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {slots?.actions && (
              <NodeRenderer
                nodes={slots.actions}
                blockId={id}
                blockProps={props as unknown as Record<string, unknown>}
                context={context}
                path="slots/actions"
              />
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
