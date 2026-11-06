// =====================================================================
// 🚦 /admin/access/decisions — qui a été refusé, et le serait-on encore ?
// =====================================================================
// C'est l'écran qui prépare le passage en `authz-enforce` : tant que le mode est
// l'observation, aucun refus n'est appliqué, mais TOUS sont journalisés. On y lit
// donc, par capacité, le volume de refus observés — et l'on voit nommément qui
// serait bloqué avant de l'être.
//
// L'agrégat distingue volontairement « refusé et appliqué » de « refusé mais
// observé » : la même ligne de tableau ne veut pas dire la même chose selon le
// mode, et c'est précisément ce qu'on vient vérifier ici.
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { ShieldOff } from 'lucide-react';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { denialGroups, getAuthzDecisions, modeSplit } from '@/lib/admin-audit-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { QueueEmpty } from '@/components/queue/QueueEmpty';

export const dynamic = 'force-dynamic';

interface DecisionsPageProps {
  searchParams: Promise<{ capability?: string; denied?: string; window?: string }>;
}

export default async function AdminAccessDecisionsPage({ searchParams }: DecisionsPageProps) {
  const params = await searchParams;
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.audit.read');

  const windowHours = Number.parseInt(params.window ?? '168', 10) || 168;
  const onlyDenied = params.denied !== '0';
  const view = await getAuthzDecisions({
    capability: params.capability ?? '',
    denied: onlyDenied,
    window: windowHours,
    limit: 200,
  });

  const denials = denialGroups(view.groups);
  const split = modeSplit(view.groups);
  const totalDenials = denials.reduce((sum, group) => sum + group.total, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <QueuePageHeader
        icon={<ShieldOff className="w-4 h-4" />}
        title="Décisions d’autorisation"
        badge={view.mode === 'enforce' ? 'mode refus' : 'mode observation'}
        description={
          <>
            Chaque passage dans le garde de capacités est journalisé : accordé, refusé, ou refusé
            seulement <em>observé</em>. {split.observed} refus observé(s) et {split.enforced} refus
            appliqué(s) sur les {windowHours} dernières heures.{' '}
            <Link href="/admin/audit" className="underline">
              Revenir au journal d’audit
            </Link>
          </>
        }
      />

      <form
        method="get"
        action="/admin/access/decisions"
        className="flex flex-wrap items-end gap-3"
        data-testid="decisions-filters"
      >
        <label className="text-[11px] text-muted-foreground space-y-1 block">
          Capacité
          <Input
            name="capability"
            defaultValue={params.capability ?? ''}
            placeholder="admin.users.moderate"
            size="sm"
            className="w-64"
          />
        </label>
        <label className="text-[11px] text-muted-foreground space-y-1 block">
          Fenêtre (heures)
          <Input
            name="window"
            type="number"
            min={1}
            defaultValue={windowHours}
            size="sm"
            className="w-28"
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1 cursor-pointer">
          <input
            type="checkbox"
            name="denied"
            value="1"
            defaultChecked={onlyDenied}
            className="rounded border-border"
          />
          Refus uniquement
        </label>
        <Button type="submit" variant="solid" tone="brand" size="sm" data-testid="decisions-apply">
          Appliquer
        </Button>
      </form>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">
          Refus par capacité {totalDenials > 0 ? `(${totalDenials})` : ''}
        </h2>
        {denials.length === 0 ? (
          <QueueEmpty
            title="Aucun refus sur la période"
            hint="Personne n’a été bloqué : c’est la condition pour armer le mode refus sans surprise."
          />
        ) : (
          <Table aria-label="Refus par capacité" size="md" data-testid="decisions-groups">
            <TableHeader>
              <TableColumn isRowHeader>Capacité</TableColumn>
              <TableColumn>Motif</TableColumn>
              <TableColumn>Mode</TableColumn>
              <TableColumn>Refus</TableColumn>
              <TableColumn>Dernier</TableColumn>
            </TableHeader>
            <TableBody items={denials}>
              {(group) => (
                <TableRow id={`${group.capability}-${group.mode}-${group.code}`}>
                  <TableCell className="tabular-nums text-[11px] font-semibold text-foreground">
                    {group.capability}
                  </TableCell>
                  <TableCell className="tabular-nums text-[11px] text-muted-foreground">
                    {group.code}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="soft"
                      tone={group.mode === 'enforce' ? 'danger' : 'neutral'}
                      size="xs"
                    >
                      {group.mode === 'enforce' ? 'appliqué' : 'observé'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold text-foreground">{group.total}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {group.lastAt ? new Date(group.lastAt).toLocaleString('fr-FR') : '—'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Dernières décisions ({view.items.length})</h2>
        {view.items.length === 0 ? (
          <QueueEmpty
            title="Aucune décision sur la période"
            hint="Élargissez la fenêtre ou retirez le filtre de refus."
          />
        ) : (
          <Table aria-label="Dernières décisions" size="md" data-testid="decisions-items">
            <TableHeader>
              <TableColumn isRowHeader>Quand</TableColumn>
              <TableColumn>Personne</TableColumn>
              <TableColumn>Route</TableColumn>
              <TableColumn>Capacité</TableColumn>
              <TableColumn>Issue</TableColumn>
            </TableHeader>
            <TableBody items={view.items}>
              {(item) => (
                <TableRow id={item.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString('fr-FR')}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">{item.email || '—'}</div>
                    <div className="tabular-nums text-[10px] text-muted-foreground">
                      {item.userId ?? 'anonyme'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="tabular-nums text-[11px] text-foreground">
                      {item.method} {item.path}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums text-[11px]">
                    {item.capability}
                    {item.proofLevel ? (
                      <Badge variant="soft" tone="neutral" size="xs" className="ml-1 font-sans">
                        {item.proofLevel}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="soft"
                      tone={
                        item.allowed ? 'success' : item.mode === 'enforce' ? 'danger' : 'neutral'
                      }
                      size="xs"
                    >
                      {item.allowed ? 'accordé' : item.mode === 'enforce' ? 'refusé' : 'observé'}
                    </Badge>
                    {!item.allowed && (
                      <div className="mt-1 tabular-nums text-[10px] text-muted-foreground">
                        {item.code}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
