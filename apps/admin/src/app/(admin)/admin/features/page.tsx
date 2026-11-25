import React from 'react';
import { Sparkles } from 'lucide-react';
import { getAdminIdentity, hasCapability, requireCapability } from '@/lib/admin-identity';
import { getAdminFeatures } from '@/lib/admin-data';
import { updateFeatureAction } from '@/lib/admin-feature-actions';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { Select } from '@qoe/ui/select';
import { UnavailableNotice } from '@/components/shell/UnavailableNotice';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import { CheckboxInput } from '@qoe/ui/checkbox';

export const dynamic = 'force-dynamic';

const STATUSES = ['in-development', 'coming-soon', 'paused', 'beta', 'live', 'retired'];

export default async function AdminFeaturesPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.config.read');
  const canWrite = hasCapability(identity, 'admin.flags.write');
  const registry = await getAdminFeatures();
  // Le registre est « vide » seulement s'il a été lu : une panne ne doit pas
  // accuser la migration 00069 d'être absente.
  const features = registry.ok ? registry.data : [];

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
          Lecture seule : <span className="tabular-nums">admin.flags.write</span> est requis pour
          modifier le registre.
        </p>
      )}

      {registry.ok ? null : <UnavailableNotice what="Le registre des fonctionnalités" />}

      {features.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Aucune fonctionnalité enregistrée. La migration 00069 doit avoir été appliquée.
        </div>
      ) : (
        <div className="space-y-3">
          {features.map((feature) => (
            <form
              key={feature.key}
              action={updateFeatureAction}
              className="grid gap-3 rounded-lg border border-border/60 bg-card p-5 shadow-sm md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
            >
              <Input
                className=" h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
                type="hidden"
                name="key"
                value={feature.key}
              />
              <div>
                <p className="tabular-nums text-xs text-muted-foreground">{feature.key}</p>
                <p className="mt-1 text-sm font-semibold">
                  {feature.interested} personne{feature.interested === 1 ? '' : 's'} intéressée
                  {feature.interested === 1 ? '' : 's'}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Statut</span>
                <Select
                  label="Statut"
                  hideLabel
                  size="xs"
                  name="status"
                  defaultValue={feature.status}
                  disabled={!canWrite}
                  options={STATUSES.map((status) => ({ id: status, label: status }))}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-muted-foreground space-y-1 block">
                  Flag lié
                  <Input
                    name="flagKey"
                    defaultValue={feature.flagKey ?? ''}
                    disabled={!canWrite}
                    placeholder="ex. reader-plus-banner"
                    className="w-full! rounded-xl border border-border bg-background px-3 py-2 text-xs! leading-[16px]! h-auto! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
                  />
                </label>
                <label className="text-[11px] text-muted-foreground space-y-1 block">
                  Page de destination
                  <Input
                    name="href"
                    defaultValue={feature.href ?? ''}
                    disabled={!canWrite}
                    placeholder="/settings/domain"
                    className="w-full! rounded-xl border border-border bg-background px-3 py-2 text-xs! leading-[16px]! h-auto! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-xs">
                  <CheckboxInput
                    name="notifyEnabled"
                    defaultChecked={feature.notifyEnabled}
                    disabled={!canWrite}
                  />
                  Me prévenir ouvert
                </label>
                <Button
                  type="submit"
                  variant="solid"
                  tone="brand"
                  size="sm"
                  disabled={!canWrite}
                  className="rounded-xl px-3 py-2 text-xs! font-bold! leading-[16px]! h-auto! whitespace-normal! justify-normal inline-block "
                >
                  Enregistrer
                </Button>
              </div>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
