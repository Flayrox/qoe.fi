// =====================================================================
// 🎫 File support — dossiers hors recours (tranche 6)
// =====================================================================
// Compte perdu/restreint, contenu, API, import, livraison, signalement,
// autre. L'ouverture n'a jamais rien changé ; la clôture ne lève ni
// suspension ni permission (les actes passent par les chemins existants).
// On ne clôt jamais son propre dossier (conflit d'intérêts refusé côté Go).
// =====================================================================

import React from 'react';
import { LifeBuoy } from 'lucide-react';
import { getAdminSupportTickets, getAdminSupportMetrics } from '@/lib/admin-data';
import { SupportQueue } from './components/support-queue';

export default async function AdminSupportPage() {
  const [tickets, metrics] = await Promise.all([
    getAdminSupportTickets(),
    getAdminSupportMetrics(),
  ]);
  const openCount = tickets.items.filter((t) => t.status !== 'closed').length;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#EE4B2B] mb-2">
          <LifeBuoy className="w-4 h-4" />
          Administration Console
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Support</h1>
          {openCount > 0 && (
            <span className="bg-highlight/15 text-highlight border border-highlight/40 px-2.5 py-1 rounded-full text-xs font-bold">
              {openCount} à traiter
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-2 text-sm max-w-2xl leading-relaxed">
          Les dossiers des utilisateurs : prendre en main, répondre, clore en traçant. Un dossier
          ouvert par motif — le reste s&apos;écrit dedans.
        </p>
      </div>

      <SupportQueue initialItems={tickets.items} metrics={metrics} />
    </div>
  );
}
