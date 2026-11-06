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

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-[17px] font-semibold tracking-tight text-foreground">
            File de modération
          </h1>
          {data.pending > 0 && (
            <span className="bg-highlight/15 text-highlight border border-highlight/40 px-2.5 py-1 rounded-full text-xs font-bold">
              {data.pending} en attente
            </span>
          )}
        </div>
        <p className="mt-1 max-w-3xl text-[12px] leading-5 text-muted-foreground">
          Les signalements de la communauté (pensées, articles, comptes). Masquez un contenu pour le
          retirer des flux, ou suspendez l'auteur directement. Toutes les actions sont réversibles.
        </p>
      </div>

      <ModerationQueue initialItems={serialized} initialPending={data.pending} />
    </div>
  );
}
