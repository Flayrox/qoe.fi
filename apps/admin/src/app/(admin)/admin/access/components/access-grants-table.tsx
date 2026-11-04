'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Search, ShieldOff } from 'lucide-react';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import { revokeRoleAction } from '@/lib/admin-access-actions';
import { QueueEmpty } from '@/components/queue/QueueEmpty';
import { useStaffAction } from '@/components/queue/useStaffAction';
import type { AccessGrantRow } from '@/lib/admin-access-data';

const inputCls =
  'w-full text-xs px-3 py-2 rounded-xl border border-border bg-background outline-none';

const fmt = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('fr-FR') : '—');

interface AccessGrantsTableProps {
  grants: AccessGrantRow[];
  query: string;
  canGrant: boolean;
}

/**
 * Les attributions, avec leur état réel : une échéance passée reste affichée
 * (l'information compte) mais la ligne dit « échu » — elle n'accorde plus rien.
 * Révoquer demande un motif : le bouton ouvre une confirmation, il ne supprime
 * jamais d'un clic.
 */
export function AccessGrantsTable({ grants, query, canGrant }: AccessGrantsTableProps) {
  const router = useRouter();
  const { loadingId, run } = useStaffAction<string>();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const key = (grant: AccessGrantRow) => `${grant.userId}:${grant.roleKey}`;

  const submitRevoke = async (grant: AccessGrantRow) => {
    const res = await run(
      key(grant),
      () => revokeRoleAction({ userId: grant.userId, roleKey: grant.roleKey, reason }),
      {
        ok: 'Rôle révoqué — le cache de capacités est invalidé immédiatement',
      }
    );
    if (res?.ok) {
      setRevoking(null);
      setReason('');
      router.refresh();
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-sm font-semibold">Attributions</h2>
        <form
          method="get"
          action="/admin/access"
          className="flex gap-2"
          data-testid="access-grants-search"
        >
          <Input
            name="q"
            defaultValue={query}
            placeholder="Filtrer par personne, email ou rôle…"
            size="sm"
            data-testid="access-grants-search-input"
          />
          <Button type="submit" variant="outline" size="sm">
            <Search /> Filtrer
          </Button>
        </form>
      </div>

      {grants.length === 0 ? (
        <QueueEmpty
          title="Aucune attribution"
          hint="Cherchez une personne ci-dessus pour lui attribuer un rôle — ou élargissez le filtre."
        />
      ) : (
        <Table aria-label="Attributions de rôles" size="md" data-testid="access-grants-table">
          <TableHeader>
            <TableColumn isRowHeader>Personne</TableColumn>
            <TableColumn>Rôle</TableColumn>
            <TableColumn>Attribué le</TableColumn>
            <TableColumn>Échéance</TableColumn>
            <TableColumn>État</TableColumn>
            <TableColumn className="text-right">Action</TableColumn>
          </TableHeader>
          <TableBody items={grants}>
            {(grant) => {
              const isOpen = revoking === key(grant);
              return (
                <TableRow id={key(grant)} data-testid={`access-grant-row-${grant.roleKey}`}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      {grant.name ?? grant.username ?? grant.email}
                    </div>
                    <div className="text-muted-foreground">{grant.email}</div>
                    <Link
                      href={`/admin/access/people/${encodeURIComponent(grant.userId)}`}
                      className="text-[11px] underline text-muted-foreground hover:text-foreground"
                      data-testid={`access-explain-${grant.roleKey}`}
                    >
                      pourquoi ?
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">{grant.roleLabel}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {grant.roleKey}
                    </div>
                  </TableCell>
                  <TableCell>{fmt(grant.grantedAt)}</TableCell>
                  <TableCell>{fmt(grant.expiresAt)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="soft"
                      tone={grant.state === 'active' ? 'vivid' : 'neutral'}
                      size="xs"
                    >
                      {grant.state === 'active' ? 'actif' : 'échu'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {isOpen ? (
                      <div
                        className="flex flex-col gap-2 pt-1 min-w-[220px]"
                        data-testid={`access-revoke-form-${grant.roleKey}`}
                      >
                        <Input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Motif (obligatoire)"
                          size="xs"
                          data-testid={`access-revoke-reason-${grant.roleKey}`}
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              setRevoking(null);
                              setReason('');
                            }}
                          >
                            Annuler
                          </Button>
                          <Button
                            type="button"
                            variant="solid"
                            tone="danger"
                            size="xs"
                            disabled={reason.trim().length < 5 || loadingId !== null}
                            onClick={() => submitRevoke(grant)}
                            data-testid={`access-revoke-confirm-${grant.roleKey}`}
                          >
                            {loadingId === key(grant) ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <ShieldOff />
                            )}
                            Confirmer
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={!canGrant || loadingId !== null}
                        onClick={() => {
                          setRevoking(key(grant));
                          setReason('');
                        }}
                        data-testid={`access-revoke-${grant.roleKey}`}
                      >
                        <ShieldOff /> Révoquer
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            }}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
