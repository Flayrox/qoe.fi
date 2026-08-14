// =====================================================================
// 🔔 Notifications — apps/dashboard/src/app/(creator)/notifications/page.tsx
// =====================================================================
// Centre de notifications du créateur (soumissions, invitations média,
// réactions, commentaires). Réutilise le composant partagé @qoe/ui.
// =====================================================================

import { NotificationList } from '@qoe/ui/notifications';

export const metadata = {
  title: 'Notifications | qoe.fi',
  description: 'Vos notifications créateur et média sur qoe.fi.',
};

export default function DashboardNotificationsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Notifications
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Invitations, soumissions, réactions et nouveaux membres.
        </p>
      </div>
      <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
        <NotificationList />
      </div>
    </div>
  );
}
