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
import { UnavailableNotice } from '@/components/shell/UnavailableNotice';

export default async function AdminAppealsPage() {
  requireCapability(await getAdminIdentity(), 'admin.appeals.read');
  // Une lecture en échec n'est pas « aucun recours » : les compteurs ne
  // s'affichent que si la file a été lue, sinon l'écran le dit.
  const appeals = await getAdminAbuseAppeals();
  const items = appeals.ok ? appeals.data.items : [];

  const openCount = items.filter((a) => a.status === 'open').length;
  const reviewCount = items.filter((a) => a.status === 'under_review').length;
  const decidedCount = items.filter((a) => a.status === 'decided').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">Recours</h1>
          <p className="text-[12px] text-muted-foreground">
            Contestations des sanctions visant un compte · confirmation ou levée pour faux positif.
          </p>
        </div>
        {appeals.ok ? (
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
                value: items.length,
                tone: 'default',
              },
            ]}
          />
        ) : (
          <UnavailableNotice what="Les recours" />
        )}
      </div>

      <AppealsQueue initialItems={items} />
    </div>
  );
}
