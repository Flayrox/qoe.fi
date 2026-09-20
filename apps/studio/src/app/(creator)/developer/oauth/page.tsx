// =====================================================================
// 🔐 Applications OAuth — apps/studio/src/app/(creator)/developer/oauth/page.tsx
// =====================================================================
// Gestion des applications OAuth 2.1 / OIDC ("Se connecter avec qoe.fi").
// Le statut d'accès API vient du Go (GET /v1/users/me).
// =====================================================================

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { listOAuthClientsAction } from './actions';
import { OAuthAppsClient } from './OAuthAppsClient';

export const metadata = {
  title: 'Applications OAuth | qoe.fi',
  description: 'Créez des applications OAuth 2.1 / OpenID Connect pour "Se connecter avec qoe.fi".',
};

export default async function OAuthAppsPage() {
  const user = await requireUser();
  if (!user) {
    redirect('/login');
  }

  const workspace = await getActiveWorkspace(user.id);
  const isMedia = workspace.type === 'MEDIA';

  let status = 'none';
  let hasOAuthGrant = false;

  if (isMedia) {
    // Mode Média : les applications OAuth sont rattachées au Média (auto-approuvé)
    status = 'approved';
    hasOAuthGrant = true;
  } else {
    try {
      const me = await goFetch<{
        data: { apiAccessStatus: string; apiGrants: string[] };
      }>('/v1/users/me');
      status = (me.data?.apiAccessStatus ?? 'none').toLowerCase();
      hasOAuthGrant = status === 'approved' && (me.data?.apiGrants ?? []).includes('oauth');
    } catch (err) {
      console.warn('[developer/oauth] impossible de lire le profil utilisateur:', err);
    }
  }

  const workspaceContext = {
    type: workspace.type,
    name: workspace.name,
    publicationId: workspace.publicationId,
  };

  if (status !== 'approved' || !hasOAuthGrant) {
    return (
      <OAuthAppsClient
        status={status}
        hasOAuthGrant={hasOAuthGrant}
        clients={[]}
        workspace={workspaceContext}
      />
    );
  }

  const res = await listOAuthClientsAction(isMedia ? workspace.publicationId : undefined);
  return (
    <OAuthAppsClient
      status={status}
      hasOAuthGrant={hasOAuthGrant}
      clients={res.success ? res.clients : []}
      error={res.success ? undefined : res.error}
      workspace={workspaceContext}
    />
  );
}
