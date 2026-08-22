'use client';

import React, { useState, useTransition } from 'react';
import { Eye, Users, Activity, Clock, TrendingUp, Sparkles, Info } from 'lucide-react';
import { getCreatorAnalyticsData, AnalyticsResponseData, TimePeriod } from './actions';
import { TimeseriesChart } from './components/TimeseriesChart';
import { TopPagesBlock } from './components/TopPagesBlock';
import { ReferrersBlock } from './components/ReferrersBlock';
import { DevicesAndGeoBlock } from './components/DevicesAndGeoBlock';
import { ProductMetricsBlock } from './components/ProductMetricsBlock';
import { ProvenanceBlock } from './components/ProvenanceBlock';
import { AudienceInsightsBlock } from './components/AudienceInsightsBlock';
import { ReturningAndHeatmapBlock } from './components/ReturningAndHeatmapBlock';
import { ArticleInspectorModal } from './components/ArticleInspectorModal';

interface AnalyticsDashboardClientProps {
  initialData: AnalyticsResponseData;
}

export function AnalyticsDashboardClient({ initialData }: AnalyticsDashboardClientProps) {
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
    <div className="space-y-8 p-6 lg:p-10 max-w-7xl mx-auto">
      {/* ─── Header & Period Controls ─────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border/30">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            {/* QuietDot Indicator (6px) */}
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Télémétrie en direct
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Analytics Créateur</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mesures d'audience et de consultation souveraines (Umami, sans cookies traceurs)
          </p>
        </div>

        {/* Apple Segmented Control */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/40 border border-border/30 backdrop-blur-md self-start sm:self-auto">
          {(['24h', '7d', '30d', '90d'] as TimePeriod[]).map((period) => {
            const labels: Record<TimePeriod, string> = {
              '24h': '24h',
              '7d': '7 jours',
              '30d': '30 jours',
              '90d': '90 jours',
            };

            const isActive = selectedPeriod === period;

            return (
              <button
                key={period}
                onClick={() => handlePeriodChange(period)}
                disabled={isPending}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-card text-foreground shadow-sm font-semibold border border-border/30'
                    : 'text-muted-foreground hover:text-foreground'
                } ${isPending ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {labels[period]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Unconfigured State Banner ───────────────────────────── */}
      {(!data.configured || !data.websiteId) && (
        <div className="rounded-xl border border-border/30 bg-card p-6 sm:p-8 backdrop-blur-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase text-muted-foreground mb-1">
                <Sparkles className="h-3.5 w-3.5 stroke-[1.5]" />
                <span>Configuration Analytics Umami</span>
              </div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                Connectez votre tracker d'audience
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Umami mesure les lectures sur votre espace créateur en temps réel, sans déposer
                aucun cookie chez vos visiteurs.
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
        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none transition-all hover:bg-muted/20">
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
            <span className="text-xs font-medium text-success flex items-center gap-0.5">
              <TrendingUp className="h-3 w-3 stroke-[1.5]" />
              +14%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Consultations de pages totales</p>
        </div>

        {/* KPI 2: Visitors */}
        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none transition-all hover:bg-muted/20">
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
          <p className="text-xs text-muted-foreground mt-2">Audience distincte identifiée</p>
        </div>

        {/* KPI 3: Visits */}
        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none transition-all hover:bg-muted/20">
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
          <p className="text-xs text-muted-foreground mt-2">Sessions de lecture ouvertes</p>
        </div>

        {/* KPI 4: Avg Duration */}
        <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none transition-all hover:bg-muted/20">
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
          <p className="text-xs text-muted-foreground mt-2">Durée moyenne par session</p>
        </div>
      </div>

      {/* ─── Product Metrics: Subscribers & Top Articles ────────── */}
      <ProductMetricsBlock metrics={data.productMetrics} />

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
        <ArticleInspectorModal
          urlPath={selectedArticleUrl}
          period={selectedPeriod}
          onClose={() => setSelectedArticleUrl(null)}
        />
      )}
    </div>
  );
}
