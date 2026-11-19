import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { BillingClient, type BillingData } from './BillingClient';
import { normalizeBillingData } from './billing-helpers';

export const metadata = {
  title: 'Portefeuille & Abonnements | Qoe',
  description: 'Gérez votre solde, vos abonnements créateurs et l’historique de vos transactions.',
};

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Go (backend-of-record, requis en Phase 3). Un portefeuille indisponible
  // n'est pas une erreur de page : on rend des compteurs à zéro.
  const billing = normalizeBillingData(
    await goFetch<BillingData>('/v1/me/billing').catch(() => null)
  );

  const userName =
    (user.user_metadata?.name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split('@')[0];

  return <BillingClient billing={billing} userEmail={user.email} userName={userName} />;
}
