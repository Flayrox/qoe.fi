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

export default async function AdminAbusePage() {
  requireCapability(await getAdminIdentity(), 'admin.abuse.read');
  const data = await getAdminAbuseDecisions();

  const autoCount = data.items.filter((a) => a.decidedBy === 'auto').length;
  const humanCount = data.items.filter((a) => a.decidedBy === 'human').length;

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
        <MetricChips
          items={[
            {
              label: 'Dossiers ouverts',
              value: data.items.length,
              tone: data.items.length > 0 ? 'warn' : 'default',
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
      </div>

      <AbuseQueue initialItems={data.items} />
    </div>
  );
}
