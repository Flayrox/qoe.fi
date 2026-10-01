// =====================================================================
// 🔎 /admin/access/people/{userId} — « pourquoi cette personne détient-elle
// ceci ? »
// =====================================================================
// La question qu'on se pose devant un incident, et à laquelle un journal brut ne
// répond pas : la capacité est nommée, son RÔLE PORTEUR est nommé, l'échéance est
// affichée, et la promotion historique est distinguée d'une attribution.
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { UserSearch } from 'lucide-react';
import { getAdminIdentity, hasCapability, requireCapability } from '@/lib/admin-identity';
import { getAccessPerson, getAccessRoles } from '@/lib/admin-access-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { StatusPill } from '@/components/queue/StatusPill';
import { AccessGrantForm } from '../../components/access-grant-form';

export const dynamic = 'force-dynamic';

interface AccessPersonPageProps {
  params: Promise<{ userID: string }>;
}

const fmt = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('fr-FR') : '—');

export default async function AdminAccessPersonPage({ params }: AccessPersonPageProps) {
  const { userID } = await params;
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.access.read');
  const canGrant = hasCapability(identity, 'admin.access.grant');

  const [person, roles] = await Promise.all([getAccessPerson(userID), getAccessRoles()]);
  if (!person) notFound();

  return (
    <div className="w-full max-w-4xl mx-auto space-y-10">
      <QueuePageHeader
        icon={<UserSearch className="w-4 h-4" />}
        title={person.name ?? person.username ?? person.email}
        badge={person.legacySuperadmin ? 'superadmin historique' : null}
        description={
          <>
            {person.email} — {person.capabilities.length} capacité(s) effective(s).{' '}
            <Link href="/admin/access" className="underline">
              Revenir aux attributions
            </Link>
          </>
        }
      />

      {person.legacySuperadmin && (
        <p className="rounded-2xl border border-border bg-muted/40 p-4 text-xs">
          Cette personne porte la promotion historique{' '}
          <span className="font-mono">User.role = &apos;superadmin&apos;</span> : elle détient
          TOUTES les capacités, indépendamment des rôles listés ci-dessous. Retirer un rôle de la
          matrice ne la verrouille donc pas — c&apos;est volontaire (aucun superadmin existant ne
          peut être verrouillé par l&apos;introduction des rôles).
        </p>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Rôles attribués</h2>
        {person.roles.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="access-person-no-roles">
            Aucun rôle attribué. Cette personne n&apos;ouvre aucun écran de la console
            {person.legacySuperadmin ? ' — sauf par la promotion historique.' : '.'}
          </p>
        ) : (
          <div className="bg-white border border-border rounded-3xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs" data-testid="access-person-roles">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Rôle</th>
                  <th className="px-4 py-3 font-semibold">Attribué le</th>
                  <th className="px-4 py-3 font-semibold">Échéance</th>
                  <th className="px-4 py-3 font-semibold">État</th>
                </tr>
              </thead>
              <tbody>
                {person.roles.map((role) => (
                  <tr key={role.roleKey} className="border-t border-border/70">
                    <td className="px-4 py-3">
                      <div className="font-medium">{role.roleLabel}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {role.roleKey}
                      </div>
                    </td>
                    <td className="px-4 py-3">{fmt(role.grantedAt)}</td>
                    <td className="px-4 py-3">{fmt(role.expiresAt)}</td>
                    <td className="px-4 py-3">
                      <StatusPill tone={role.state === 'active' ? 'hot' : 'muted'}>
                        {role.state === 'active' ? 'actif' : 'échu'}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Capacités effectives, et leur provenance</h2>
        {person.capabilities.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="access-person-no-capabilities">
            Aucune capacité : rien n&apos;est ouvert.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="access-person-capabilities">
            {person.capabilities.map((capability) => (
              <li
                key={capability}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-4 py-2"
              >
                <span className="font-mono text-[11px]">{capability}</span>
                <span className="text-[11px] text-muted-foreground">
                  {(person.capabilitySources[capability] ?? []).join(', ') || 'provenance inconnue'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AccessGrantForm
        people={[
          {
            userId: person.userId,
            email: person.email,
            name: person.name,
            username: person.username,
            roles: person.roles
              .filter((role) => role.state === 'active')
              .map((role) => role.roleKey),
            legacySuperadmin: person.legacySuperadmin,
          },
        ]}
        roles={roles}
        canGrant={canGrant}
      />
    </div>
  );
}
