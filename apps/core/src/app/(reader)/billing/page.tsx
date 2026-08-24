import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { Wallet, CreditCard, ShieldX, ArrowRight, Receipt } from 'lucide-react';
import { ReaderPageLayout } from '@/components/layout/ReaderPageLayout';

import { routes } from '@qoe/config/routes';

// Contrat GET /v1/me/billing (module users Go)
// include walletTransactions + subscriber.findMany).
interface BillingTransaction {
  id: string;
  type: string;
  amountCents: number;
  createdAt: string;
}

interface BillingSubscription {
  id: string;
  publication: { name: string | null; logoUrl: string | null; slug: string } | null;
}

interface BillingData {
  walletBalanceCents: number;
  walletTransactions: BillingTransaction[];
  subscriptions: BillingSubscription[];
}

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Go (backend-of-record, requis en Phase 3) — plus de fallback Prisma.
  const billing = await goFetch<BillingData>('/v1/me/billing');

  return (
    <ReaderPageLayout giantTitle="Portefeuille">
      <div className="bg-card text-card-foreground shadow-2xl border-t border-x border-border/40 rounded-t-2xl min-h-screen mt-24 relative z-20">
        <div className="px-6 pt-6 pb-6 space-y-6">
          {/* Page header inside the sheet */}
          <div className="px-1">
            <h1 className="text-lg font-bold text-foreground tracking-tight">
              Portefeuille & Abonnements
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Transparence totale sur votre solde et vos engagements.
            </p>
          </div>

          {/* Main content in Bento shell wrapper inside sheet */}
          <div className="bg-muted/30 rounded-2xl p-2.5 border border-border/40 flex flex-col gap-3">
            {/* Wallet balance card */}
            <div className="bg-card rounded-xl p-6 shadow-xs border border-border/60 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Wallet className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold block">
                    Solde Disponible
                  </span>
                  <span className="text-3xl font-black font-sans text-foreground block mt-1 tracking-tight">
                    {((billing.walletBalanceCents || 0) / 100).toFixed(2)} €
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="w-full sm:w-auto bg-primary text-primary-foreground hover:opacity-90 transition-colors py-2.5 px-6 rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
              >
                Recharger le Portefeuille
              </button>
            </div>

            {/* Subscriptions card */}
            <div className="bg-card rounded-xl p-6 shadow-xs border border-border/60">
              <div className="flex items-center gap-2 mb-5">
                <CreditCard className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Abonnements Premium Actifs
                </span>
              </div>

              {billing.subscriptions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground flex flex-col items-center gap-3">
                  <CreditCard className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-xs font-semibold text-foreground">
                    Aucun abonnement premium actif.
                  </p>
                  <a
                    href="/home"
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                  >
                    Découvrir des créateurs <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              ) : (
                <div className="space-y-3">
                  {billing.subscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between border border-border/60 p-4 rounded-xl bg-muted/30 hover:bg-muted/60 transition-colors"
                    >
                      <a
                        href={
                          sub.publication?.slug ? routes.feed.profile(sub.publication.slug) : '#'
                        }
                        className="flex items-center gap-3 min-w-0 group"
                      >
                        {sub.publication?.logoUrl ? (
                          <Image
                            src={sub.publication.logoUrl}
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-lg object-cover border border-border/60"
                            alt=""
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-xs text-primary">
                            {sub.publication?.name?.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="text-xs font-bold block truncate group-hover:text-primary transition-colors text-foreground">
                            {sub.publication?.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                            Premium • Renouvellement auto.
                          </span>
                        </div>
                      </a>
                      <button
                        type="button"
                        className="text-[10px] font-bold text-destructive hover:bg-destructive/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 border border-destructive/30 cursor-pointer"
                      >
                        <ShieldX className="w-3.5 h-3.5" /> Annuler
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Transactions card */}
            <div className="bg-card rounded-xl p-6 shadow-xs border border-border/60">
              <div className="flex items-center gap-2 mb-5">
                <Receipt className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Transactions Récentes
                </span>
              </div>

              {billing.walletTransactions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <p className="text-xs font-semibold">Aucune transaction pour le moment.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {billing.walletTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-3.5 rounded-xl border border-border/40 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                            tx.amountCents > 0
                              ? 'bg-success/10 text-success'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {tx.amountCents > 0 ? '+' : '−'}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-foreground block">{tx.type}</span>
                          <span className="text-[10px] text-muted-foreground font-sans font-medium">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-sm font-bold font-sans ${
                          tx.amountCents > 0 ? 'text-success' : 'text-foreground'
                        }`}
                      >
                        {tx.amountCents > 0 ? '+' : ''}
                        {(tx.amountCents / 100).toFixed(2)} €
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ReaderPageLayout>
  );
}
