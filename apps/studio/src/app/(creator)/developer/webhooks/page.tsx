// =====================================================================
// 🔗 Webhooks — apps/studio/src/app/(creator)/developer/webhooks/page.tsx
// =====================================================================

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { listWebhooksAction } from './actions';
import { WebhooksClient } from './WebhooksClient';
import { getDeveloperAccess } from '@/features/developer/server';
import {
  developerWorkspaceAccess,
  hasDeveloperGrant,
  type DeveloperWorkspace,
} from '@/features/developer/types';

export const metadata = {
  title: 'Webhooks | qoefi',
  description: 'Recevez les événements de votre site web en temps réel.',
};

export default async function WebhooksPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  let workspaceName = '';
  let workspace: DeveloperWorkspace = {
    type: 'PERSONAL',
    name: '',
    publisherId: '',
  };

  try {
    const activeWorkspace = await getActiveWorkspace(user.id);
    workspaceName = activeWorkspace.name;
    workspace = {
      type: activeWorkspace.type,
      name: activeWorkspace.name,
      mediaId: activeWorkspace.mediaId,
      publisherId: activeWorkspace.publisherId,
    };
  } catch (err) {
    console.warn('[webhooks] impossible de lire le workspace actif:', err);
  }

  const access =
    workspace.type === 'MEDIA' ? developerWorkspaceAccess(workspace) : await getDeveloperAccess();
  const hasWebhookGrant = hasDeveloperGrant(access, 'webhooks');

  // Ne pas appeler l'API webhooks sans la permission : évite un 403 bloquant.
  const res = hasWebhookGrant
    ? await listWebhooksAction()
    : {
        success: true as const,
        webhooks: [],
        events: [
          'article.published',
          'article.updated',
          'article.deleted',
          'subscriber.created',
        ] as const,
        workspaceName,
      };

  return (
    <WebhooksClient
      access={access}
      initialWebhooks={res.success ? res.webhooks : []}
      events={res.events ?? []}
      workspaceName={res.workspaceName || workspaceName}
    />
  );
}
