import { prisma } from '@qoe/db/client';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Mail } from 'lucide-react';
import { DeliveryTable, type DeliveryRow } from './DeliveryTable';

export default async function AdminNotificationsPage() {
  const [groups, deliveries, totalCount] = await Promise.all([
    prisma.notificationDelivery.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.notificationDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        notification: { select: { type: true, article: { select: { title: true } } } },
      },
    }),
    prisma.notificationDelivery.count(),
  ]);

  const counts = Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
  const rows: DeliveryRow[] = deliveries.map((delivery) => ({
    id: delivery.id,
    recipient: delivery.recipient,
    status: delivery.status,
    channel: delivery.channel,
    attempts: delivery.attempts,
    provider: delivery.provider,
    lastError: delivery.lastError,
    createdAt: delivery.createdAt.toISOString(),
    notification: {
      type: delivery.notification.type,
      articleTitle: delivery.notification.article?.title || null,
    },
  }));

  const cards = [
    {
      label: 'En attente',
      value: counts.QUEUED || 0,
      icon: Clock3,
      className: 'text-highlight bg-highlight/10',
    },
    {
      label: 'Envoyées',
      value: counts.SENT || 0,
      icon: CheckCircle2,
      className: 'text-success bg-success/10',
    },
    {
      label: 'En échec',
      value: counts.FAILED || 0,
      icon: AlertTriangle,
      className: 'text-destructive bg-destructive/10',
    },
    {
      label: 'Total',
      value: totalCount,
      icon: Activity,
      className: 'text-primary bg-primary/10',
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Mail className="h-4 w-4" /> Notification delivery
        </div>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground">
          Outbox & livraisons
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Supervisez les emails transactionnels sans exposer de clé fournisseur. Les événements
          in-app restent indépendants des livraisons externes.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-border bg-white p-5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${card.className}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-4 text-xs font-medium text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-3xl font-bold text-foreground">{card.value}</p>
            </div>
          );
        })}
      </div>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Dernières livraisons</h2>
          <span className="text-xs text-muted-foreground">50 dernières lignes</span>
        </div>
        <DeliveryTable rows={rows} />
      </section>
    </div>
  );
}
