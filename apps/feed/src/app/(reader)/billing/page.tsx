import { createClient } from "@qoe/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@qoe/db/client"
import { Wallet, CreditCard, ShieldX, ArrowRight, Receipt } from "lucide-react"

import { ReaderPageLayout } from "@/components/layout/ReaderPageLayout"

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      walletTransactions: { orderBy: { createdAt: 'desc' }, take: 10 }
    }
  })

  const subscriptions = await prisma.subscriber.findMany({
    where: { email: user.email, isPremium: true, isActive: true },
    include: { creator: { select: { name: true, logoUrl: true, username: true } } }
  })

  return (
    <ReaderPageLayout giantTitle="Portefeuille">
      <div className="bg-white shadow-[0_8px_30px_rgba(0,0,0,0.02)] border border-neutral-200/40 rounded-t-xl min-h-screen mt-0 relative z-20">
        
        <div className="px-6 pt-6 pb-6 space-y-6">
            
            {/* Page header inside the sheet */}
            <div className="px-1">
              <h1 className="text-lg font-bold text-neutral-800 tracking-tight">Portefeuille & Abonnements</h1>
              <p className="text-xs text-neutral-400 mt-0.5">Transparence totale sur votre solde et vos engagements.</p>
            </div>

            {/* Main content in Bento shell wrapper inside sheet */}
            <div className="bg-[#EE4B2B] rounded-[40px] p-3 shadow-xl flex flex-col gap-3">
              
              {/* Wallet balance card */}
              <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#EE4B2B]/10 flex items-center justify-center text-[#EE4B2B] shrink-0">
                    <Wallet className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold block">Solde Disponible</span>
                    <span className="text-3xl font-black font-mono text-neutral-800 block mt-1 tracking-tight">
                      {((dbUser?.walletBalanceCents || 0) / 100).toFixed(2)} €
                    </span>
                  </div>
                </div>
                <button className="w-full sm:w-auto bg-[#EE4B2B] text-white hover:bg-[#d63d20] transition-colors py-3 px-8 rounded-2xl text-xs font-bold shadow-xs shadow-[#EE4B2B]/10">
                  Recharger le Portefeuille
                </button>
              </div>

              {/* Subscriptions card */}
              <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100">
                <div className="flex items-center gap-2 mb-5">
                  <CreditCard className="w-4 h-4 text-[#EE4B2B]" />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">Abonnements Premium Actifs</span>
                </div>
                
                {subscriptions.length === 0 ? (
                  <div className="text-center py-10 text-neutral-400 flex flex-col items-center gap-3">
                    <CreditCard className="w-8 h-8 text-neutral-200" />
                    <p className="text-xs font-semibold">Aucun abonnement premium actif.</p>
                    <a href="/home" className="text-[10px] font-bold text-[#EE4B2B] hover:underline flex items-center gap-1">
                      Découvrir des créateurs <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {subscriptions.map((sub: any) => (
                      <div key={sub.id} className="flex items-center justify-between border border-neutral-100 p-4 rounded-2xl bg-neutral-50/50 hover:bg-neutral-50 transition-colors">
                        <a href={sub.creator.username ? `/@${sub.creator.username}` : "#"} className="flex items-center gap-3 min-w-0 group">
                          {sub.creator.logoUrl ? (
                            <img src={sub.creator.logoUrl} className="w-10 h-10 rounded-xl object-cover border border-neutral-200/50" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-[#EE4B2B]/10 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                              {sub.creator.name?.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-bold block truncate group-hover:text-[#EE4B2B] transition-colors">{sub.creator.name}</span>
                            <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">Premium • Renouvellement auto.</span>
                          </div>
                        </a>
                        <button className="text-[10px] font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1 border border-red-200/50">
                          <ShieldX className="w-3 h-3" /> Annuler
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Transactions card */}
              <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100">
                <div className="flex items-center gap-2 mb-5">
                  <Receipt className="w-4 h-4 text-[#EE4B2B]" />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">Transactions Récentes</span>
                </div>

                {(dbUser?.walletTransactions.length || 0) === 0 ? (
                  <div className="text-center py-10 text-neutral-400">
                    <p className="text-xs font-semibold">Aucune transaction pour le moment.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dbUser?.walletTransactions.map((tx: any) => (
                      <div key={tx.id} className="flex items-center justify-between p-3.5 rounded-2xl border border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${tx.amountCents > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-neutral-100 text-neutral-500'}`}>
                            {tx.amountCents > 0 ? '+' : '−'}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-neutral-700 block">{tx.type}</span>
                            <span className="text-[9px] text-neutral-400 font-mono">{new Date(tx.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <span className={`text-sm font-bold font-mono ${tx.amountCents > 0 ? 'text-emerald-600' : 'text-neutral-700'}`}>
                          {tx.amountCents > 0 ? '+' : ''}{(tx.amountCents / 100).toFixed(2)} €
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
  )
}
