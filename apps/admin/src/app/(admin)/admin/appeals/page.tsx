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
import { AppealsQueue } from './components/appeals-queue';

export default async function AdminAppealsPage() {
  const data = await getAdminAbuseAppeals();
  const openCount = data.items.filter((a) => a.status !== 'decided').length;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#EE4B2B] mb-2">
          <Scale className="w-4 h-4" />
          Administration Console
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Recours</h1>
          {openCount > 0 && (
            <span className="bg-highlight/15 text-highlight border border-highlight/40 px-2.5 py-1 rounded-full text-xs font-bold">
              {openCount} à traiter
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-2 text-sm max-w-2xl leading-relaxed">
          Les contestations des mesures visant un compte (y compris suspendu). Prendre en main,
          répondre, puis trancher : confirmer (la mesure était justifiée) ou infirmer (faux positif
          avéré — la mesure tombe).
        </p>
      </div>

      <AppealsQueue initialItems={data.items} />
    </div>
  );
}
