// =====================================================================
// 🚪 /admin/access — nommer quelqu'un, dater, révoquer (plan, Phase 2)
// =====================================================================
// L'écran qui supprime la dernière opération exigeant du SQL : attribuer un rôle
// depuis la console. Trois gestes, chacun tracé :
//   1. chercher la personne (motif d'au moins deux caractères) ;
//   2. choisir le rôle et l'échéance (vide = sans fin) ;
//   3. écrire le MOTIF — obligatoire pour attribuer comme pour révoquer.
//
// Les décisions que la console ne prend pas ici : pas d'escalade (on ne
// distribue que ce qu'on détient), pas de retrait de son propre dernier rôle,
// pas de révocation du dernier superadmin. Elles vivent dans le service Go, et
// l'écran les affiche telles que le serveur les refuse.
// =====================================================================

import React from 'react';
import { KeyRound } from 'lucide-react';
import Link from 'next/link';
import { getAdminIdentity, hasCapability, requireCapability } from '@/lib/admin-identity';
import { getAccessGrants, getAccessRoles, searchAccessPeople } from '@/lib/admin-access-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { AccessGrantForm } from './components/access-grant-form';
import { AccessGrantsTable } from './components/access-grants-table';

export const dynamic = 'force-dynamic';

interface AccessPageProps {
  searchParams: Promise<{ q?: string; person?: string }>;
}

export default async function AdminAccessPage({ searchParams }: AccessPageProps) {
  const params = await searchParams;
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.access.read');
  const canGrant = hasCapability(identity, 'admin.access.grant');

  const [grants, roles, people] = await Promise.all([
    getAccessGrants(params.q ?? ''),
    getAccessRoles(),
    params.person ? searchAccessPeople(params.person) : Promise.resolve([]),
  ]);

  const active = grants.filter((grant) => grant.state === 'active').length;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <QueuePageHeader
        icon={<KeyRound className="w-4 h-4" />}
        title="Accès staff"
        badge={active > 0 ? `${active} actif${active > 1 ? 's' : ''}` : null}
        description={
          <>
            Qui ouvre quoi : rôles attribués, échéances, provenance. Chaque mouvement exige un motif
            et laisse une ligne d’audit. La{' '}
            <Link href="/admin/access/roles" className="underline">
              matrice des rôles
            </Link>{' '}
            montre ce que chaque rôle accorde — elle vient de la base, pas d’une copie.
          </>
        }
      />

      <AccessGrantForm people={people} roles={roles} canGrant={canGrant} />

      <AccessGrantsTable grants={grants} query={params.q ?? ''} canGrant={canGrant} />
    </div>
  );
}
