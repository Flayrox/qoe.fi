import React from 'react';
import { Inbox } from 'lucide-react';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { getAdminWorkQueue } from '@/lib/admin-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { MetricChips } from '@/components/shell/MetricChips';
import { TriageBoard } from './components/triage-board';

export const dynamic = 'force-dynamic';

export default async function AdminWorkPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.dashboard.read');
  const view = await getAdminWorkQueue();
  const total = view.items.reduce((sum, item) => sum + item.count, 0);

  const chips = [
    { label: 'Ouverts', value: total },
    { label: 'À moi', value: view.assignedToMe },
    {
      label: 'SLA dépassés',
      value: view.breached,
      tone: view.breached > 0 ? ('danger' as const) : ('default' as const),
    },
    ...view.items.map((item) => ({
      label: item.label,
      value: item.count,
      href: item.href,
      tone: item.breached > 0 ? ('warn' as const) : ('default' as const),
      hint: `${item.assignedToMe} à moi · ${item.breached} SLA dépassé(s)`,
    })),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <QueuePageHeader
        icon={<Inbox className="h-4 w-4" />}
        title="Ma file"
        badge={total > 0 ? `${total} en attente` : null}
        description="Les six files staff réunies, avec assignation, priorité, échéance et état SLA."
      />

      <MetricChips items={chips} />

      {view.items.length === 0 ? (
        <p className="rounded border border-border/60 bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
          Aucune file accessible.
        </p>
      ) : (
        <TriageBoard view={view} />
      )}
    </div>
  );
}
