'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldX,
  Plus,
  ArrowRight,
  Zap,
  TrendingUp,
  Receipt,
} from 'lucide-react';
import { toast } from '@qoe/ui/toast';
import { routes } from '@qoe/config/routes';
import { cn } from '@qoe/utils';
import { SafeAvatar } from '@qoe/ui';
import { DynamicBannerSlot } from '@/components/banners/DynamicBannerSlot';
import { Button } from '@qoe/ui/button';

import {
  type BillingTransaction,
  type BillingSubscription,
  type BillingData,
  type BillingTransactionFilter,
  formatTransactionAmount,
  filterBillingTransactions,
  calculateBillingKPIs,
  formatTransactionDate,
} from './billing-helpers';

export type { BillingTransaction, BillingSubscription, BillingData };

interface BillingClientProps {
  billing: BillingData;
  userEmail?: string;
  userName?: string;
}

export function BillingClient({ billing, userEmail, userName }: BillingClientProps) {
  const [filter, setFilter] = useState<BillingTransactionFilter>('all');

  const kpis = calculateBillingKPIs(billing);
  const balance = kpis.balanceEuros;
  const totalTransactions = kpis.totalTransactions;
  const creditsCount = kpis.creditsCount;
  const debitsCount = kpis.debitsCount;

  const filteredTransactions = filterBillingTransactions(billing.walletTransactions, filter);

  const handleTopUp = () => {
    toast.info(
      'Le module de recharge sécurisé Stripe sera disponible dans la prochaine mise à jour.'
    );
  };

  const handleCancelSub = (pubName: string) => {
    toast.info(`Gestion de l'abonnement à ${pubName} : redirection vers le portail client.`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* ─── En-tête standard unifié ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
              Portefeuille & abonnements
            </h1>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-success/10 text-success-text border border-success/20">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              Actif
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Transparence totale sur votre solde, vos abonnements créateurs et vos transactions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="solid"
            tone="brand"
            size="sm"
            onClick={handleTopUp}
            className="gap-1.5 rounded-xl px-4 py-2 text-xs! font-semibold! shadow-xs leading-[16px]! h-auto! whitespace-normal! justify-normal "
          >
            <Plus className="w-3.5! h-3.5!" />
            Recharger le solde
          </Button>
        </div>
      </div>

      {/* ─── Fintech Hero Bento Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Carte Virtuelle Qoe Pay (Col 7) */}
        <div className="lg:col-span-7 relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card/90 to-primary/5 p-6 shadow-md flex flex-col justify-between min-h-[220px]">
          {/* Lueur d'arrière-plan subtile */}
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          {/* Rangée supérieure de la carte */}
          <div className="flex items-start justify-between relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center text-primary font-bold text-xs">
                Q
              </div>
              <div>
                <span className="text-xs font-bold text-foreground block">Qoe Pay</span>
                <span className="text-[10px] text-muted-foreground font-medium block">
                  Compte lecteur
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-mono tracking-widest text-muted-foreground">
                •••• 4821
              </span>
            </div>
          </div>

          {/* Solde central & Titulaire */}
          <div className="my-6 relative z-10">
            <span className="text-xs font-medium text-muted-foreground block">
              Solde disponible
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl sm:text-4xl font-black font-sans tracking-tight text-foreground">
                {balance} €
              </span>
              <span className="text-xs text-muted-foreground font-medium">EUR</span>
            </div>
          </div>

          {/* Rangée inférieure : Titulaire & badge */}
          <div className="flex items-center justify-between pt-4 border-t border-border/40 relative z-10 text-xs">
            <div className="min-w-0">
              <span className="text-[10px] text-muted-foreground block font-medium">Titulaire</span>
              <span className="font-semibold text-foreground truncate block">
                {userName || userEmail || 'Lecteur'}
              </span>
            </div>
            <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-md border border-primary/20">
              Débit instantané
            </span>
          </div>
        </div>

        {/* Colonne latérale KPIs & Infos (Col 5) */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          {/* KPI 1 : Abonnements */}
          <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                Abonnements actifs
              </span>
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <CreditCard className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold tracking-tight text-foreground block">
                {billing.subscriptions.length}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {billing.subscriptions.length === 0
                  ? 'Aucun engagement récurrent'
                  : `${billing.subscriptions.length} créateur(s) soutenu(s)`}
              </p>
            </div>
          </div>

          {/* KPI 2 : Activité */}
          <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Transactions</span>
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold tracking-tight text-foreground block">
                {totalTransactions}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {creditsCount} crédit(s) • {debitsCount} débit(s)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Bannière Abonnement Plateforme (Dynamic In-App Messaging Slot) ─── */}
      <DynamicBannerSlot slot="reader.billing.hero" />

      {/* ─── Section Abonnements Premium ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold tracking-tight text-foreground">
              Abonnements premium
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {billing.subscriptions.length}
            </span>
          </div>
        </div>

        {billing.subscriptions.length === 0 ? (
          <div className="bg-muted/20 rounded-2xl p-8 border border-border/40 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">
                Aucun abonnement premium en cours
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Abonnez-vous à vos auteurs préférés pour débloquer leurs éditions exclusives.
              </p>
            </div>
            <Link
              href="/home"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline mt-1"
            >
              Explorer les publications <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {billing.subscriptions.map((sub) => {
              const pub = sub.publisher;
              const pubName = pub?.name || 'Publisher';
              const profileHref = pub?.slug ? routes.feed.profile(pub.slug) : '#';

              return (
                <div
                  key={sub.id}
                  className="bg-card rounded-xl p-4 border border-border/50 hover:border-primary/30 transition-all flex items-center justify-between gap-4 shadow-2xs"
                >
                  <Link href={profileHref} className="flex items-center gap-3 min-w-0 group">
                    <SafeAvatar
                      src={pub?.logoUrl}
                      name={pubName}
                      username={pub?.slug}
                      size={40}
                      shape="squircle"
                      className="rounded-xl border border-border/60 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-xs font-bold block truncate group-hover:text-primary transition-colors text-foreground">
                        {pubName}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-success-text font-semibold mt-0.5">
                        <span className="w-1 h-1 rounded-full bg-success" />
                        Premium • Renouvellement auto
                      </span>
                    </div>
                  </Link>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCancelSub(pubName)}
                    className="shrink-0 items-center gap-1 rounded-lg border-border/60 px-3 py-1.5 text-[11px]! font-semibold! text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive-text h-auto! leading-[inherit]! whitespace-normal! justify-normal "
                  >
                    <ShieldX className="w-3.5! h-3.5!" />
                    Gérer
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Section Historique des Transactions ─── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold tracking-tight text-foreground">
              Historique des transactions
            </h2>
          </div>

          {/* Filtres de transactions */}
          <div className="inline-flex items-center p-0.5 bg-muted/50 border border-border/50 rounded-xl">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilter('all')}
              className={cn(
                'rounded-lg px-3 py-1 text-xs! font-semibold! hover:bg-transparent h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! ',
                filter === 'all'
                  ? 'bg-card font-bold text-foreground shadow-2xs hover:bg-card'
                  : 'text-muted-foreground hover:text-foreground leading-[16px]! h-auto! whitespace-normal! justify-normal inline-block '
              )}
            >
              Toutes ({totalTransactions})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilter('credits')}
              className={cn(
                'rounded-lg px-3 py-1 text-xs! font-semibold! hover:bg-transparent h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! ',
                filter === 'credits'
                  ? 'bg-card font-bold text-foreground shadow-2xs hover:bg-card'
                  : 'text-muted-foreground hover:text-foreground leading-[16px]! h-auto! whitespace-normal! justify-normal inline-block '
              )}
            >
              Crédits ({creditsCount})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilter('debits')}
              className={cn(
                'rounded-lg px-3 py-1 text-xs! font-semibold! hover:bg-transparent h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! ',
                filter === 'debits'
                  ? 'bg-card font-bold text-foreground shadow-2xs hover:bg-card'
                  : 'text-muted-foreground hover:text-foreground leading-[16px]! h-auto! whitespace-normal! justify-normal inline-block '
              )}
            >
              Débits ({debitsCount})
            </Button>
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="bg-muted/20 rounded-2xl p-8 border border-border/40 text-center text-muted-foreground">
            <p className="text-xs font-semibold">Aucune transaction trouvée.</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border/50 overflow-hidden shadow-2xs divide-y divide-border/40">
            {filteredTransactions.map((tx) => {
              const { formatted: formattedAmount, isCredit } = formatTransactionAmount(
                tx.amountCents
              );
              const formattedDate = formatTransactionDate(tx.createdAt);

              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                        isCredit
                          ? 'bg-success/10 text-success-text border border-success/20'
                          : 'bg-muted text-muted-foreground border border-border/40'
                      )}
                    >
                      {isCredit ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-foreground block">
                        {tx.type || (isCredit ? 'Rechargement' : 'Paiement')}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {formattedDate}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={cn(
                        'text-sm font-bold font-sans block',
                        isCredit ? 'text-success-text' : 'text-foreground'
                      )}
                    >
                      {formattedAmount}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-medium">Complété</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
