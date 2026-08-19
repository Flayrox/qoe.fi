'use client';

import React from 'react';
import { Users, Globe, BarChart3, Info } from 'lucide-react';
import { AudienceInsights, DemographicBucket, labelDemographic } from '../actions';

interface AudienceInsightsBlockProps {
  insights: AudienceInsights;
}

function Distribution({
  title,
  buckets,
  total,
  accent,
}: {
  title: string;
  buckets: DemographicBucket[];
  total: number;
  accent: string;
}) {
  const max = buckets.length > 0 ? Math.max(...buckets.map((b) => b.count)) : 1;

  return (
    <div className="mb-5">
      <h4 className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground mb-2.5">
        {title}
      </h4>
      {buckets.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 italic">Aucune donnée déclarée</p>
      ) : (
        <div className="space-y-1.5">
          {buckets.slice(0, 5).map((bucket) => {
            const percentage = total > 0 ? Math.round((bucket.count / total) * 100) : 0;
            return (
              <div key={bucket.value} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-xs text-muted-foreground truncate">
                  {bucket.value}
                </span>
                <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${accent} transition-all duration-500`}
                    style={{ width: `${Math.max((bucket.count / max) * 100, 2)}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-xs font-semibold text-foreground">
                  {percentage}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AudienceInsightsBlock({ insights }: AudienceInsightsBlockProps) {
  const { creator, platform } = insights;
  const creatorTotal =
    creator.gender.reduce((s, b) => s + b.count, 0) ||
    creator.ageRange.reduce((s, b) => s + b.count, 0);
  const platformTotal =
    platform.gender.reduce((s, b) => s + b.count, 0) ||
    platform.ageRange.reduce((s, b) => s + b.count, 0);

  return (
    <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
            <Users className="h-4 w-4 stroke-[1.5]" />
          </div>
          <div>
            <h3 className="text-[17px] font-semibold tracking-tight text-foreground">
              Votre audience
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Profil démographique agrégé — jamais individuel, déclaré volontairement
            </p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground font-medium">
          {creator.declared.toLocaleString()} lecteurs·trices renseigné·es
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ─── Votre audience (followers) ─────────────────────────── */}
        <div className="border border-border/30 rounded-lg p-5 bg-muted/10">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-foreground/70 stroke-[1.5]" />
            <span className="text-sm font-semibold text-foreground">Vos lecteurs</span>
          </div>
          <Distribution
            title="Genre"
            buckets={creator.gender.map((b) => ({
              value: labelDemographic('gender', b.value),
              count: b.count,
            }))}
            total={creatorTotal}
            accent="bg-success/60"
          />
          <Distribution
            title="Tranche d'âge"
            buckets={creator.ageRange.map((b) => ({
              value: labelDemographic('ageRange', b.value),
              count: b.count,
            }))}
            total={creatorTotal}
            accent="bg-primary/60"
          />
          <Distribution
            title="Top pays"
            buckets={creator.countries}
            total={creatorTotal}
            accent="bg-muted-foreground/50"
          />
        </div>

        {/* ─── Plateforme entière ─────────────────────────────────── */}
        <div className="border border-border/30 rounded-lg p-5 bg-muted/10">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-4 w-4 text-foreground/70 stroke-[1.5]" />
            <span className="text-sm font-semibold text-foreground">
              Plateforme qoe.fi{' '}
              <span className="text-[11px] font-normal text-muted-foreground">
                ({platformTotal.toLocaleString()} profils)
              </span>
            </span>
          </div>
          <Distribution
            title="Ratio genre (plateforme)"
            buckets={platform.gender.map((b) => ({
              value: labelDemographic('gender', b.value),
              count: b.count,
            }))}
            total={platformTotal}
            accent="bg-success/40"
          />
          <Distribution
            title="Tranches d'âge (plateforme)"
            buckets={platform.ageRange.map((b) => ({
              value: labelDemographic('ageRange', b.value),
              count: b.count,
            }))}
            total={platformTotal}
            accent="bg-primary/40"
          />
          <Distribution
            title="Top pays (plateforme)"
            buckets={platform.countries}
            total={platformTotal}
            accent="bg-muted-foreground/30"
          />
        </div>
      </div>

      <div className="mt-5 flex items-start gap-2 text-xs text-muted-foreground/70">
        <Info className="h-3.5 w-3.5 shrink-0 stroke-[1.5] mt-0.5" />
        <p>
          Les données démographiques sont renseignées volontairement à l'onboarding (genre, tranche
          d'âge, pays, langue) et restent optionnelles. Elles ne sont jamais exposées
          individuellement.
        </p>
      </div>
    </div>
  );
}
