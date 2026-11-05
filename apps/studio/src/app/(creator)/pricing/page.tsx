// =====================================================================
// 💎 /offre — comparatif Gratuit vs Pro (auteur/média)
// =====================================================================
// Data-driven (OFFERS) : gratuit = ce qui existe pour tous, Pro = la
// personnalisation email (emailPro, réel) + domaines (tranche 7, marqués
// « bientôt » — jamais de vente de vent). Pas de checkout avant Stripe :
// le CTA Pro dit « lancement prochain » + contact support (pas de fausse
// waitlist sans stockage, pas de faux bouton d'achat).
// =====================================================================

import { URLS } from '@qoe/config';
import { StudioHeader, StudioPage } from '@/components/studio-page';
import { OfferCompare } from './components/offer-compare';

export const metadata = {
  title: 'Offre Pro | qoefi Studio',
  description: 'Gratuit ou Pro : ce qui est inclus pour votre média, et ce qui arrive.',
};

export default function OffrePage() {
  return (
    <StudioPage>
      <StudioHeader
        title="Offres"
        description="Ce qui est inclus pour tous, et ce que débloque le forfait Pro."
      />
      <OfferCompare supportUrl={`${URLS.APP}/support`} />
    </StudioPage>
  );
}
