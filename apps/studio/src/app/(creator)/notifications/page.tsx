// =====================================================================
// 🔔 Notifications — apps/studio/src/app/(creator)/notifications/page.tsx
// =====================================================================
// Centre de notifications du créateur (soumissions, invitations média,
// réactions, commentaires). Réutilise le composant partagé @qoe/ui.
// =====================================================================

import { NotificationList } from '@qoe/ui/notifications';
import { getLanguage } from '@qoe/i18n/server';
import type { Metadata } from 'next';
import { StudioHeader, StudioSection } from '@/components/studio-page';
import { t } from '@lingui/core/macro';

// Métadonnées rendues hors du provider i18n : la langue de la requête est lue
// sans activer le singleton (cf. packages/i18n/src/server.ts).
export async function generateMetadata(): Promise<Metadata> {
  const isFr = (await getLanguage()) === 'fr';
  return {
    title: isFr ? 'Notifications | qoefi' : 'Notifications | qoefi',
    description: isFr
      ? t`Vos notifications créateur et média sur qoefi.`
      : 'Your creator and publication notifications on qoefi.',
  };
}

export default function DashboardNotificationsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <StudioHeader
        title={t`Notifications`}
        description={t`Invitations, soumissions, réactions et nouveaux membres.`}
      />
      <StudioSection className="p-0" bodyClassName="overflow-hidden rounded-xl">
        <NotificationList />
      </StudioSection>
    </div>
  );
}
