'use client';

// =====================================================================
// 💳 PlusCheckoutCta — souscription Qoefi Plus (Stripe Checkout)
// =====================================================================
// Le backend renvoie une URL Stripe ; si la clé n'est pas configurée il
// répond 503 et on affiche un message honnête (jamais un bouton qui ne
// fait rien). Non connecté → invitation à se connecter, pas une erreur
// technique.
// =====================================================================

import { useState } from 'react';
import Link from 'next/link';
import { startSubscriptionCheckoutAction } from '@qoe/sdk';
import { Button } from '@qoe/ui/button';
import { Icon } from '@qoe/ui/icons';
import { t } from '@lingui/core/macro';

export function PlusCheckoutCta() {
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
      <Button
        variant="solid"
        tone="brand"
        size="sm"
        block
        loading={loading}
        onClick={() => void start()}
      >
        <Icon name="sparkles" />
        {t`Souscrire à Qoefi Plus (3,99 €/mois)`}
      </Button>
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
