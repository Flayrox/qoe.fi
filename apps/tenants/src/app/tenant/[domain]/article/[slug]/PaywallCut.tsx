'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Lock, Wallet, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import {
  unlockArticleWithWalletAction as unlockArticleWithWallet,
  getCurrentUserWalletAction as getCurrentUser,
} from '@qoe/sdk/actions/tenant';

import { sanitizeHtml } from '@/lib/sanitize';
import { t } from '@lingui/core/macro';

/** Prix de l'achat à l'unité, en centimes (source unique pour l'UI et l'API). */
const ARTICLE_UNLOCK_PRICE_CENTS = 200;
/** Abonnement mensuel complet, en centimes. */
const MEMBERSHIP_PRICE_CENTS = 500;

function formatEuro(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export interface PaywallCutProps {
  contentHtml: string;
  isPremium: boolean;
  name: string | null;
  isBrutalist: boolean;
  accentColor: string | null;
  mainAppUrl: string;
  creatorId: string;
  initialAuthenticated?: boolean;
  initialUser?: WalletUser | null;
}

export function PaywallCut({
  contentHtml,
  isPremium,
  name,
  isBrutalist,
  accentColor,
  mainAppUrl,
  creatorId,
  initialAuthenticated,
  initialUser,
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
      <div className="article-prose" dangerouslySetInnerHTML={{ __html: safeHtml }} />
      <PaywallOverlay
        name={name}
        isBrutalist={isBrutalist}
        accentColor={accentColor}
        mainAppUrl={mainAppUrl}
        creatorId={creatorId}
        initialAuthenticated={initialAuthenticated}
        initialUser={initialUser}
      />
    </>
  );
}

export interface WalletUser {
  walletBalanceCents?: number | null;
  name?: string | null;
  email?: string | null;
}

export interface PaywallOverlayProps {
  name: string | null;
  isBrutalist: boolean;
  accentColor: string | null;
  mainAppUrl: string;
  creatorId: string;
  initialAuthenticated?: boolean;
  initialUser?: WalletUser | null;
}

export function PaywallOverlay({
  name,
  isBrutalist,
  accentColor,
  mainAppUrl,
  creatorId,
  initialAuthenticated,
  initialUser,
}: PaywallOverlayProps) {
  const [user, setUser] = useState<WalletUser | null>(initialUser ?? null);
  const [unlocking, setUnlocking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // If explicitly known as anonymous, avoid making an unnecessary network call
    if (initialAuthenticated === false) return;

    getCurrentUser()
      .then((res) => {
        setUser(res.ok ? res.data : null);
      })
      .catch(() => {
        // ignore
      });
  }, [initialAuthenticated]);

  const handleUnlock = async () => {
    if (!user) {
      // Redirect to login page on the main app
      window.location.href = `${mainAppUrl}/login?redirect=${encodeURIComponent(window.location.href)}`;
      return;
    }

    setUnlocking(true);
    setErrorMessage(null);

    try {
      const res = await unlockArticleWithWallet({
        creatorId,
        costCents: ARTICLE_UNLOCK_PRICE_CENTS,
      });
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

  const loginHref = `${mainAppUrl}/login?redirect=${encodeURIComponent(
    typeof window !== 'undefined' ? window.location.href : ''
  )}`;

  return (
    <div className="relative mt-16 w-full">
      {/* Fondu progressif sur la fin du teaser */}
      <div className="pointer-events-none absolute -top-44 left-0 h-44 w-full bg-gradient-to-t from-background via-background to-transparent" />

      <section
        className={`not-prose relative z-10 mx-auto max-w-2xl overflow-hidden ${
          isBrutalist
            ? 'border-4 border-foreground bg-background shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]'
            : 'rounded-2xl border border-border/70 bg-card shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)]'
        }`}
      >
        {/* Filet d'accent : rappelle la couleur de la publication */}
        <div
          className="h-1 w-full"
          style={{ backgroundColor: accentColor || 'var(--tenant-accent)' }}
        />

        <div className="px-5 py-7 sm:px-8 sm:py-9">
          <header className="text-center">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                isBrutalist
                  ? 'border-2 border-foreground'
                  : 'border border-[var(--tenant-accent)]/25 bg-[var(--tenant-accent)]/10 text-[var(--tenant-accent)]'
              }`}
            >
              <Lock className="h-3 w-3" />
              {t`Article réservé`}
            </span>

            <h3
              className={`mt-4 tracking-tight ${
                isBrutalist ? 'text-2xl font-black uppercase' : 'text-xl font-bold sm:text-2xl'
              }`}
            >
              {t`Accéder à la suite de l'article`}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {t`Cet écrit approfondi est une exclusivité pour les soutiens et abonnés de `}
              <strong className="font-semibold text-foreground">{name}</strong>.
            </p>
          </header>

          {errorMessage && (
            <div className="mx-auto mt-5 flex max-w-md items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-left text-xs font-medium text-destructive animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {/* Achat à l'unité */}
            <button
              type="button"
              onClick={handleUnlock}
              disabled={unlocking}
              className={`group flex flex-col justify-between rounded-xl p-4 text-left transition-all disabled:opacity-70 ${
                isBrutalist
                  ? 'border-2 border-foreground hover:bg-muted'
                  : 'border border-border/70 bg-background hover:-translate-y-0.5 hover:border-[var(--tenant-accent)]/50 hover:shadow-md'
              }`}
            >
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tenant-accent)]">
                  {t`À la carte`}
                </span>
                <h4 className="mt-1 text-base font-semibold text-foreground">
                  {t`Débloquer cet article`}
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t`Accès permanent et illimité à cette publication sans engagement.`}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                <span className="text-lg font-bold tabular-nums text-foreground">
                  {formatEuro(ARTICLE_UNLOCK_PRICE_CENTS)}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: accentColor || 'var(--tenant-accent)' }}
                >
                  {unlocking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Wallet className="h-3.5 w-3.5" />
                      <span>{t`Débloquer`}</span>
                    </>
                  )}
                </span>
              </div>
            </button>

            {/* Abonnement */}
            <Link
              href="#subscribe"
              className={`group flex flex-col justify-between rounded-xl p-4 transition-all ${
                isBrutalist
                  ? 'border-2 border-foreground hover:bg-muted'
                  : 'border border-border/70 bg-background hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t`Abonnement`}
                  </span>
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                    {t`Illimité`}
                  </span>
                </div>
                <h4 className="mt-1 text-base font-semibold text-foreground">{t`Membre Premium`}</h4>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t`Accédez à l'intégralité des archives et soutenez l'auteur chaque mois.`}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                <span className="text-lg font-bold tabular-nums text-foreground">
                  {formatEuro(MEMBERSHIP_PRICE_CENTS)}
                  <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                    {t`/mois`}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-opacity group-hover:opacity-90">
                  {t`S'abonner`}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          </div>

          <div className="mt-6 border-t border-border/50 pt-4 text-center text-xs text-muted-foreground">
            {user ? (
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                <span>
                  {t`Connecté en tant que `}
                  <strong className="font-semibold text-foreground">
                    {user.name || user.email}
                  </strong>
                </span>
                <span className="text-border">•</span>
                <span className="font-medium text-foreground">
                  {t`Solde : ${((user.walletBalanceCents || 0) / 100).toFixed(2)} €`}
                </span>
              </div>
            ) : (
              <span>
                {t`Vous avez déjà un compte ou êtes déjà abonné ?`}{' '}
                <a
                  href={loginHref}
                  className="font-semibold text-foreground underline decoration-foreground/30 underline-offset-2 transition-colors hover:text-[var(--tenant-accent)]"
                >
                  {t`Se connecter avec qoefi`}
                </a>
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
