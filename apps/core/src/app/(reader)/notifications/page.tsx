import { NotificationList } from '@qoe/ui/notifications';

export const metadata = {
  title: 'Notifications | qoe.fi',
  description: 'Consultez vos notifications, réponses, mentions et réactions en direct sur qoe.fi.',
};

export default function NotificationsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-border/40">
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                Notifications
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Toutes vos interactions, mentions et alertes en temps réel.
              </p>
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-border/50 overflow-hidden shadow-xs">
            <NotificationList />
          </div>
        </div>
      </div>
    </div>
  );
}
