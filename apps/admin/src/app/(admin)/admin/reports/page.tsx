// =====================================================================
// 🛡️ Page de file de modération — signalements de la communauté
// =====================================================================
// Queue des ModerationReport (pensées, articles, comptes) : aperçu de la
// cible, sévérité (nombre de signalements), et actions de modération
// (résoudre, ignorer, masquer, suspendre l'auteur).
// =====================================================================

import React from 'react';
import { getAdminReports } from '@/lib/admin-data';
import { ModerationQueue } from './components/moderation-queue';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { MetricChips } from '@/components/shell/MetricChips';

export default async function AdminReportsPage() {
  requireCapability(await getAdminIdentity(), 'admin.reports.read');
  const data = await getAdminReports();

  const serialized = data.items.map((r) => ({
    id: r.id,
    targetId: r.targetId,
    targetType: r.targetType,
    reason: r.reason,
    details: r.details,
    status: r.status,
    actionTaken: r.actionTaken,
    createdAt: r.createdAt,
    targetPreview: r.targetPreview,
    targetCount: r.targetCount,
    reporter: {
      id: r.reporter.id,
      name: r.reporter.name,
      username: r.reporter.username,
      logoUrl: r.reporter.logoUrl,
    },
  }));

  const pendingCount = serialized.filter((r) => r.status === 'pending').length;
  const resolvedCount = serialized.filter((r) => r.status === 'resolved').length;
  const dismissedCount = serialized.filter((r) => r.status === 'dismissed').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
            File de modération
          </h1>
          <p className="text-[12px] text-muted-foreground">
            Signalements de la communauté (pensées, articles, comptes) · masquage et suspension
            d’auteur.
          </p>
        </div>
        <MetricChips
          items={[
            {
              label: 'En attente',
              value: pendingCount,
              tone: pendingCount > 0 ? 'warn' : 'default',
            },
            {
              label: 'Résolus',
              value: resolvedCount,
              tone: 'default',
            },
            {
              label: 'Ignorés',
              value: dismissedCount,
              tone: 'default',
            },
            {
              label: 'Total',
              value: serialized.length,
              tone: 'default',
            },
          ]}
        />
      </div>

      <ModerationQueue initialItems={serialized} initialPending={data.pending} />
    </div>
  );
}
