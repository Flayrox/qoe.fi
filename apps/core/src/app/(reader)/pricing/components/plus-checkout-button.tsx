'use client';

// =====================================================================
// 💳 PlusCheckoutButton — souscription Qoefi Plus (Stripe Checkout)
// =====================================================================
// Le backend renvoie une URL Stripe ; si la clé n'est pas configurée il
// répond 503 et on affiche un message honnête (jamais un bouton qui ne
// fait rien). Non connecté → invitation à se connecter, pas une erreur
// technique.
// =====================================================================

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Sparkles } from 'lucide-react';
import { startSubscriptionCheckoutAction } from '@qoe/sdk';
import { t } from '@lingui/core/macro';

export function PlusCheckoutButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  const start = async () => {
    if (loading) return;
    setError(null);
    setNeedsLogin(false);
    setLoading(true);
    try {
      const res = await startSubscriptionCheckoutAction({ plan: 'plus' });
      if (res.ok) {
        window.location.href = res.data.url;
        return;
      }
      if (res.error?.code === 'UNAUTHORIZED') {
        setNeedsLogin(true);
        return;
      }
      setError(
        t`Le paiement par carte n’est pas encore ouvert. Écrivez-nous pour un accès anticipé.`
      );
    } catch {
      setError(t`Paiement momentanément indisponible.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-xs hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        {t`Souscrire à Qoefi Plus (3,99 €/mois)`}
      </button>
      {needsLogin && (
        <p className="text-[11px] text-muted-foreground text-center">
          <Link href="/login?redirect=/pricing" className="font-semibold text-foreground underline">
            {t`Connectez-vous`}
          </Link>{' '}
          {t`pour soutenir la plateforme.`}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[11px] text-muted-foreground text-center">
          {error}
        </p>
      )}
    </div>
  );
}
