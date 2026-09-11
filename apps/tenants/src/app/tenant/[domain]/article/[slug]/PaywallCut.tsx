'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Lock, Wallet, Loader2, AlertCircle } from 'lucide-react';
import {
  unlockArticleWithWalletAction as unlockArticleWithWallet,
  getCurrentUserWalletAction as getCurrentUser,
} from '@qoe/sdk/actions/tenant';

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
    <div className="relative mt-12 w-full">
      {/* Smooth fade-out gradient over teaser */}
      <div className="absolute -top-36 left-0 w-full h-36 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />

      {/* Frosted Glass Paywall Container */}
      <div
        className={`p-6 sm:p-10 md:p-12 mx-auto max-w-3xl text-center not-prose relative z-10 ${
          isBrutalist
            ? 'bg-background border-4 border-foreground shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]'
            : 'bg-card/90 backdrop-blur-xl border border-border/80 rounded-3xl shadow-2xl'
        }`}
      >
        <div className="w-14 h-14 rounded-2xl bg-[var(--tenant-accent)]/10 text-[var(--tenant-accent)] flex items-center justify-center mx-auto mb-5 border border-[var(--tenant-accent)]/20">
          <Lock className="w-6 h-6" />
        </div>

        <h3
          className={`text-2xl sm:text-3xl tracking-tight mb-3 ${
            isBrutalist ? 'font-black uppercase' : 'font-bold'
          }`}
        >
          {t`Accéder à la suite de l'article`}
        </h3>
        <p className="text-muted-foreground mb-8 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          {t`Cet écrit approfondi est une exclusivité pour les soutiens et abonnés de `}
          <strong className="text-foreground">{name}</strong>.
        </p>

        {errorMessage && (
          <div className="p-4 mb-6 bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium rounded-xl flex items-start gap-2 text-left max-w-md mx-auto animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Triptyque Monetization Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 text-left max-w-xl mx-auto">
          {/* Option 1: Instant Article Unlock via Wallet */}
          <div
            onClick={handleUnlock}
            className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
              isBrutalist
                ? 'border-2 border-foreground hover:bg-muted'
                : 'border-border/80 bg-background/60 hover:border-[var(--tenant-accent)] hover:shadow-md'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--tenant-accent)]">
                  {t`À la carte`}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium text-foreground">
                  {t`1 clic`}
                </span>
              </div>
              <h4 className="font-bold text-lg text-foreground mb-1">{t`Débloquer cet article`}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t`Accès permanent et illimité à cette publication sans engagement.`}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
              <span className="font-extrabold text-xl text-foreground">2,00 €</span>
              <button
                disabled={unlocking}
                className="px-4 py-2 rounded-full font-medium text-xs text-white transition-all flex items-center gap-1.5"
                style={{ backgroundColor: accentColor || 'var(--tenant-accent)' }}
              >
                {unlocking ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Wallet className="w-3.5 h-3.5" />
                    <span>{t`Débloquer`}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Option 2: Full Membership Subscription */}
          <Link
            href="#subscribe"
            className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
              isBrutalist
                ? 'border-2 border-foreground hover:bg-muted'
                : 'border-border/80 bg-background/60 hover:border-foreground/40 hover:shadow-md'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t`Abonnement`}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">
                  {t`Illimité`}
                </span>
              </div>
              <h4 className="font-bold text-lg text-foreground mb-1">{t`Membre Premium`}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t`Accédez à l'intégralité des archives et soutenez l'auteur chaque mois.`}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
              <span className="font-extrabold text-xl text-foreground">
                5,00 €<span className="text-xs font-normal text-muted-foreground">/mois</span>
              </span>
              <span className="px-4 py-2 rounded-full font-medium text-xs bg-foreground text-background group-hover:opacity-90 transition-opacity">
                {t`S'abonner`}
              </span>
            </div>
          </Link>
        </div>

        {/* User Session Info / Quick Login */}
        <div className="text-xs text-muted-foreground pt-4 border-t border-border/40 max-w-md mx-auto">
          {user ? (
            <div className="flex items-center justify-between">
              <span>
                {t`Connecté en tant que `}
                <strong className="text-foreground">{user.name || user.email}</strong>
              </span>
              <span className="font-medium text-foreground">
                {t`Solde : ${((user.walletBalanceCents || 0) / 100).toFixed(2)} €`}
              </span>
            </div>
          ) : (
            <div>
              {t`Vous avez déjà un compte ou êtes déjà abonné ?`}{' '}
              <button
                onClick={() =>
                  (window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`)
                }
                className="underline font-semibold hover:text-[var(--tenant-accent)] cursor-pointer bg-transparent border-0 p-0 text-foreground"
              >
                {t`Se connecter avec qoe.fi`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
