'use client';

// =====================================================================
// DispatchMagazineGrid.tsx — Grille 3-colonnes Magaziney
// =====================================================================
// Lead story centrale, carte secondaire et liste de brèves/top stories.
// =====================================================================

import React from 'react';
import type {
  TemplateArticleItem,
  TemplatePublicationContext,
  TemplateRenderContext,
} from '../../schema';
import { DispatchPostCard } from './DispatchPostCard';
import { BlockWrapper } from '../BlockWrapper';

export interface DispatchMagazineGridProps {
  heading?: string;
}

interface DispatchMagazineGridComponentProps {
  id: string;
  props?: DispatchMagazineGridProps;
  articles?: TemplateArticleItem[];
  publication: TemplatePublicationContext;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
  hiddenAt?: ('mobile' | 'tablet')[];
}

export function DispatchMagazineGrid({
  id,
  props = {},
  articles = [],
  publication,
  context,
  visible = true,
  locked = false,
  hiddenAt,
}: DispatchMagazineGridComponentProps) {
  if (articles.length === 0) return null;

  const leadArticle = articles[0];
  const secondaryArticle = articles.length > 1 ? articles[1] : null;
  const sideArticles = articles.slice(2, 6);

  return (
    <BlockWrapper
      id={id}
      type="dispatch-magazine"
      label="Grille Magazine (3 colonnes)"
      visible={visible}
      locked={locked}
      context={context}
      hiddenAt={hiddenAt}
    >
      <section
        data-oid={`dispatch_magazine_grid_${id}`}
        className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 border-b border-border/50"
      >
        {props.heading && (
          <h2 className="text-xl font-bold tracking-tight mb-6 pb-2 border-b border-border/60">
            {props.heading}
          </h2>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* 1. Colonne Principale : Grande Histoire Vedette (Lead) (7 cols) */}
          <div className="md:col-span-7">
            {leadArticle && (
              <DispatchPostCard
                article={leadArticle}
                variant="lead"
                accentColor={publication.accentColor || undefined}
              />
            )}
          </div>

          {/* 2. Colonne Latérale : Histoire Secondaire & Top Stories (5 cols) */}
          <div className="md:col-span-5 flex flex-col gap-6 md:pl-4 md:border-l md:border-border/60">
            {secondaryArticle && (
              <DispatchPostCard
                article={secondaryArticle}
                variant="feed"
                accentColor={publication.accentColor || undefined}
                className="pb-4"
              />
            )}

            {sideArticles.length > 0 && (
              <div className="flex flex-col">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Dernières parutions
                </span>
                <div className="flex flex-col">
                  {sideArticles.map((article) => (
                    <DispatchPostCard
                      key={article.id}
                      article={article}
                      variant="compact"
                      accentColor={publication.accentColor || undefined}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </BlockWrapper>
  );
}
