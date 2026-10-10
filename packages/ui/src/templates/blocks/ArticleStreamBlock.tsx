// =====================================================================
// ArticleStreamBlock.tsx — Flux de Publications & Archives (Licorne 2026)
// =====================================================================
// Affiche le catalogue d'articles sous forme de liste ou de grille (2/3 cols).
// Supporte :
// - Densité paramétrable (compact, standard, spacious)
// - Affichage des extraits, temps de lecture, badges de catégorie
// - Format accessible et balisé pour le SEO
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { SafeImage } from '../../SafeImage';
import { Clock } from 'lucide-react';
import { PLACEHOLDER_COVER_1, PLACEHOLDER_COVER_2, PLACEHOLDER_COVER_3 } from '../placeholders';
import type {
  ArticleStreamBlockProps,
  TemplateArticleItem,
  TemplatePublicationContext,
  TemplateRenderContext,
  CardCornerShape,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';
import { NodeRenderer } from './NodeRenderer';

interface ArticleStreamBlockComponentProps {
  id: string;
  props: ArticleStreamBlockProps;
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

export function ArticleStreamBlock({
  id,
  props,
  articles = [],
  cardShape = 'rounded-xl',
  context,
  visible = true,
  locked = false,
  slots,
  nodes,
  hiddenAt,
}: ArticleStreamBlockComponentProps) {
  const {
    displayMode = 'list',
    density = 'standard',
    showReadingTime = true,
    showExcerpts = true,
    showCategories = true,
    categoryFilter,
  } = props;
  const gridMobileClasses = (props.columnsMobile ?? 1) === 2 ? 'grid-cols-2' : 'grid-cols-1';
  const gridDesktopClasses = displayMode === 'grid-3' ? 'lg:grid-cols-3' : '';

  const fallbackArticles: TemplateArticleItem[] = [
    {
      id: 'art_fb_1',
      title: "Titre de l'article",
      slug: 'autonomie-editoriale',
      excerpt: '',
      imageUrl: PLACEHOLDER_COVER_1,
      readingTime: 4,
      publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      category: { name: 'Souveraineté' },
    },
    {
      id: 'art_fb_2',
      title: "Titre de l'article",
      slug: 'renaissance-longs-formats',
      excerpt: '',
      imageUrl: PLACEHOLDER_COVER_2,
      readingTime: 7,
      publishedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      category: { name: 'Médias' },
    },
    {
      id: 'art_fb_3',
      title: "Titre de l'article",
      slug: 'structurer-newsletter-durable',
      excerpt: '',
      imageUrl: PLACEHOLDER_COVER_3,
      readingTime: 5,
      publishedAt: new Date(Date.now() - 86400000 * 9).toISOString(),
      category: { name: 'Pratique' },
    },
  ];

  const sourceArticles = categoryFilter
    ? articles.filter((a) => a.category?.slug === categoryFilter)
    : articles;
  const items = categoryFilter
    ? sourceArticles
    : sourceArticles.length > 0
      ? sourceArticles
      : fallbackArticles;

  const paddingY = density === 'compact' ? 'py-3' : density === 'spacious' ? 'py-7' : 'py-5';

  return (
    <BlockWrapper
      id={id}
      type="article-stream"
      label="Flux de Publications"
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
        {displayMode === 'list' ? (
          /* Mode Liste */
          <div className="max-w-4xl mx-auto divide-y divide-border">
            {items.map((article) => (
              <article key={article.id} className={`${paddingY} group relative`}>
                <div className="flex flex-col sm:flex-row gap-5 items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                      {showCategories &&
                        article.category &&
                        (article.category.slug ? (
                          <Link
                            href={`/categorie/${article.category.slug}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (context.mode === 'editable') e.preventDefault();
                            }}
                            className="relative z-10 font-semibold text-foreground hover:underline"
                          >
                            {article.category.name}
                          </Link>
                        ) : (
                          <span className="font-semibold text-foreground">
                            {article.category.name}
                          </span>
                        ))}
                      {article.publishedAt && (
                        <span>
                          {new Date(article.publishedAt).toLocaleDateString('fr-FR', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                      {showReadingTime && article.readingTime && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 opacity-60" />
                          {article.readingTime} min
                        </span>
                      )}
                      {article.isPremium && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-border bg-background text-muted-foreground">
                          Réservé
                        </span>
                      )}
                    </div>

                    <h3 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                      <Link
                        href={`/article/${article.slug}`}
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="after:absolute after:inset-0"
                      >
                        {article.title}
                      </Link>
                    </h3>

                    {showExcerpts && article.excerpt && (
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2 leading-relaxed max-w-2xl">
                        {article.excerpt}
                      </p>
                    )}
                  </div>

                  {article.imageUrl && (
                    <div
                      className={`relative w-full sm:w-44 h-32 shrink-0 overflow-hidden bg-muted ${cardShape}`}
                    >
                      <SafeImage src={article.imageUrl} alt="" fill className="object-cover" />
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          /* Mode Grille (2 ou 3 colonnes) */
          <div className={`grid ${gridMobileClasses} md:grid-cols-2 ${gridDesktopClasses} gap-6`}>
            {items.map((article) => (
              <article
                key={article.id}
                className={`group relative flex flex-col justify-between overflow-hidden bg-card border border-border transition-colors duration-300 ${cardShape}`}
              >
                <div className="flex flex-col h-full">
                  {article.imageUrl && (
                    <div className="relative w-full h-44 overflow-hidden bg-muted">
                      <SafeImage src={article.imageUrl} alt="" fill className="object-cover" />
                    </div>
                  )}

                  <div className="p-5 flex flex-col justify-between flex-1">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        {showCategories &&
                          article.category &&
                          (article.category.slug ? (
                            <Link
                              href={`/categorie/${article.category.slug}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (context.mode === 'editable') e.preventDefault();
                              }}
                              className="relative z-10 font-semibold text-foreground hover:underline"
                            >
                              {article.category.name}
                            </Link>
                          ) : (
                            <span className="font-semibold text-foreground">
                              {article.category.name}
                            </span>
                          ))}
                        {showReadingTime && article.readingTime && (
                          <span>{article.readingTime} min</span>
                        )}
                      </div>

                      <h3 className="font-bold text-lg text-foreground leading-snug">
                        <Link
                          href={`/article/${article.slug}`}
                          onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                          className="after:absolute after:inset-0"
                        >
                          {article.title}
                        </Link>
                      </h3>

                      {showExcerpts && article.excerpt && (
                        <p className="mt-2 text-xs md:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                          {article.excerpt}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </BlockWrapper>
  );
}
