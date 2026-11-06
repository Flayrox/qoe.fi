// =====================================================================
// 🎫 File support — dossiers hors recours (tranche 6)
// =====================================================================
// Compte perdu/restreint, contenu, API, import, livraison, signalement,
// autre. L'ouverture n'a jamais rien changé ; la clôture ne lève ni
// suspension ni permission (les actes passent par les chemins existants).
// On ne clôt jamais son propre dossier (conflit d'intérêts refusé côté Go).
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { getAdminSupportTickets, getAdminSupportMetrics } from '@/lib/admin-data';
import { SupportQueue } from './components/support-queue';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { MetricChips } from '@/components/shell/MetricChips';

export default async function AdminSupportPage() {
  requireCapability(await getAdminIdentity(), 'admin.support.read');
  const [tickets, metrics] = await Promise.all([
    getAdminSupportTickets(),
    getAdminSupportMetrics(),
  ]);
  const openCount = tickets.items.filter((t) => t.status !== 'closed').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight text-foreground">Support</h1>
            <span className="text-muted-foreground/60">·</span>
            <Link
              href="/admin/support/articles"
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Gérer les articles d’aide
            </Link>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Dossiers d’assistance utilisateur (accès, imports, livraisons, modération) · prise en
            main et clôture.
          </p>
        </div>
        <MetricChips
          items={[
            {
              label: 'Ouverts',
              value: metrics?.open ?? openCount,
              tone: (metrics?.open ?? openCount) > 0 ? 'warn' : 'default',
            },
            {
              label: 'Non assignés',
              value: metrics?.unassignedOpen ?? 0,
              tone: (metrics?.unassignedOpen ?? 0) > 0 ? 'warn' : 'default',
            },
            {
              label: 'En cours',
              value: metrics?.under_review ?? 0,
              tone: 'default',
            },
            {
              label: 'Plus ancien',
              value: `${metrics?.oldestOpenAgeHours ?? 0}h`,
              tone: (metrics?.oldestOpenAgeHours ?? 0) > 48 ? 'danger' : 'default',
            },
            {
              label: 'Délai moyen (30j)',
              value: `${metrics?.avgCloseHours30d ?? 0}h`,
              tone: 'default',
            },
            {
              label: 'Clos (30j)',
              value: metrics?.closed30d ?? 0,
              tone: 'default',
            },
          ]}
        />
      </div>

      <SupportQueue initialItems={tickets.items} metrics={metrics} />
    </div>
  );
}
