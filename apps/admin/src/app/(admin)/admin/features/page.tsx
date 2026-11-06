import React from 'react';
import { Sparkles } from 'lucide-react';
import { getAdminIdentity, hasCapability, requireCapability } from '@/lib/admin-identity';
import { getAdminFeatures } from '@/lib/admin-data';
import { updateFeatureAction } from '@/lib/admin-feature-actions';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';

export const dynamic = 'force-dynamic';

const STATUSES = ['in-development', 'coming-soon', 'paused', 'beta', 'live', 'retired'];

export default async function AdminFeaturesPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.config.read');
  const canWrite = hasCapability(identity, 'admin.flags.write');
  const features = await getAdminFeatures();

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <QueuePageHeader
        icon={<Sparkles className="w-4 h-4" />}
        title="Registre des fonctionnalités"
        description={
          <>
            L’état opérationnel qui pilote les annonces : statut, promesse de notification, flag et
            page de destination. Les textes restent dans le catalogue UI.
          </>
        }
      />

      {!canWrite && (
        <p className="text-xs text-muted-foreground">
          Lecture seule : <span className="font-mono">admin.flags.write</span> est requis pour
          modifier le registre.
        </p>
      )}

      {features.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Aucune fonctionnalité enregistrée. La migration 00069 doit avoir été appliquée.
        </div>
      ) : (
        <div className="space-y-3">
          {features.map((feature) => (
            <form
              key={feature.key}
              action={updateFeatureAction}
              className="grid gap-3 rounded-2xl border border-border/60 bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
            >
              <input type="hidden" name="key" value={feature.key} />
              <div>
                <p className="font-mono text-xs text-muted-foreground">{feature.key}</p>
                <p className="mt-1 text-sm font-semibold">
                  {feature.interested} personne{feature.interested === 1 ? '' : 's'} intéressée
                  {feature.interested === 1 ? '' : 's'}
                </p>
              </div>

              <label className="text-[11px] text-muted-foreground space-y-1">
                Statut
                <select
                  name="status"
                  defaultValue={feature.status}
                  disabled={!canWrite}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-2">
                <label className="text-[11px] text-muted-foreground space-y-1 block">
                  Flag lié
                  <input
                    name="flagKey"
                    defaultValue={feature.flagKey ?? ''}
                    disabled={!canWrite}
                    placeholder="ex. reader-plus-banner"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                  />
                </label>
                <label className="text-[11px] text-muted-foreground space-y-1 block">
                  Page de destination
                  <input
                    name="href"
                    defaultValue={feature.href ?? ''}
                    disabled={!canWrite}
                    placeholder="/settings/domain"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    name="notifyEnabled"
                    defaultChecked={feature.notifyEnabled}
                    disabled={!canWrite}
                  />
                  Me prévenir ouvert
                </label>
                <button
                  type="submit"
                  disabled={!canWrite}
                  className="rounded-xl bg-[#EE4B2B] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
