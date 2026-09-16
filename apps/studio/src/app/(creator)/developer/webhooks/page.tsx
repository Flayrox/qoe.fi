// =====================================================================
// 🔗 Webhooks — apps/studio/src/app/(creator)/developer/webhooks/page.tsx
// =====================================================================
// L'API sortante (webhooks) est une permission modulable : si l'admin ne l'a
// pas accordée, la page affiche un message clair au lieu d'une erreur 403.

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { listWebhooksAction } from './actions';
import { WebhooksClient } from './WebhooksClient';

export const metadata = {
  title: 'Webhooks | qoe.fi',
  description: 'Recevez les événements de votre publication en temps réel.',
};

export default async function WebhooksPage() {
  const user = await requireUser();
  if (!user) {
    redirect('/login');
  }

  let hasWebhookGrant = false;
  let apiAccessStatus = 'none';
  let workspaceName = '';

  try {
    const workspace = await getActiveWorkspace(user.id);
    workspaceName = workspace.name;
  } catch (err) {
    console.warn('[webhooks] impossible de lire le workspace actif:', err);
  }

  try {
    const me = await goFetch<{
      data: { apiAccessStatus: string; apiGrants: string[] };
    }>('/v1/users/me');
    apiAccessStatus = (me.data?.apiAccessStatus ?? 'none').toLowerCase();
    hasWebhookGrant =
      apiAccessStatus === 'approved' && (me.data?.apiGrants ?? []).includes('webhooks');
  } catch (err) {
    console.warn('[webhooks] impossible de lire le statut utilisateur:', err);
  }

  // Ne pas appeler l'API webhooks si la permission n'est pas accordée (évite un 403 bloquant)
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
      initialWebhooks={res.success ? res.webhooks : []}
      events={res.events ?? []}
      workspaceName={res.workspaceName || workspaceName}
      hasWebhookGrant={hasWebhookGrant}
      apiAccessStatus={apiAccessStatus}
    />
  );
}
