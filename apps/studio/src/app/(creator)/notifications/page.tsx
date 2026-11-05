// =====================================================================
// 🔔 Notifications — apps/studio/src/app/(creator)/notifications/page.tsx
// =====================================================================
// Centre de notifications du créateur (soumissions, invitations média,
// réactions, commentaires). Réutilise le composant partagé @qoe/ui.
// =====================================================================

import { NotificationList } from '@qoe/ui/notifications';
import { StudioHeader, StudioSection } from '@/components/studio-page';

export const metadata = {
  title: 'Notifications | qoefi',
  description: 'Vos notifications créateur et média sur qoefi.',
};

export default function DashboardNotificationsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <StudioHeader
        title="Notifications"
        description="Invitations, soumissions, réactions et nouveaux membres."
      />
      <StudioSection className="p-0" bodyClassName="overflow-hidden rounded-xl">
        <NotificationList />
      </StudioSection>
    </div>
  );
}
