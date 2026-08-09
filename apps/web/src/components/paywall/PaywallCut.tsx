'use client';

/**
 * 🔒 PAYWALL CUT COMPONENT — @qoe/web
 *
 * Glassmorphic Apple Music Web aesthetic CTA card displayed when a guest
 * or free reader encounters a paywalled article segment.
 */

import React, { useState } from 'react';
import { Lock, Sparkles, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { useCreateCheckoutSession } from '@qoe/api-client';

export interface PaywallCutProps {
  creatorId: string;
  creatorName: string;
  articleTitle: string;
  monthlyPriceCents?: number;
  stripePriceId?: string;
  readerEmail?: string;
}

export function PaywallCut({
  creatorId,
  creatorName,
  articleTitle,
  monthlyPriceCents = 500,
  stripePriceId,
  readerEmail = '',
}: PaywallCutProps) {
  const [email, setEmail] = useState(readerEmail);
  const [emailError, setEmailError] = useState('');
  const checkoutMutation = useCreateCheckoutSession();

  const formattedPrice = (monthlyPriceCents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  });

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setEmailError('Veuillez saisir une adresse e-mail valide.');
      return;
    }
    setEmailError('');

    try {
      const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
      const result = await checkoutMutation.mutateAsync({
        creatorId,
        readerEmail: email,
        stripePriceId: stripePriceId || 'price_default',
        successUrl: `${currentUrl}?subscribed=true`,
        cancelUrl: currentUrl,
      });

      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err: any) {
      setEmailError(err?.message || 'Erreur lors du lancement de la souscription.');
    }
  };

  return (
    <div className="relative my-12 overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-b from-zinc-900/90 via-zinc-900/95 to-black p-8 text-white shadow-2xl backdrop-blur-xl md:p-12">
      {/* Top ambient glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-96 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-xl text-center">
        {/* Header Badge */}
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-medium text-amber-400 backdrop-blur-md">
          <Lock className="h-3.5 w-3.5 text-amber-400" />
          <span>Contenu réservé aux abonnés payants</span>
        </div>

        {/* Title */}
        <h3 className="mb-3 text-2xl font-bold tracking-tight text-white md:text-3xl font-sans">
          Poursuivez votre lecture de « {articleTitle} »
        </h3>

        <p className="mb-8 text-sm text-zinc-300 leading-relaxed font-sans">
          Soutenez l'indépendance de <span className="font-semibold text-white">{creatorName}</span> et débloquez l'accès intégral à tous les écrits et archives exclusives.
        </p>

        {/* Features List */}
        <div className="mb-8 grid grid-cols-1 gap-3 text-left text-xs text-zinc-300 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-400" />
            <span>Accès illimité aux articles payants</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-400" />
            <span>Édition newsletter complète par e-mail</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-400" />
            <span>Accès aux fils de commentaires VIP</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-400" />
            <span>Résiliation sans engagement en 1 clic</span>
          </div>
        </div>

        {/* Checkout Form */}
        <form onSubmit={handleSubscribe} className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre.email@exemple.com"
              required
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-sm text-white placeholder-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 font-sans"
            />
            <button
              type="submit"
              disabled={checkoutMutation.isPending}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-sm font-semibold text-zinc-950 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 cursor-pointer font-sans shadow-lg shadow-amber-500/20"
            >
              {checkoutMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-950" />
              ) : (
                <>
                  <span>S'abonner ({formattedPrice}/mois)</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          {emailError && (
            <p className="text-left text-xs text-red-400 font-sans">{emailError}</p>
          )}
        </form>

        <p className="mt-4 text-[11px] text-zinc-400 font-sans">
          Paiement 100% sécurisé via Stripe • Annulation possible à tout moment
        </p>
      </div>
    </div>
  );
}
