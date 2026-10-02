// =====================================================================
// 🧾 /admin/audit — qui a fait quoi, sous quelle capacité, sous quel mode
// =====================================================================
// L'écran répond en moins d'une minute aux deux questions d'un incident :
// « qui a fait ça ? » (filtres acteur / capacité / cible / période / action) et
// « qu'est-ce qui a été refusé ? » (lien vers le journal des décisions).
//
// Le mode d'autorisation est affiché EN PERMANENCE quand il est en observation :
// lire un journal de refus sans savoir qu'ils ne sont pas encore appliqués
// conduit exactement aux mauvaises conclusions.
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { ScrollText } from 'lucide-react';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { getAuditLog } from '@/lib/admin-audit-data';
import { AuditLogClient } from './AuditLogClient';

export const dynamic = 'force-dynamic';

interface AuditPageProps {
  searchParams: Promise<{
    actor?: string;
    capability?: string;
    action?: string;
    target?: string;
    since?: string;
    until?: string;
  }>;
}

export default async function AdminAuditPage({ searchParams }: AuditPageProps) {
  const params = await searchParams;
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.audit.read');

  const filters = {
    actor: params.actor ?? '',
    capability: params.capability ?? '',
    action: params.action ?? '',
    target: params.target ?? '',
    since: params.since ?? '',
    until: params.until ?? '',
    limit: 200,
  };
  const { items, mode } = await getAuditLog(filters);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <ScrollText className="h-4 w-4" /> Audit de la console
        </div>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground">
          Journal d&apos;audit
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Qui a fait quoi, sous quelle capacité, avec quel motif — et à quelle heure. Les mouvements
          de droits sont tracés même quand le flag{' '}
          <span className="font-mono text-xs">admin-audit-log</span> est éteint : une trace
          optionnelle n&apos;est pas une trace.{' '}
          <Link href="/admin/access/decisions" className="underline">
            Voir les décisions d&apos;autorisation et les refus
          </Link>
          .
        </p>
      </div>

      <AuditLogClient entries={items} mode={mode} filters={filters} />
    </div>
  );
}
