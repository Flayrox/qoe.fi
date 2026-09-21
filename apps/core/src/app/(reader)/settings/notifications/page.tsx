import AccountSettingsRoute from '../page';

export const metadata = {
  title: 'Réglages de Notifications | qoefi',
  description: 'Gérez vos préférences de notifications email et push sur qoefi.',
};

// La navigation des réglages reste persistante sur toutes les sections :
// /settings/notifications réutilise donc le shell Core complet au lieu de
// monter l'ancien formulaire isolé sans sidebar.
export default function NotificationSettingsPage() {
  return AccountSettingsRoute();
}
