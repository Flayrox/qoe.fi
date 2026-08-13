import { NotificationSettingsForm } from '@/components/notifications/NotificationSettingsForm';

export const metadata = {
  title: 'Réglages de Notifications | qoe.fi',
  description: 'Gérez vos préférences de notifications email et push sur qoe.fi.',
};

export default function NotificationSettingsPage() {
  return (
    <main className="w-full min-h-screen border-r border-border bg-background py-6">
      <NotificationSettingsForm />
    </main>
  );
}
