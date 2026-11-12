// =====================================================================
// /admin/security — Cockpit Sécurité & Trust (Lot 5)
// =====================================================================

import React from 'react';
import { MetricChips } from '@/components/shell/MetricChips';
import { getAdminIdentity, hasCapability, requireCapability } from '@/lib/admin-identity';
import { getSecurityOverview } from '@/lib/admin-security-data';
import { SecurityCockpit } from './SecurityCockpit';

export const dynamic = 'force-dynamic';

export default async function AdminSecurityPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.abuse.read');

  const overview = await getSecurityOverview();
  const canDecide = hasCapability(identity, 'admin.abuse.decide');

  const dismissalLabel =
    overview.metrics.dismissalRate >= 0
      ? `${Math.round(overview.metrics.dismissalRate * 100)} %`
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
        <MetricChips
          items={[
            {
              label: 'Authz',
              value: overview.authzEnforceEnabled ? 'enforce' : 'observe',
              tone: overview.authzEnforceEnabled ? 'default' : 'warn',
            },
            {
              label: 'Shadowbans',
              value: overview.shadowbannedCount,
              tone: overview.shadowbannedCount > 0 ? 'warn' : 'default',
            },
            {
              label: 'Suspensions',
              value: overview.suspendedCount,
              tone: overview.suspendedCount > 0 ? 'warn' : 'default',
            },
            {
              label: 'File ouverte',
              value: overview.metrics.openQueue,
              tone: overview.metrics.openQueue > 0 ? 'warn' : 'default',
            },
            {
              label: 'Faux positifs',
              value: dismissalLabel,
              tone: 'default',
            },
          ]}
        />
      </div>

      <SecurityCockpit overview={overview} canDecide={canDecide} />
    </div>
  );
}
