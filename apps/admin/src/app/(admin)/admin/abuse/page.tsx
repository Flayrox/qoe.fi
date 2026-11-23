// =====================================================================
// 🛡️ File de revue anti-abus — verdicts automatiques, clôture humaine
// =====================================================================
// Dossiers du noyau (rafales, essaims, raids) : faits récents en contexte,
// codes de raison, et clôture tracée — classer (faux positif avéré) ou
// escalader (l'acte passe par la modération existante). Jamais de sanction
// automatique ici : que des verdicts expliqués.
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { getAdminAbuseDecisions } from '@/lib/admin-data';
import { AbuseQueue } from './components/abuse-queue';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { MetricChips } from '@/components/shell/MetricChips';
import { UnavailableNotice } from '@/components/shell/UnavailableNotice';

export default async function AdminAbusePage() {
  requireCapability(await getAdminIdentity(), 'admin.abuse.read');
  // File illisible : aucun compteur, et l'écran le dit — « 0 dossier » se
  // lirait comme « rien à revoir », ce qui n'a pas été mesuré.
  const decisions = await getAdminAbuseDecisions();
  const items = decisions.ok ? decisions.data.items : [];

  const autoCount = items.filter((a) => a.decidedBy === 'auto').length;
  const humanCount = items.filter((a) => a.decidedBy === 'human').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
            Revue anti-abus
          </h1>
          <p className="text-[12px] text-muted-foreground">
            Verdicts automatiques non triviaux (rafales, essaims, raids) · classement sans suite ou
            escalade tracée.{' '}
            <Link href="/admin/security" className="underline hover:text-foreground">
              Cockpit sécurité &amp; Trust
            </Link>
            .
          </p>
        </div>
        {decisions.ok ? (
          <MetricChips
            items={[
              {
                label: 'Dossiers ouverts',
                value: items.length,
                tone: items.length > 0 ? 'warn' : 'default',
              },
              {
                label: 'Automate',
                value: autoCount,
                tone: 'default',
              },
              {
                label: 'Humain',
                value: humanCount,
                tone: 'default',
              },
            ]}
          />
        ) : (
          <UnavailableNotice what="La file anti-abus" />
        )}
      </div>

      <AbuseQueue initialItems={items} />
    </div>
  );
}
