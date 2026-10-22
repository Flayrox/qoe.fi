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
import { PublicationSidebar } from './PublicationSidebar';
import { ArticleEngagementBar } from './ArticleEngagementBar';
import { findCategoryBySlug, filterArticlesByCategory } from '../navigation';

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
  publication,
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
    featuredLayout,
    density = 'standard',
    showReadingTime = true,
    showExcerpts = true,
    showCategories = true,
    categoryFilter,
    groupByCategory = false,
  } = props;
  const gridMobileClasses = (props.columnsMobile ?? 1) === 2 ? 'grid-cols-2' : 'grid-cols-1';
  const gridDesktopClasses = displayMode === 'grid-3' ? 'lg:grid-cols-3' : '';

  const fallbackArticles: TemplateArticleItem[] = [
    {
      id: 'art_fb_1',
      title: "L'art de la souveraineté éditoriale et la renaissance des longs formats",
      slug: 'autonomie-editoriale',
      excerpt:
        'Reprendre le contrôle de son audience, de ses écrits et de sa monétisation sans intermédiaire.',
      imageUrl: PLACEHOLDER_COVER_1,
      readingTime: 4,
      publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      category: { name: 'Souveraineté' },
    },
    {
      id: 'art_fb_2',
      title: 'Le retour des carnets indépendants et des tribunes libres',
      slug: 'renaissance-longs-formats',
      excerpt:
        'Pourquoi la lecture lente et les formats approfondis reconquièrent les esprits attentifs.',
      imageUrl: PLACEHOLDER_COVER_2,
      readingTime: 7,
      publishedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      category: { name: 'Médias' },
    },
    {
      id: 'art_fb_3',
      title: 'Bâtir un écosystème de publication autonome et durable',
      slug: 'structurer-newsletter-durable',
      excerpt:
        'Méthodes concrètes pour créer un modèle d’abonnement fidèle sans algorithmes intrusifs.',
      imageUrl: PLACEHOLDER_COVER_3,
      readingTime: 5,
      publishedAt: new Date(Date.now() - 86400000 * 9).toISOString(),
      category: { name: 'Pratique' },
    },
  ];

  const targetCategory = useMemo(() => {
    if (!categoryFilter) return undefined;
    return findCategoryBySlug(publication?.categories || [], categoryFilter);
  }, [categoryFilter, publication?.categories]);

  const sourceArticles = useMemo(() => {
    if (!categoryFilter) return articles;
    if (targetCategory) {
      return filterArticlesByCategory(articles, targetCategory, publication?.categories || []);
    }
    return articles.filter((a) => a.category?.slug === categoryFilter);
  }, [categoryFilter, targetCategory, articles, publication?.categories]);
  const items = categoryFilter
    ? sourceArticles
    : context.mode === 'live' || Boolean(publication?.id)
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

  const siteOpts = (publication?.siteOptions ?? {}) as Record<string, unknown>;
  const pinnedArticleId = siteOpts?.pinnedArticleId as string | undefined;

  const isArticlePinned = (art?: TemplateArticleItem | null) => {
    if (!art) return false;
    return Boolean(
      art.isPinned || art.isEditorPick || (pinnedArticleId && art.id === pinnedArticleId)
    );
  };

  const isAllSelected = selectedCategory === 'all';
  const filteredItems = isAllSelected
    ? items
    : items.filter((a) => a.category?.name === selectedCategory);

  const sortedItems = useMemo(() => {
    const list = [...filteredItems];
    const pinnedIdx = list.findIndex(isArticlePinned);
    if (pinnedIdx > 0) {
      const [pinned] = list.splice(pinnedIdx, 1);
      return [pinned, ...list];
    }
    return list;
  }, [filteredItems, pinnedArticleId]);

  const isEditorialMode = displayMode === 'craft-notes' || displayMode === 'featured-trio';
  const isTrioMode =
    isEditorialMode &&
    (featuredLayout === 'trio' ||
      displayMode === 'featured-trio' ||
      siteOpts.featuredTrio !== false ||
      sortedItems.length >= 2);

  const centerHeroArticle = sortedItems[0] || null;
  const leftSecondaryArticle = sortedItems.length >= 3 ? sortedItems[1] : null;
  const rightSecondaryArticle =
    sortedItems.length >= 3 ? sortedItems[2] : sortedItems.length === 2 ? sortedItems[1] : null;

  const trioUsedCount =
    sortedItems.length >= 3 ? 3 : sortedItems.length === 2 ? 2 : sortedItems.length === 1 ? 1 : 0;
  const streamArticles = isTrioMode ? sortedItems.slice(trioUsedCount) : sortedItems.slice(1);

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
      <section
        className={cn(
          'container mx-auto px-4 lg:px-8',
          displayMode === 'craft-notes' ? 'pt-2 sm:pt-3 pb-12' : 'py-8 md:py-14'
        )}
      >
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
        {isEditorialMode ? (
          /* Mode Journal Éditorial & Grille à la Une 3 Colonnes */
          <div className="max-w-6xl xl:max-w-7xl mx-auto py-1 space-y-10">
            {/* =====================================================================
                GRILLE À LA UNE EN 3 COLONNES (Grand article au centre, secondaires sur les côtés)
                ===================================================================== */}
            {centerHeroArticle && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12 items-start pb-10 border-b border-border/40">
                {/* Colonne Gauche (~25%, 3 colonnes) : Article secondaire gauche */}
                {leftSecondaryArticle && (
                  <div className="lg:col-span-3 order-2 lg:order-1 space-y-6">
                    <article className="group relative space-y-3">
                      <Link
                        href={`/article/${leftSecondaryArticle.slug}`}
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="block group/cover"
                      >
                        <div className="relative w-full aspect-[16/10] rounded-xl overflow-hidden border border-border/50 bg-muted shadow-2xs">
                          <SafeImage
                            src={
                              leftSecondaryArticle.imageUrl ||
                              getCoverPlaceholder(
                                leftSecondaryArticle.slug || leftSecondaryArticle.id
                              )
                            }
                            alt={leftSecondaryArticle.title}
                            fill
                            className="object-cover transition-transform duration-500 group-hover/cover:scale-[1.03]"
                          />
                        </div>
                      </Link>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          {showCategories && leftSecondaryArticle.category && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted/80 border border-border/40 text-foreground uppercase tracking-wider">
                              {leftSecondaryArticle.category.name}
                            </span>
                          )}
                          {leftSecondaryArticle.publishedAt && (
                            <span>
                              {new Date(leftSecondaryArticle.publishedAt).toLocaleDateString(
                                'fr-FR',
                                {
                                  day: 'numeric',
                                  month: 'short',
                                }
                              )}
                            </span>
                          )}
                          {showReadingTime && leftSecondaryArticle.readingTime && (
                            <span className="inline-flex items-center gap-1 opacity-70">
                              · {leftSecondaryArticle.readingTime} min
                            </span>
                          )}
                          {leftSecondaryArticle.isPremium !== undefined && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted border border-border/40 text-foreground">
                              {leftSecondaryArticle.isPremium ? 'Payant' : 'Gratuit'}
                            </span>
                          )}
                        </div>

                        <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
                          <Link
                            href={`/article/${leftSecondaryArticle.slug}`}
                            onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                          >
                            {leftSecondaryArticle.title}
                          </Link>
                        </h3>

                        {showExcerpts && leftSecondaryArticle.excerpt && (
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                            {leftSecondaryArticle.excerpt}
                          </p>
                        )}

                        <div className="pt-2">
                          <ArticleEngagementBar
                            articleId={leftSecondaryArticle.id}
                            articleSlug={leftSecondaryArticle.slug}
                            initialLikes={leftSecondaryArticle.likesCount ?? 0}
                            initialComments={leftSecondaryArticle.commentsCount ?? 0}
                            initialReposts={leftSecondaryArticle.repostsCount ?? 0}
                            initialIsLiked={leftSecondaryArticle.isLiked}
                            initialIsReposted={leftSecondaryArticle.isReposted}
                            size="sm"
                            showShareText={false}
                            className="border-0 py-0"
                          />
                        </div>
                      </div>
                    </article>
                  </div>
                )}

                {/* Colonne Centre (~50%, 6 colonnes) : GRAND ARTICLE VEDETTE OU ÉPINGLÉ */}
                <div
                  className={cn(
                    leftSecondaryArticle && rightSecondaryArticle
                      ? 'lg:col-span-6'
                      : leftSecondaryArticle || rightSecondaryArticle
                        ? 'lg:col-span-8'
                        : 'lg:col-span-12',
                    'order-1 lg:order-2 space-y-4'
                  )}
                >
                  <article className="group relative space-y-3.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <CraftIndicator
                          type="dot"
                          color="var(--tenant-accent, #F97316)"
                          size={10}
                        />
                        {isArticlePinned(centerHeroArticle) && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/25">
                            📌 Épinglé
                          </span>
                        )}
                        {showCategories && centerHeroArticle.category && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted/80 border border-border/40 text-foreground uppercase tracking-wider">
                            {centerHeroArticle.category.name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        {centerHeroArticle.publishedAt && (
                          <span>
                            {new Date(centerHeroArticle.publishedAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        )}
                        {showReadingTime && centerHeroArticle.readingTime && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 opacity-60" />
                            {centerHeroArticle.readingTime} min
                          </span>
                        )}
                        {centerHeroArticle.isPremium !== undefined && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-muted border border-border/40 text-foreground">
                            {centerHeroArticle.isPremium ? 'Payant' : 'Gratuit'}
                          </span>
                        )}
                      </div>
                    </div>

                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground leading-[1.15] group-hover:text-primary transition-colors">
                      <Link
                        href={`/article/${centerHeroArticle.slug}`}
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                      >
                        {centerHeroArticle.title}
                      </Link>
                    </h2>

                    {showExcerpts && centerHeroArticle.excerpt && (
                      <p className="text-sm sm:text-base text-muted-foreground leading-relaxed line-clamp-3">
                        {centerHeroArticle.excerpt}
                      </p>
                    )}

                    {/* Ligne Auteur(s) */}
                    <div className="flex items-center gap-2 pt-0.5 text-xs text-muted-foreground">
                      {centerHeroArticle.author?.logoUrl ||
                      (centerHeroArticle.authors && centerHeroArticle.authors[0]?.logoUrl) ? (
                        <div className="flex -space-x-1.5 overflow-hidden items-center">
                          {(centerHeroArticle.authors || [centerHeroArticle.author])
                            .filter(Boolean)
                            .map((a, i) => (
                              <img
                                key={a?.id || i}
                                src={a?.logoUrl || ''}
                                alt={a?.name || ''}
                                className="inline-block h-5 w-5 rounded-full ring-2 ring-background object-cover"
                              />
                            ))}
                        </div>
                      ) : null}
                      <span className="font-medium text-foreground">
                        {centerHeroArticle.author?.name || publication?.name || 'Rédaction'}
                      </span>
                    </div>

                    {/* Grande Image Vedette */}
                    <div className="w-full my-3">
                      <Link
                        href={`/article/${centerHeroArticle.slug}`}
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="block group/cover"
                      >
                        <div className="relative w-full aspect-[16/10] sm:aspect-[2.1/1] max-h-72 sm:max-h-80 md:max-h-96 rounded-2xl overflow-hidden border border-border/50 bg-muted shadow-2xs">
                          <SafeImage
                            src={
                              centerHeroArticle.imageUrl ||
                              getCoverPlaceholder(centerHeroArticle.slug || centerHeroArticle.id)
                            }
                            alt={centerHeroArticle.title}
                            fill
                            className="object-cover transition-transform duration-500 group-hover/cover:scale-[1.01]"
                          />
                        </div>
                      </Link>
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-1 flex-wrap">
                      <Link
                        href={`/article/${centerHeroArticle.slug}`}
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="inline-flex items-center gap-2 text-xs sm:text-[13px] font-medium text-foreground hover:text-primary transition-colors group/cta"
                      >
                        <span>Lire l’article</span>
                        <span className="transition-transform group-hover/cta:translate-x-1 text-muted-foreground">
                          →
                        </span>
                      </Link>

                      <ArticleEngagementBar
                        articleId={centerHeroArticle.id}
                        articleSlug={centerHeroArticle.slug}
                        initialLikes={centerHeroArticle.likesCount ?? 0}
                        initialComments={centerHeroArticle.commentsCount ?? 0}
                        initialReposts={centerHeroArticle.repostsCount ?? 0}
                        initialIsLiked={centerHeroArticle.isLiked}
                        initialIsReposted={centerHeroArticle.isReposted}
                        size="sm"
                        showShareText={false}
                        className="border-0 py-0"
                      />
                    </div>
                  </article>
                </div>

                {/* Colonne Droite : Article secondaire droit */}
                {rightSecondaryArticle && (
                  <div
                    className={cn(
                      leftSecondaryArticle ? 'lg:col-span-3' : 'lg:col-span-4',
                      'order-3 lg:order-3 space-y-6'
                    )}
                  >
                    <article className="group relative space-y-3">
                      <Link
                        href={`/article/${rightSecondaryArticle.slug}`}
                        onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                        className="block group/cover"
                      >
                        <div className="relative w-full aspect-[16/10] rounded-xl overflow-hidden border border-border/50 bg-muted shadow-2xs">
                          <SafeImage
                            src={
                              rightSecondaryArticle.imageUrl ||
                              getCoverPlaceholder(
                                rightSecondaryArticle.slug || rightSecondaryArticle.id
                              )
                            }
                            alt={rightSecondaryArticle.title}
                            fill
                            className="object-cover transition-transform duration-500 group-hover/cover:scale-[1.03]"
                          />
                        </div>
                      </Link>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          {showCategories && rightSecondaryArticle.category && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted/80 border border-border/40 text-foreground uppercase tracking-wider">
                              {rightSecondaryArticle.category.name}
                            </span>
                          )}
                          {rightSecondaryArticle.publishedAt && (
                            <span>
                              {new Date(rightSecondaryArticle.publishedAt).toLocaleDateString(
                                'fr-FR',
                                {
                                  day: 'numeric',
                                  month: 'short',
                                }
                              )}
                            </span>
                          )}
                          {showReadingTime && rightSecondaryArticle.readingTime && (
                            <span className="inline-flex items-center gap-1 opacity-70">
                              · {rightSecondaryArticle.readingTime} min
                            </span>
                          )}
                          {rightSecondaryArticle.isPremium !== undefined && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted border border-border/40 text-foreground">
                              {rightSecondaryArticle.isPremium ? 'Payant' : 'Gratuit'}
                            </span>
                          )}
                        </div>

                        <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
                          <Link
                            href={`/article/${rightSecondaryArticle.slug}`}
                            onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                          >
                            {rightSecondaryArticle.title}
                          </Link>
                        </h3>

                        {showExcerpts && rightSecondaryArticle.excerpt && (
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                            {rightSecondaryArticle.excerpt}
                          </p>
                        )}

                        <div className="pt-2">
                          <ArticleEngagementBar
                            articleId={rightSecondaryArticle.id}
                            articleSlug={rightSecondaryArticle.slug}
                            initialLikes={rightSecondaryArticle.likesCount ?? 0}
                            initialComments={rightSecondaryArticle.commentsCount ?? 0}
                            initialReposts={rightSecondaryArticle.repostsCount ?? 0}
                            initialIsLiked={rightSecondaryArticle.isLiked}
                            initialIsReposted={rightSecondaryArticle.isReposted}
                            size="sm"
                            showShareText={false}
                            className="border-0 py-0"
                          />
                        </div>
                      </div>
                    </article>
                  </div>
                )}
              </div>
            )}

            {/* Agencement Éditorial Inférieur (Flux d'articles + Sidebar Sticky) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 xl:gap-14 items-start pt-4">
              {/* Colonne Principale (~65%) : Filtres et Flux d'articles */}
              <div className="lg:col-span-8 space-y-6 sm:space-y-8">
                {/* Barre de filtres par catégories */}
                {availableCategories.length > 0 && (
                  <div className="pt-1 pb-2 flex items-center justify-between flex-wrap gap-3 border-b border-border/30 pb-3">
                    <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
                      Rubriques
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

                {/* Articles secondaires : Grille dense ou regroupement par catégorie */}
                {groupByCategory && isAllSelected && availableCategories.length > 0 ? (
                  <div className="space-y-12 pt-1">
                    {availableCategories.map((catName) => {
                      const catArticles = items.filter((a) => a.category?.name === catName);
                      if (catArticles.length === 0) return null;

                      return (
                        <section key={catName} className="space-y-6">
                          <div className="flex items-center justify-between border-b border-border/40 pb-3">
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                              {catName}
                            </h3>
                            <span className="text-xs text-muted-foreground font-medium">
                              {catArticles.length} article{catArticles.length > 1 ? 's' : ''}
                            </span>
                          </div>

                          <div className="divide-y divide-border/30">
                            {catArticles.map((article) => (
                              <article
                                key={article.id}
                                className="group relative flex flex-col sm:flex-row items-start justify-between gap-6 py-6 first:pt-2 last:pb-2 transition-colors"
                              >
                                <div className="flex-1 space-y-2.5 min-w-0">
                                  <div className="flex items-center gap-2.5 text-xs text-muted-foreground flex-wrap">
                                    {showCategories && article.category && (
                                      <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
                                        {article.category.name}
                                      </span>
                                    )}
                                    {article.publishedAt && (
                                      <span>
                                        {new Date(article.publishedAt).toLocaleDateString('fr-FR', {
                                          day: 'numeric',
                                          month: 'short',
                                        })}
                                      </span>
                                    )}
                                    {showReadingTime && article.readingTime && (
                                      <span className="inline-flex items-center gap-1 opacity-80">
                                        · {article.readingTime} min
                                      </span>
                                    )}
                                    {article.isPremium !== undefined && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-background border border-border text-muted-foreground">
                                        {article.isPremium ? 'Payant' : 'Gratuit'}
                                      </span>
                                    )}
                                  </div>

                                  <h4 className="text-lg sm:text-xl font-bold tracking-tight text-foreground leading-snug group-hover:text-primary transition-colors">
                                    <Link
                                      href={`/article/${article.slug}`}
                                      onClick={(e) =>
                                        context.mode === 'editable' && e.preventDefault()
                                      }
                                    >
                                      {article.title}
                                    </Link>
                                  </h4>

                                  {showExcerpts && article.excerpt && (
                                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                                      {article.excerpt}
                                    </p>
                                  )}

                                  <div className="pt-2 flex items-center justify-between gap-3 text-xs flex-wrap">
                                    <Link
                                      href={`/article/${article.slug}`}
                                      onClick={(e) =>
                                        context.mode === 'editable' && e.preventDefault()
                                      }
                                      className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors group/cta"
                                    >
                                      <span>Lire</span>
                                      <span className="transition-transform group-hover/cta:translate-x-1 text-muted-foreground">
                                        →
                                      </span>
                                    </Link>
                                    <ArticleEngagementBar
                                      articleId={article.id}
                                      articleSlug={article.slug}
                                      initialLikes={article.likesCount ?? 0}
                                      initialComments={article.commentsCount ?? 0}
                                      initialReposts={article.repostsCount ?? 0}
                                      initialIsLiked={article.isLiked}
                                      initialIsReposted={article.isReposted}
                                      size="sm"
                                      showShareText={false}
                                      className="border-0 py-0"
                                    />
                                  </div>
                                </div>

                                <Link
                                  href={`/article/${article.slug}`}
                                  onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                                  className="relative w-full sm:w-44 md:w-48 aspect-[16/10] sm:h-32 shrink-0 rounded-xl overflow-hidden bg-muted border border-border/40 group/thumb block"
                                >
                                  <img
                                    src={
                                      article.imageUrl ||
                                      getCoverPlaceholder(article.slug || article.id)
                                    }
                                    alt={article.title}
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-[1.03]"
                                    loading="lazy"
                                  />
                                </Link>
                              </article>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : streamArticles.length > 0 ? (
                  <div className="space-y-6 pt-1">
                    <div className="flex items-center justify-between border-b border-border/40 pb-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        {selectedCategory === 'all' ? 'Dernières parutions' : selectedCategory}
                      </h3>
                      <span className="text-xs text-muted-foreground font-medium">
                        {streamArticles.length} article{streamArticles.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="divide-y divide-border/30">
                      {streamArticles.map((article) => (
                        <article
                          key={article.id}
                          className="group relative flex flex-col sm:flex-row items-start justify-between gap-6 py-6 first:pt-2 last:pb-2 transition-colors"
                        >
                          <div className="flex-1 space-y-2.5 min-w-0">
                            <div className="flex items-center gap-2.5 text-xs text-muted-foreground flex-wrap">
                              {showCategories && article.category && (
                                <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
                                  {article.category.name}
                                </span>
                              )}
                              {article.publishedAt && (
                                <span>
                                  {new Date(article.publishedAt).toLocaleDateString('fr-FR', {
                                    day: 'numeric',
                                    month: 'short',
                                  })}
                                </span>
                              )}
                              {showReadingTime && article.readingTime && (
                                <span className="inline-flex items-center gap-1 opacity-80">
                                  · {article.readingTime} min
                                </span>
                              )}
                              {article.isPremium !== undefined && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-background border border-border text-muted-foreground">
                                  {article.isPremium ? 'Payant' : 'Gratuit'}
                                </span>
                              )}
                            </div>

                            <h4 className="text-lg sm:text-xl font-bold tracking-tight text-foreground leading-snug group-hover:text-primary transition-colors">
                              <Link
                                href={`/article/${article.slug}`}
                                onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                              >
                                {article.title}
                              </Link>
                            </h4>

                            {showExcerpts && article.excerpt && (
                              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                                {article.excerpt}
                              </p>
                            )}

                            <div className="pt-2 flex items-center justify-between gap-3 text-xs flex-wrap">
                              <Link
                                href={`/article/${article.slug}`}
                                onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                                className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors group/cta"
                              >
                                <span>Lire</span>
                                <span className="transition-transform group-hover/cta:translate-x-1 text-muted-foreground">
                                  →
                                </span>
                              </Link>
                              <ArticleEngagementBar
                                articleId={article.id}
                                articleSlug={article.slug}
                                initialLikes={article.likesCount ?? 0}
                                initialComments={article.commentsCount ?? 0}
                                initialReposts={article.repostsCount ?? 0}
                                initialIsLiked={article.isLiked}
                                initialIsReposted={article.isReposted}
                                size="sm"
                                showShareText={false}
                                className="border-0 py-0"
                              />
                            </div>
                          </div>

                          <Link
                            href={`/article/${article.slug}`}
                            onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                            className="relative w-full sm:w-44 md:w-48 aspect-[16/10] sm:h-32 shrink-0 rounded-xl overflow-hidden bg-muted border border-border/40 group/thumb block"
                          >
                            <img
                              src={
                                article.imageUrl || getCoverPlaceholder(article.slug || article.id)
                              }
                              alt={article.title}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-[1.03]"
                              loading="lazy"
                            />
                          </Link>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : items.length === 0 ? (
                  <div className="py-16 text-center border border-dashed border-border/40 rounded-2xl p-8 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Aucun article dans cette rubrique pour le moment.
                    </p>
                    <a
                      href="/"
                      className="inline-block text-xs font-semibold text-[var(--tenant-accent)] hover:underline"
                    >
                      ← Voir tous les articles
                    </a>
                  </div>
                ) : null}
              </div>

              {/* Colonne Latérale (~35%) Sticky : Auteur + Recommandations Réseau + Newsletter + Top Lectures */}
              <div className="lg:col-span-4 lg:sticky lg:top-24">
                <PublicationSidebar publication={publication} articles={items} context={context} />
              </div>
            </div>
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
                            href={`/${article.category.slug}`}
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
                      {article.isPremium !== undefined && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-border bg-background text-muted-foreground">
                          {article.isPremium ? 'Payant' : 'Gratuit'}
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
                              href={`/${article.category.slug}`}
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
