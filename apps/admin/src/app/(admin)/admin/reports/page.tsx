// =====================================================================
// 🛡️ Page de file de modération — signalements de la communauté
// =====================================================================
// Queue des ModerationReport (pensées, articles, comptes) : aperçu de la
// cible, sévérité (nombre de signalements), et actions de modération
// (résoudre, ignorer, masquer, suspendre l'auteur).
// =====================================================================

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { getAdminReports } from '@/lib/admin-data';
import { ModerationQueue } from './components/moderation-queue';

export default async function AdminReportsPage() {
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
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#EE4B2B] mb-2">
          <ShieldAlert className="w-4 h-4" />
          Administration Console
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">File de modération</h1>
          {data.pending > 0 && (
            <span className="bg-highlight/15 text-highlight border border-highlight/40 px-2.5 py-1 rounded-full text-xs font-bold">
              {data.pending} en attente
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-2 text-sm max-w-2xl leading-relaxed">
          Les signalements de la communauté (pensées, articles, comptes). Masquez un contenu pour le
          retirer des flux, ou suspendez l'auteur directement. Toutes les actions sont réversibles.
        </p>
      </div>

      <ModerationQueue initialItems={serialized} initialPending={data.pending} />
    </div>
  );
}
