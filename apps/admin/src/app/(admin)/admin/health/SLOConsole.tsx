'use client';

// =====================================================================
// 🎯 SLOConsole — Tableau de bord des SLO & alertes par surface (Lot D4)
// =====================================================================
// Surveillance continue de la latence, du taux d'erreur, de l'outbox et
// du schéma. Visualisation du budget d'erreur restant et des alertes actives.
// =====================================================================

import { Activity, AlertTriangle, CheckCircle2, Database, Mail, ShieldAlert, Sparkles } from 'lucide-react';
import { Badge } from '@qoe/ui/badge';
import type { PlatformSLOReport, SLOSurface } from '@/lib/admin-infra-data';

interface SLOConsoleProps {
  report: PlatformSLOReport | null;
}

const surfaceIcons: Record<string, typeof Activity> = {
  api_latency: Database,
  error_rate: Activity,
  outbox: Mail,
  migration: Sparkles,
};

function statusBadge(status: string) {
  switch (status) {
    case 'critical':
      return (
        <Badge variant="soft" tone="danger" size="xs">
          Critique
        </Badge>
      );
    case 'warning':
      return (
        <Badge variant="soft" tone="vivid" size="xs">
          Dégradé
        </Badge>
      );
    default:
      return (
        <Badge variant="soft" tone="success" size="xs">
          Nominal
        </Badge>
      );
  }
}

export function SLOConsole({ report }: SLOConsoleProps) {
  if (!report) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        Rapport SLO indisponible pour le moment.
      </div>
    );
  }

  const { surfaces, alerts, globalStatus, generatedAt } = report;

  return (
    <div className="space-y-6">
      {/* ── En-tête de santé globale & SLO ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Objectifs de Niveau de Service (SLO) &amp; Alertes
            </h2>
            {statusBadge(globalStatus)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Mesure en continu des 4 surfaces vitales de la plateforme avec budgets d&apos;erreur associés.
          </p>
        </div>
        <div className="text-[11px] tabular-nums text-muted-foreground">
          Mesuré à {new Date(generatedAt).toLocaleTimeString('fr-FR')}
        </div>
      </div>

      {/* ── Alertes actives ── */}
      {alerts.length > 0 && (
        <div className="space-y-3" role="region" aria-label="Alertes actives">
          <div className="flex items-center gap-2 text-xs font-semibold text-destructive">
            <ShieldAlert className="h-4 w-4" />
            <span>Alertes actives ({alerts.length})</span>
          </div>
          <div className="space-y-2">
            {alerts.map((alert) => {
              const isCrit = alert.severity === 'critical';
              return (
                <div
                  key={alert.id}
                  className={`rounded-lg border px-4 py-3 text-xs ${
                    isCrit
                      ? 'border-destructive/40 bg-destructive/10 text-foreground'
                      : 'border-highlight/40 bg-highlight/10 text-foreground'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 font-medium">
                      {isCrit ? (
                        <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-highlight shrink-0" />
                      )}
                      <span>{alert.title}</span>
                    </div>
                    <Badge variant="soft" tone={isCrit ? 'danger' : 'vivid'} size="xs">
                      {alert.severity.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                    {alert.message}
                  </p>
                  {alert.recommendation && (
                    <div className="mt-2 text-[11px] italic text-foreground">
                      Action recommandée : {alert.recommendation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Les 4 surfaces opérationnelles ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {surfaces.map((surf: SLOSurface) => {
          const Icon = surfaceIcons[surf.id] ?? Activity;
          const budgetPct = Math.max(0, Math.min(100, surf.errorBudgetRemaining));
          const budgetTone =
            budgetPct > 50 ? 'bg-success' : budgetPct > 20 ? 'bg-highlight' : 'bg-destructive';

          return (
            <div
              key={surf.id}
              className="rounded-lg border border-border bg-card p-4 flex flex-col justify-between space-y-3 shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{surf.name}</span>
                  </div>
                  {statusBadge(surf.status)}
                </div>
                <div className="mt-3 text-2xl font-semibold tabular-nums text-foreground">
                  {surf.currentValue}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Cible : {surf.target}
                </div>
              </div>

              <div className="pt-2 border-t border-border/60 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Budget restant</span>
                  <span className="tabular-nums font-semibold text-foreground">
                    {surf.errorBudgetRemaining.toFixed(1)} %
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${budgetTone}`}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {alerts.length === 0 && (
        <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-2.5 text-xs text-foreground flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          <span>
            Toutes les surfaces respectent leurs engagements de service (SLO). Aucun incident ou dérive détecté.
          </span>
        </div>
      )}
    </div>
  );
}
