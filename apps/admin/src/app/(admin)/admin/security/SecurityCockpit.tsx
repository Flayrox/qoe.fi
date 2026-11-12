'use client';

// =====================================================================
// SecurityCockpit — vue PolicyV3 (30j) et recalcul Trust à chaud (Lot 5)
// =====================================================================

import React, { useMemo, useState } from 'react';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/ui/input';
import { CopyableId } from '@/components/shell/CopyableId';
import { DataGrid, type GridColumn } from '@/components/shell/DataGrid';
import { recomputeUserTrustAction } from '@/lib/admin-security-actions';
import type {
  PolicyV3RuleStat,
  SecurityOverview,
  SecurityTopSubject,
  TrustRecomputeResult,
} from '@/lib/admin-security-data';
import { attemptWithStepUp, notifyActionFailure } from '@/lib/authz-feedback';

interface SecurityCockpitProps {
  overview: SecurityOverview;
  canDecide: boolean;
}

interface PolicyV3Row extends PolicyV3RuleStat {
  id: string;
}

interface TopSubjectRow extends SecurityTopSubject {
  id: string;
}

const RULE_LABELS: Record<string, string> = {
  'follow-ring': 'Anneau de follows mutuels',
  'follow-churn': 'Churn de follows agressif',
  'comment-swarm': 'Raid de commentaires',
  'dm-cold-burst': 'Rafale de DM à froid',
  'coordinated-spam': 'Spam coordonné SimHash',
  'subnet-multi-account': 'Ferme multi-comptes sous-réseau',
};

const RESULT_LABELS: Record<string, string> = {
  allow: 'Autorisé',
  slow: 'Ralenti',
  challenge: 'Vérification',
  needs_review: 'Revue requise',
  limit_distribution: 'Distribution limitée',
  pause_sending: 'Envois en pause',
  suspend: 'Suspendu',
};

