import { prisma } from "@/lib/db"
import { ShieldAlert, ShieldCheck, Ban, CheckCircle2, Unlock } from "lucide-react"
import { toggleCertification, toggleShadowban, toggleSuspension } from "./actions"
import { cn } from "@/lib/utils"

export default async function AdminCreators() {
  const creators = await prisma.user.findMany({
    where: { role: 'creator' },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Le Tribunal</h1>
        <p className="text-zinc-400 mt-1 text-sm">Modération globale, certification, shadowban et suspension des créateurs.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-zinc-400 uppercase bg-zinc-950/60 border-b border-zinc-800">
            <tr>
              <th className="px-6 py-4 font-semibold">Créateur</th>
              <th className="px-6 py-4 font-semibold">Domaine</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {creators.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 italic">Aucun créateur enregistré.</td>
              </tr>
            ) : (
              creators.map(c => {
                const toggleCertAction = toggleCertification.bind(null, c.id)
                const toggleShadowAction = toggleShadowban.bind(null, c.id)
                const toggleSuspendAction = toggleSuspension.bind(null, c.id)

                return (
                  <tr 
                    key={c.id} 
                    className={cn(
                      "hover:bg-zinc-800/20 transition-colors duration-150",
                      c.isSuspended && "bg-red-950/5 hover:bg-red-950/10"
                    )}
                  >
                    <td className="px-6 py-4 font-medium flex items-center gap-3">
                      <div className="relative">
                        {c.isCertified && (
                          <CheckCircle2 className="w-4 h-4 text-blue-500 absolute -top-1 -right-1 bg-zinc-950 rounded-full" />
                        )}
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 border border-zinc-700">
                          {c.logoUrl ? (
                            <img src={c.logoUrl} className="w-full h-full rounded-full object-cover" />
                          ) : (
                            c.name?.substring(0, 2).toUpperCase() || c.email.substring(0, 2).toUpperCase()
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-100">{c.name || "Créateur Sans Nom"}</div>
                        <div className="text-xs text-zinc-500 font-mono">{c.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-zinc-400">
                      {c.subdomain ? `${c.subdomain}.qoe.fi` : "Non configuré"}
                      {c.customDomain && (
                        <div className="text-[10px] text-zinc-500 mt-0.5">({c.customDomain})</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {c.isSuspended ? (
                        <span className="px-2.5 py-1 bg-red-950/50 text-red-400 border border-red-900/50 rounded-lg text-xs font-medium">
                          Suspendu
                        </span>
                      ) : c.isShadowbanned ? (
                        <span className="px-2.5 py-1 bg-amber-950/40 text-amber-400 border border-amber-900/50 rounded-lg text-xs font-medium">
                          Shadowbanned
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-emerald-950/40 text-emerald-400 border border-emerald-900/50 rounded-lg text-xs font-medium">
                          Actif
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Certify Button */}
                        <form action={toggleCertAction} className="inline-block">
                          <button 
                            type="submit"
                            className={cn(
                              "p-2 rounded-lg transition-all duration-200 border",
                              c.isCertified 
                                ? "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20" 
                                : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                            )}
                            title={c.isCertified ? "Retirer la certification" : "Certifier le créateur"}
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                        </form>

                        {/* Shadowban Button */}
                        <form action={toggleShadowAction} className="inline-block">
                          <button 
                            type="submit"
                            className={cn(
                              "p-2 rounded-lg transition-all duration-200 border",
                              c.isShadowbanned 
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20" 
                                : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                            )}
                            title={c.isShadowbanned ? "Retirer le shadowban" : "Shadowbannir le créateur"}
                          >
                            <ShieldAlert className="w-4 h-4" />
                          </button>
                        </form>

                        {/* Suspend / Unsuspend Button */}
                        <form action={toggleSuspendAction} className="inline-block">
                          <button 
                            type="submit"
                            className={cn(
                              "p-2 rounded-lg transition-all duration-200 border",
                              c.isSuspended 
                                ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20" 
                                : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-red-950/30 hover:text-red-400 hover:border-red-900/50"
                            )}
                            title={c.isSuspended ? "Réactiver le compte" : "Suspendre le compte"}
                          >
                            {c.isSuspended ? <Unlock className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
