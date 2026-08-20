// =====================================================================
// 🔐 Applications OAuth — apps/studio/src/app/(creator)/developer/oauth/page.tsx
// =====================================================================
// Gestion des applications OAuth 2.1 / OIDC ("Se connecter avec qoe.fi").
// =====================================================================

import { prisma } from '@qoe/db/client';
import { requireUser } from '@qoe/auth/current-user';
import { listOAuthClientsAction } from './actions';
import { OAuthAppsClient } from './OAuthAppsClient';

export const metadata = {
  title: 'Applications OAuth | qoe.fi',
  description: 'Créez des applications OAuth 2.1 / OpenID Connect pour "Se connecter avec qoe.fi".',
};

export default async function OAuthAppsPage() {
  const user = await requireUser();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { apiAccessStatus: true },
  });

  if (!dbUser) {
    return (
      <OAuthAppsClient
        status="none"
        clients={[]}
        error="Profil créateur introuvable. Veuillez contacter l'équipe technique."
      />
    );
  }

  if (dbUser.apiAccessStatus !== 'approved') {
    return <OAuthAppsClient status={dbUser.apiAccessStatus} clients={[]} />;
  }

  const res = await listOAuthClientsAction();
  return (
    <OAuthAppsClient
      status={dbUser.apiAccessStatus}
      clients={res.success ? res.clients : []}
      error={res.success ? undefined : res.error}
    />
  );
}
