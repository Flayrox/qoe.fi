'use client';

import React from 'react';
import {
  Users,
  Bookmark,
  Highlighter,
  MessageSquare,
  Trophy,
  Repeat,
  BookOpen,
  Tag,
  Heart,
  BarChart3,
  ChevronRight,
} from 'lucide-react';
import { ProductMetrics } from '../actions';

interface ProductMetricsBlockProps {
  metrics: ProductMetrics;
  onSelectArticle?: (urlPath: string) => void;
}

export function ProductMetricsBlock({ metrics, onSelectArticle }: ProductMetricsBlockProps) {
  const {
    subscriberCount,
    subscriberDelta7d,
    totalArticles,
    totalLikes,
    totalBookmarks,
    totalHighlights,
    totalHighlightsPublic,
    totalHighlightsPrivate,
    totalComments,
    totalAnnotations,
    totalReposts,
    totalInteractions,
    avgLikesPerArticle,
    avgBookmarksPerArticle,
    avgCommentsPerArticle,
    avgInteractionsPerArticle,
    avgCompletionRate,
    topCategories,
    topArticles,
    readingQuality,
  } = metrics;

  const hasArticles = topArticles.length > 0;

  return (
    <div className="space-y-6">
      {/* ─── 1. KPIs d'engagement global ───────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 : Interactions globales */}
        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none transition-all hover:bg-muted/10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Interactions globales
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <BarChart3 className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {totalInteractions.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground font-medium">
              ~{avgInteractionsPerArticle} / écrit
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Cumul des réactions, sauvegardes, notes et partages
          </p>
        </div>

        {/* KPI 2 : Appréciations & Partages */}
        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none transition-all hover:bg-muted/10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Appréciations & Partages
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Heart className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="flex items-baseline gap-1.5" title="Mentions j'aime">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {totalLikes.toLocaleString()}
              </span>
              <Heart className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
            </div>
            <div className="flex items-baseline gap-1.5" title="Republications et citations">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {totalReposts.toLocaleString()}
              </span>
              <Repeat className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            ~{avgLikesPerArticle} j'aime / article · {totalReposts} reposts
          </p>
        </div>

        {/* KPI 3 : Sauvegardes & Surlignages */}
        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none transition-all hover:bg-muted/10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Sauvegardes & Extraits
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Bookmark className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="flex items-baseline gap-1.5" title="Marque-pages">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {totalBookmarks.toLocaleString()}
              </span>
              <Bookmark className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
            </div>
            <div className="flex items-baseline gap-1.5" title="Surlignages">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {totalHighlights.toLocaleString()}
              </span>
              <Highlighter className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            ~{avgBookmarksPerArticle} marque-pages / article · {totalHighlightsPublic} publics,{' '}
            {totalHighlightsPrivate} privés
          </p>
        </div>

        {/* KPI 4 : Discussions & Retours */}
        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none transition-all hover:bg-muted/10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Discussions & Retours
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <MessageSquare className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="flex items-baseline gap-1.5" title="Commentaires d'articles">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {totalComments.toLocaleString()}
              </span>
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
            </div>
            {totalAnnotations > 0 && (
              <div className="flex items-baseline gap-1.5" title="Annotations sur surlignages">
                <span className="text-2xl font-bold tracking-tight text-foreground">
                  {totalAnnotations.toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground">notes</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            ~{avgCommentsPerArticle} commentaires / article
          </p>
        </div>
      </div>

      {/* ─── 2. Détail audience + Articles les plus engageants ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne latérale : Abonnés & Qualité de lecture */}
        <div className="lg:col-span-1 space-y-4">
          {/* Abonnés */}
          <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
                Abonnés
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
                <Users className="h-4 w-4 stroke-[1.5]" />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {subscriberCount.toLocaleString()}
              </span>
              <span
                className={`text-xs font-medium ${
                  subscriberDelta7d > 0 ? 'text-success' : 'text-muted-foreground'
                }`}
              >
                {subscriberDelta7d > 0 ? `+${subscriberDelta7d}` : subscriberDelta7d} sur 7j
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Lecteurs abonnés à votre publication ({totalArticles} écrits publiés)
            </p>
          </div>

          {/* Complétion de lecture certifiée & Qualité */}
          <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
                Complétion de lecture certifiée
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
                <BookOpen className="h-4 w-4 stroke-[1.5]" />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {avgCompletionRate === null ? '—' : `${Math.round(avgCompletionRate * 100)}%`}
              </span>
              <span className="text-xs text-muted-foreground font-medium">score moyen</span>
            </div>

            {readingQuality && (
              <div className="mt-4 pt-3 border-t border-border/30 space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-success font-medium">
                    Lectures complètes ({readingQuality.deepReadsRate}%)
                  </span>
                  <span className="text-warning font-medium">
                    Survols ({readingQuality.skimsRate}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted/60 flex overflow-hidden">
                  <div
                    className="h-full bg-success"
                    style={{ width: `${readingQuality.deepReadsRate}%` }}
                  />
                  <div
                    className="h-full bg-warning"
                    style={{ width: `${readingQuality.skimsRate}%` }}
                  />
                  <div
                    className="h-full bg-muted-foreground/30"
                    style={{ width: `${readingQuality.bouncesRate}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Basé sur le temps de lecture effectif (≥ 35% de la durée estimée)
                </p>
              </div>
            )}
          </div>

          {/* Top catégories */}
          {topCategories.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
              <div className="flex items-center gap-1.5 mb-3">
                <Tag className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
                <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
                  Catégories publiées
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {topCategories.map((cat) => (
                  <span
                    key={cat.name}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border/60 text-xs font-medium text-foreground"
                  >
                    {cat.name}
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      ×{cat.count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Colonne principale : Articles les plus engageants */}
        <div className="lg:col-span-2 rounded-xl border border-border/30 bg-card p-6 shadow-none">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
                <Trophy className="h-4 w-4 stroke-[1.5]" />
              </div>
              <div>
                <h3 className="text-[17px] font-semibold tracking-tight text-foreground">
                  Articles les plus engageants
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Classés par interactions totales (j'aime, marque-pages, commentaires, surlignages,
                  partages)
                </p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground font-medium">
              {topArticles.length} écrits
            </span>
          </div>

          {!hasArticles ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg border-border/30 bg-muted/10">
              <Trophy className="h-6 w-6 text-muted-foreground/40 mb-2 stroke-[1.5]" />
              <p className="text-xs font-medium text-muted-foreground">
                Aucun article publié pour le moment
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {topArticles.map((article, index) => {
                const total = article.interactions;
                const formattedRank = index + 1 < 10 ? `0${index + 1}` : `${index + 1}`;

                return (
                  <div
                    key={article.slug}
                    onClick={() => onSelectArticle?.(`/articles/${article.slug}`)}
                    className="group relative flex items-center gap-3.5 h-16 px-3 -mx-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-xs font-bold text-muted-foreground">
                      {formattedRank}
                    </span>
                    <div className="flex flex-col min-w-0 flex-1 pr-3">
                      <span className="font-medium text-foreground text-sm truncate group-hover:text-primary transition-colors">
                        {article.title}
                      </span>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-normal mt-0.5">
                        <span>
                          {article.publishedAt
                            ? new Date(article.publishedAt).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : 'Brouillon'}
                        </span>
                        {article.completionRate > 0 && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <BookOpen className="h-3 w-3 stroke-[1.5]" />
                              {Math.round(article.completionRate * 100)}% lu
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3.5 shrink-0">
                      {/* Likes */}
                      <div
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                        title={`${article.likes} mentions j'aime`}
                      >
                        <Heart className="h-3.5 w-3.5 stroke-[1.5]" />
                        <span>{article.likes}</span>
                      </div>

                      {/* Marque-pages */}
                      <div
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                        title={`${article.bookmarks} marque-pages`}
                      >
                        <Bookmark className="h-3.5 w-3.5 stroke-[1.5]" />
                        <span>{article.bookmarks}</span>
                      </div>

                      {/* Surlignages */}
                      <div
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                        title={`${article.highlights} surlignages (${article.highlightsPublic} publics, ${article.highlightsPrivate} privés)`}
                      >
                        <Highlighter className="h-3.5 w-3.5 stroke-[1.5]" />
                        <span>{article.highlights}</span>
                      </div>

                      {/* Commentaires */}
                      <div
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                        title={`${article.comments} commentaires`}
                      >
                        <MessageSquare className="h-3.5 w-3.5 stroke-[1.5]" />
                        <span>{article.comments}</span>
                      </div>

                      {/* Reposts (si > 0) */}
                      {article.reposts > 0 && (
                        <div
                          className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground"
                          title={`${article.reposts} republications`}
                        >
                          <Repeat className="h-3.5 w-3.5 stroke-[1.5]" />
                          <span>{article.reposts}</span>
                        </div>
                      )}

                      {/* Total interaction badge */}
                      <span className="w-12 text-right font-semibold text-foreground text-sm">
                        {total}
                      </span>

                      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground group-hover:translate-x-0.5 transition-all stroke-[1.5]" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
