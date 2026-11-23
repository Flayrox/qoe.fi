// =====================================================================
// 💳 /monetization — formules d'abonnement de la publication
// =====================================================================
// Le prix, la devise et la commission vivent côté Go/Stripe. Cette page
// pilote seulement le catalogue : nom, description, prix affiché et tarif
// Stripe. Tant qu'aucun tarif Stripe n'est renseigné, le paywall refuse
// honnêtement le paiement (503) au lieu d'afficher un bouton mort.
// =====================================================================

import { redirect } from 'next/navigation';
import { getLanguage } from '@qoe/i18n/server';
import type { Metadata } from 'next';
import { requireUser } from '@qoe/auth/current-user';
import { getCreatorTiersAction } from '@qoe/sdk';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { StudioHeader, StudioPage } from '@/components/studio-page';

import { MonetizationClient } from './monetization-client';
import { t } from '@lingui/core/macro';

// Métadonnées rendues hors du provider i18n : la langue de la requête est lue
// sans activer le singleton (cf. packages/i18n/src/server.ts).
export async function generateMetadata(): Promise<Metadata> {
  const isFr = (await getLanguage()) === 'fr';
  return {
    title: isFr ? t`Monétisation | qoefi Studio` : 'Monetization | qoefi Studio',
    description: isFr
      ? t`Vos formules d’abonnement et le portail de facturation de vos lecteurs.`
      : 'Your subscription plans and your readers’ billing portal.',
  };
}

export default async function MonetizationPage() {
  const user = await requireUser();
  if (!user) {
    redirect('/login');
  }
  const workspace = await getActiveWorkspace(user.id);
  const res = await getCreatorTiersAction({ publisherId: workspace.publisherId });
  const tiers = res.ok ? res.data.tiers : [];

  return (
    <StudioPage>
      <StudioHeader
        title={t`Monétisation`}
        description={t`Vos formules d’abonnement. Le paiement, les taxes et les reversements sont traités par Stripe.`}
      />
      <MonetizationClient
        publisherId={workspace.publisherId}
        initialTiers={tiers}
        initialError={res.ok ? null : t`Formules momentanément indisponibles.`}
      />
    </StudioPage>
  );
}
