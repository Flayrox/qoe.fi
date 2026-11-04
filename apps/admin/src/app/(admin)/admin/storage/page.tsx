// =====================================================================
// 💾 /admin/storage — la saturation du bucket images, sous les yeux
// =====================================================================
// L'API exposait la supervision du stockage sans surface : on ne la voyait
// qu'en SQL. Cet écran répond à « combien, où, qui consomme » — avec le volume
// NON purgé en tête, parce que c'est lui qui coûte.
// =====================================================================

import React from 'react';
import { Database } from 'lucide-react';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { getStorageUsage } from '@/lib/admin-infra-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { QueueEmpty } from '@/components/queue/QueueEmpty';

export const dynamic = 'force-dynamic';

/** Octets lisibles (l'unité change la lecture d'un pic de stockage). */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value.toFixed(value >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`;
}

export default async function AdminStoragePage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.dashboard.read');

  const usage = await getStorageUsage(20);
  const statuses = Object.entries(usage.byStatus).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <QueuePageHeader
        icon={<Database className="w-4 h-4" />}
        title="Stockage médias"
        badge={formatBytes(usage.totalBytes)}
        description={
          <>
            Volume non purgé du bucket images, répartition par statut et plus gros consommateurs.
            Les lignes purgées sont exclues du total : elles ne coûtent plus rien.
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Volume total
          </div>
          <div className="mt-2 text-3xl font-semibold" data-testid="storage-total">
            {formatBytes(usage.totalBytes)}
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Fichiers
          </div>
          <div className="mt-2 text-3xl font-semibold" data-testid="storage-assets">
            {usage.assetCount.toLocaleString('fr-FR')}
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Statuts</div>
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="storage-statuses">
            {statuses.length === 0 ? (
              <span className="text-xs text-muted-foreground">aucun média</span>
            ) : (
              statuses.map(([status, count]) => (
                <span
                  key={status}
                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {status}: {count}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Plus gros consommateurs</h2>
        {usage.topUsers.length === 0 ? (
          <QueueEmpty title="Aucun média enregistré" hint="Le registre MediaAsset est vide." />
        ) : (
          <Table
            aria-label="Plus gros consommateurs de stockage"
            size="md"
            data-testid="storage-top-users"
          >
            <TableHeader>
              <TableColumn isRowHeader>Compte</TableColumn>
              <TableColumn>Fichiers</TableColumn>
              <TableColumn>Volume</TableColumn>
              <TableColumn>Part</TableColumn>
            </TableHeader>
            <TableBody items={usage.topUsers}>
              {(user) => {
                const share = usage.totalBytes > 0 ? (user.totalBytes / usage.totalBytes) * 100 : 0;
                return (
                  <TableRow id={user.ownerId}>
                    <TableCell className="font-mono text-[11px] text-foreground">
                      {user.ownerId}
                    </TableCell>
                    <TableCell>{user.assetCount.toLocaleString('fr-FR')}</TableCell>
                    <TableCell className="font-medium text-foreground">
                      {formatBytes(user.totalBytes)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-highlight"
                            style={{ width: `${Math.min(100, share).toFixed(1)}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {share.toFixed(1)} %
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
