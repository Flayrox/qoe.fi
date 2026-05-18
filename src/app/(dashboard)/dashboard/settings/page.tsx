import { Settings } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Title section */}
      <div className="pb-6 border-b border-zinc-800">
        <h1 className="text-3xl font-extrabold tracking-tight font-sans text-white">Settings</h1>
        <p className="text-zinc-400 font-sans text-sm mt-1">
          Configure publication preferences, API connections, and domain details
        </p>
      </div>

      {/* Main dashboard body */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Navigation Sidebar */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-lg space-y-3">
          <button className="w-full text-left font-sans text-xs font-semibold bg-white text-black p-3 rounded-lg transition-colors cursor-pointer">
            General Options
          </button>
          <button className="w-full text-left font-sans text-xs font-semibold bg-zinc-900 text-zinc-350 p-3 rounded-lg border border-zinc-800/40 hover:bg-zinc-850 hover:text-white transition-colors cursor-pointer">
            Custom Domain
          </button>
          <button className="w-full text-left font-sans text-xs font-semibold bg-zinc-900 text-zinc-350 p-3 rounded-lg border border-zinc-800/40 hover:bg-zinc-850 hover:text-white transition-colors cursor-pointer">
            API Keys & Integrations
          </button>
          <button className="w-full text-left font-sans text-xs font-semibold bg-zinc-900 text-zinc-350 p-3 rounded-lg border border-zinc-800/40 hover:bg-zinc-850 hover:text-white transition-colors cursor-pointer">
            Security & Backups
          </button>
        </div>

        {/* Content Pane */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-lg md:col-span-2 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-zinc-900">
            <div className="h-10 w-10 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center">
              <Settings className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-sans text-white">General Preferences</h3>
              <p className="text-xs text-zinc-400 font-sans">Primary details representing your publication node</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-zinc-450 font-sans font-semibold">Publication Name</label>
              <input
                type="text"
                defaultValue="qoe.fi"
                className="w-full bg-zinc-900/30 border border-zinc-800 rounded-lg p-3 font-sans text-sm text-white focus:outline-none focus:border-zinc-700"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-zinc-450 font-sans font-semibold">Support Email</label>
              <input
                type="email"
                defaultValue="hello@qoe.fi"
                className="w-full bg-zinc-900/30 border border-zinc-800 rounded-lg p-3 font-sans text-sm text-white focus:outline-none focus:border-zinc-700"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
