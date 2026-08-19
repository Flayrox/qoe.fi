import { NodeViewWrapper } from '@tiptap/react';
import { Lock } from 'lucide-react';

export const PaywallDividerComponent = () => {
  return (
    <NodeViewWrapper className="paywall-divider-component relative py-8 my-8 select-none">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t-2 border-dashed border-highlight/50" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-card px-4 py-2 rounded-full border border-highlight/50 text-highlight text-xs font-bold tracking-wider uppercase flex items-center gap-2 shadow-lg shadow-highlight/10">
          <Lock className="w-4 h-4 text-highlight" />
          Paywall Premium — Contenu réservé aux abonnés
        </span>
      </div>
    </NodeViewWrapper>
  );
};
