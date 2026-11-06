import React from 'react';
import { getAdminDeliveries, getAdminOutboxMetrics } from '@/lib/admin-data';
import { getGlobalAnnouncementAction, listPlacementsAdminAction } from '@/lib/admin-aux-actions';
import { DeliveryTable, type DeliveryRow } from './DeliveryTable';
import { BroadcastAnnouncementConsole } from './BroadcastAnnouncementConsole';
import { PlacementsManager } from './PlacementsManager';
import { OutboxObservabilityConsole } from './OutboxObservabilityConsole';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { MetricChips } from '@/components/shell/MetricChips';

export default async function AdminNotificationsPage() {
  requireCapability(await getAdminIdentity(), 'admin.deliveries.read');
  const [deliveriesData, announcement, placements, outboxMetrics] = await Promise.all([
    getAdminDeliveries(),
    getGlobalAnnouncementAction(),
    listPlacementsAdminAction(),
    getAdminOutboxMetrics(),
  ]);
  const { counts, total: totalCount, deliveries } = deliveriesData;

  const rows: DeliveryRow[] = deliveries.map((delivery) => ({
    id: delivery.id,
    recipient: delivery.recipient,
    status: delivery.status,
    channel: delivery.channel,
    attempts: delivery.attempts,
    provider: delivery.provider,
    lastError: delivery.lastError,
    createdAt: delivery.createdAt,
    notification: {
      type: delivery.notification.type,
      articleTitle: delivery.notification.articleTitle || null,
    },
  }));

  const queued = counts.QUEUED || 0;
  const sent = counts.SENT || 0;
  const failed = counts.FAILED || 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
            Outbox & livraisons
          </h1>
          <p className="text-[12px] text-muted-foreground">
            Supervision des e-mails transactionnels et de l’outbox événementielle · relance unitaire
            et audit.
          </p>
        </div>
        <MetricChips
          items={[
            {
              label: 'En attente',
              value: queued,
              tone: queued > 0 ? 'warn' : 'default',
            },
            {
              label: 'Envoyées',
              value: sent,
              tone: 'default',
            },
            {
              label: 'En échec',
              value: failed,
              tone: failed > 0 ? 'danger' : 'default',
            },
            {
              label: 'Total',
              value: totalCount,
              tone: 'default',
            },
          ]}
        />
      </div>

      <OutboxObservabilityConsole metrics={outboxMetrics} />

      <BroadcastAnnouncementConsole initialAnnouncement={announcement} />

      <PlacementsManager initialPlacements={placements} />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-foreground">Dernières livraisons</h2>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            50 dernières lignes
          </span>
        </div>
        <DeliveryTable rows={rows} />
      </section>
    </div>
  );
}
