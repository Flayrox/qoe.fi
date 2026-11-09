'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bookmark,
  Edit3,
  Heart,
  Highlighter,
  Loader2,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { t } from '@lingui/core/macro';
import { Select } from '@qoe/ui/select';
import { cn } from '@qoe/utils';
import { STUDIO_PAGE_CLASS } from '@/components/studio-page';
import {
  getArticleAnalyticsDetailById,
  type ArticleDetailData,
  type TimePeriod,
} from '../../actions';
import { TimeseriesChart } from '../../components/TimeseriesChart';
import { ReferrersBlock } from '../../components/ReferrersBlock';

const PERIOD_OPTIONS = [
  { id: '7d', label: t`7 derniers jours` },
  { id: '30d', label: t`30 derniers jours` },
  { id: '90d', label: t`90 derniers jours` },
  { id: '24h', label: t`24 heures` },
  { id: 'all', label: t`Tout l'historique` },
];

export function ArticleAnalyticsPageClient({
  identifier,
  initialDetail,
  initialError,
}: {
  identifier: string;
  initialDetail: ArticleDetailData | null;
  initialError: string | null;
}) {
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const [detail, setDetail] = useState<ArticleDetailData | null>(initialDetail);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getArticleAnalyticsDetailById(identifier, period).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.data) {
        setDetail(res.data);
        setError(null);
      } else {
        setError(res.error ?? 'Erreur de chargement des détails');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [identifier, period]);

  // Édition : l'identifiant canonique est nécessaire pour ouvrir l'éditeur ;
  // à défaut le slug reste une URL exploitable.
  const editHref = detail?.articleId ? `/articles/${detail.articleId}` : null;

  return (
    <main className={cn(STUDIO_PAGE_CLASS, 'space-y-6 pb-16 text-foreground')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/analytics"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5 stroke-[1.5]" />
            {t`Retour aux analytics`}
          </Link>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t`Analytics de l'article`}
          </p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">
            {detail?.title || identifier}
          </h1>
          {detail?.url && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{detail.url}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Select
            label={t`Période`}
            hideLabel
            size="sm"
            value={period}
            onValueChange={(value) => setPeriod(value as TimePeriod)}
            options={PERIOD_OPTIONS}
          />
          {editHref && (
            <Link
              href={editHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted/50"
            >
              <Edit3 className="h-3.5 w-3.5 stroke-[1.5]" />
              {t`Éditer`}
            </Link>
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center text-xs text-destructive-text">
          {error}
        </div>
      ) : !detail ? (
        <div className="flex items-center justify-center gap-2 py-24 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t`Chargement des données de l'article…`}
        </div>
      ) : (
        <div className={cn('space-y-6 transition-opacity', loading && 'opacity-60')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border/30 bg-muted/20 p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {t`Vues sur l'écrit`} ({period})
              </span>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {detail.totalViews.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t`Toutes les lectures de cet article, tous canaux confondus.`}
              </p>
            </div>

            <div className="rounded-xl border border-border/30 bg-muted/20 p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {t`Engagement total`}
              </span>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {detail.totalInteractions.toLocaleString()}
              </p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3 stroke-[1.5]" />
                {t`J'aime, marque-pages, commentaires, surlignages et partages.`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              label={t`J'aime`}
              icon={<Heart className="h-3.5 w-3.5 stroke-[1.5]" />}
              value={detail.likes}
              hint={detail.reposts > 0 ? `${detail.reposts} ${t`partages`}` : undefined}
            />
            <MetricCard
              label={t`Marque-pages`}
              icon={<Bookmark className="h-3.5 w-3.5 stroke-[1.5]" />}
              value={detail.bookmarks}
            />
            <MetricCard
              label={t`Commentaires`}
              icon={<MessageSquare className="h-3.5 w-3.5 stroke-[1.5]" />}
              value={detail.comments}
              hint={
                detail.completionRate > 0
                  ? `${Math.round(detail.completionRate * 100)}% ${t`lu`}`
                  : undefined
              }
            />
            <MetricCard
              label={t`Surlignages`}
              icon={<Highlighter className="h-3.5 w-3.5 stroke-[1.5]" />}
              value={detail.highlights}
              hint={`${detail.highlightsPublic} ${t`publics`}`}
            />
          </div>

          <TimeseriesChart data={detail.timeseries} period={period} />
          <ReferrersBlock referrers={detail.referrers} />
        </div>
      )}
    </main>
  );
}

function MetricCard({
  label,
  icon,
  value,
  hint,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border/30 bg-card p-3.5">
      <div className="mb-1 flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold tabular-nums">{value.toLocaleString()}</span>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
