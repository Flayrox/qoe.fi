'use client';

// =====================================================================
// 🚩 FeatureFlagsToggles — Interrupteurs en direct pour superadmin
// =====================================================================
// 📖 Permet d'allumer / éteindre n'importe quelle fonctionnalité en prod
//    sans aucun re-déploiement ni commit.
// =====================================================================

import { useState, useTransition } from 'react';
import { toggleFeatureFlagAction } from '@/lib/admin-aux-actions';
import type { FeatureFlagItem } from '@/lib/admin-data';
import { cn } from '@qoe/utils';

export function FeatureFlagsToggles({ initialFlags }: { initialFlags: FeatureFlagItem[] }) {
  const [flags, setFlags] = useState<FeatureFlagItem[]>(initialFlags);
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleToggle = (key: string, currentVal: boolean) => {
    const nextVal = !currentVal;
    setPendingKey(key);
    setErrorMsg(null);

    // Mise à jour optimiste immédiate
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, is_enabled: nextVal } : f)));

    startTransition(async () => {
      const res = await toggleFeatureFlagAction(key, nextVal);
      if (!res.success) {
        // Rollback en cas d'erreur
        setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, is_enabled: currentVal } : f)));
        setErrorMsg(res.error ?? 'Erreur lors du changement de statut');
      }
      setPendingKey(null);
    });
  };

  const activeCount = flags.filter((f) => f.is_enabled).length;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">Feature Flags</h2>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {activeCount} / {flags.length} actifs
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Bascule instantanée en direct sans re-déploiement. Les modifications sont appliquées au
            runtime dans l'ensemble des applications.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {flags.map((flag) => {
          const isCurrentPending = isPending && pendingKey === flag.key;
          return (
            <div
              key={flag.key}
              className={cn(
                'flex flex-col justify-between rounded-xl border p-4 transition-all duration-200',
                flag.is_enabled
                  ? 'border-primary/40 bg-card shadow-sm'
                  : 'border-border bg-card/40 opacity-75 hover:opacity-100'
              )}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-foreground bg-muted/60 px-2 py-0.5 rounded">
                    {flag.key}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      flag.is_enabled
                        ? 'bg-success/15 text-success'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {flag.is_enabled ? 'ON' : 'OFF'}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {flag.description || 'Aucune description fournie.'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    Rôle :
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {flag.target_roles?.join(', ') || 'all'}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isCurrentPending}
                  onClick={() => handleToggle(flag.key, flag.is_enabled)}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50',
                    flag.is_enabled ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out',
                      flag.is_enabled ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
