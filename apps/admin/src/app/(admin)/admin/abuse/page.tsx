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
import { AbuseQueue } from './components/abuse-queue';

export default async function AdminAbusePage() {
  const data = await getAdminAbuseDecisions();

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#EE4B2B] mb-2">
          <ShieldAlert className="w-4 h-4" />
          Administration Console
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Revue anti-abus</h1>
          {data.total > 0 && (
            <span className="bg-highlight/15 text-highlight border border-highlight/40 px-2.5 py-1 rounded-full text-xs font-bold">
              {data.total} dossier{data.total > 1 ? 's' : ''} ouvert{data.total > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-2 text-sm max-w-2xl leading-relaxed">
          Les verdicts automatiques non triviaux (rafales, essaims, raids). Un dossier ouvert
          n&apos;est pas une preuve : classez sans suite ou escaladez, en traçant le motif.
          L&apos;acte (suspension, limitation…) passe par la modération existante.
        </p>
      </div>

      <AbuseQueue initialItems={data.items} />
    </div>
  );
}
