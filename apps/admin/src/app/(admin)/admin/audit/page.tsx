import { ScrollText } from 'lucide-react';
import { getAdminAuditLog } from '@/lib/admin-data';
import { AuditLogClient } from './AuditLogClient';

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
  const entries = await getAdminAuditLog(100);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <ScrollText className="h-4 w-4" /> Admin audit log
        </div>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground">
          Journal d&apos;audit
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Qui, quand, quoi — chaque bascule de permissions API, chaque coupure du contrôle
          d&apos;accès global et chaque action de modération est tracée ici. Les écritures sont
          pilotées par le flag <span className="font-mono text-xs">admin-audit-log</span> (Feature
          Flags).
        </p>
      </div>

      <AuditLogClient initialEntries={entries} />
    </div>
  );
}
