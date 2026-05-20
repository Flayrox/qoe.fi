import { prisma } from "@/lib/db"

export default async function AdminConfig() {
  const configs = await prisma.systemConfig.findMany()

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Feature Flags</h1>
        <p className="text-zinc-400 mt-1">Gérez le comportement global de qoe.fi sans redéployer.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-zinc-400 uppercase bg-zinc-950/50 border-b border-zinc-800">
            <tr>
              <th className="px-6 py-4">Clé (Key)</th>
              <th className="px-6 py-4">Valeur Actuelle</th>
              <th className="px-6 py-4">Description</th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {configs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">Aucune configuration définie.</td>
              </tr>
            ) : (
              configs.map(c => (
                <tr key={c.key} className="hover:bg-zinc-800/30">
                  <td className="px-6 py-4 font-mono font-medium">{c.key}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${c.value === 'true' ? 'bg-green-500/10 text-green-500' : c.value === 'false' ? 'bg-red-500/10 text-red-500' : 'bg-zinc-800 text-zinc-300'}`}>
                      {c.value}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-400">{c.description}</td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-blue-400 hover:underline text-sm font-semibold">Modifier</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 border-dashed rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Ajouter une configuration</h3>
        <form className="flex gap-4">
          <input type="text" placeholder="Ex: ALLOW_NEW_REGISTRATIONS" className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 flex-1 focus:border-white focus:outline-none" />
          <input type="text" placeholder="true / false" className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 w-32 focus:border-white focus:outline-none" />
          <button type="button" className="bg-white text-black px-6 py-2 rounded-lg font-bold hover:bg-zinc-200">Ajouter</button>
        </form>
      </div>
    </div>
  )
}
