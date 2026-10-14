'use client';

// =====================================================================
// DispatchFeedBlock.tsx — Flux 2-colonnes Newspaper
// =====================================================================
// Découplé : combine DispatchPostCard et DispatchAuthorSidebar.
// =====================================================================

import React from 'react';
import type {
  TemplateArticleItem,
  TemplatePublicationContext,
  TemplateRenderContext,
} from '../../schema';
import { DispatchPostCard } from './DispatchPostCard';
import { DispatchAuthorSidebar } from './DispatchAuthorSidebar';
import { BlockWrapper } from '../BlockWrapper';

export interface DispatchFeedBlockProps {
  showLead?: boolean;
  articlesPerPage?: number;
}

interface DispatchFeedBlockComponentProps {
  id: string;
  props?: DispatchFeedBlockProps;
  articles?: TemplateArticleItem[];
  publication: TemplatePublicationContext;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
  hiddenAt?: ('mobile' | 'tablet')[];
}

export function DispatchFeedBlock({
  id,
  props = {},
  articles = [],
  publication,
  context,
  visible = true,
  locked = false,
  hiddenAt,
}: DispatchFeedBlockComponentProps) {
  const showLead = props.showLead ?? true;
  const leadArticle = showLead && articles.length > 0 ? articles[0] : null;
  const feedArticles = showLead ? articles.slice(1) : articles;

  return (
    <BlockWrapper
      id={id}
      type="dispatch-feed"
      label="Flux de publication (2 colonnes)"
      visible={visible}
      locked={locked}
      context={context}
      hiddenAt={hiddenAt}
    >
      <section
        data-oid={`dispatch_feed_block_${id}`}
        className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Colonne Principale : Flux d'articles (65% / 8 cols) */}
          <div className="lg:col-span-8 flex flex-col">
            {leadArticle && (
              <DispatchPostCard
                article={leadArticle}
                variant="lead"
                accentColor={publication.accentColor || undefined}
                className="mb-4"
              />
            )}

            {feedArticles.length > 0 ? (
              <div className="flex flex-col divide-y divide-border/40">
                {feedArticles.map((article) => (
                  <DispatchPostCard
                    key={article.id}
                    article={article}
                    variant="feed"
                    accentColor={publication.accentColor || undefined}
                  />
                ))}
              </div>
            ) : !leadArticle ? (
              <div className="py-16 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                <p className="text-sm">Aucun article publié pour le moment.</p>
              </div>
            ) : null}
          </div>

          {/* Colonne Secondaire : Sidebar Auteur / Publication (35% / 4 cols) */}
          <div className="lg:col-span-4 w-full">
            <DispatchAuthorSidebar publication={publication} />
          </div>
        </div>
      </section>
    </BlockWrapper>
  );
}
