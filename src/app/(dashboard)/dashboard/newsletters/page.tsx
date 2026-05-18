import { Send, Award } from "lucide-react"

export default function NewslettersPage() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Title section */}
      <div className="pb-6 border-b border-zinc-800">
        <h1 className="text-3xl font-extrabold tracking-tight font-sans text-white">Newsletters</h1>
        <p className="text-zinc-400 font-sans text-sm mt-1">
          Distribute sovereign mailings directly to your reader's mailbox
        </p>
      </div>

      {/* Main dashboard body */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Campaign Status Card */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-lg md:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center">
              <Send className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-sans text-white">Active Campaigns</h3>
              <p className="text-xs text-zinc-400 font-sans">No newsletter drafts are currently scheduled for dispatch.</p>
            </div>
          </div>
          <div className="h-40 border border-dashed border-zinc-800 bg-zinc-900/10 rounded-lg flex items-center justify-center text-zinc-500 font-mono text-xs">
            Draft newsletters will appear here.
          </div>
        </div>

        {/* Deliverability Stats */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-lg space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center">
              <Award className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-sans text-white">Reputation</h3>
              <p className="text-xs text-zinc-400 font-sans">Sovereign mailer health index</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between font-mono text-xs mb-1.5 text-zinc-300">
                <span>Deliverability</span>
                <span className="font-bold text-white">99.8%</span>
              </div>
              <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800/60">
                <div className="bg-green-500 h-full rounded-full w-[99.8%]"></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between font-mono text-xs mb-1.5 text-zinc-300">
                <span>IP Health</span>
                <span className="font-bold text-white">Excellent</span>
              </div>
              <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800/60">
                <div className="bg-green-500 h-full rounded-full w-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
