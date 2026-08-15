import { redirect } from 'next/navigation';
import { getAccountSettingsAction } from './actions';
import AccountSettingsPage from './SettingsPageClient';

export const metadata = {
  title: 'Réglages du compte | qoe.fi',
  description: 'Gérez votre profil, votre confidentialité, votre lecture et vos données qoe.fi.',
};

export default async function AccountSettingsRoute() {
  try {
    const initialData = await getAccountSettingsAction();
    return <AccountSettingsPage initialData={initialData} />;
  } catch {
    redirect('/login?redirect=/settings');
  }
}
