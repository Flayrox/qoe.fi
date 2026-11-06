import Link from 'next/link';
import { Cog } from 'lucide-react';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import { apiOnlyRoutes, coverageRatio } from '@/lib/admin-coverage';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';

export const dynamic = 'force-dynamic';

// =====================================================================
// ⚙️ /admin/system — la méta de la console, hors exploitation
// =====================================================================
// La couverture des routes n'aide personne à trancher un dossier : elle vit
// ici, pas sur le tableau de bord. Chaque route API-only garde sa raison
// écrite — c'est le manifeste que le test Go relit.
// =====================================================================

export default async function AdminSystemPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.dashboard.read');

  const coverage = coverageRatio();
  const orphans = apiOnlyRoutes();

  return (
    <div className="space-y-4">
      <QueuePageHeader
        icon={<Cog className="size-4" />}
        title="Système"
        badge={`${coverage.percent} % couvert`}
        description="Couverture des routes de l’API admin par un écran de la console. Les routes sans écran sont assumées, avec leur raison."
      />

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
        <div className="flex flex-col gap-0 bg-card px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Routes classées
          </span>
          <span className="text-lg font-semibold tabular-nums">{coverage.total}</span>
        </div>
        <div className="flex flex-col gap-0 bg-card px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Portées par un écran
          </span>
          <span className="text-lg font-semibold tabular-nums">{coverage.covered}</span>
        </div>
        <div className="flex flex-col gap-0 bg-card px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            API-only assumées
          </span>
          <span className="text-lg font-semibold tabular-nums">{orphans.length}</span>
        </div>
      </section>

      <section className="space-y-1.5">
        <h2 className="text-[13px] font-semibold">Routes sans écran</h2>
        <Table aria-label="Routes sans écran" size="xs" className="rounded-md border-border/70">
          <TableHeader>
            <TableColumn id="route" isRowHeader width={320}>
              Route
            </TableColumn>
            <TableColumn id="reason">Raison</TableColumn>
          </TableHeader>
          <TableBody items={orphans} emptyState="Toutes les routes ont un écran.">
            {(orphan) => (
              <TableRow id={orphan.key}>
                <TableCell className="text-foreground">{orphan.key}</TableCell>
                <TableCell className="text-muted-foreground">{orphan.reason}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <p className="text-[11px] text-muted-foreground">
        Le manifeste vit dans{' '}
        <span className="text-foreground">apps/admin/src/lib/admin-coverage.ts</span> ; le test Go
        refuse une route non classée.{' '}
        <Link href="/admin/health" className="font-medium text-[#EE4B2B] hover:underline">
          Voir la santé plateforme
        </Link>
        .
      </p>
    </div>
  );
}
