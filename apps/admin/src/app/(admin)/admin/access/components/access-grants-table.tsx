'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Search, ShieldOff } from 'lucide-react';
import { revokeRoleAction } from '@/lib/admin-access-actions';
import { QueueEmpty } from '@/components/queue/QueueEmpty';
import { StatusPill } from '@/components/queue/StatusPill';
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
          <input
            name="q"
            defaultValue={query}
            placeholder="Filtrer par personne, email ou rôle…"
            className={inputCls}
            data-testid="access-grants-search-input"
          />
          <button
            type="submit"
            className="text-xs font-bold px-3 py-2 rounded-xl border border-border cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Search className="w-3 h-3" /> Filtrer
          </button>
        </form>
      </div>

      {grants.length === 0 ? (
        <QueueEmpty
          title="Aucune attribution"
          hint="Cherchez une personne ci-dessus pour lui attribuer un rôle — ou élargissez le filtre."
        />
      ) : (
        <div className="bg-white border border-border rounded-3xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs" data-testid="access-grants-table">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Personne</th>
                <th className="px-4 py-3 font-semibold">Rôle</th>
                <th className="px-4 py-3 font-semibold">Attribué le</th>
                <th className="px-4 py-3 font-semibold">Échéance</th>
                <th className="px-4 py-3 font-semibold">État</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((grant) => {
                const isOpen = revoking === key(grant);
                return (
                  <React.Fragment key={key(grant)}>
                    <tr
                      className="border-t border-border/70"
                      data-testid={`access-grant-row-${grant.roleKey}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {grant.name ?? grant.username ?? grant.email}
                        </div>
                        <div className="text-muted-foreground">{grant.email}</div>
                        <Link
                          href={`/admin/access/people/${encodeURIComponent(grant.userId)}`}
                          className="text-[11px] underline text-muted-foreground"
                          data-testid={`access-explain-${grant.roleKey}`}
                        >
                          pourquoi ?
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{grant.roleLabel}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {grant.roleKey}
                        </div>
                      </td>
                      <td className="px-4 py-3">{fmt(grant.grantedAt)}</td>
                      <td className="px-4 py-3">{fmt(grant.expiresAt)}</td>
                      <td className="px-4 py-3">
                        <StatusPill tone={grant.state === 'active' ? 'hot' : 'muted'}>
                          {grant.state === 'active' ? 'actif' : 'échu'}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={!canGrant || loadingId !== null}
                          onClick={() => {
                            setRevoking(isOpen ? null : key(grant));
                            setReason('');
                          }}
                          data-testid={`access-revoke-${grant.roleKey}`}
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ShieldOff className="w-3 h-3" /> Révoquer
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr
                        className="border-t border-border/70 bg-muted/20"
                        data-testid={`access-revoke-form-${grant.roleKey}`}
                      >
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder={`Motif de la révocation de « ${grant.roleKey} » (obligatoire)`}
                              className={`${inputCls} flex-1 min-w-[240px]`}
                              data-testid={`access-revoke-reason-${grant.roleKey}`}
                            />
                            <button
                              type="button"
                              onClick={() => submitRevoke(grant)}
                              disabled={reason.trim().length < 5 || loadingId !== null}
                              data-testid={`access-revoke-confirm-${grant.roleKey}`}
                              className="text-[11px] font-bold px-3 py-2 rounded-lg bg-[#EE4B2B] text-white cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {loadingId === key(grant) ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <ShieldOff className="w-3 h-3" />
                              )}
                              Confirmer la révocation
                            </button>
                          </div>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Refusé par le serveur si c’est votre dernier rôle, le dernier superadmin
                            de la plateforme, ou un rôle dont vous ne détenez pas toutes les
                            capacités.
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
