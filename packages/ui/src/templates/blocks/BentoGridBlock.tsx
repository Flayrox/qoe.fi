// =====================================================================
// 🍱 BentoGridBlock.tsx — Mosaïque Asymétrique Bento (Licorne 2026)
// =====================================================================
// Fournit une mise en page asymétrique hautement immersive (Apple/Linear).
// Supporte :
// - Agencement 1 grande carte vedette + 2 ou 3 cartes satellites
// - Surface adaptative (glassmorphic, bordered, elevated)
// - Formes géométriques pilotées par les tokens de design
// =====================================================================

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, Clock, Lock } from 'lucide-react';
import type {
  BentoGridBlockProps,
  TemplateArticleItem,
  TemplatePublicationContext,
  TemplateRenderContext,
  CardCornerShape,
  SurfaceStyle,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';

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
}: BentoGridBlockComponentProps) {
  const { maxArticles = 4, showCategories = true, showReadingTime = true } = props;

  // Découpage des articles (on saute éventuellement le 1er si déjà en lead)
  const bentoArticles = articles.slice(0, maxArticles);

  // Articles de démonstration si la publication a peu d'articles
  const fallbackArticles: TemplateArticleItem[] = [
    {
      id: 'bento_fb_1',
      title: 'L’art du minimalisme typographique dans le journalisme moderne',
      slug: 'minimalisme-typographique',
      excerpt: 'Comment la suppression des fioritures visuelles réhabilite l’attention du lecteur.',
      imageUrl:
        'https://images.unsplash.com/photo-1507842229451-7f01be8860ee?q=80&w=800&auto=format&fit=crop',
      readingTime: 4,
      category: { name: 'Design' },
    },
    {
      id: 'bento_fb_2',
      title: 'L’essor des micro-publications souveraines',
      slug: 'micro-publications-souveraines',
      excerpt: 'Pourquoi les auteurs reprennent le contrôle de leur lectorat.',
      imageUrl:
        'https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=800&auto=format&fit=crop',
      readingTime: 5,
      category: { name: 'Économie' },
    },
    {
      id: 'bento_fb_3',
      title: 'Au-delà du clic : mesurer l’attention réelle',
      slug: 'au-dela-du-clic',
      excerpt: 'Les métriques de vanité laissent place à la profondeur de lecture.',
      imageUrl:
        'https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?q=80&w=800&auto=format&fit=crop',
      readingTime: 3,
      category: { name: 'Médias' },
    },
  ];

  const items = bentoArticles.length > 0 ? bentoArticles : fallbackArticles;

  const surfaceClasses =
    surface === 'glassmorphic'
      ? 'bg-card/60 backdrop-blur-md border border-border/80 shadow-sm'
      : surface === 'elevated'
        ? 'bg-card border border-border/60 shadow-lg'
        : 'bg-card border border-border shadow-xs';

  return (
    <BlockWrapper
      id={id}
      type="bento-grid"
      label="Grille Bento Dynamique"
      visible={visible}
      locked={locked}
      context={context}
    >
      <section className="container mx-auto px-4 lg:px-8 py-8 md:py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {items.map((item, index) => {
            const isLead = index === 0;

            return (
              <Link
                key={item.id}
                href={`/article/${item.slug}`}
                onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                className={`group flex flex-col justify-between overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${cardShape} ${surfaceClasses} ${
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
                    <Image
                      src={item.imageUrl}
                      alt={item.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-103"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

                    <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                      {showCategories && item.category && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-background/90 text-foreground backdrop-blur-sm shadow-xs">
                          {item.category.name}
                        </span>
                      )}
                      {item.isPremium && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning/90 text-warning-foreground flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Club
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Contenu textuel */}
                <div className="p-5 md:p-6 flex flex-col justify-between flex-1">
                  <div>
                    <h3
                      className={`font-bold tracking-tight text-foreground group-hover:text-[var(--tenant-accent,hsl(var(--primary)))] transition-colors ${
                        isLead ? 'text-xl md:text-2xl' : 'text-base md:text-lg'
                      }`}
                    >
                      {item.title}
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

                    <span className="inline-flex items-center gap-1 font-medium group-hover:translate-x-0.5 transition-transform text-foreground">
                      Lire <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </BlockWrapper>
  );
}
