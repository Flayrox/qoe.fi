// =====================================================================
// ⚖️ File des recours — contestations des mesures visant un compte
// =====================================================================
// L'ouverture d'un recours ne lève jamais rien : seule une décision
// overturned lève (verdict allow), upheld confirme. Statuts : open (à
// prendre), under_review (en cours), decided (tranché). Seule overturned
// lève la mesure — le reste trace.
// =====================================================================

import React from 'react';
import { getAdminAbuseAppeals } from '@/lib/admin-data';
import { AppealsQueue } from './components/appeals-queue';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { MetricChips } from '@/components/shell/MetricChips';

export default async function AdminAppealsPage() {
  requireCapability(await getAdminIdentity(), 'admin.appeals.read');
  const data = await getAdminAbuseAppeals();

  const openCount = data.items.filter((a) => a.status === 'open').length;
  const reviewCount = data.items.filter((a) => a.status === 'under_review').length;
  const decidedCount = data.items.filter((a) => a.status === 'decided').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">Recours</h1>
          <p className="text-[12px] text-muted-foreground">
            Contestations des sanctions visant un compte · confirmation ou levée pour faux positif.
          </p>
        </div>
        <MetricChips
          items={[
            {
              label: 'À traiter',
              value: openCount,
              tone: openCount > 0 ? 'warn' : 'default',
            },
            {
              label: 'En cours',
              value: reviewCount,
              tone: 'default',
            },
            {
              label: 'Tranchés',
              value: decidedCount,
              tone: 'default',
            },
            {
              label: 'Total',
              value: data.items.length,
              tone: 'default',
            },
          ]}
        />
      </div>

      <AppealsQueue initialItems={data.items} />
    </div>
  );
}
