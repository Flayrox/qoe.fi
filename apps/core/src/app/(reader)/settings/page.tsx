import { redirect } from 'next/navigation';
import { getAccountSettingsAction } from './actions';
import AccountSettingsPage from './SettingsPageClient';

export const metadata = {
  title: 'Réglages du compte | qoefi',
  description:
    'Gérez votre compte, votre sécurité, votre confidentialité, votre lecture et vos données qoefi.',
};

export default async function AccountSettingsRoute() {
  try {
    const initialData = await getAccountSettingsAction();
    return <AccountSettingsPage initialData={initialData} />;
  } catch {
    redirect('/login?redirect=/settings');
  }
}
