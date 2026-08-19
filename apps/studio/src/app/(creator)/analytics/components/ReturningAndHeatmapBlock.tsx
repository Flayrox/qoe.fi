'use client';

import React from 'react';
import { Repeat, Clock, Info } from 'lucide-react';
import { UmamiAdvancedInsights } from '../actions';

interface ReturningAndHeatmapBlockProps {
  insights: UmamiAdvancedInsights;
}

function HourBar({ hour, visits, max }: { hour: number; visits: number; max: number }) {
  const percentage = max > 0 ? Math.max((visits / max) * 100, 3) : 0;
  const isPeak = max > 0 && visits === max;
  const label = `${String(hour).padStart(2, '0')}h`;

  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-right text-[10px] text-muted-foreground font-mono">
        {label}
      </span>
      <div className="flex-1 h-3 rounded-md bg-muted/40 overflow-hidden">
        <div
          className={`h-full rounded-md transition-all duration-500 ${
            isPeak ? 'bg-[#EE4B2B]' : 'bg-primary/50'
          }`}
          style={{ width: `${percentage}%` }}
          title={`${label} — ${visits} visites`}
        />
      </div>
      <span className="w-8 shrink-0 text-left text-[10px] text-muted-foreground font-mono">
        {visits > 0 ? visits : ''}
      </span>
    </div>
  );
}

export function ReturningAndHeatmapBlock({ insights }: ReturningAndHeatmapBlockProps) {
  const { returning, hours } = insights;
  const total = returning?.total ?? 0;
  const newPct = total > 0 ? Math.round(((returning?.newVisitors ?? 0) / total) * 100) : 0;
  const returningPct = total > 0 ? 100 - newPct : 0;
  const maxHour = hours.length > 0 ? Math.max(...hours.map((h) => h.visits)) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ─── Nouveaux vs Récurrents ───────────────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Repeat className="h-4 w-4 stroke-[1.5]" />
            </div>
            <div>
              <h3 className="text-[17px] font-semibold tracking-tight text-foreground">
                Nouveaux vs récurrents
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Visiteurs uniques de la période
              </p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            {total.toLocaleString()} visiteurs
          </span>
        </div>

        {!returning ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg border-border/30 bg-muted/10">
            <Repeat className="h-6 w-6 text-muted-foreground/40 mb-2 stroke-[1.5]" />
            <p className="text-xs font-medium text-muted-foreground">
              Disponible dès que des visites sont enregistrées
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Donut simple (barre pleine) */}
            <div className="flex items-center gap-6">
              <div className="relative h-28 w-28 shrink-0">
                <div
                  className="absolute inset-0 rounded-full bg-[#EE4B2B]"
                  style={{
                    background: `conic-gradient(#EE4B2B 0% ${returningPct}%, #d63d20 ${returningPct}% 100%)`,
                  }}
                />
                <div className="absolute inset-3 rounded-full bg-card flex flex-col items-center justify-center">
                  <span className="text-lg font-bold text-foreground leading-none">{newPct}%</span>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">
                    nouveaux
                  </span>
                </div>
              </div>
              <div className="space-y-2.5 flex-1">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#EE4B2B] inline-block" />
                      Récurrents
                    </span>
                    <span className="font-semibold text-foreground">
                      {returning.returningVisitors.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#EE4B2B] transition-all duration-500"
                      style={{ width: `${returningPct}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-primary/60 inline-block" />
                      Nouveaux
                    </span>
                    <span className="font-semibold text-foreground">
                      {returning.newVisitors.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all duration-500"
                      style={{ width: `${newPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <p className="flex items-start gap-2 text-[11px] text-muted-foreground/70 leading-relaxed">
              <Info className="h-3.5 w-3.5 shrink-0 stroke-[1.5] mt-0.5" />
              Un visiteur est « nouveau » si c'est sa première session jamais enregistrée ; «
              récurrent » s'il revient après une visite antérieure (identifiant anonyme persistant,
              sans cookie traceur).
            </p>
          </div>
        )}
      </div>

      {/* ─── Heatmap heures de lecture ────────────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-card p-6 shadow-none">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Clock className="h-4 w-4 stroke-[1.5]" />
            </div>
            <div>
              <h3 className="text-[17px] font-semibold tracking-tight text-foreground">
                Heures de lecture
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Meilleur moment pour publier — visites par heure
              </p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground font-medium">UTC</span>
        </div>

        {hours.length === 0 || maxHour === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg border-border/30 bg-muted/10">
            <Clock className="h-6 w-6 text-muted-foreground/40 mb-2 stroke-[1.5]" />
            <p className="text-xs font-medium text-muted-foreground">
              Disponible dès que des visites sont enregistrées
            </p>
          </div>
        ) : (
          <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
            {hours.map((h) => (
              <HourBar key={h.hour} hour={h.hour} visits={h.visits} max={maxHour} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
