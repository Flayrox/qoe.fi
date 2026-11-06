// =====================================================================
// 🎛️ /admin/settings — l'index des leviers de la plateforme (C2)
// =====================================================================
// Chaque ligne dit : le levier, ce qu'il change, sa portée, la capacité qui
// l'ouvre et le niveau de preuve. Une capacité manquante n'efface pas la
// ligne — elle la passe en lecture, pour qu'on sache qu'un levier existe
// même sans le droit de le toucher.
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { MetricChips } from '@/components/shell/MetricChips';
import { SETTINGS_CATALOG } from '@/lib/admin-settings-catalog';
import { SettingsExplorer } from './SettingsExplorer';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.config.read');

  const heldCapabilities = identity?.capabilities ?? [];
  const held = new Set(heldCapabilities);
  const editableCount = SETTINGS_CATALOG.filter((lever) => held.has(lever.capability)).length;
  const readonlyCount = SETTINGS_CATALOG.length - editableCount;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
              Réglages & catalogue des leviers
            </h1>
            <span className="text-muted-foreground/60">·</span>
            <Link
              href="/admin/system"
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Couverture système
            </Link>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Index exhaustif des paramètres de la plateforme · statut de vos habilitations et
            deep-links vers les écrans.
          </p>
        </div>
        <MetricChips
          items={[
            {
              label: 'Modifiables',
              value: `${editableCount}/${SETTINGS_CATALOG.length}`,
              tone: editableCount > 0 ? 'default' : 'warn',
            },
            {
              label: 'Lecture seule',
              value: readonlyCount,
              tone: 'default',
            },
            {
              label: 'Total leviers',
              value: SETTINGS_CATALOG.length,
              tone: 'default',
            },
          ]}
        />
      </div>

      <SettingsExplorer heldCapabilities={heldCapabilities} />
    </div>
  );
}
