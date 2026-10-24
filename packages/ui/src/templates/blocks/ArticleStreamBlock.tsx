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
  PLACEHOLDER_COVER_1,
  PLACEHOLDER_COVER_2,
  PLACEHOLDER_COVER_3,
  getCoverPlaceholder,
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
import { buildArticlePath, buildCategoryPath, cn } from '@qoe/utils';
import { PublicationSidebar } from './PublicationSidebar';
import { ArticleCard } from './ArticleCard';
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
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'discussed'>('recent');

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

    if (sortBy === 'popular') {
      return list.sort(
        (a, b) =>
          (b.likesCount ?? 0) +
          (b.commentsCount ?? 0) * 2 +
          (b.repostsCount ?? 0) * 2 -
          ((a.likesCount ?? 0) + (a.commentsCount ?? 0) * 2 + (a.repostsCount ?? 0) * 2)
      );
    }

    if (sortBy === 'discussed') {
      return list.sort(
        (a, b) =>
          (b.commentsCount ?? 0) - (a.commentsCount ?? 0) ||
          (b.likesCount ?? 0) - (a.likesCount ?? 0)
      );
    }

    // Tri par défaut : ordre de publication fourni par l'API, l'épinglé en tête.
    const pinnedIdx = list.findIndex(isArticlePinned);
    if (pinnedIdx > 0) {
      const [pinned] = list.splice(pinnedIdx, 1);
      return [pinned, ...list];
    }
    return list;
  }, [filteredItems, pinnedArticleId, sortBy]);

  const isEditorialMode = displayMode === 'craft-notes' || displayMode === 'featured-trio';
  const isTrioMode =
    isEditorialMode &&
    (featuredLayout === 'trio' ||
      displayMode === 'featured-trio' ||
      siteOpts.featuredTrio !== false);

  // ── Grille à la une ───────────────────────────────────────────────────
  // Centre : l'article épinglé, sinon le plus récent. Si l'épinglé n'est pas
  // le plus récent, ce dernier ne disparaît pas : il passe en tête de la
  // colonne de gauche (les plus récents). À droite : les plus lus.
  const popularityScore = (art: TemplateArticleItem) =>
    (art.likesCount ?? 0) + (art.commentsCount ?? 0) * 2 + (art.repostsCount ?? 0) * 2;

  const publishedTimestamp = (art: TemplateArticleItem) => {
    const ts = art.publishedAt ? new Date(art.publishedAt).getTime() : 0;
    return Number.isNaN(ts) ? 0 : ts;
  };

  const byRecency = [...filteredItems].sort(
    (a, b) => publishedTimestamp(b) - publishedTimestamp(a)
  );
  const pinnedHeroArticle = filteredItems.find(isArticlePinned) ?? null;
  const centerHeroArticle = pinnedHeroArticle ?? byRecency[0] ?? null;

  const sidePool = byRecency.filter((art) => art.id !== centerHeroArticle?.id);
  const leftTarget = Math.min(3, Math.ceil(sidePool.length / 2));
  const recentColumnArticles = sidePool.slice(0, leftTarget);
  const recentColumnIds = new Set(recentColumnArticles.map((art) => art.id));

  const popularColumnArticles = [...sidePool]
    .filter((art) => !recentColumnIds.has(art.id))
    .sort(
      (a, b) =>
        popularityScore(b) - popularityScore(a) || publishedTimestamp(b) - publishedTimestamp(a)
    )
    .slice(0, 3);
  const hasPopularitySignal = popularColumnArticles.some((art) => popularityScore(art) > 0);

  const trioIds = new Set(
    [centerHeroArticle, ...recentColumnArticles, ...popularColumnArticles]
      .filter((art): art is TemplateArticleItem => Boolean(art))
      .map((art) => art.id)
  );

  const streamArticles = isTrioMode
    ? sortedItems.filter((art) => !trioIds.has(art.id))
    : sortedItems.slice(1);

  const formatShortDate = (iso?: string | Date | null) =>
    iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null;

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
                {/* Colonne Gauche (~25%) : les plus récents, en liste compacte */}
                {recentColumnArticles.length > 0 && (
                  <div
                    className="lg:col-span-3 lg:col-start-1 order-2 lg:order-1"
                    data-testid="trio-recent-column"
                  >
                    <div className="flex items-baseline justify-between border-b border-border/50 pb-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Les plus récents
                      </h3>
                      <span className="text-[11px] tabular-nums text-muted-foreground/50">
                        {String(recentColumnArticles.length).padStart(2, '0')}
                      </span>
                    </div>

                    <ol className="divide-y divide-border/40">
                      {recentColumnArticles.map((art) => (
                        <li key={art.id} className="py-4 first:pt-3" data-testid="trio-recent-item">
                          <div className="flex gap-3">
                            <Link
                              href={buildArticlePath(art)}
                              onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                              className="relative w-16 h-12 shrink-0 overflow-hidden rounded-[4px] border border-border/40 bg-muted"
                            >
                              <SafeImage
                                src={art.imageUrl || getCoverPlaceholder(art.slug || art.id)}
                                alt=""
                                fill
                                className="object-cover"
                              />
                            </Link>
                            <div className="min-w-0">
                              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                                {formatShortDate(art.publishedAt) ?? art.category?.name}
                              </p>
                              <h4 className="mt-1 text-[13px] font-semibold leading-snug text-foreground line-clamp-2">
                                <Link
                                  href={buildArticlePath(art)}
                                  onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                                  className="hover:underline underline-offset-2"
                                >
                                  {art.title}
                                </Link>
                              </h4>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Colonne Centre (~50%) : l'épinglé, sinon le plus récent */}
                <div className="lg:col-span-6 lg:col-start-4 order-1 lg:order-2 space-y-4">
                  <ArticleCard
                    article={centerHeroArticle}
                    variant="hero-center"
                    publicationName={publication?.name}
                    showExcerpts={showExcerpts}
                    showReadingTime={showReadingTime}
                    showCategories={showCategories}
                    isPinned={isArticlePinned(centerHeroArticle)}
                    editableMode={context.mode === 'editable'}
                    testId="center-hero-article"
                  />
                </div>

                {/* Colonne Droite (~25%) : les plus lus, classés par engagement réel */}
                {popularColumnArticles.length > 0 && (
                  <div
                    className="lg:col-span-3 lg:col-start-10 order-3"
                    data-testid="trio-popular-column"
                  >
                    <div className="flex items-baseline justify-between border-b border-border/50 pb-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {hasPopularitySignal ? 'Les plus lus' : 'À lire aussi'}
                      </h3>
                      <span className="text-[11px] tabular-nums text-muted-foreground/50">
                        {String(popularColumnArticles.length).padStart(2, '0')}
                      </span>
                    </div>

                    <ol className="divide-y divide-border/40">
                      {popularColumnArticles.map((art, index) => {
                        const comments = art.commentsCount ?? 0;
                        return (
                          <li
                            key={art.id}
                            className="flex gap-3 py-4 first:pt-3"
                            data-testid="trio-popular-item"
                          >
                            <span className="w-4 shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground/50">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <div className="min-w-0">
                              <h4 className="text-[13px] font-semibold leading-snug text-foreground line-clamp-2">
                                <Link
                                  href={buildArticlePath(art)}
                                  onClick={(e) => context.mode === 'editable' && e.preventDefault()}
                                  className="hover:underline underline-offset-2"
                                >
                                  {art.title}
                                </Link>
                              </h4>
                              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                                {art.readingTime ? `${art.readingTime} min` : null}
                                {comments > 0
                                  ? ` · ${comments} commentaire${comments > 1 ? 's' : ''}`
                                  : null}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* Agencement Éditorial Inférieur (Flux d'articles + Sidebar Sticky) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 xl:gap-14 items-start pt-4">
              {/* Colonne Principale (~65%) : Filtres et Flux d'articles */}
              <div className="lg:col-span-8 space-y-6 sm:space-y-8">
                {/* Barre de filtres par catégories */}
                {items.length > 1 && (
                  <div className="pt-1 pb-2 flex items-center justify-between flex-wrap gap-3 border-b border-border/30 pb-3">
                    {availableCategories.length > 0 && (
                      <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
                        Rubriques
                      </span>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {availableCategories.length > 0 && (
                        <>
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
                        </>
                      )}
                      {/* Le tri n'agit que sur le flux d'archives : inutile quand
                          tous les articles tiennent déjà dans la une. */}
                      {(!isTrioMode || streamArticles.length > 0) && (
                        <div className="flex items-center gap-1.5 pl-2 ml-1 border-l border-border/50">
                          <label
                            htmlFor={`stream-sort-${id}`}
                            className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60"
                          >
                            Tri
                          </label>
                          <select
                            id={`stream-sort-${id}`}
                            value={sortBy}
                            onChange={(e) =>
                              setSortBy(e.target.value as 'recent' | 'popular' | 'discussed')
                            }
                            className="bg-transparent text-xs font-medium text-foreground cursor-pointer focus:outline-none"
                          >
                            <option value="recent">Récents</option>
                            <option value="popular">Populaires</option>
                            <option value="discussed">Commentés</option>
                          </select>
                        </div>
                      )}
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
                              <ArticleCard
                                key={article.id}
                                article={article}
                                variant="row"
                                publicationName={publication?.name}
                                showExcerpts={showExcerpts}
                                showReadingTime={showReadingTime}
                                showCategories={showCategories}
                                editableMode={context.mode === 'editable'}
                              />
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
                        {selectedCategory !== 'all'
                          ? selectedCategory
                          : sortBy === 'popular'
                            ? 'Les plus lus'
                            : sortBy === 'discussed'
                              ? 'Les plus commentés'
                              : 'Dernières parutions'}
                      </h3>
                      <span className="text-xs text-muted-foreground font-medium">
                        {streamArticles.length} article{streamArticles.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="divide-y divide-border/30">
                      {streamArticles.map((article) => (
                        <ArticleCard
                          key={article.id}
                          article={article}
                          variant="row"
                          publicationName={publication?.name}
                          showExcerpts={showExcerpts}
                          showReadingTime={showReadingTime}
                          showCategories={showCategories}
                          editableMode={context.mode === 'editable'}
                        />
                      ))}
                    </div>
                  </div>
                ) : items.length === 0 ? (
                  <div className="py-16 text-center border border-dashed border-border/60 bg-card/50 rounded-2xl p-8 space-y-3 backdrop-blur-xs">
                    <p className="text-sm font-medium text-muted-foreground">
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
                <div className="rounded-2xl border border-border/50 bg-card/60 p-6 backdrop-blur-xs shadow-2xs">
                  <PublicationSidebar
                    publication={publication}
                    articles={items}
                    context={context}
                    showTopArticles={!isTrioMode}
                  />
                </div>
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
                            href={buildCategoryPath(article.category)}
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
                        href={buildArticlePath(article)}
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
                              href={buildCategoryPath(article.category)}
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
                          href={buildArticlePath(article)}
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
