import { NodeViewWrapper } from '@tiptap/react'
import { Lock } from 'lucide-react'

export const PaywallDividerComponent = () => {
  return (
    <NodeViewWrapper className="paywall-divider-component relative py-8 my-8 select-none">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t-2 border-dashed border-amber-500/50" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-zinc-950 px-4 py-2 rounded-full border border-amber-500/50 text-amber-500 text-sm font-bold tracking-widest uppercase flex items-center gap-2 shadow-lg shadow-amber-500/10">
          <Lock className="w-4 h-4" />
          Premium Paywall Starts Here
        </span>
      </div>
    </NodeViewWrapper>
  )
}
