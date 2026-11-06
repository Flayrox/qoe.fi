import Link from 'next/link';
import { Cog } from 'lucide-react';
import { apiOnlyRoutes, coverageRatio } from '@/lib/admin-coverage';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import {
  AdminTable,
  AdminTBody,
  AdminTd,
  AdminTh,
  AdminTHead,
  AdminTr,
} from '@/components/shell/AdminTable';

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
    <div className="space-y-5">
      <QueuePageHeader
        icon={<Cog className="size-4" />}
        title="Système"
        badge={`${coverage.percent} % couvert`}
        description="Couverture des routes de l’API admin par un écran de la console. Les routes sans écran sont assumées, avec leur raison."
      />

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        <div className="flex flex-col gap-0.5 bg-card px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Routes classées
          </span>
          <span className="text-xl font-semibold tabular-nums">{coverage.total}</span>
        </div>
        <div className="flex flex-col gap-0.5 bg-card px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Portées par un écran
          </span>
          <span className="text-xl font-semibold tabular-nums">{coverage.covered}</span>
        </div>
        <div className="flex flex-col gap-0.5 bg-card px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            API-only assumées
          </span>
          <span className="text-xl font-semibold tabular-nums">{orphans.length}</span>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold">Routes sans écran</h2>
        <AdminTable minWidth="680px">
          <AdminTHead>
            <tr>
              <AdminTh>Route</AdminTh>
              <AdminTh>Raison</AdminTh>
            </tr>
          </AdminTHead>
          <AdminTBody>
            {orphans.length === 0 ? (
              <tr className="border-t border-border/60">
                <td colSpan={2} className="px-3 py-6 text-[13px] text-muted-foreground">
                  Toutes les routes ont un écran.
                </td>
              </tr>
            ) : (
              orphans.map((orphan) => (
                <AdminTr key={orphan.key} className="h-auto">
                  <AdminTd className="py-2">
                    <code className="font-mono text-[11px] text-foreground">{orphan.key}</code>
                  </AdminTd>
                  <AdminTd className="py-2 text-[12px] leading-5 text-muted-foreground">
                    {orphan.reason}
                  </AdminTd>
                </AdminTr>
              ))
            )}
          </AdminTBody>
        </AdminTable>
      </section>

      <p className="text-[11px] text-muted-foreground">
        Le manifeste vit dans{' '}
        <code className="font-mono text-[11px]">apps/admin/src/lib/admin-coverage.ts</code> ; le
        test Go refuse une route non classée.{' '}
        <Link href="/admin/health" className="font-medium text-[#EE4B2B] hover:underline">
          Voir la santé plateforme
        </Link>
        .
      </p>
    </div>
  );
}
