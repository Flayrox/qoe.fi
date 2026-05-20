import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { Wallet, CreditCard, ShieldX } from "lucide-react"

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      walletTransactions: { orderBy: { createdAt: 'desc' }, take: 5 }
    }
  })

  const subscriptions = await prisma.subscriber.findMany({
    where: { email: user.email, isPremium: true, isActive: true },
    include: { creator: { select: { name: true, logoUrl: true } } }
  })

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="container mx-auto px-4 py-16 max-w-4xl space-y-12">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Gestion Financière</h1>
          <p className="text-muted-foreground">Transparence totale sur vos abonnements et votre solde.</p>
        </div>

        {/* Wallet Section */}
        <section className="bg-card border rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-8 shadow-sm">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <Wallet className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Solde Disponible</p>
              <p className="text-4xl font-black font-mono tracking-tighter">
                {((dbUser?.walletBalanceCents || 0) / 100).toFixed(2)} €
              </p>
            </div>
          </div>
          <button className="w-full md:w-auto bg-primary text-primary-foreground px-8 py-3 rounded-full font-bold hover:opacity-90 transition-opacity">
            Recharger
          </button>
        </section>

        {/* Subscriptions */}
        <section>
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> Abonnements Premium Actifs
          </h2>
          
          {subscriptions.length === 0 ? (
            <p className="text-muted-foreground italic">Vous n'avez aucun abonnement premium actif.</p>
          ) : (
            <div className="grid gap-4">
              {subscriptions.map(sub => (
                <div key={sub.id} className="flex items-center justify-between bg-card border p-4 rounded-2xl">
                  <div className="flex items-center gap-4">
                    {sub.creator.logoUrl ? (
                      <img src={sub.creator.logoUrl} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center font-bold">
                        {sub.creator.name?.charAt(0)}
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold">{sub.creator.name}</h4>
                      <p className="text-xs text-muted-foreground">Premium • Renouvellement auto.</p>
                    </div>
                  </div>
                  <button className="text-xs font-semibold text-destructive hover:bg-destructive/10 px-4 py-2 rounded-lg transition-colors flex items-center gap-1">
                    <ShieldX className="w-3 h-3" /> Annuler
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Transactions */}
        <section>
          <h2 className="text-xl font-bold mb-6">Transactions Récentes</h2>
          <div className="bg-card border rounded-2xl overflow-hidden">
            {dbUser?.walletTransactions.length === 0 ? (
              <p className="p-6 text-muted-foreground text-center">Aucune transaction.</p>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground font-semibold">
                  <tr>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dbUser?.walletTransactions.map(tx => (
                    <tr key={tx.id}>
                      <td className="px-6 py-4">{new Date(tx.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4">{tx.type}</td>
                      <td className={`px-6 py-4 text-right font-mono font-medium ${tx.amountCents > 0 ? 'text-green-500' : ''}`}>
                        {tx.amountCents > 0 ? '+' : ''}{(tx.amountCents / 100).toFixed(2)} €
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
