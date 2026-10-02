'use client';

// =====================================================================
// 🗓️ access-reviews-section — cycle de vie et revue périodique (Phase 8)
// =====================================================================
// Affiche la synthèse des accès en direct, les alertes d'expiration
// imminente (< 30 jours), les rôles échus gelés automatiquement, et permet
// aux administrateurs autorisés de sceller ou forcer l'instantané mensuel.
// =====================================================================

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Users,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { triggerAccessReviewSnapshotAction } from '@/lib/admin-access-actions';
import { useStaffAction } from '@/components/queue/useStaffAction';
import { StatusPill } from '@/components/queue/StatusPill';
import type { AccessReviewsData, AccessGrantRow } from '@/lib/admin-access-data';

interface AccessReviewsSectionProps {
  data: AccessReviewsData;
  canGrant: boolean;
}

const fmtDate = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

export function AccessReviewsSection({ data, canGrant }: AccessReviewsSectionProps) {
  const router = useRouter();
  const { loadingId, run } = useStaffAction<string>();
  const [showHistory, setShowHistory] = useState(false);
  const [snapshotReason, setSnapshotReason] = useState('');
  const [isSnapshotting, setIsSnapshotting] = useState(false);

  const current = data.current;
  const history = data.items;

  const currentPeriod = current?.period ?? new Date().toISOString().slice(0, 7);

  const handleSnapshot = async () => {
    const res = await run(
      'snapshot',
      () =>
        triggerAccessReviewSnapshotAction({
          period: currentPeriod,
          force: true,
          reason: snapshotReason.trim() || 'Scellement périodique manuel',
        }),
      {
        ok: 'Instantané mensuel des accès scellé avec succès.',
      }
    );
    if (res?.ok) {
      setIsSnapshotting(false);
      setSnapshotReason('');
      router.refresh();
    }
  };

  return (
    <section className="space-y-6 pt-4 border-t border-border" data-testid="access-reviews-section">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Revue périodique & cycle de vie</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Surveillance continue des habilitations : instantanés mensuels immuables, alertes
            d’échéances et gel automatique des rôles échus.
          </p>
        </div>

        {canGrant && (
          <button
            type="button"
            onClick={() => setIsSnapshotting(true)}
            disabled={loadingId === 'snapshot'}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            data-testid="access-snapshot-trigger"
          >
            <Camera className="w-3.5 h-3.5" />
            Sceller l’instantané ({currentPeriod})
          </button>
        )}
      </div>

      {/* Formulaire de scellement si actif */}
      {isSnapshotting && (
        <div className="p-4 rounded-2xl border border-primary/20 bg-primary/5 space-y-3">
          <div className="text-xs font-semibold flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" />
            Sceller manuellement l’instantané pour {currentPeriod}
          </div>
          <p className="text-xs text-muted-foreground">
            Un motif est requis pour consigner ce scellement dans le journal d’audit d’accès.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={snapshotReason}
              onChange={(e) => setSnapshotReason(e.target.value)}
              placeholder="Motif de la revue (ex. : Audit trimestriel Q4 2026)…"
              className="text-xs px-3 py-2 rounded-xl border border-border bg-background outline-none flex-1"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSnapshot}
                disabled={loadingId === 'snapshot' || snapshotReason.trim().length < 5}
                className="text-xs font-bold px-3 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                Confirmer le scellement
              </button>
              <button
                type="button"
                onClick={() => setIsSnapshotting(false)}
                className="text-xs px-3 py-2 rounded-xl border border-border hover:bg-muted cursor-pointer"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4 Tuiles KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl border border-border bg-card/50 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Rôles actifs</span>
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold">{current?.activeGrants ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">habilitations actives</div>
        </div>

        <div className="p-4 rounded-2xl border border-border bg-card/50 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Échéance &lt; 30j</span>
            <Clock
              className={`w-4 h-4 ${(current?.expiringSoon ?? 0) > 0 ? 'text-highlight' : 'text-muted-foreground'}`}
            />
          </div>
          <div className="text-2xl font-bold flex items-center gap-2">
            <span>{current?.expiringSoon ?? 0}</span>
            {(current?.expiringSoon ?? 0) > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-highlight/15 text-highlight border border-highlight/30">
                Action requise
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">à renouveler bientôt</div>
        </div>

        <div className="p-4 rounded-2xl border border-border bg-card/50 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Rôles échus</span>
            <ShieldAlert className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold text-muted-foreground">
            {current?.expiredGrants ?? 0}
          </div>
          <div className="text-[11px] text-muted-foreground">gelés à la lecture</div>
        </div>

        <div className="p-4 rounded-2xl border border-border bg-card/50 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Staff total</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold">{current?.totalStaff ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">personnes habilitées</div>
        </div>
      </div>

      {/* Alerte si des échéances sont imminentes */}
      {current?.expiringList && current.expiringList.length > 0 && (
        <div className="p-4 rounded-2xl border border-highlight/30 bg-highlight/10 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-highlight">
            <Clock className="w-4 h-4" />
            <span>Rôles expirant dans les 30 prochains jours ({current.expiringList.length})</span>
          </div>
          <div className="divide-y divide-border/40 text-xs">
            {current.expiringList.map((grant: AccessGrantRow) => (
              <div
                key={`${grant.userId}:${grant.roleKey}`}
                className="py-2 flex items-center justify-between gap-4"
              >
                <div>
                  <span className="font-semibold">
                    {grant.name || grant.username || grant.email}
                  </span>
                  <span className="text-muted-foreground ml-2">({grant.email})</span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone="hot">{grant.roleLabel || grant.roleKey}</StatusPill>
                  <span className="text-muted-foreground">
                    Expire le {fmtDate(grant.expiresAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historique des revues archivées */}
      {history.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            {showHistory ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            <span>Historique des revues mensuelles scellées ({history.length})</span>
          </button>

          {showHistory && (
            <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden bg-card/30">
              {history.map((rev) => (
                <div
                  key={rev.id}
                  className="p-3 text-xs flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span className="font-bold">{rev.period}</span>
                    <span className="text-muted-foreground text-[11px]">
                      scellé le {fmtDate(rev.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground text-[11px]">
                    <span>{rev.report.activeGrants} actifs</span>
                    <span>{rev.report.expiringSoon} imminents</span>
                    <span>{rev.report.expiredGrants} échus</span>
                    <span>{rev.report.totalStaff} staff</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
