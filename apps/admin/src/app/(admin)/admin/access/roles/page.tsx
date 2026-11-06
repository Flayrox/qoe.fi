// =====================================================================
// 🧮 /admin/access/roles — la matrice des rôles & simulateur de droits (C3)
// =====================================================================
// Les données proviennent directement de AdminRole / AdminRoleCapability.
// L'écran permet de visualiser la matrice complète et d'interroger
// instantanément « Qui peut X ? » pour auditer les habilitations.
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { getAccessCapabilities, getAccessRoles } from '@/lib/admin-access-data';
import { MetricChips } from '@/components/shell/MetricChips';
import { RolesMatrixSimulator } from './RolesMatrixSimulator';

export const dynamic = 'force-dynamic';

export default async function AdminAccessRolesPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.access.read');

  const [roles, capabilities] = await Promise.all([getAccessRoles(), getAccessCapabilities()]);

  const totalHolders = roles.reduce((sum, r) => sum + r.holders, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
              Matrice des rôles & simulateur
            </h1>
            <span className="text-muted-foreground/60">·</span>
            <Link
              href="/admin/access"
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Attributions du personnel
            </Link>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Cartographie rôle × capacité et simulateur d’habilitation · audit des attributions
            actives.
          </p>
        </div>
        <MetricChips
          items={[
            {
              label: 'Rôles',
              value: roles.length,
              tone: 'default',
            },
            {
              label: 'Capacités',
              value: capabilities.length,
              tone: 'default',
            },
            {
              label: 'Détenteurs actifs',
              value: totalHolders,
              tone: 'default',
            },
          ]}
        />
      </div>

      <RolesMatrixSimulator roles={roles} capabilities={capabilities} />
    </div>
  );
}
