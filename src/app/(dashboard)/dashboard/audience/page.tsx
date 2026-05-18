import { Users, Search } from "lucide-react"

export default function AudiencePage() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Title section */}
      <div className="pb-6 border-b border-zinc-800">
        <h1 className="text-3xl font-extrabold tracking-tight font-sans text-white">Audience</h1>
        <p className="text-zinc-400 font-sans text-sm mt-1">
          Nurture and grow your community of sovereign subscribers
        </p>
      </div>

      {/* Main dashboard body */}
      <div className="grid gap-6 md:grid-cols-4">
        {/* Metric Cards */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-md space-y-2">
          <span className="text-xs uppercase tracking-wider text-zinc-400 font-sans font-semibold">Subscribers</span>
          <h2 className="text-3xl font-extrabold text-white">1,240</h2>
          <span className="text-xs text-green-500 font-sans">+20.1% month-over-month</span>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-md space-y-2">
          <span className="text-xs uppercase tracking-wider text-zinc-400 font-sans font-semibold">Paid Members</span>
          <h2 className="text-3xl font-extrabold text-white">340</h2>
          <span className="text-xs text-green-500 font-sans">27.4% conversion rate</span>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-md space-y-2">
          <span className="text-xs uppercase tracking-wider text-zinc-400 font-sans font-semibold">Unsubscribes</span>
          <h2 className="text-3xl font-extrabold text-white">4</h2>
          <span className="text-xs text-zinc-500 font-sans">0.3% unsubscribe rate</span>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-md space-y-2">
          <span className="text-xs uppercase tracking-wider text-zinc-400 font-sans font-semibold">LTV</span>
          <h2 className="text-3xl font-extrabold text-white">€148.00</h2>
          <span className="text-xs text-green-500 font-sans">Average subscriber value</span>
        </div>

        {/* Audience Table Placeholder */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-md md:col-span-4 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-sans text-white">Subscribers List</h3>
                <p className="text-xs text-zinc-400 font-sans">Full inventory of active reader addresses</p>
              </div>
            </div>
            {/* Search Box */}
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search subscribers..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 font-sans text-xs text-white focus:outline-none focus:border-zinc-700 placeholder:text-zinc-650"
              />
            </div>
          </div>

          <div className="h-60 border border-dashed border-zinc-800 bg-zinc-900/10 rounded-lg flex items-center justify-center text-zinc-500 font-mono text-xs">
            Subscribers data table will load here.
          </div>
        </div>
      </div>
    </div>
  )
}
