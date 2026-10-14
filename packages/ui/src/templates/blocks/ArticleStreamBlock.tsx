'use client';

// =====================================================================
// ArticleStreamBlock.tsx — Flux de Publications & Archives (Licorne 2026)
// =====================================================================
// Affiche le catalogue d'articles sous forme de liste ou de grille (2/3 cols).
// Supporte :
// - Densité paramétrable (compact, standard, spacious)
// - Affichage des extraits, temps de lecture, badges de catégorie
// - Format accessible et balisé pour le SEO
// =====================================================================

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { SafeImage } from '../../SafeImage';
import { Clock } from 'lucide-react';
import {
  getCoverPlaceholder,
  PLACEHOLDER_COVER_1,
  PLACEHOLDER_COVER_2,
  PLACEHOLDER_COVER_3,
} from '../placeholders';
import type {
  ArticleStreamBlockProps,
  TemplateArticleItem,
  TemplatePublicationContext,
  TemplateRenderContext,
  CardCornerShape,
} from '../schema';
import { BlockWrapper } from './BlockWrapper';
import { NodeRenderer } from './NodeRenderer';
import { CraftIndicator } from '../../ui/craft-indicator';
import { cn } from '@qoe/utils';

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

  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((a) => {
      if (a.category?.name) cats.add(a.category.name);
    });
    return Array.from(cats);
  }, [items]);

  const isAllSelected = selectedCategory === 'all';
  const filteredItems = isAllSelected
    ? items
    : items.filter((a) => a.category?.name === selectedCategory);

  const featuredArticle = filteredItems[0];
  const remainingArticles = filteredItems.slice(1);

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
        {displayMode === 'craft-notes' ? (
          /* Mode Craft Notes (Option B : Journal Hybride Devouring Details) */
          <div className="max-w-[640px] mx-auto space-y-10 py-4">
            {featuredArticle && (
              <article className="group relative space-y-4 pb-10 border-b border-border/40">
                <div className="flex items-center justify-between text-xs text-muted-foreground/80">
                  <div className="flex items-center gap-2.5">
                    <CraftIndicator type="dot" color="var(--tenant-accent, #F97316)" size={10} />
                    <span className="font-mono text-xs text-foreground/90 tabular-nums">01</span>
                    {showCategories && featuredArticle.category && (
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        · {featuredArticle.category.name}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[11px]">
                    {featuredArticle.publishedAt && (
                      <span>
                        {new Date(featuredArticle.publishedAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    )}
                    {showReadingTime && featuredArticle.readingTime && (
                      <span>· {featuredArticle.readingTime} min read</span>
                    )}
                  </div>
                </div>

                <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground leading-snug group-hover:text-primary transition-colors">
                  <Link
                    href={`/article/${featuredArticle.slug}`}
                    onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                  >
                    {featuredArticle.title}
                  </Link>
                </h2>

                {showExcerpts && featuredArticle.excerpt && (
                  <p className="text-base text-muted-foreground/90 leading-relaxed max-w-xl">
                    {featuredArticle.excerpt}
                  </p>
                )}

                {/* Bleed media : s'étend au-delà de la colonne de 640px sur grands écrans */}
                <div className="w-screen relative left-1/2 right-1/2 -translate-x-1/2 max-w-[960px] px-4 my-6">
                  <Link
                    href={`/article/${featuredArticle.slug}`}
                    onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                    className="block group/cover"
                  >
                    <div className="relative w-full aspect-[16/9] sm:aspect-[2/1] rounded-2xl overflow-hidden border border-border/50 bg-muted shadow-2xs">
                      <SafeImage
                        src={
                          featuredArticle.imageUrl ||
                          getCoverPlaceholder(featuredArticle.slug || featuredArticle.id)
                        }
                        alt={featuredArticle.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover/cover:scale-[1.01]"
                      />
                    </div>
                  </Link>
                </div>

                <div>
                  <Link
                    href={`/article/${featuredArticle.slug}`}
                    onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                    className="inline-flex items-center gap-2 text-xs sm:text-[13px] font-medium text-foreground hover:text-primary transition-colors group/cta"
                  >
                    <span>Lire l’article</span>
                    <span className="transition-transform group-hover/cta:translate-x-1 text-muted-foreground">
                      →
                    </span>
                  </Link>
                </div>
              </article>
            )}

            {/* Barre de filtres par catégories (Pill segmented control minimal) */}
            {availableCategories.length > 0 && (
              <div className="pt-2 pb-2 flex items-center justify-between flex-wrap gap-3">
                <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/60">
                  Sommaire
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={cn(
                      'text-xs px-3 py-1 rounded-full transition-all cursor-pointer font-medium',
                      selectedCategory === 'all'
                        ? 'bg-foreground text-background shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    )}
                  >
                    Tous ({items.length})
                  </button>
                  {availableCategories.map((cat) => {
                    const count = items.filter((a) => a.category?.name === cat).length;
                    const isActive = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          'text-xs px-3 py-1 rounded-full transition-all cursor-pointer font-medium',
                          isActive
                            ? 'bg-foreground text-background shadow-2xs'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        )}
                      >
                        {cat} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Index numéroté sobre des articles suivants */}
            {remainingArticles.length > 0 && (
              <div className="divide-y divide-border/30 pt-1">
                {remainingArticles.map((article, idx) => {
                  const globalIndex = items.findIndex((a) => a.id === article.id);
                  const num = String((globalIndex >= 0 ? globalIndex : idx + 1) + 1).padStart(
                    2,
                    '0'
                  );
                  return (
                    <article
                      key={article.id}
                      className="group flex items-center justify-between py-4 sm:py-4.5 gap-4 transition-colors hover:bg-muted/20 px-3 -mx-3 rounded-lg"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span className="font-mono text-xs tabular-nums text-muted-foreground/50 w-5 shrink-0">
                          {num}
                        </span>
                        <Link
                          href={`/article/${article.slug}`}
                          onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                          className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-md overflow-hidden bg-muted/30 border border-border/40"
                        >
                          <img
                            src={
                              article.imageUrl || getCoverPlaceholder(article.slug || article.id)
                            }
                            alt={article.title}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                        </Link>
                        <div className="min-w-0">
                          <h3 className="text-base sm:text-[17px] font-medium tracking-tight text-foreground group-hover:text-primary transition-colors truncate">
                            <Link
                              href={`/article/${article.slug}`}
                              onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                            >
                              {article.title}
                            </Link>
                          </h3>
                          {article.category && (
                            <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70 sm:hidden block mt-0.5">
                              {article.category.name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground/80">
                        {showCategories && article.category && (
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60 hidden sm:inline">
                            {article.category.name}
                          </span>
                        )}
                        {showReadingTime && article.readingTime && (
                          <span className="text-xs text-muted-foreground/60 font-mono">
                            {article.readingTime} min
                          </span>
                        )}
                        <span className="text-muted-foreground/30 group-hover:text-foreground group-hover:translate-x-1 transition-all">
                          →
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : displayMode === 'list' ? (
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
