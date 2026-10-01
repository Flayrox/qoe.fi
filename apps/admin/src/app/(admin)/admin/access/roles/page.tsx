// =====================================================================
// 🧮 /admin/access/roles — la matrice, telle que la base la porte
// =====================================================================
// Lecture seule, volontairement : modifier la matrice d'un rôle partagé est un
// acte de conception, pas une case à cocher d'exploitation. L'écran sert à
// RÉPONDRE (« qui peut exporter la conformité ? »), pas à improviser.
//
// Les données viennent de `AdminRole` / `AdminRoleCapability` (et non d'une
// copie TypeScript) : si la migration et le Go divergent, on le voit ici avant
// de le voir en production.
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { Grid3X3, Users } from 'lucide-react';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { getAccessCapabilities, getAccessRoles } from '@/lib/admin-access-data';
import { ADMIN_DOMAIN_LABELS, ADMIN_DOMAINS, type AdminDomain } from '@/lib/admin-console';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';

export const dynamic = 'force-dynamic';

export default async function AdminAccessRolesPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.access.read');

  const [roles, capabilities] = await Promise.all([getAccessRoles(), getAccessCapabilities()]);
  const held = new Map(roles.map((role) => [role.key, new Set(role.capabilities)]));
  const byDomain = new Map<AdminDomain, typeof capabilities>(
    ADMIN_DOMAINS.map((domain) => [domain, []])
  );
  for (const capability of capabilities) {
    const bucket = byDomain.get(capability.domain as AdminDomain);
    if (bucket) bucket.push(capability);
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-10">
      <QueuePageHeader
        icon={<Grid3X3 className="w-4 h-4" />}
        title="Matrice des rôles"
        badge={`${roles.length} rôle${roles.length > 1 ? 's' : ''}`}
        description={
          <>
            Rôle × capacité, lu depuis la base. « Détenteurs » compte les attributions encore
            actives : une échéance passée ne compte pas.{' '}
            <Link href="/admin/access" className="underline">
              Revenir aux attributions
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap gap-2" data-testid="access-roles-holders">
        {roles.map((role) => (
          <span
            key={role.key}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px]"
            title={role.description}
          >
            <span className="font-semibold">{role.label}</span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Users className="w-3 h-3" /> {role.holders}
            </span>
          </span>
        ))}
      </div>

      <div className="bg-white border border-border rounded-3xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs" data-testid="access-roles-matrix">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold sticky left-0 bg-muted/40">Capacité</th>
              {roles.map((role) => (
                <th
                  key={role.key}
                  className="px-3 py-3 font-semibold text-center whitespace-nowrap"
                >
                  {role.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ADMIN_DOMAINS.map((domain) => (
              <React.Fragment key={domain}>
                <tr className="border-t border-border/70 bg-muted/20">
                  <td colSpan={roles.length + 1} className="px-4 py-2 font-semibold">
                    {ADMIN_DOMAIN_LABELS[domain]}
                  </td>
                </tr>
                {(byDomain.get(domain) ?? []).map((capability) => (
                  <tr key={capability.key} className="border-t border-border/40">
                    <td className="px-4 py-2 sticky left-0 bg-white">
                      <div className="font-medium">{capability.label}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {capability.key}
                      </div>
                    </td>
                    {roles.map((role) => {
                      const has = held.get(role.key)?.has(capability.key) ?? false;
                      return (
                        <td
                          key={role.key}
                          className="px-3 py-2 text-center"
                          data-testid={`access-matrix-${role.key}-${capability.key}`}
                        >
                          {has ? (
                            <span className="text-foreground" aria-label="détenue">
                              ●
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40" aria-label="absente">
                              ·
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
