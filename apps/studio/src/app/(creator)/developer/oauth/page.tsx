// =====================================================================
// 🔐 Applications OAuth — apps/studio/src/app/(creator)/developer/oauth/page.tsx
// =====================================================================
// Gestion des applications OAuth 2.1 / OIDC ("Se connecter avec qoe.fi").
// Le statut d'accès API vient du Go (GET /v1/users/me) — fallback Prisma dev.
// =====================================================================

import { prisma } from '@qoe/db/client';
import { requireUser } from '@qoe/auth/current-user';
import { goFetch, isGoEnabled } from '@qoe/api-client/actions/utils/go-client';
import { listOAuthClientsAction } from './actions';
import { OAuthAppsClient } from './OAuthAppsClient';

export const metadata = {
  title: 'Applications OAuth | qoe.fi',
  description: 'Créez des applications OAuth 2.1 / OpenID Connect pour "Se connecter avec qoe.fi".',
};

export default async function OAuthAppsPage() {
  const user = await requireUser();

  // Go en primaire : statut d'accès API (chemin nominal).
  if (isGoEnabled()) {
    try {
      const me = await goFetch<{ data: { apiAccessStatus: string } }>('/v1/users/me');
      const status = me.data.apiAccessStatus;

      if (status !== 'approved') {
        return <OAuthAppsClient status={status} clients={[]} />;
      }

      const res = await listOAuthClientsAction();
      return (
        <OAuthAppsClient
          status={status}
          clients={res.success ? res.clients : []}
          error={res.success ? undefined : res.error}
        />
      );
    } catch {
      // Fallback Prisma dev ci-dessous (QOE_API_URL indisponible).
    }
  }

  // ⚠️ Fallback dev — le chemin nominal est le Go ci-dessus.
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
