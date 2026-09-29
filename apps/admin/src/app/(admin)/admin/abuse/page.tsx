// =====================================================================
// 🛡️ File de revue anti-abus — verdicts automatiques, clôture humaine
// =====================================================================
// Dossiers du noyau (rafales, essaims, raids) : faits récents en contexte,
// codes de raison, et clôture tracée — classer (faux positif avéré) ou
// escalader (l'acte passe par la modération existante). Jamais de sanction
// automatique ici : que des verdicts expliqués (fiche 06 §8).
// =====================================================================

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { getAdminAbuseDecisions } from '@/lib/admin-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { AbuseQueue } from './components/abuse-queue';

export default async function AdminAbusePage() {
  const data = await getAdminAbuseDecisions();

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <QueuePageHeader
        icon={<ShieldAlert className="w-4 h-4" />}
        title="Revue anti-abus"
        badge={
          data.total > 0
            ? `${data.total} dossier${data.total > 1 ? 's' : ''} ouvert${data.total > 1 ? 's' : ''}`
            : null
        }
        description={
          <>
            Les verdicts automatiques non triviaux (rafales, essaims, raids). Un dossier ouvert
            n&apos;est pas une preuve : classez sans suite ou escaladez, en traçant le motif.
            L&apos;acte (suspension, limitation…) passe par la modération existante.
          </>
        }
      />

      <AbuseQueue initialItems={data.items} />
    </div>
  );
}
