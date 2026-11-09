'use client';

import React, { useEffect, useState } from 'react';
import {
  FileText,
  Loader2,
  Edit3,
  Heart,
  Bookmark,
  Highlighter,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { getArticleAnalyticsDetail, ArticleDetailData, TimePeriod } from '../actions';
import { TimeseriesChart } from './TimeseriesChart';
import { ReferrersBlock } from './ReferrersBlock';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@qoe/ui/drawer';
import { Select } from '@qoe/ui/select';

interface ArticleInspectorDrawerProps {
  urlPath: string | null;
  articleId?: string | null;
  period?: TimePeriod;
  onClose: () => void;
  onEdit?: () => void;
}

export function ArticleInspectorDrawer({
  urlPath,
  articleId,
  period: initialPeriod = '30d',
  onClose,
  onEdit,
}: ArticleInspectorDrawerProps) {
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

  // Lien partageable vers la page complète : l'identifiant canonique est
  // préféré au slug dès que le détail est chargé.
  const fallbackSlug = urlPath
    .replace(/^\/(articles?)\//i, '')
    .replace(/^\/+/, '')
    .split(/[?#]/)[0];
  const fullPageHref = `/analytics/articles/${encodeURIComponent(
    detail?.articleId || detail?.slug || fallbackSlug
  )}`;

  const handleEditClick = () => {
    if (onEdit) {
      onEdit();
    } else if (articleId) {
      window.location.href = `/articles/${articleId}`;
    }
  };

  return (
    <Drawer
      side="right"
      width="xl"
      isOpen={Boolean(urlPath)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText className="h-5 w-5 stroke-[1.5]" />
              </div>
              <div className="min-w-0">
                <DrawerDescription className="mt-0 text-[11px] font-bold uppercase tracking-wider">
                  Analyses de l&apos;article
                </DrawerDescription>
                <DrawerTitle className="truncate">{detail?.title || urlPath}</DrawerTitle>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={fullPageHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/50"
              >
                <ExternalLink className="h-3.5 w-3.5 stroke-[1.5]" />
                <span>{t`Page complète`}</span>
              </Link>
              {(articleId || onEdit) && (
                <Button variant="solid" tone="brand" size="xs" onClick={handleEditClick}>
                  <Edit3 />
                  <span>{t`Éditer l'article`}</span>
                </Button>
              )}
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody className="p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">
                Chargement des données de l&apos;article...
              </p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive-text text-center">
              {error}
            </div>
          ) : detail ? (
            <div className="space-y-6">
              {/* Top Metric Header */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-border/30 bg-muted/20">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Vues sur l&apos;écrit ({period})
                  </span>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {detail.totalViews.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Toutes les lectures (feed, direct, tenant) sur cet articleId — plein par
                    co-auteur
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/30 bg-muted/20">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Chemin d&apos;accès
                  </span>
                  <p className="text-xs font-sans font-medium text-foreground mt-2 truncate">
                    {detail.url}
                  </p>
                  <Select
                    label={t`Période`}
                    hideLabel
                    size="sm"
                    className="mt-3"
                    value={period}
                    onValueChange={(value) => setPeriod(value as TimePeriod)}
                    options={[
                      { id: '7d', label: t`7 derniers jours` },
                      { id: '30d', label: t`30 derniers jours` },
                      { id: '90d', label: t`90 derniers jours` },
                      { id: '24h', label: t`24 heures` },
                      { id: 'all', label: t`Tout l'historique` },
                    ]}
                  />
                </div>
              </div>

              {/* Engagement Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Likes & Reposts */}
                <div className="p-3.5 rounded-xl border border-border/30 bg-card">
                  <div className="flex items-center justify-between text-muted-foreground mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider">
                      J&apos;aime & Reposts
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
                <span className="text-muted-foreground">
                  Score d&apos;engagement total sur cet écrit
                </span>
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
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
