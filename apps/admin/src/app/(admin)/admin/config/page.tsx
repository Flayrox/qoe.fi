import { prisma } from "@qoe/db/client"
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
    <div className="w-full max-w-5xl mx-auto space-y-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Config</h1>
        <p className="text-neutral-500 mt-2 text-sm">System & Feature Flags</p>
      </div>

      {/* Add new Config Minimal Form */}
      <div className="mb-12">
        <form action={handleAddConfig} className="flex flex-col md:flex-row items-end gap-4 border-b border-neutral-200 pb-6">
          <div className="flex-1 w-full space-y-1.5">
            <label className="text-xs font-medium text-neutral-500">Key</label>
            <input
              type="text"
              name="key"
              placeholder="ALLOW_NEW_REGISTRATIONS"
              className="w-full bg-transparent border-none px-0 py-1.5 text-base font-medium text-neutral-900 placeholder:text-neutral-300 focus:ring-0 shadow-none"
              required
            />
          </div>
          
          <div className="flex-1 w-full space-y-1.5">
            <label className="text-xs font-medium text-neutral-500">Value</label>
            <input
              type="text"
              name="value"
              placeholder="true"
              className="w-full bg-transparent border-none px-0 py-1.5 text-base font-medium text-neutral-900 placeholder:text-neutral-300 focus:ring-0 shadow-none"
              required
            />
          </div>
          
          <div className="flex-1 w-full space-y-1.5">
            <label className="text-xs font-medium text-neutral-500">Description</label>
            <input
              type="text"
              name="description"
              placeholder="Context..."
              className="w-full bg-transparent border-none px-0 py-1.5 text-base font-medium text-neutral-900 placeholder:text-neutral-300 focus:ring-0 shadow-none"
            />
          </div>
          
          <div className="shrink-0 mb-1">
            <button
              type="submit"
              className="text-sm font-medium text-neutral-900 hover:text-[#EE4B2B] transition-colors bg-neutral-100 hover:bg-neutral-200 px-3 py-1.5 rounded-lg"
            >
              Add
            </button>
          </div>
        </form>
      </div>

      {/* Feature Flags Table */}
      <div className="w-full">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-neutral-100 hover:bg-transparent">
              <th className="h-auto py-2 align-bottom text-neutral-500 font-semibold text-xs w-1/4">Key</th>
              <th className="h-auto py-2 align-bottom text-neutral-500 font-semibold text-xs w-1/4">Value</th>
              <th className="h-auto py-2 align-bottom text-neutral-500 font-semibold text-xs w-2/5">Description</th>
              <th className="h-auto py-2 align-bottom text-neutral-500 font-semibold text-xs text-right w-1/12">Actions</th>
            </tr>
          </thead>
          <tbody>
            {configs.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-16 text-center text-neutral-500 text-sm">No configuration defined.</td>
              </tr>
            ) : (
              configs.map((c: any) => (
                <tr key={c.key} className="hover:bg-neutral-50/50 border-b border-neutral-100/50 transition-colors duration-150 group">
                  <td className="py-3 font-mono text-sm text-neutral-700 align-middle">{c.key}</td>
                  
                  {/* Inline value and description update form */}
                  <td colSpan={2} className="py-3 align-middle">
                    <form action={handleUpdateConfig} className="w-full flex items-center gap-4">
                      <input type="hidden" name="key" value={c.key} />
                      <div className="w-1/2">
                        <textarea
                          name="value"
                          defaultValue={c.value}
                          rows={c.value.length > 80 || c.value.includes('\n') ? 3 : 1}
                          className="w-full bg-transparent border border-transparent px-2 py-1 text-sm text-neutral-700 focus:ring-1 focus:ring-neutral-200 resize-y shadow-none font-mono hover:bg-white hover:border-neutral-200 focus:bg-white transition-all rounded outline-none"
                        />
                      </div>
                      
                      <div className="w-full flex items-center gap-2">
                        <input
                          type="text"
                          name="description"
                          defaultValue={c.description || ""}
                          className="w-full bg-transparent border border-transparent px-2 py-1 text-sm text-neutral-600 focus:ring-1 focus:ring-neutral-200 shadow-none hover:bg-white hover:border-neutral-200 focus:bg-white transition-all rounded outline-none"
                          placeholder="Add a description..."
                        />
                        
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="submit"
                            className="text-xs font-medium text-neutral-500 hover:text-neutral-900 bg-white border border-neutral-200 shadow-sm px-2 py-1 rounded"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </form>
                  </td>
                  
                  <td className="py-3 text-right align-middle">
                    <form action={handleDeleteConfig} className="inline-block opacity-0 group-hover:opacity-100 transition-opacity">
                      <input type="hidden" name="key" value={c.key} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-neutral-500 hover:text-red-500 px-2 py-1"
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
