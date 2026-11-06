// =====================================================================
// 🤝 /admin/approvals — la file des doubles validations (Phase 8)
// =====================================================================
// Un acte N3 n'est exécuté que si une SECONDE personne autorisée l'a approuvé
// pour CETTE cible. Cet écran est l'endroit où cette seconde personne dit oui
// (ou non), avec un motif écrit.
//
// Ce qu'on y perd volontairement : aucun bouton « tout approuver ». Chaque
// décision est individuelle, nominative et tracée — une validation à deux qui
// se donne en bloc ne vaut pas mieux qu'une signature unique.
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { getApprovals, isApprovalOpen } from '@/lib/admin-approval-data';
import { ApprovalsQueue } from './components/approvals-queue';
import { MetricChips } from '@/components/shell/MetricChips';

export const dynamic = 'force-dynamic';

export default async function AdminApprovalsPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.legal.read');

  const items = await getApprovals();
  const openCount = items.filter((item) => isApprovalOpen(item)).length;
  const approvedCount = items.filter(
    (item) => item.status === 'approved' || item.status === 'consumed'
  ).length;
  const rejectedCount = items.filter((item) => item.status === 'rejected').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
              Doubles validations
            </h1>
            <span className="text-muted-foreground/60">·</span>
            <Link
              href="/admin/legal"
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Contenu juridique
            </Link>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Actes irréversibles soumis à la règle de la seconde paire d’yeux (valable 72 h) ·
            décisions individuelles tracées.
          </p>
        </div>
        <MetricChips
          items={[
            {
              label: 'En attente',
              value: openCount,
              tone: openCount > 0 ? 'warn' : 'default',
            },
            {
              label: 'Approuvées',
              value: approvedCount,
              tone: 'default',
            },
            {
              label: 'Refusées',
              value: rejectedCount,
              tone: 'default',
            },
            {
              label: 'Total',
              value: items.length,
              tone: 'default',
            },
          ]}
        />
      </div>

      <ApprovalsQueue initialItems={items} currentUserId={identity?.userId ?? ''} />
    </div>
  );
}
