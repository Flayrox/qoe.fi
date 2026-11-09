'use client';

import React, { useState, useTransition } from 'react';
import { t } from '@lingui/core/macro';
import { Eye, Users, Activity, Clock, Info } from 'lucide-react';
import { ToggleButton, ToggleGroup } from '@qoe/ui/toggle';
import { StudioHeader } from '@/components/studio-page';
import type { FeatureLocale } from '@qoe/ui';
import { getCreatorAnalyticsData, AnalyticsResponseData, TimePeriod } from './actions';
import { TimeseriesChart } from './components/TimeseriesChart';
import { TopPagesBlock } from './components/TopPagesBlock';
import { ReferrersBlock } from './components/ReferrersBlock';
import { DevicesAndGeoBlock } from './components/DevicesAndGeoBlock';
import { ProductMetricsBlock } from './components/ProductMetricsBlock';
import { FeatureInterestBlock } from './components/FeatureInterestBlock';
import { ProvenanceBlock } from './components/ProvenanceBlock';
import { AudienceInsightsBlock } from './components/AudienceInsightsBlock';
import { ReturningAndHeatmapBlock } from './components/ReturningAndHeatmapBlock';
import { ArticleInspectorDrawer } from './components/ArticleInspectorModal';

interface AnalyticsDashboardClientProps {
  initialData: AnalyticsResponseData;
  locale?: FeatureLocale;
}

export function AnalyticsDashboardClient({
  initialData,
  locale = 'fr',
}: AnalyticsDashboardClientProps) {
  const [data, setData] = useState<AnalyticsResponseData>(initialData);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>(initialData.period);
  const [selectedArticleUrl, setSelectedArticleUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handlePeriodChange = (newPeriod: TimePeriod) => {
    setSelectedPeriod(newPeriod);
    startTransition(async () => {
      const res = await getCreatorAnalyticsData(newPeriod);
      if (res.data) {
        setData(res.data);
      }
    });
  };

  const stats = data.stats;
  const pageviews = stats?.pageviews || 0;
  const visitors = stats?.visitors || 0;
  const visits = stats?.visits || 0;
  const bounces = stats?.bounces || 0;
  const totaltime = stats?.totaltime || 0;

  const avgDurationSeconds = visits > 0 ? Math.round(totaltime / visits) : 0;
  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const mins = Math.floor(sec / 60);
    const remainingSec = sec % 60;
    return `${mins}m ${remainingSec}s`;
  };

  const bounceRate = visits > 0 ? Math.round((bounces / visits) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* ─── Header & Period Controls ─────────────────────────────── */}
      <StudioHeader
        title={t`Statistiques`}
        description={t`Audience et lecture, sans cookies.`}
        actions={
          <ToggleGroup
            aria-label="Période"
            variant="inset"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[selectedPeriod]}
            onSelectionChange={(keys) => {
              const [next] = Array.from(keys);
              if (next) handlePeriodChange(next as TimePeriod);
            }}
          >
            {(
              [
                ['24h', '24 h'],
                ['7d', '7 jours'],
                ['30d', '30 jours'],
                ['90d', '90 jours'],
                ['all', 'Tout'],
              ] as const
            ).map(([period, label]) => (
              <ToggleButton key={period} id={period} size="xs" isDisabled={isPending}>
                {label}
              </ToggleButton>
            ))}
          </ToggleGroup>
        }
      />

      {/* ─── Unconfigured State Banner ───────────────────────────── */}
      {(!data.configured || !data.websiteId) && (
        <div className="rounded-xl border border-border/30 bg-card p-6 sm:p-8 backdrop-blur-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-2xl">
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                Statistiques non configurées
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Umami mesure les lectures sans déposer de cookie chez vos visiteurs.
              </p>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border/30 text-xs text-muted-foreground shrink-0">
              <Info className="h-4 w-4 shrink-0 stroke-[1.5]" />
              <span>
                Website ID global :{' '}
                <span className="text-foreground font-medium">NEXT_PUBLIC_UMAMI_WEBSITE_ID</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── 4 Core KPI Cards Grid ────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Pageviews */}
        <div className="rounded-xl border border-border/50 bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Pages vues
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Eye className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {pageviews.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t`Pages vues sur la période`}</p>
        </div>

        {/* KPI 2: Visitors */}
        <div className="rounded-xl border border-border/50 bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Visiteurs uniques
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Users className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {visitors.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground font-medium">Lecteurs uniques</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t`Visiteurs distincts`}</p>
        </div>

        {/* KPI 3: Visits */}
        <div className="rounded-xl border border-border/50 bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Visites / Sessions
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Activity className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {visits.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground font-medium">
              {visits > 0 ? (pageviews / visits).toFixed(1) : '0'} p/v
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t`Sessions`}</p>
        </div>

        {/* KPI 4: Avg Duration */}
        <div className="rounded-xl border border-border/50 bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Temps de lecture
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Clock className="h-4 w-4 stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {formatDuration(avgDurationSeconds)}
            </span>
            <span className="text-xs text-muted-foreground font-medium">Rebond {bounceRate}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t`Durée moyenne`}</p>
        </div>
      </div>

      {/* ─── Product Metrics: Subscribers & Top Articles ────────── */}
      <ProductMetricsBlock
        metrics={data.productMetrics}
        onSelectArticle={(url) => setSelectedArticleUrl(url)}
      />

      {/* ─── Intérêt pour les fonctionnalités à venir / Pro ─────── */}
      <FeatureInterestBlock signals={data.featureInterest} locale={locale} />

      {/* ─── Provenance fine : d'où viennent les vues (le plus poussé) ── */}
      <ProvenanceBlock provenance={data.provenance} />

      {/* ─── Audience Demographics (creator + platform) ──────────── */}
      <AudienceInsightsBlock insights={data.audience} />

      {/* ─── Nouveaux vs Récurrents + Heatmap heures ─────────────── */}
      <ReturningAndHeatmapBlock insights={data.umamiAdvanced} />

      {/* ─── Timeseries Area Chart ───────────────────────────────── */}
      <TimeseriesChart data={data.timeseries} period={selectedPeriod} />

      {/* ─── Breakdown Grids: Top Pages, Referrers & Devices ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopPagesBlock
          topPages={data.topPages}
          articleTitlesMap={data.articleTitlesMap}
          onSelectArticle={(url) => setSelectedArticleUrl(url)}
        />
        <ReferrersBlock referrers={data.referrers} />
      </div>

      {/* Devices & Geolocation Breakdown */}
      <DevicesAndGeoBlock
        devices={data.devices}
        browsers={data.browsers}
        countries={data.countries}
      />

      {/* ─── Article Inspection Modal ────────────────────────────── */}
      {selectedArticleUrl && (
        <ArticleInspectorDrawer
          urlPath={selectedArticleUrl}
          period={selectedPeriod}
          onClose={() => setSelectedArticleUrl(null)}
        />
      )}
    </div>
  );
}
