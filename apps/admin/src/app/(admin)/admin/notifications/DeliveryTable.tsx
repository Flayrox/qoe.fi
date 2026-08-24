'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock3, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { retryNotificationDeliveryAction } from '@/lib/admin-aux-actions';

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

const statusMeta: Record<string, { label: string; className: string; icon: typeof Clock3 }> = {
  QUEUED: { label: 'En attente', className: 'text-highlight bg-highlight/10', icon: Clock3 },
  PROCESSING: { label: 'En cours', className: 'text-primary bg-primary/10', icon: Loader2 },
  SENT: { label: 'Envoyé', className: 'text-success bg-success/10', icon: CheckCircle2 },
  FAILED: { label: 'Échec', className: 'text-destructive bg-destructive/10', icon: XCircle },
  DISABLED: { label: 'Désactivé', className: 'text-muted-foreground bg-muted', icon: XCircle },
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
          className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Destinataire</th>
                <th className="px-4 py-3">Événement</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Tentatives</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row) => {
                const meta = statusMeta[row.status] || statusMeta.FAILED;
                const Icon = meta.icon;
                return (
                  <tr key={row.id} className="align-top hover:bg-muted/70">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{row.recipient}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString('fr-FR')}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{row.notification.type}</p>
                      <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                        {row.notification.articleTitle || 'Notification sans article'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ${meta.className}`}
                      >
                        <Icon
                          className={`h-3.5 w-3.5 ${row.status === 'PROCESSING' ? 'animate-spin' : ''}`}
                        />
                        {meta.label}
                      </span>
                      {row.lastError && (
                        <p
                          className="mt-1 max-w-xs truncate text-[11px] text-destructive"
                          title={row.lastError}
                        >
                          {row.lastError}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.attempts}</td>
                    <td className="px-4 py-3 text-right">
                      {['FAILED', 'DISABLED'].includes(row.status) && (
                        <button
                          disabled={isPending && retrying === row.id}
                          onClick={() => retry(row.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Relancer
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Aucune livraison dans l’outbox.
          </div>
        )}
      </div>
    </div>
  );
}
