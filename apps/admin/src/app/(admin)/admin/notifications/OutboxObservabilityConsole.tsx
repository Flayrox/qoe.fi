'use client';

// =====================================================================
// 📮 OutboxObservabilityConsole — Supervision & reprise de la boîte d'envoi
// =====================================================================
// Fournit la vue temps-réel de l'outbox événementielle :
// - Profondeur de la file (QUEUED, PROCESSING, FAILED)
// - Détection des messages fantômes bloqués en PROCESSING
// - Temps d'attente / lag du message le plus ancien
// - Déblocage et relance en masse auditées
// =====================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ShieldAlert,
  Unlock,
} from 'lucide-react';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import type { OutboxHealthMetrics } from '@/lib/admin-data';
import {
  retryAllFailedDeliveriesAction,
  unlockStuckDeliveriesAction,
} from '@/lib/admin-aux-actions';

interface OutboxObservabilityConsoleProps {
  metrics: OutboxHealthMetrics;
}

function statusBadge(status: string) {
  switch (status) {
    case 'blocked':
      return (
        <Badge variant="soft" tone="danger" size="xs">
          Blocage détecté
        </Badge>
      );
    case 'degraded':
      return (
        <Badge variant="soft" tone="vivid" size="xs">
          Flux ralenti
        </Badge>
      );
    default:
      return (
        <Badge variant="soft" tone="success" size="xs">
          Flux nominal
        </Badge>
      );
  }
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'vide';
  if (seconds < 60) return `${seconds} s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  return `${hours} h ${mins % 60} min`;
}

export function OutboxObservabilityConsole({ metrics }: OutboxObservabilityConsoleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isActionPending, setIsActionPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const handleUnlockStuck = async () => {
    setIsActionPending(true);
    setStatusMessage(null);
    try {
      const res = await unlockStuckDeliveriesAction(
        'Déblocage manuel suite à détection de verrous fantômes'
      );
      if (res.success) {
        setStatusMessage(
          `Audité · ${res.unlockedCount} message(s) coincé(s) remis en file d'attente à ${new Date().toLocaleTimeString('fr-FR')}`
        );
        refresh();
      } else {
        setStatusMessage(res.error || 'Échec du déblocage');
      }
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Erreur de déblocage');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleRetryAll = async () => {
    setIsActionPending(true);
    setStatusMessage(null);
    try {
      const res = await retryAllFailedDeliveriesAction('Relance manuelle globale des échecs');
      if (res.success) {
        setStatusMessage(
          `Audité · ${res.retriedCount} message(s) en échec réarmé(s) à ${new Date().toLocaleTimeString('fr-FR')}`
        );
        refresh();
      } else {
        setStatusMessage(res.error || 'Échec de la relance');
      }
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Erreur de relance');
    } finally {
      setIsActionPending(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Send className="h-4 w-4 text-primary" /> Boîte d&apos;envoi événementielle (Outbox)
            </h2>
            {statusBadge(metrics.status)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Supervision du dépilage transactionnel, surveillance des verrous et relance globale des échecs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {metrics.stuckProcessing > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUnlockStuck}
              disabled={isActionPending}
              className="gap-1.5 text-highlight border-highlight/40"
            >
              {isActionPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unlock className="h-3.5 w-3.5" />
              )}
              Débloquer {metrics.stuckProcessing} coincé{metrics.stuckProcessing > 1 ? 's' : ''}
            </Button>
          )}

          {metrics.failedTotal > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRetryAll}
              disabled={isActionPending}
              className="gap-1.5 text-foreground"
            >
              {isActionPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Relancer tous les échecs ({metrics.failedTotal})
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isPending}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {statusMessage && (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-xs text-foreground flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* ── Cartes métriques de profondeur ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-muted/15 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>En attente (QUEUED)</span>
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            {metrics.queuedTotal}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {metrics.queuedTotal > 0
              ? `Le plus ancien : ${formatDuration(metrics.oldestQueuedSeconds)}`
              : 'File entièrement dépilée'}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/15 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>En traitement (PROCESSING)</span>
            <Send className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            {metrics.processingTotal}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {metrics.stuckProcessing > 0 ? (
              <span className="text-destructive font-medium">
                {metrics.stuckProcessing} coincé(s) &gt; 10 min
              </span>
            ) : (
              'Aucun verrou fantôme détecté'
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/15 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Échecs totaux (FAILED)</span>
            <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
          </div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            {metrics.failedTotal}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {metrics.failed24h} échec{metrics.failed24h > 1 ? 's' : ''} sur 24h
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/15 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Livrés (SENT)</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          </div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            {metrics.sent24h}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Sur les 24 dernières heures
          </div>
        </div>
      </div>

      {/* ── Répartition par canal ── */}
      {metrics.channels.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border/70">
          <div className="text-xs font-medium text-muted-foreground">
            Répartition par canal de distribution
          </div>
          <div className="flex flex-wrap gap-2">
            {metrics.channels.map((ch) => (
              <div
                key={ch.channel}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs"
              >
                <Mail className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold text-foreground">{ch.channel}</span>
                <span className="text-muted-foreground">·</span>
                <span className="tabular-nums text-muted-foreground">
                  {ch.queued} en attente
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="tabular-nums text-foreground">
                  {ch.sent} livrés (24h)
                </span>
                {ch.failed > 0 && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="tabular-nums text-destructive font-medium">
                      {ch.failed} échecs
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
