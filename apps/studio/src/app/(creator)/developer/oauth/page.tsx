// =====================================================================
// 🔐 Applications OAuth — apps/studio/src/app/(creator)/developer/oauth/page.tsx
// =====================================================================
// Gestion des applications OAuth 2.1 / OIDC ("Se connecter avec qoe.fi").
// Le statut d'accès API vient du Go (GET /v1/users/me).
// =====================================================================

import { requireUser } from '@qoe/auth/current-user';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { listOAuthClientsAction } from './actions';
import { OAuthAppsClient } from './OAuthAppsClient';

export const metadata = {
  title: 'Applications OAuth | qoe.fi',
  description: 'Créez des applications OAuth 2.1 / OpenID Connect pour "Se connecter avec qoe.fi".',
};

export default async function OAuthAppsPage() {
  const user = await requireUser();

  // Go : statut d'accès API (chemin nominal).
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
}