export function SecurityCockpit({ overview, canDecide }: SecurityCockpitProps) {
  const [targetUserId, setTargetUserId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [auditStatus, setAuditStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [trustResult, setTrustResult] = useState<TrustRecomputeResult | null>(null);

  const policyRows = useMemo<PolicyV3Row[]>(
    () =>
      overview.policyV3.map((item) => ({
        ...item,
        id: item.rule,
      })),
    [overview.policyV3]
  );

  const subjectRows = useMemo<TopSubjectRow[]>(
    () =>
      overview.metrics.topSubjects.map((item) => ({
        ...item,
        id: `${item.subjectType}:${item.subjectId}`,
      })),
    [overview.metrics.topSubjects]
  );

  const policyColumns = useMemo<GridColumn<PolicyV3Row>[]>(
    () => [
      {
        id: 'rule',
        header: 'Règle PolicyV3',
        sort: { kind: 'text', value: (row) => row.rule },
        cell: (row) => (
          <span className="font-medium text-foreground">{RULE_LABELS[row.rule] ?? row.rule}</span>
        ),
      },
      {
        id: 'reason',
        header: 'Code raison',
        sort: { kind: 'text', value: (row) => row.reason },
        cell: (row) => <span className="text-muted-foreground">{row.reason}</span>,
      },
      {
        id: 'count',
        header: 'Déclenchements (30j)',
        align: 'right',
        sort: { kind: 'number', value: (row) => row.count },
        cell: (row) => <span className="tabular-nums font-medium">{row.count}</span>,
      },
    ],
    []
  );

  const subjectColumns = useMemo<GridColumn<TopSubjectRow>[]>(
    () => [
      {
        id: 'subjectType',
        header: 'Type',
        sort: { kind: 'text', value: (row) => row.subjectType },
        cell: (row) => <span className="text-muted-foreground">{row.subjectType}</span>,
      },
      {
        id: 'subjectId',
        header: 'Sujet',
        sort: { kind: 'text', value: (row) => row.subjectId },
        cell: (row) => <CopyableId id={row.subjectId} />,
      },
      {
        id: 'signals',
        header: 'Signaux',
        align: 'right',
        sort: { kind: 'number', value: (row) => row.signals },
        cell: (row) => <span className="tabular-nums font-medium">{row.signals}</span>,
      },
      {
        id: 'lastResult',
        header: 'Dernier verdict',
        sort: { kind: 'text', value: (row) => row.lastResult },
        cell: (row) => (
          <span className="text-foreground">{RESULT_LABELS[row.lastResult] ?? row.lastResult}</span>
        ),
      },
    ],
    []
  );

  const handleRecompute = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = targetUserId.trim();
    if (!trimmed) {
      setErrorMessage('Identifiant utilisateur requis.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setAuditStatus(null);

    const outcome = await attemptWithStepUp(() => recomputeUserTrustAction(trimmed), {
      reason: 'Recalculer le score Trust utilisateur',
    });

    setIsSubmitting(false);

    if (!outcome.success) {
      notifyActionFailure(outcome, 'Impossible de recalculer le score Trust.');
      setErrorMessage(outcome.error ?? 'Impossible de recalculer le score Trust.');
      return;
    }

    setTrustResult(outcome.data);
    const now = new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setAuditStatus(`Audité · à ${now}`);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-foreground">
            Règles PolicyV3 (30 derniers jours)
          </h2>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            Revues humaines : {overview.metrics.humanReviews} · Classements :{' '}
            {overview.metrics.humanDismissed}
          </span>
        </div>
        <DataGrid
          ariaLabel="Ventilation des règles PolicyV3 sur 30 jours"
          rows={policyRows}
          columns={policyColumns}
          initialSort={{ column: 'count', direction: 'descending' }}
          emptyState="Aucun signal PolicyV3 enregistré sur la fenêtre."
        />
      </section>

      <section className="space-y-3 rounded-md border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold text-foreground">Recalcul Trust à chaud</h2>
            <p className="text-[11.5px] text-muted-foreground">
              Invalide le cache Redis, réévalue le score en direct et trace l’acte dans le journal
              d’audit.
            </p>
          </div>
          {auditStatus ? (
            <span className="text-[11.5px] font-medium text-muted-foreground" role="status">
              {auditStatus}
            </span>
          ) : null}
        </div>

        <form onSubmit={handleRecompute} className="flex flex-wrap items-center gap-2">
          <div className="min-w-[260px] flex-1">
            <Input
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              placeholder="UUID utilisateur (ex. 00000000-0000-0000-0000-000000000000)"
              aria-label="Identifiant utilisateur pour recalcul Trust"
              disabled={!canDecide || isSubmitting}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={!canDecide || isSubmitting}
            className="bg-[#EE4B2B] text-white hover:bg-[#EE4B2B]/90"
          >
            {isSubmitting ? 'Recalcul...' : 'Recalculer Trust'}
          </Button>
        </form>

        {!canDecide ? (
          <p className="text-[11.5px] text-muted-foreground">
            Lecture seule : la capacité admin.abuse.decide est requise pour recalculer un profil.
          </p>
        ) : null}

        {errorMessage ? (
          <p className="text-[12px] text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {trustResult ? (
          <div className="grid gap-2 border-t border-border pt-3 text-[12px] sm:grid-cols-4">
            <div>
              <div className="text-[11px] text-muted-foreground">Score / Palier</div>
              <div className="font-semibold text-foreground tabular-nums">
                {trustResult.score} / 100 · {trustResult.tier}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Ancienneté</div>
              <div className="font-medium text-foreground tabular-nums">
                {trustResult.accountAgeDays} j
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Facteurs vérifiés</div>
              <div className="font-medium text-foreground">
                Téléphone : {trustResult.phoneVerified ? 'oui' : 'non'} · MFA :{' '}
                {trustResult.mfaEnabled ? 'oui' : 'non'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Abonnés / Sous-réseau</div>
              <div className="font-medium text-foreground tabular-nums">
                {trustResult.effectiveFollowers} effectifs · {trustResult.subnetAccountCount}{' '}
                comptes/24
              </div>
            </div>
            <div className="sm:col-span-4">
              <div className="text-[11px] text-muted-foreground">Signaux retenus</div>
              <div className="text-foreground">
                {trustResult.reasons.length > 0 ? trustResult.reasons.join(' · ') : 'Aucun'}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {subjectRows.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold text-foreground">
            Sujets chauds (30 derniers jours)
          </h2>
          <DataGrid
            ariaLabel="Sujets les plus signalés sur 30 jours"
            rows={subjectRows}
            columns={subjectColumns}
            initialSort={{ column: 'signals', direction: 'descending' }}
          />
        </section>
      ) : null}
    </div>
  );
}
