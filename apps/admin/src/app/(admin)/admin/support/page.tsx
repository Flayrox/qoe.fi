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
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { SupportQueue } from './components/support-queue';

export default async function AdminSupportPage() {
  const [tickets, metrics] = await Promise.all([
    getAdminSupportTickets(),
    getAdminSupportMetrics(),
  ]);
  const openCount = tickets.items.filter((t) => t.status !== 'closed').length;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <QueuePageHeader
        icon={<LifeBuoy className="w-4 h-4" />}
        title="Support"
        badge={openCount > 0 ? `${openCount} à traiter` : null}
        description={
          <>
            Les dossiers des utilisateurs : prendre en main, répondre, clore en traçant. Un dossier
            ouvert par motif — le reste s&apos;écrit dedans.{' '}
            <a
              href="/admin/support/articles"
              className="underline underline-offset-2 font-semibold"
            >
              Gérer les articles d&apos;aide
            </a>
            .
          </>
        }
      />

      <SupportQueue initialItems={tickets.items} metrics={metrics} />
    </div>
  );
}
