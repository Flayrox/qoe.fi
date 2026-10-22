// CategorySpotlightBlock.tsx — Encadré rubrique
import { buildArticlePath, buildCategoryPath } from '@qoe/utils';

import React from 'react';
import Link from 'next/link';
import { SafeImage } from '../../SafeImage';
import { ArrowRight, Clock } from 'lucide-react';
import type {
  CategorySpotlightBlockProps,
  TemplateArticleItem,
  TemplatePublicationContext,
  TemplateRenderContext,
  CardCornerShape,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';
import { NodeRenderer } from './NodeRenderer';
import { findCategoryBySlug, filterArticlesByCategory } from '../navigation';

interface CategorySpotlightBlockComponentProps {
  id: string;
  props: CategorySpotlightBlockProps;
  articles?: TemplateArticleItem[];
  publication?: TemplatePublicationContext;
  cardShape?: CardCornerShape;
  context: TemplateRenderContext;
  visible?: boolean;
  locked?: boolean;
  slots?: Record<string, import('../schema').TemplateNode[]>;
  nodes?: import('../schema').TemplateNode[];
  hiddenAt?: ('mobile' | 'tablet')[];
}

export function CategorySpotlightBlock({
  id,
  props,
  articles = [],
  publication,
  context,
  visible = true,
  locked = false,
  slots,
  nodes,
  hiddenAt,
}: CategorySpotlightBlockComponentProps) {
  const { categorySlug, title, layout = 'framed', maxArticles = 3, showReadingTime = true } = props;

  const targetCategory = categorySlug
    ? findCategoryBySlug(publication?.categories || [], categorySlug)
    : undefined;

  const pool = targetCategory
    ? filterArticlesByCategory(articles, targetCategory, publication?.categories || [])
    : categorySlug
      ? articles.filter((a) => a.category?.slug === categorySlug)
      : articles;

  const items = pool.slice(0, Math.max(1, Math.min(6, maxArticles)));
  const firstCategoryName = targetCategory?.name || items[0]?.category?.name || null;
  const heading = title || firstCategoryName || 'Sélection';

  return (
    <BlockWrapper
      id={id}
      type="category-spotlight"
      label="Encadré rubrique"
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
      <section className="container mx-auto px-4 lg:px-8 py-8 md:py-12">
        <div
          className={
            layout === 'framed'
              ? 'rounded-lg border border-border bg-card p-5 md:p-7 shadow-xs'
              : ''
          }
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg md:text-xl font-bold tracking-tight">{heading}</h2>
            {categorySlug && (
              <Link
                href={buildCategoryPath(targetCategory ?? { slug: categorySlug })}
                onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Tout voir <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>

          {slots?.header && (
            <div className="mb-4">
              <NodeRenderer
                nodes={slots.header}
                blockId={id}
                blockProps={props as unknown as Record<string, unknown>}
                context={context}
                path="slots/header"
              />
            </div>
          )}

          {items.length > 0 ? (
            <div className="divide-y divide-border">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="group relative flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                >
                  {item.imageUrl && (
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                      <SafeImage src={item.imageUrl} alt="" fill className="object-cover" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm md:text-base font-bold">
                      <Link
                        href={buildArticlePath(item)}
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="after:absolute after:inset-0"
                      >
                        {item.title}
                      </Link>
                    </h3>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {item.category && !categorySlug && <span>{item.category.name}</span>}
                      {showReadingTime && item.readingTime ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 opacity-60" /> {item.readingTime} min
                        </span>
                      ) : null}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              {categorySlug
                ? 'Aucun article dans cette rubrique pour le moment.'
                : 'Ajoutez le slug d\u2019une rubrique dans les réglages du bloc.'}
            </p>
          )}

          {nodes && nodes.length > 0 && (
            <div className="mt-4">
              <NodeRenderer
                nodes={nodes}
                blockId={id}
                blockProps={props as unknown as Record<string, unknown>}
                context={context}
                path="nodes"
              />
            </div>
          )}
        </div>
      </section>
    </BlockWrapper>
  );
}
