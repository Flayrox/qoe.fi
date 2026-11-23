// =====================================================================
// /admin/security — Cockpit Sécurité & Trust (Lot 5)
// =====================================================================

import React from 'react';
import { MetricChips } from '@/components/shell/MetricChips';
import { getAdminIdentity, hasCapability, requireCapability } from '@/lib/admin-identity';
import { describeAuthzEnforcement, getSecurityOverview } from '@/lib/admin-security-data';
import { UnavailableNotice } from '@/components/shell/UnavailableNotice';
import { SecurityCockpit } from './SecurityCockpit';

export const dynamic = 'force-dynamic';

export default async function AdminSecurityPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.abuse.read');

  const cockpit = await getSecurityOverview();
  // Sonde illisible : pas de chiffres à zéro, un avertissement nommé.
  const authzMode = describeAuthzEnforcement(cockpit.ok ? cockpit.data.authzEnforceEnabled : null);
  const canDecide = hasCapability(identity, 'admin.abuse.decide');

  const dismissalLabel =
    cockpit.ok && cockpit.data.metrics.dismissalRate >= 0
      ? `${Math.round(cockpit.data.metrics.dismissalRate * 100)} %`
      : '—';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
            Cockpit sécurité &amp; Trust
          </h1>
          <p className="text-[12px] text-muted-foreground">
            Synthèse 30 jours du noyau PolicyV3, sanctions actives et recalcul Trust en direct.
          </p>
        </div>
        {cockpit.ok ? (
          <MetricChips
            items={[
              {
                label: 'Authz',
                value: authzMode.value,
                tone: authzMode.tone,
                hint: authzMode.detail,
              },
              {
                label: 'Shadowbans',
                value: cockpit.data.shadowbannedCount,
                tone: cockpit.data.shadowbannedCount > 0 ? 'warn' : 'default',
              },
              {
                label: 'Suspensions',
                value: cockpit.data.suspendedCount,
                tone: cockpit.data.suspendedCount > 0 ? 'warn' : 'default',
              },
              {
                label: 'File ouverte',
                value: cockpit.data.metrics.openQueue,
                tone: cockpit.data.metrics.openQueue > 0 ? 'warn' : 'default',
              },
              {
                label: 'Faux positifs',
                value: dismissalLabel,
                tone: 'default',
              },
            ]}
          />
        ) : (
          <UnavailableNotice what="Le cockpit sécurité" />
        )}
      </div>

      {cockpit.ok ? <SecurityCockpit overview={cockpit.data} canDecide={canDecide} /> : null}
    </div>
  );
}
