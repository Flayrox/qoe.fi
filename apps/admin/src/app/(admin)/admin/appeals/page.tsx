// =====================================================================
// ⚖️ File des recours — contestations des mesures visant un compte
// =====================================================================
// L'ouverture d'un recours ne lève jamais rien : seule une décision
// overturned lève (verdict allow), upheld confirme. Statuts : open (à
// prendre), under_review (en cours), decided (tranché). Seule overturned
// lève la mesure — le reste trace (tranche 6, amorce).
// =====================================================================

import React from 'react';
import { Scale } from 'lucide-react';
import { getAdminAbuseAppeals } from '@/lib/admin-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { AppealsQueue } from './components/appeals-queue';

export default async function AdminAppealsPage() {
  const data = await getAdminAbuseAppeals();
  const openCount = data.items.filter((a) => a.status !== 'decided').length;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <QueuePageHeader
        icon={<Scale className="w-4 h-4" />}
        title="Recours"
        badge={openCount > 0 ? `${openCount} à traiter` : null}
        description={
          <>
            Les contestations des mesures visant un compte (y compris suspendu). Prendre en main,
            répondre, puis trancher : confirmer (la mesure était justifiée) ou infirmer (faux
            positif avéré — la mesure tombe).
          </>
        }
      />

      <AppealsQueue initialItems={data.items} />
    </div>
  );
}
