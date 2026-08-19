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
} from 'lucide-react';
import { ProductMetrics } from '../actions';

interface ProductMetricsBlockProps {
  metrics: ProductMetrics;
}

export function ProductMetricsBlock({ metrics }: ProductMetricsBlockProps) {
  const {
    subscriberCount,
    subscriberDelta7d,
    totalBookmarks,
    totalHighlights,
    totalInteractions,
    avgCompletionRate,
    topCategories,
    topArticles,
  } = metrics;
  const hasArticles = topArticles.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ─── Subscribers & Engagement KPIs ─────────────────────────── */}
      <div className="lg:col-span-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
        {/* Subscribers */}
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
          <p className="text-xs text-muted-foreground mt-2">Lecteurs abonnés à votre publication</p>
        </div>
        {/* Engagement (bookmarks + highlights) */}
        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Engagement contenu
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Highlighter className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {totalBookmarks.toLocaleString()}
              </span>
              <Bookmark className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {totalHighlights.toLocaleString()}
              </span>
              <Highlighter className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Marque-pages et surlignages sur vos 5 meilleurs articles
          </p>
        </div>{' '}
        {/* Interactions totales */}
        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Interactions totales
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Repeat className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {totalInteractions.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground font-medium">sur vos 5 meilleurs</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Bookmarks + commentaires + surlignages + annotations
          </p>
        </div>
        {/* Complétion de lecture moyenne */}
        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Complétion de lecture
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <BookOpen className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {avgCompletionRate === null ? '—' : `${Math.round(avgCompletionRate * 100)}%`}
            </span>
            <span className="text-xs text-muted-foreground font-medium">moyenne</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Part moyenne d'un article lue par vos lecteurs
          </p>
        </div>
      </div>

      {/* ─── Top Articles by Engagement ───────────────────────────── */}
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
                Classés par bookmarks + commentaires + surlignages
              </p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            {topArticles.length} articles
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
          <>
            <div className="divide-y divide-border/30">
              {topArticles.map((article, index) => {
                const total = article.interactions;
                return (
                  <div
                    key={article.slug}
                    className="group relative flex items-center gap-4 h-16 px-3 -mx-3 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-xs font-bold text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="flex flex-col min-w-0 flex-1 pr-4">
                      <span className="font-medium text-foreground text-sm truncate">
                        {article.title}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-normal">
                        {article.publishedAt
                          ? new Date(article.publishedAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'Brouillon'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                        title="Marque-pages"
                      >
                        <Bookmark className="h-3.5 w-3.5 stroke-[1.5]" />
                        {article.bookmarks}
                      </div>
                      <div
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                        title={`${article.highlightsPublic} publics · ${article.highlightsPrivate} privés`}
                      >
                        <Highlighter className="h-3.5 w-3.5 stroke-[1.5]" />
                        {article.highlights}
                      </div>
                      <div
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                        title="Commentaires"
                      >
                        <MessageSquare className="h-3.5 w-3.5 stroke-[1.5]" />
                        {article.comments}
                      </div>
                      <span className="w-14 text-right font-semibold text-foreground text-sm">
                        {total}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {topCategories.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/30">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
                  <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
                    Top catégories publiées
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
          </>
        )}
      </div>
    </div>
  );
}
