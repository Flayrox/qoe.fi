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
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { denialGroups, getAuthzDecisions, modeSplit } from '@/lib/admin-audit-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { QueueEmpty } from '@/components/queue/QueueEmpty';
import { StatusPill } from '@/components/queue/StatusPill';

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
          <input
            name="capability"
            defaultValue={params.capability ?? ''}
            placeholder="admin.users.moderate"
            className="w-64 text-xs px-3 py-2 rounded-xl border border-border bg-background outline-none"
          />
        </label>
        <label className="text-[11px] text-muted-foreground space-y-1 block">
          Fenêtre (heures)
          <input
            name="window"
            type="number"
            min={1}
            defaultValue={windowHours}
            className="w-28 text-xs px-3 py-2 rounded-xl border border-border bg-background outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <input type="checkbox" name="denied" value="1" defaultChecked={onlyDenied} />
          Refus uniquement
        </label>
        <button
          type="submit"
          className="rounded-xl bg-[#EE4B2B] px-4 py-2 text-xs font-bold text-white"
          data-testid="decisions-apply"
        >
          Appliquer
        </button>
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
          <div className="bg-white border border-border rounded-3xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs" data-testid="decisions-groups">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Capacité</th>
                  <th className="px-4 py-3 font-semibold">Motif</th>
                  <th className="px-4 py-3 font-semibold">Mode</th>
                  <th className="px-4 py-3 font-semibold">Refus</th>
                  <th className="px-4 py-3 font-semibold">Dernier</th>
                </tr>
              </thead>
              <tbody>
                {denials.map((group) => (
                  <tr
                    key={`${group.capability}-${group.mode}-${group.code}`}
                    className="border-t border-border/70"
                  >
                    <td className="px-4 py-3 font-mono text-[11px]">{group.capability}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      {group.code}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={group.mode === 'enforce' ? 'hot' : 'muted'}>
                        {group.mode === 'enforce' ? 'appliqué' : 'observé'}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3 font-semibold">{group.total}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {group.lastAt ? new Date(group.lastAt).toLocaleString('fr-FR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <div className="bg-white border border-border rounded-3xl shadow-sm overflow-hidden">
            <table className="w-full min-w-[860px] text-left text-xs" data-testid="decisions-items">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Quand</th>
                  <th className="px-4 py-3 font-semibold">Personne</th>
                  <th className="px-4 py-3 font-semibold">Route</th>
                  <th className="px-4 py-3 font-semibold">Capacité</th>
                  <th className="px-4 py-3 font-semibold">Issue</th>
                </tr>
              </thead>
              <tbody>
                {view.items.map((item) => (
                  <tr key={item.id} className="border-t border-border/70">
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3">
                      <div>{item.email || '—'}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {item.userId ?? 'anonyme'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px]">
                        {item.method} {item.path}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      {item.capability}
                      {item.proofLevel ? (
                        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-sans text-[10px]">
                          {item.proofLevel}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={item.allowed ? 'hot' : 'muted'}>
                        {item.allowed ? 'accordé' : item.mode === 'enforce' ? 'refusé' : 'observé'}
                      </StatusPill>
                      {!item.allowed && (
                        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                          {item.code}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
