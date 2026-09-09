// =====================================================================
// 🔗 Webhooks — apps/studio/src/app/(creator)/developer/webhooks/page.tsx
// =====================================================================
// L'API sortante (webhooks) est une permission modulable : si l'admin ne l'a
// pas accordée, la page affiche un message clair au lieu d'une erreur 403.

import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { listWebhooksAction } from './actions';
import { WebhooksClient } from './WebhooksClient';

export const metadata = {
  title: 'Webhooks | qoe.fi',
  description: 'Recevez les événements de votre publication en temps réel.',
};

export default async function WebhooksPage() {
  const me = await goFetch<{
    data: { apiAccessStatus: string; apiGrants: string[] };
  }>('/v1/users/me');
  const hasWebhookGrant = (me.data?.apiGrants ?? []).includes('webhooks');

  const res = await listWebhooksAction();

  return (
    <WebhooksClient
      initialWebhooks={res.success ? res.webhooks : []}
      events={res.success ? res.events : []}
      workspaceName={res.success ? res.workspaceName : ''}
      hasWebhookGrant={hasWebhookGrant}
    />
  );
}
