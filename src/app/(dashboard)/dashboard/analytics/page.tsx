import { BarChart3, Compass } from "lucide-react"

export default function AnalyticsPage() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Title section */}
      <div className="pb-6 border-b border-zinc-800">
        <h1 className="text-3xl font-extrabold tracking-tight font-sans text-white">Analytics</h1>
        <p className="text-zinc-400 font-sans text-sm mt-1">
          Measure content performance, conversion dynamics, and reach metrics
        </p>
      </div>

      {/* Main dashboard body */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Performance Overview */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-lg md:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-sans text-white">Audience Growth</h3>
              <p className="text-xs text-zinc-400 font-sans">Visual timeline of subscribers acquisition</p>
            </div>
          </div>
          <div className="h-64 border border-dashed border-zinc-800 bg-zinc-900/10 rounded-lg flex items-center justify-center text-zinc-500 font-mono text-xs">
            Interactive chart plotting timeline statistics will load here.
          </div>
        </div>

        {/* Traffic Sources */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-lg space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center">
              <Compass className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-sans text-white">Top Channels</h3>
              <p className="text-xs text-zinc-400 font-sans">Origin of incoming reader traffic</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
              <span className="font-sans text-xs text-zinc-300">Direct Search</span>
              <span className="font-mono text-xs font-bold text-white">42%</span>
            </div>
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
              <span className="font-sans text-xs text-zinc-300">X / Twitter</span>
              <span className="font-mono text-xs font-bold text-white">31%</span>
            </div>
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
              <span className="font-sans text-xs text-zinc-300">Substack recommendations</span>
              <span className="font-mono text-xs font-bold text-white">15%</span>
            </div>
            <div className="flex items-center justify-between pb-2">
              <span className="font-sans text-xs text-zinc-300">Other Search Engines</span>
              <span className="font-mono text-xs font-bold text-white">12%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
