'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, ShieldAlert, ShieldCheck, SlidersHorizontal, UserCog } from 'lucide-react';
import { getAdminAuditLog, type AdminAuditEntry } from '@/lib/admin-data';

// Libellés humains des actions tracées.
const actionMeta: Record<string, { label: string; icon: typeof ShieldCheck }> = {
  'api.access.status': { label: "Changement d'accès API", icon: ShieldCheck },
  'api.access.grants': { label: 'Permissions ajustées', icon: SlidersHorizontal },
  'api.access.modules': { label: 'Modules plateforme', icon: SlidersHorizontal },
  'access.control.config': { label: 'Contrôle d’accès global', icon: ShieldAlert },
  'moderation.update': { label: 'Modération', icon: UserCog },
};

function formatMetadata(entry: AdminAuditEntry): string {
  if (!entry.metadata) return '';
  const { status, grants, enabled, key, value, isSuspended } = entry.metadata;
  if (Array.isArray(grants) && grants.length > 0) {
    return `permissions: ${grants.join(', ')}`;
  }
  if (Array.isArray(enabled) && enabled.length > 0) {
    return `modules: ${enabled.join(', ')}`;
  }
  if (typeof status === 'string') return `statut: ${status}`;
  if (typeof key === 'string') return `${key} = ${String(value)}`;
  if (typeof isSuspended === 'boolean') return `suspendu: ${isSuspended ? 'oui' : 'non'}`;
  return '';
}

export function AuditLogClient({ initialEntries }: { initialEntries: AdminAuditEntry[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setError(null);
    startTransition(async () => {
      try {
        await getAdminAuditLog(100);
        router.refresh();
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : 'Rechargement impossible.');
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {initialEntries.length} dernières entrées · activé via le flag{' '}
          <span className="font-mono">admin-audit-log</span>
        </span>
        <button
          disabled={isPending}
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} /> Actualiser
        </button>
      </div>

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
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Quand</th>
                <th className="px-4 py-3">Qui</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Cible</th>
                <th className="px-4 py-3">Détail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {initialEntries.map((entry) => {
                const meta = actionMeta[entry.action] || {
                  label: entry.action,
                  icon: ShieldCheck,
                };
                const Icon = meta.icon;
                return (
                  <tr key={entry.id} className="align-top hover:bg-muted/70">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {entry.actorName || entry.actorEmail}
                      </p>
                      <p className="text-xs text-muted-foreground">{entry.actorEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                        <Icon className="h-3.5 w-3.5" /> {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-muted-foreground">{entry.targetType}</p>
                      {entry.targetId && (
                        <p className="mt-0.5 max-w-[180px] truncate font-mono text-[11px] text-foreground/70">
                          {entry.targetId}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatMetadata(entry) || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {initialEntries.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Aucune entrée pour l’instant — activez le flag{' '}
            <span className="font-mono">admin-audit-log</span> dans Feature Flags, puis effectuez
            une action (approbation API, coupure de l’API, modération).
          </div>
        )}
      </div>
    </div>
  );
}
