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
    <div className="max-w-6xl mx-auto space-y-8 font-sans">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-neutral-100 border border-neutral-200/60 rounded-[28px] text-neutral-900 shadow-sm">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Feature Flags & Config</h1>
          <p className="text-neutral-500 mt-1 text-sm">Manage global behavior of the platform without redeploying.</p>
        </div>
      </div>

      {/* Feature Flags Table */}
      <div className="bg-white border border-neutral-200/60 rounded-[36px] overflow-hidden shadow-2xl">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-neutral-500 bg-neutral-50/50 border-b border-neutral-100">
            <tr>
              <th className="px-6 py-4 font-semibold w-1/4">Key</th>
              <th className="px-6 py-4 font-semibold w-1/4">Value</th>
              <th className="px-6 py-4 font-semibold w-2/5">Description</th>
              <th className="px-6 py-4 text-right font-semibold w-1/12">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {configs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-neutral-400 font-medium">No configuration defined.</td>
              </tr>
            ) : (
              configs.map(c => (
                <tr key={c.key} className="hover:bg-neutral-50/50 transition-colors duration-150 align-middle group">
                  <td className="px-6 py-4 font-mono text-xs font-semibold text-neutral-700">{c.key}</td>
                  
                  {/* Inline value and description update form */}
                  <td colSpan={2} className="px-0 py-0">
                    <form action={handleUpdateConfig} className="w-full flex items-center justify-between gap-4 py-2">
                      <input type="hidden" name="key" value={c.key} />
                      <div className="px-6 w-1/2">
                        <textarea 
                          name="value" 
                          defaultValue={c.value} 
                          rows={c.value.length > 80 || c.value.includes('\n') ? 4 : 1}
                          className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-neutral-300 focus:ring-4 focus:ring-neutral-100 transition-all font-mono resize-y shadow-sm"
                        />
                      </div>
                      
                      <div className="px-4 w-full">
                        <input 
                          type="text" 
                          name="description" 
                          defaultValue={c.description || ""} 
                          className="w-full bg-transparent border-b border-transparent hover:border-neutral-200 focus:border-neutral-300 px-2 py-1.5 text-xs text-neutral-600 focus:outline-none transition-all"
                          placeholder="Add a description..."
                        />
                      </div>
                      
                      <div className="pr-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          type="submit" 
                          className="p-2.5 bg-white border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 rounded-xl text-neutral-600 transition-all shadow-sm"
                          title="Save changes"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                      </div>
                    </form>
                  </td>
                  
                  <td className="px-6 py-4 text-right">
                    <form action={handleDeleteConfig} className="inline-block opacity-0 group-hover:opacity-100 transition-opacity">
                      <input type="hidden" name="key" value={c.key} />
                      <button 
                        type="submit" 
                        className="p-2.5 bg-white border border-red-100 text-red-500 hover:bg-red-50 rounded-xl transition-all shadow-sm"
                        title="Delete configuration"
                      >
                        <Trash2 className="w-4 h-4" />
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
      <div className="bg-white border border-neutral-200/60 rounded-[36px] p-6 shadow-2xl space-y-6">
        <div>
          <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#EE4B2B]" /> Add Configuration
          </h3>
          <p className="text-sm text-neutral-500 mt-1">Create a new Feature Flag or system configuration variable.</p>
        </div>
        
        <form action={handleAddConfig} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          <div className="space-y-2">
            <label className="text-[11px] uppercase font-bold tracking-wider text-neutral-500">Key</label>
            <input 
              type="text" 
              name="key"
              placeholder="Ex: ALLOW_NEW_REGISTRATIONS" 
              className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:border-neutral-300 focus:outline-none font-mono focus:ring-4 focus:ring-neutral-100 transition-all shadow-sm"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-[11px] uppercase font-bold tracking-wider text-neutral-500">Value</label>
            <textarea 
              name="value"
              placeholder="true / false / or text" 
              rows={1}
              className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:border-neutral-300 focus:outline-none font-mono focus:ring-4 focus:ring-neutral-100 transition-all shadow-sm resize-y"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-[11px] uppercase font-bold tracking-wider text-neutral-500">Description</label>
            <input 
              type="text" 
              name="description"
              placeholder="Description for the team..." 
              className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:border-neutral-300 focus:outline-none focus:ring-4 focus:ring-neutral-100 transition-all shadow-sm"
            />
          </div>
          
          <div className="md:col-span-3 flex justify-end mt-4 pt-6 border-t border-neutral-100">
            <button 
              type="submit" 
              className="bg-[#EE4B2B] text-white px-6 py-2.5 rounded-xl font-bold hover:bg-[#d63f22] transition-colors text-sm flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add Variable
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
