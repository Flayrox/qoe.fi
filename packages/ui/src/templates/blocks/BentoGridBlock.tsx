// =====================================================================
// BentoGridBlock.tsx — Grille asymétrique
// Supporte :
// - Agencement 1 grande carte vedette + 2 ou 3 cartes satellites
// - Surface adaptative (glassmorphic, bordered, elevated)
// - Formes géométriques pilotées par les tokens de design
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { SafeImage } from '../../SafeImage';
import { Clock, Lock } from 'lucide-react';
import { PLACEHOLDER_COVER_1, PLACEHOLDER_COVER_2, PLACEHOLDER_COVER_3 } from '../placeholders';
import type {
  BentoGridBlockProps,
  TemplateArticleItem,
  TemplatePublicationContext,
  TemplateRenderContext,
  CardCornerShape,
  SurfaceStyle,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';
import { NodeRenderer } from './NodeRenderer';

interface BentoGridBlockComponentProps {
  id: string;
  props: BentoGridBlockProps;
  articles?: TemplateArticleItem[];
  publication: TemplatePublicationContext;
  cardShape?: CardCornerShape;
  surface?: SurfaceStyle;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
  slots?: Record<string, import('../schema').TemplateNode[]>;
  nodes?: import('../schema').TemplateNode[];
  hiddenAt?: ('mobile' | 'tablet')[];
}

export function BentoGridBlock({
  id,
  props,
  articles = [],
  cardShape = 'rounded-2xl',
  surface = 'bordered',
  context,
  visible = true,
  locked = false,
  slots,
  nodes,
  hiddenAt,
}: BentoGridBlockComponentProps) {
  const { maxArticles = 4, showCategories = true, showReadingTime = true, categoryFilter } = props;
  const columnsMobile = props.columnsMobile ?? 1;
  const columns = props.columns ?? 3;
  const gridClasses =
    columnsMobile === 2
      ? columns === 2
        ? 'grid-cols-2 md:grid-cols-2'
        : 'grid-cols-2 md:grid-cols-3'
      : columns === 2
        ? 'grid-cols-1 md:grid-cols-2'
        : 'grid-cols-1 md:grid-cols-3';

  // Découpage des articles (on saute éventuellement le 1er si déjà en lead)
  const sourceArticles = categoryFilter
    ? articles.filter((a) => a.category?.slug === categoryFilter)
    : articles;
  const bentoArticles = sourceArticles.slice(0, maxArticles);

  // Articles de démonstration si la publication a peu d'articles
  const fallbackArticles: TemplateArticleItem[] = [
    {
      id: 'bento_fb_1',
      title: "Titre de l'article",
      slug: 'minimalisme-typographique',
      excerpt: '',
      imageUrl: PLACEHOLDER_COVER_1,
      readingTime: 4,
      category: { name: 'Design' },
    },
    {
      id: 'bento_fb_2',
      title: "Titre de l'article",
      slug: 'micro-publications-souveraines',
      excerpt: '',
      imageUrl: PLACEHOLDER_COVER_2,
      readingTime: 5,
      category: { name: 'Économie' },
    },
    {
      id: 'bento_fb_3',
      title: "Titre de l'article",
      slug: 'au-dela-du-clic',
      excerpt: '',
      imageUrl: PLACEHOLDER_COVER_3,
      readingTime: 3,
      category: { name: 'Médias' },
    },
  ];

  const items = categoryFilter
    ? bentoArticles
    : bentoArticles.length > 0
      ? bentoArticles
      : fallbackArticles;

  const surfaceClasses =
    surface === 'glassmorphic'
      ? 'bg-card border border-border/80 shadow-xs'
      : surface === 'elevated'
        ? 'bg-card border border-border/60 shadow-xs'
        : 'bg-card border border-border shadow-xs';

  return (
    <BlockWrapper
      id={id}
      type="bento-grid"
      label="Grille"
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
      <section className="container mx-auto px-4 lg:px-8 py-8 md:py-14">
        {(slots?.header || (nodes && nodes.length > 0)) && (
          <div className="mb-5">
            {slots?.header && (
              <NodeRenderer
                nodes={slots.header}
                blockId={id}
                blockProps={props as unknown as Record<string, unknown>}
                context={context}
                path="slots/header"
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
        <div className={`grid ${gridClasses} gap-5 md:gap-6`}>
          {items.map((item, index) => {
            const isLead = index === 0;

            return (
              <div
                key={item.id}
                className={`group relative flex flex-col justify-between overflow-hidden transition-colors duration-300 ${cardShape} ${surfaceClasses} ${
                  isLead ? 'md:col-span-2 md:row-span-1 min-h-[340px]' : 'min-h-[300px]'
                }`}
              >
                {/* Image */}
                {item.imageUrl && (
                  <div
                    className={`relative w-full overflow-hidden bg-muted ${
                      isLead ? 'h-48 md:h-56' : 'h-36'
                    }`}
                  >
                    <SafeImage src={item.imageUrl} alt="" fill className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

                    <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                      {showCategories &&
                        item.category &&
                        (item.category.slug ? (
                          <Link
                            href={`/categorie/${item.category.slug}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (context.mode === 'editable') e.preventDefault();
                            }}
                            className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground hover:text-foreground"
                          >
                            {item.category.name}
                          </Link>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground">
                            {item.category.name}
                          </span>
                        ))}
                      {item.isPremium && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-border bg-background text-muted-foreground flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Réservé
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Contenu textuel */}
                <div className="p-5 md:p-6 flex flex-col justify-between flex-1">
                  <div>
                    <h3
                      className={`font-bold tracking-tight text-foreground ${
                        isLead ? 'text-xl md:text-2xl' : 'text-base md:text-lg'
                      }`}
                    >
                      <Link
                        href={`/article/${item.slug}`}
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="after:absolute after:inset-0"
                      >
                        {item.title}
                      </Link>
                    </h3>
                    {item.excerpt && (
                      <p className="mt-2 text-xs md:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                        {item.excerpt}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                    {showReadingTime && item.readingTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 opacity-70" />
                        {item.readingTime} min
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </BlockWrapper>
  );
}
