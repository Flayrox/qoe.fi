import { prisma } from "@/lib/db"

export default async function AdminDashboard() {
  const usersCount = await prisma.user.count()
  const creatorsCount = await prisma.user.count({ where: { role: 'creator' } })
  const articlesCount = await prisma.article.count()
  
  // Basic MRR calc (MVP logic - assuming subscriptions are 2€ for this example)
  const premiumSubs = await prisma.subscriber.count({ where: { isPremium: true, isActive: true } })
  const mrr = premiumSubs * 2.00;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Health</h1>
        <p className="text-zinc-400 mt-1">Platform overview and vital metrics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Total Users</h3>
          <div className="text-3xl font-bold">{usersCount}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Active Creators</h3>
          <div className="text-3xl font-bold text-blue-400">{creatorsCount}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Articles Published</h3>
          <div className="text-3xl font-bold">{articlesCount}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Global MRR Estimate</h3>
          <div className="text-3xl font-bold text-green-400">{mrr.toFixed(2)} €</div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 flex items-center justify-center h-64">
        <p className="text-zinc-500 font-mono text-sm">Real-time charts will be injected here via Recharts.</p>
      </div>
    </div>
  )
}
