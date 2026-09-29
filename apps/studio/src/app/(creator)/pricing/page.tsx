// =====================================================================
// 💎 /offre — comparatif Gratuit vs Pro (auteur/média)
// =====================================================================
// Data-driven (OFFERS) : gratuit = ce qui existe pour tous, Pro = la
// personnalisation email (emailPro, réel) + domaines (tranche 7, marqués
// « bientôt » — jamais de vente de vent). Pas de checkout avant Stripe :
// le CTA Pro dit « lancement prochain » + contact support (pas de fausse
// waitlist sans stockage, pas de faux bouton d'achat).
// =====================================================================

import { Crown } from 'lucide-react';
import { URLS } from '@qoe/config';
import { OfferCompare } from './components/offer-compare';

export const metadata = {
  title: 'Offre Pro | qoefi Studio',
  description: 'Gratuit ou Pro : ce qui est inclus pour votre média, et ce qui arrive.',
};

export default function OffrePage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        <Crown className="w-4 h-4" />
        Offre
      </div>
      <h1 className="text-3xl font-bold tracking-tight">Gratuit ou Pro ?</h1>
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-2xl">
        Publier et envoyer des newsletters soignées reste gratuit, pour toujours.{' '}
        <strong>Pro</strong> s&apos;adresse aux médias qui veulent leur identité jusque dans la
        boîte mail — et financent une plateforme indépendante.
      </p>
      <div className="mt-8">
        <OfferCompare supportUrl={`${URLS.APP}/support`} />
      </div>
    </main>
  );
}
