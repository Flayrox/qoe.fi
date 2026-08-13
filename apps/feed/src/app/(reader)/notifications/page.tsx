import { NotificationList } from '@/components/notifications/NotificationList';

export const metadata = {
  title: 'Notifications | qoe.fi',
  description: 'Consultez vos notifications, réponses, mentions et réactions en direct sur qoe.fi.',
};

export default function NotificationsPage() {
  return (
    <main className="w-full min-h-screen border-r border-border bg-background">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Notifications</h1>
      </div>
      <NotificationList />
    </main>
  );
}
