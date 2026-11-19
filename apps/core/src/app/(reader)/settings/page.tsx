import { redirect } from 'next/navigation';
import { createClient } from '@qoe/supabase/server';
import { getAccountSettingsAction } from './actions';
import AccountSettingsPage from './SettingsPageClient';

export const metadata = {
  title: 'Réglages du compte | qoefi',
  description:
    'Gérez votre compte, votre sécurité, votre confidentialité, votre lecture et vos données qoefi.',
};

export default async function AccountSettingsRoute() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Pas de session = retour au login. Une session valide ne doit JAMAIS être
  // renvoyée au login parce que le backend Go est en panne.
  if (!user) redirect('/login?redirect=/settings');

  try {
    const initialData = await getAccountSettingsAction();
    return <AccountSettingsPage initialData={initialData} />;
  } catch (error) {
    // Seule une session expirée (401 Go) justifie le retour au login ; toute
    // autre panne remonte honnêtement (500) au lieu de faire croire à une
    // déconnexion.
    if ((error as { status?: number })?.status === 401) {
      redirect('/login?redirect=/settings');
    }
    throw error;
  }
}
