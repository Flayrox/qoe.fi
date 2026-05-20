import { prisma } from "@/lib/db"
import { ShieldAlert, ShieldCheck, Ban, CheckCircle2 } from "lucide-react"

export default async function AdminCreators() {
  const creators = await prisma.user.findMany({
    where: { role: 'creator' },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Le Tribunal</h1>
        <p className="text-zinc-400 mt-1">Modération globale, certification et shadowban.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-zinc-400 uppercase bg-zinc-950/50 border-b border-zinc-800">
            <tr>
              <th className="px-6 py-4">Créateur</th>
              <th className="px-6 py-4">Domaine</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {creators.map(c => (
              <tr key={c.id} className="hover:bg-zinc-800/30">
                <td className="px-6 py-4 font-medium flex items-center gap-3">
                  {c.isCertified && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                  {c.name || c.email}
                </td>
                <td className="px-6 py-4 font-mono text-zinc-400">{c.subdomain}.qoe.fi</td>
                <td className="px-6 py-4">
                  {c.isShadowbanned ? (
                    <span className="px-2 py-1 bg-red-500/10 text-red-500 rounded-md text-xs font-semibold">Shadowbanned</span>
                  ) : (
                    <span className="px-2 py-1 bg-green-500/10 text-green-500 rounded-md text-xs font-semibold">Actif</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  <form action={async () => {
                    "use server";
                    const { prisma } = await import("@/lib/db");
                    await prisma.user.update({ where: { id: c.id }, data: { isCertified: !c.isCertified } })
                  }} className="inline-block">
                    <button className="p-2 hover:bg-zinc-800 rounded-md text-blue-400" title="Toggle Certification">
                      <ShieldCheck className="w-4 h-4" />
                    </button>
                  </form>
                  <form action={async () => {
                    "use server";
                    const { prisma } = await import("@/lib/db");
                    await prisma.user.update({ where: { id: c.id }, data: { isShadowbanned: !c.isShadowbanned } })
                  }} className="inline-block">
                    <button className="p-2 hover:bg-zinc-800 rounded-md text-orange-400" title="Toggle Shadowban">
                      <ShieldAlert className="w-4 h-4" />
                    </button>
                  </form>
                  <button className="p-2 hover:bg-red-500/10 rounded-md text-red-500" title="Suspendre">
                    <Ban className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
