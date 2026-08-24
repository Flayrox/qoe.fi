'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Lock, Wallet, Loader2, AlertCircle } from 'lucide-react';
import {
  unlockArticleWithWalletAction as unlockArticleWithWallet,
  getCurrentUserWalletAction as getCurrentUser,
} from '@qoe/sdk/actions/tenant';

import { cn } from '@qoe/utils';
import { sanitizeHtml } from '@/lib/sanitize';
import { t } from '@lingui/core/macro';

interface PaywallCutProps {
  contentHtml: string;
  isPremium: boolean;
  name: string | null;
  isBrutalist: boolean;
  accentColor: string | null;
  mainAppUrl: string;
  creatorId: string;
}

export function PaywallCut({
  contentHtml,
  isPremium,
  name,
  isBrutalist,
  accentColor,
  mainAppUrl,
  creatorId,
}: PaywallCutProps) {
  const safeHtml = sanitizeHtml(contentHtml);

  // If not premium, render full content
  if (!isPremium) {
    return <div dangerouslySetInnerHTML={{ __html: safeHtml }} />;
  }

  // If isPremium is true, the contentHtml has already been safely truncated on the server (RSC).
  // Render the teaser HTML and the PaywallOverlay directly.
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
      <PaywallOverlay
        name={name}
        isBrutalist={isBrutalist}
        accentColor={accentColor}
        mainAppUrl={mainAppUrl}
        creatorId={creatorId}
      />
    </>
  );
}

interface WalletUser {
  walletBalanceCents?: number | null;
  name?: string | null;
  email?: string | null;
}

function PaywallOverlay({
  name,
  isBrutalist,
  accentColor,
  mainAppUrl,
  creatorId,
}: {
  name: string | null;
  isBrutalist: boolean;
  accentColor: string | null;
  mainAppUrl: string;
  creatorId: string;
}) {
  const [user, setUser] = useState<WalletUser | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then((res) => {
        setUser(res.ok ? res.data : null);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const handleUnlock = async () => {
    if (!user) {
      // Redirect to login page on the main app
      window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`;
      return;
    }

    setUnlocking(true);
    setErrorMessage(null);

    try {
      const res = await unlockArticleWithWallet({ creatorId, costCents: 200 }); // 2.00 € = 200 cents
      if (res.ok) {
        // Reload to reveal full content
        window.location.reload();
      } else {
        if (res.error?.code === 'INSUFFICIENT_FUNDS') {
          setErrorMessage(
            t`Solde insuffisant dans votre portefeuille. Veuillez recharger votre compte sur l'application principale.`
          );
        } else {
          setErrorMessage(t`Une erreur est survenue lors du paiement. Veuillez réessayer.`);
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(t`Erreur réseau. Impossible de contacter le serveur de paiement.`);
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="relative mt-8 w-full">
      <div className="absolute -top-32 left-0 w-full h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      <div
        className={`p-8 md:p-12 mx-auto max-w-2xl text-center not-prose relative z-10 ${isBrutalist ? 'bg-background border-4 border-foreground shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]' : 'bg-card border border-border/80 rounded-3xl shadow-2xl'}`}
      >
        <div className="w-16 h-16 rounded-full bg-[var(--tenant-accent)]/10 text-[var(--tenant-accent)] flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8" />
        </div>
        <h3
          className={`text-2xl md:text-3xl mb-4 ${isBrutalist ? 'font-black uppercase' : 'font-bold'}`}
        >
          {t`Histoire Premium`}
        </h3>
        <p className="text-muted-foreground mb-8 text-lg">
          {t`La suite de cette publication est exclusivement réservée aux abonnés de `}
          <strong className="text-foreground">{name}</strong>.
        </p>

        {errorMessage && (
          <div className="p-4 mb-6 bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium rounded-xl flex items-start gap-2 text-left max-w-sm mx-auto animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex flex-col gap-4 max-w-sm mx-auto">
          <button
            onClick={handleUnlock}
            disabled={unlocking}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-4 font-bold text-white text-lg transition-all cursor-pointer',
              isBrutalist
                ? 'border-4 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase tracking-wider hover:translate-y-1 hover:shadow-none'
                : 'rounded-xl hover:opacity-90 active:scale-95'
            )}
            style={{ backgroundColor: accentColor || '#EE4B2B' }}
          >
            {unlocking ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Wallet className="w-5 h-5" />
                {t`Débloquer pour 2,00 €`}
              </>
            )}
          </button>

          {/* Show wallet balance if user is logged in */}
          {user && (
            <p className="text-xs text-muted-foreground font-mono">
              {t`Solde actuel : ${((user.walletBalanceCents || 0) / 100).toFixed(2)} €`}
            </p>
          )}

          <Link
            href="#subscribe"
            className={`w-full py-3 font-semibold text-foreground bg-secondary hover:bg-muted transition-all ${isBrutalist ? 'border-4 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase tracking-wider hover:translate-y-1 hover:shadow-none' : 'rounded-xl'}`}
          >
            {t`Voir les formules d'abonnement`}
          </Link>

          <p className="text-sm text-muted-foreground mt-2">
            {!user ? (
              <>
                {t`Déjà abonné ?`}{' '}
                <button
                  onClick={() =>
                    (window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`)
                  }
                  className="underline font-semibold hover:text-[var(--tenant-accent)] cursor-pointer bg-transparent border-0 p-0 text-foreground"
                >
                  {t`Se connecter`}
                </button>
              </>
            ) : (
              <span>
                {t`Connecté en tant que `}
                <strong className="text-foreground">{user.name || user.email}</strong>
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
