'use client';

import React from 'react';
import { Globe, Search, Share2 } from 'lucide-react';
import { UmamiPageMetric } from '@qoe/analytics/server';
import { getReferrerLabel } from '@qoe/analytics/referrers';

interface ReferrersBlockProps {
  referrers: UmamiPageMetric[];
}

export function ReferrersBlock({ referrers }: ReferrersBlockProps) {
  const maxVisits = referrers.length > 0 ? Math.max(...referrers.map((r) => r.y)) : 1;

  return (
    <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[17px] font-semibold tracking-tight text-foreground">
            Sources de trafic
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Provenances principales de vos lecteurs
          </p>
        </div>
        <span className="text-xs text-muted-foreground font-medium">
          {referrers.length} sources
        </span>
      </div>

      {referrers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg border-border/30 bg-muted/10">
          <Globe className="h-6 w-6 text-muted-foreground/40 mb-2 stroke-[1.5]" />
          <p className="text-xs font-medium text-muted-foreground">Aucune source enregistrée</p>
        </div>
      ) : (
        <div className="divide-y divide-border/30">
          {referrers.map((ref, index) => {
            const { name, category } = getReferrerLabel(ref.x);
            const percentage = Math.round((ref.y / maxVisits) * 100);

            return (
              <div
                key={ref.x || index}
                className="group relative flex flex-col justify-center h-14 px-3 -mx-3 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
                      {category === 'Recherche' ? (
                        <Search className="h-3.5 w-3.5 stroke-[1.5]" />
                      ) : category === 'Réseaux Sociaux' ? (
                        <Share2 className="h-3.5 w-3.5 stroke-[1.5]" />
                      ) : (
                        <Globe className="h-3.5 w-3.5 stroke-[1.5]" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-foreground text-sm truncate">{name}</span>
                      <span className="text-[11px] text-muted-foreground font-normal">
                        {category}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-semibold text-foreground text-sm">
                      {ref.y.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">visites</span>
                  </div>
                </div>

                {/* Hairline Progress Indicator */}
                <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-transparent">
                  <div
                    className="h-full bg-success/40 rounded-full transition-all duration-300 group-hover:bg-success/70"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
