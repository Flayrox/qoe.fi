'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  FileText,
  Loader2,
  Edit3,
  Heart,
  Bookmark,
  Highlighter,
  MessageSquare,
} from 'lucide-react';
import { getArticleAnalyticsDetail, ArticleDetailData, TimePeriod } from '../actions';
import { TimeseriesChart } from './TimeseriesChart';
import { ReferrersBlock } from './ReferrersBlock';
import { t } from '@lingui/core/macro';

interface ArticleInspectorModalProps {
  urlPath: string | null;
  articleId?: string | null;
  period?: TimePeriod;
  onClose: () => void;
  onEdit?: () => void;
}

export function ArticleInspectorModal({
  urlPath,
  articleId,
  period: initialPeriod = '30d',
  onClose,
  onEdit,
}: ArticleInspectorModalProps) {
  const [period, setPeriod] = useState<TimePeriod>(initialPeriod);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ArticleDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync si la liste change de période (30j → 7j etc.)
  useEffect(() => {
    setPeriod(initialPeriod);
  }, [initialPeriod]);

  useEffect(() => {
    if (!urlPath) return;

    setLoading(true);
    setError(null);

    getArticleAnalyticsDetail(urlPath, period).then((res) => {
      setLoading(false);
      if (res.data) {
        setDetail(res.data);
      } else {
        setError(res.error || 'Erreur de chargement des détails');
      }
    });
  }, [urlPath, period]);

  if (!urlPath) return null;

  const handleEditClick = () => {
    if (onEdit) {
      onEdit();
    } else if (articleId) {
      window.location.href = `/articles/${articleId}`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Backdrop click handler */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slide-Over Drawer Container */}
      <div className="relative w-full max-w-2xl h-full bg-card border-l border-border/40 shadow-2xl p-6 sm:p-8 overflow-y-auto z-10 flex flex-col space-y-6 animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="flex items-start justify-between border-b border-border/30 pb-4">
          <div className="flex items-center gap-3 pr-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5 stroke-[1.5]" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Analyses de l'article
              </span>
              <h2
                className="text-lg font-bold text-foreground truncate max-w-md"
                title={detail?.title || urlPath}
              >
                {detail?.title || urlPath}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(articleId || onEdit) && (
              <button
                onClick={handleEditClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              >
                <Edit3 className="h-3.5 w-3.5 stroke-[1.5]" />
                <span>{t`Éditer l'article`}</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg flex items-center justify-center bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="h-4 w-4 stroke-[1.5]" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground">Chargement des données de l'article...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive text-center">
            {error}
          </div>
        ) : detail ? (
          <div className="space-y-6">
            {/* Top Metric Header */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-border/30 bg-muted/20">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Vues sur l'écrit ({period})
                </span>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {detail.totalViews.toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Toutes les lectures (feed, direct, tenant) sur cet articleId — plein par co-auteur
                </p>
              </div>

              <div className="p-4 rounded-xl border border-border/30 bg-muted/20">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Chemin d'accès
                </span>
                <p className="text-xs font-sans font-medium text-foreground mt-2 truncate">
                  {detail.url}
                </p>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as TimePeriod)}
                  className="mt-3 w-full bg-background border border-border/30 rounded-lg px-2 py-1.5 text-xs text-muted-foreground"
                >
                  <option value="7d">7 derniers jours</option>
                  <option value="30d">30 derniers jours</option>
                  <option value="90d">90 derniers jours</option>
                  <option value="24h">24 heures</option>
                  <option value="all">Tout l'historique</option>
                </select>
              </div>
            </div>

            {/* Engagement Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Likes & Reposts */}
              <div className="p-3.5 rounded-xl border border-border/30 bg-card">
                <div className="flex items-center justify-between text-muted-foreground mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider">
                    J'aime & Reposts
                  </span>
                  <Heart className="h-3.5 w-3.5 stroke-[1.5]" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-foreground">
                    {detail.likes.toLocaleString()}
                  </span>
                  {detail.reposts > 0 && (
                    <span className="text-xs text-muted-foreground" title="Republications">
                      · {detail.reposts} partages
                    </span>
                  )}
                </div>
              </div>

              {/* Bookmarks */}
              <div className="p-3.5 rounded-xl border border-border/30 bg-card">
                <div className="flex items-center justify-between text-muted-foreground mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider">
                    Marque-pages
                  </span>
                  <Bookmark className="h-3.5 w-3.5 stroke-[1.5]" />
                </div>
                <p className="text-xl font-bold text-foreground">
                  {detail.bookmarks.toLocaleString()}
                </p>
              </div>

              {/* Surlignages */}
              <div className="p-3.5 rounded-xl border border-border/30 bg-card">
                <div className="flex items-center justify-between text-muted-foreground mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider">
                    Surlignages
                  </span>
                  <Highlighter className="h-3.5 w-3.5 stroke-[1.5]" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-foreground">
                    {detail.highlights.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({detail.highlightsPublic} pub.)
                  </span>
                </div>
              </div>

              {/* Commentaires & Complétion */}
              <div className="p-3.5 rounded-xl border border-border/30 bg-card">
                <div className="flex items-center justify-between text-muted-foreground mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider">
                    Commentaires
                  </span>
                  <MessageSquare className="h-3.5 w-3.5 stroke-[1.5]" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-foreground">
                    {detail.comments.toLocaleString()}
                  </span>
                  {detail.completionRate > 0 && (
                    <span
                      className="text-xs text-muted-foreground font-medium"
                      title="Complétion de lecture certifiée"
                    >
                      · {Math.round(detail.completionRate * 100)}% lu
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Total Interaction Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-border/30 bg-muted/15 text-xs">
              <span className="text-muted-foreground">Score d'engagement total sur cet écrit</span>
              <span className="font-semibold text-foreground">
                {detail.totalInteractions.toLocaleString()} interactions
              </span>
            </div>

            {/* Dedicated Article Timeseries */}
            <TimeseriesChart data={detail.timeseries} period={period} />

            {/* Dedicated Article Referrers — toutes les provenances envoyées */}
            <ReferrersBlock referrers={detail.referrers} />
            <p className="text-[11px] text-muted-foreground text-center">
              Données complètes envoyées : vues, uniques, timeseries, provenances (hostname /
              referrer), chemin canonique.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
