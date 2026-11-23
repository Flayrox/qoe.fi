// =====================================================================
// 🔐 Applications OAuth — apps/studio/src/app/(creator)/developer/oauth/page.tsx
// =====================================================================

import { redirect } from 'next/navigation';
import { getLanguage } from '@qoe/i18n/server';
import type { Metadata } from 'next';
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
import { t } from '@lingui/core/macro';

// Métadonnées rendues hors du provider i18n : la langue de la requête est lue
// sans activer le singleton (cf. packages/i18n/src/server.ts).
export async function generateMetadata(): Promise<Metadata> {
  const isFr = (await getLanguage()) === 'fr';
  return {
    title: isFr ? 'Applications OAuth | qoefi' : 'OAuth applications | qoefi',
    description: isFr
      ? t`Créez des applications OAuth 2.1 / OpenID Connect pour "Se connecter avec qoefi".`
      : 'Create OAuth 2.1 / OpenID Connect apps for "Sign in with qoefi".',
  };
}

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
