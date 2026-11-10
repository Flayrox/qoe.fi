// =====================================================================
// 🔐 Applications OAuth — apps/studio/src/app/(creator)/developer/oauth/page.tsx
// =====================================================================

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { listOAuthClientsAction } from './actions';
import { OAuthAppsClient } from './OAuthAppsClient';
import { getDeveloperAccess } from '@/features/developer/server';
import {
  developerWorkspaceAccess,
  hasDeveloperGrant,
  type DeveloperAccess,
  type DeveloperWorkspace,
} from '@/features/developer/types';

export const metadata = {
  title: 'Applications OAuth | qoefi',
  description: 'Créez des applications OAuth 2.1 / OpenID Connect pour "Se connecter avec qoefi".',
};

export default async function OAuthAppsPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const activeWorkspace = await getActiveWorkspace(user.id);
  const workspace: DeveloperWorkspace = {
    type: activeWorkspace.type,
    name: activeWorkspace.name,
    mediaId: activeWorkspace.mediaId,
    publisherId: activeWorkspace.publisherId,
  };
  const access: DeveloperAccess =
    workspace.type === 'MEDIA' ? developerWorkspaceAccess(workspace) : await getDeveloperAccess();
  const hasOAuthGrant = hasDeveloperGrant(access, 'oauth');

  const workspaceContext = {
    type: workspace.type,
    name: workspace.name,
    publisherId: workspace.publisherId,
  };

  if (access.status !== 'approved' || !hasOAuthGrant) {
    return <OAuthAppsClient access={access} clients={[]} workspace={workspaceContext} />;
  }

  const res = await listOAuthClientsAction(
    workspace.type === 'MEDIA' ? workspace.publisherId : undefined
  );
  return (
    <OAuthAppsClient
      access={access}
      clients={res.success ? res.clients : []}
      error={res.success ? undefined : res.error}
      workspace={workspaceContext}
    />
  );
}
