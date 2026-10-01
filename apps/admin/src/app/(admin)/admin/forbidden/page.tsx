// =====================================================================
// ⛔ /admin/forbidden — le refus, dit clairement
// =====================================================================
// Deux façons d'arriver ici :
//   - un écran précis a redirigé (garde de capacité) :
//     ?capability=admin.audit.read&screen=/admin/audit ;
//   - le compte n'ouvre aucun écran (aucune capacité).
// Dans les deux cas, aucune redirection silencieuse : on explique.
// =====================================================================

import { getAdminIdentity } from '@/lib/admin-identity';
import { isAdminCapability, type AdminCapability } from '@/lib/admin-console';
import { AccessDenied } from '../components/AccessDenied';

export const dynamic = 'force-dynamic';

interface ForbiddenPageProps {
  searchParams: Promise<{ capability?: string; screen?: string }>;
}

export default async function ForbiddenPage({ searchParams }: ForbiddenPageProps) {
  const params = await searchParams;
  const identity = await getAdminIdentity();

  // Une capacité hors vocabulaire n'est pas « manquante » : elle n'existe pas.
  // On ne l'affiche pas — sinon l'écran de refus enseignerait un faux droit.
  const missing = (params.capability ?? '')
    .split(',')
    .map((capability) => capability.trim())
    .filter((capability) => isAdminCapability(capability));

  return (
    <AccessDenied
      missing={missing}
      roles={identity?.roles ?? []}
      capabilities={(identity?.capabilities ?? []) as AdminCapability[]}
      screen={params.screen}
    />
  );
}
