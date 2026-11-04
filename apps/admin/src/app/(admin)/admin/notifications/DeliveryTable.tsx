'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock3, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { retryNotificationDeliveryAction } from '@/lib/admin-aux-actions';
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from '@qoe/ui/table';
import { Badge, type BadgeProps } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';

type BadgeTone = NonNullable<BadgeProps['tone']>;

export type DeliveryRow = {
  id: string;
  recipient: string;
  status: string;
  channel: string;
  attempts: number;
  provider: string | null;
  lastError: string | null;
  createdAt: string;
  notification: { type: string; articleTitle: string | null };
};

const statusMeta: Record<string, { label: string; tone: BadgeTone; icon: typeof Clock3 }> = {
  QUEUED: { label: 'En attente', tone: 'brand', icon: Clock3 },
  PROCESSING: { label: 'En cours', tone: 'brand', icon: Loader2 },
  SENT: { label: 'Envoyé', tone: 'success', icon: CheckCircle2 },
  FAILED: { label: 'Échec', tone: 'danger', icon: XCircle },
  DISABLED: { label: 'Désactivé', tone: 'neutral', icon: XCircle },
};

export function DeliveryTable({ rows }: { rows: DeliveryRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const retry = (id: string) => {
    setRetrying(id);
    setError(null);
    startTransition(async () => {
      try {
        await retryNotificationDeliveryAction(id);
        router.refresh();
      } catch (retryError) {
        setError(retryError instanceof Error ? retryError.message : 'Relance impossible.');
      } finally {
        setRetrying(null);
      }
    });
  };

  return (
    <div className="space-y-3">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive-text"
        >
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table aria-label="Journal des livraisons de notifications" size="md">
          <TableHeader>
            <TableColumn isRowHeader>Destinataire</TableColumn>
            <TableColumn>Événement</TableColumn>
            <TableColumn>Statut</TableColumn>
            <TableColumn>Tentatives</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody
            items={rows}
            renderEmptyState={() => (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Aucune livraison dans l’outbox.
              </div>
            )}
          >
            {(row) => {
              const meta = statusMeta[row.status] || statusMeta.FAILED;
              const Icon = meta.icon;
              return (
                <TableRow id={row.id}>
                  <TableCell>
                    <p className="font-medium text-foreground">{row.recipient}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString('fr-FR')}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-foreground">{row.notification.type}</p>
                    <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                      {row.notification.articleTitle || 'Notification sans article'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="soft" tone={meta.tone} size="sm">
                      <Icon
                        className={`h-3 w-3 ${row.status === 'PROCESSING' ? 'animate-spin' : ''}`}
                      />
                      <span>{meta.label}</span>
                    </Badge>
                    {row.lastError && (
                      <p
                        className="mt-1 max-w-xs truncate text-[11px] text-destructive-text"
                        title={row.lastError}
                      >
                        {row.lastError}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.attempts}</TableCell>
                  <TableCell className="text-right">
                    {['FAILED', 'DISABLED'].includes(row.status) && (
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={isPending && retrying === row.id}
                        onClick={() => retry(row.id)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Relancer
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            }}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
