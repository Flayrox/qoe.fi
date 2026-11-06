import React from 'react';
import { Inbox } from 'lucide-react';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { getAdminWorkQueue } from '@/lib/admin-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { TriageBoard } from './components/triage-board';

export const dynamic = 'force-dynamic';

const counterClass = 'rounded-2xl border border-border/60 bg-white p-5 shadow-sm';

export default async function AdminWorkPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.dashboard.read');
  const view = await getAdminWorkQueue();
  const total = view.items.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <QueuePageHeader
        icon={<Inbox className="w-4 h-4" />}
        title="Ma file"
        badge={total > 0 ? `${total} en attente` : null}
        description="Les six files staff réunies. Chaque dossier porte les mêmes champs de triage : assignation, priorité, échéance et état SLA."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={counterClass}>
          <p className="text-xs text-muted-foreground">Dossiers ouverts</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{total}</p>
        </div>
        <div className={counterClass}>
          <p className="text-xs text-muted-foreground">Assignés à moi</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{view.assignedToMe}</p>
        </div>
        <div className={counterClass}>
          <p className="text-xs text-muted-foreground">SLA dépassés</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{view.breached}</p>
        </div>
      </div>

      {view.items.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Aucune file accessible.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {view.items.map((item) => (
            <div
              key={item.key}
              className="rounded-2xl border border-border/60 bg-white p-5 shadow-sm"
            >
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{item.count}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {item.assignedToMe} assigné{item.assignedToMe > 1 ? 's' : ''} à moi ·{' '}
                {item.breached} SLA dépassé{item.breached > 1 ? 's' : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      <TriageBoard view={view} />
    </div>
  );
}
