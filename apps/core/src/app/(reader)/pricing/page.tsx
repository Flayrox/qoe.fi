// =====================================================================
// 💎 /pricing — Offres & Abonnement Lecteur (Gratuit vs Plus)
// =====================================================================
// Convention d'URL : /pricing (slug EN acté).
// Présentation transparente de l'offre Plus (audio TTS, packs hors-ligne,
// résumés IA, thèmes confort) et rappel que Studio Pro inclut Plus.
// =====================================================================

import { Crown } from 'lucide-react';
import { PricingCompare } from './components/pricing-compare';

export const metadata = {
  title: 'Abonnements & Offres | qoefi',
  description: 'Découvrez la formule Qoefi Plus pour enrichir votre expérience de lecture.',
};

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-2">
        <Crown className="w-4 h-4" />
        Offres & Abonnements
      </div>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
        Choisissez votre expérience de lecture
      </h1>
      <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed max-w-2xl">
        Lire, surligner et échanger reste gratuit pour toujours. <strong>Qoefi Plus</strong> apporte
        le confort audio, le hors-ligne et l&apos;intelligence de lecture à ceux qui veulent aller
        plus loin.
      </p>

      <div className="mt-8">
        <PricingCompare supportUrl="/support" />
      </div>
    </main>
  );
}
