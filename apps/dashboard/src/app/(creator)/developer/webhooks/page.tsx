// =====================================================================
// 🔗 Webhooks — apps/dashboard/src/app/(creator)/developer/webhooks/page.tsx
// =====================================================================

import { listWebhooksAction } from './actions';
import { WebhooksClient } from './WebhooksClient';

export const metadata = {
  title: 'Webhooks | qoe.fi',
  description: 'Recevez les événements de votre publication en temps réel.',
};

export default async function WebhooksPage() {
  const res = await listWebhooksAction();

  return (
    <WebhooksClient
      initialWebhooks={res.success ? res.webhooks : []}
      events={res.success ? res.events : []}
      workspaceName={res.success ? res.workspaceName : ''}
    />
  );
}
