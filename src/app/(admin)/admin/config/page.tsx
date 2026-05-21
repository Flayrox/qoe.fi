import { prisma } from "@/lib/db"
import { Trash2, Save, Plus, Settings } from "lucide-react"
import { saveConfig, deleteConfig } from "./actions"

export default async function AdminConfig() {
  const configs = await prisma.systemConfig.findMany({
    orderBy: { key: 'asc' }
  })

  // Server Actions bound inside the component
  async function handleAddConfig(formData: FormData) {
    "use server"
    const key = formData.get("key") as string
    const value = formData.get("value") as string
    const description = formData.get("description") as string
    
    if (!key || !value) return
    await saveConfig(key, value, description)
  }

  async function handleUpdateConfig(formData: FormData) {
    "use server"
    const key = formData.get("key") as string
    const value = formData.get("value") as string
    const description = formData.get("description") as string
    
    if (!key || !value) return
    await saveConfig(key, value, description)
  }

  async function handleDeleteConfig(formData: FormData) {
    "use server"
    const key = formData.get("key") as string
    if (!key) return
    await deleteConfig(key)
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 font-sans">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Feature Flags & Config</h1>
          <p className="text-zinc-400 mt-1 text-sm">Gérez le comportement global de qoe.fi sans redéployer.</p>
        </div>
      </div>

      {/* Feature Flags Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-zinc-400 uppercase bg-zinc-950/60 border-b border-zinc-800">
            <tr>
              <th className="px-6 py-4 font-semibold w-1/4">Clé (Key)</th>
              <th className="px-6 py-4 font-semibold w-1/4">Valeur</th>
              <th className="px-6 py-4 font-semibold w-2/5">Description</th>
              <th className="px-6 py-4 text-right font-semibold w-1/12">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {configs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 italic">Aucune configuration définie.</td>
              </tr>
            ) : (
              configs.map(c => (
                <tr key={c.key} className="hover:bg-zinc-800/10 transition-colors duration-150 align-middle">
                  <td className="px-6 py-4 font-mono text-xs font-semibold text-zinc-300">{c.key}</td>
                  
                  {/* Inline value and description update form */}
                  <td colSpan={2} className="px-0 py-0">
                    <form action={handleUpdateConfig} className="w-full flex items-center justify-between gap-4 py-2">
                      <input type="hidden" name="key" value={c.key} />
                                         <div className="px-6 w-1/2">
                        <textarea 
                          name="value" 
                          defaultValue={c.value} 
                          rows={c.value.length > 80 || c.value.includes('\n') ? 4 : 1}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all font-mono resize-y"
                        />
                      </div>
                      
                      <div className="px-4 w-full">
                        <input 
                          type="text" 
                          name="description" 
                          defaultValue={c.description || ""} 
                          className="w-full bg-transparent border-b border-transparent hover:border-zinc-800 focus:border-zinc-700 px-2 py-1 text-xs text-zinc-400 focus:outline-none transition-all"
                          placeholder="Ajouter une description..."
                        />
                      </div>
                      
                      <div className="pr-4 flex-shrink-0">
                        <button 
                          type="submit" 
                          className="p-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-100 rounded-lg text-zinc-400 transition-colors cursor-pointer"
                          title="Enregistrer les modifications"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </form>
                  </td>
                  
                  <td className="px-6 py-4 text-right">
                    <form action={handleDeleteConfig} className="inline-block">
                      <input type="hidden" name="key" value={c.key} />
                      <button 
                        type="submit" 
                        className="p-2 bg-zinc-950 border border-zinc-800 text-red-500/80 hover:text-red-400 hover:border-red-900/50 rounded-lg transition-colors cursor-pointer"
                        title="Supprimer la configuration"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add new Config card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div>
          <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Plus className="w-5 h-5 text-zinc-400" /> Ajouter une configuration
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">Créez un nouveau Feature Flag ou une variable de configuration système.</p>
        </div>
        
        <form action={handleAddConfig} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Clé (Key)</label>
            <input 
              type="text" 
              name="key"
              placeholder="Ex: ALLOW_NEW_REGISTRATIONS" 
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none font-mono focus:ring-1 focus:ring-zinc-500 transition-all"
              required
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Valeur (Value)</label>
            <textarea 
              name="value"
              placeholder="true / false / ou texte" 
              rows={2}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none font-mono focus:ring-1 focus:ring-zinc-500 transition-all resize-y"
              required
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Description</label>
            <input 
              type="text" 
              name="description"
              placeholder="Description explicative pour l'équipe..." 
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-all"
            />
          </div>
          
          <div className="md:col-span-3 flex justify-end mt-2 pt-2 border-t border-zinc-800/40">
            <button 
              type="submit" 
              className="bg-white text-black px-6 py-2.5 rounded-xl font-bold hover:bg-zinc-200 transition-colors text-xs flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Ajouter la variable
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
