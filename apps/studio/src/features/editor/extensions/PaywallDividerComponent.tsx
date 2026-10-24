import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Lock } from 'lucide-react';

/**
 * Limite Paywall dans l'éditeur.
 *
 * Version sobre : deux filets qui s'estompent vers l'extérieur et une
 * étiquette discrète au centre. Pas d'aplat coloré ni d'ombre — la ligne doit
 * se lire comme une respiration typographique, pas comme un bandeau.
 * Quand le nœud est sélectionné, une consigne très légère apparaît.
 */
export const PaywallDividerComponent = ({ selected }: NodeViewProps) => (
  <NodeViewWrapper
    className="paywall-divider-component relative my-12 select-none"
    data-selected={selected}
  >
    <div className="flex items-center gap-4" aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border/80" />
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        <Lock className="h-3 w-3 shrink-0" strokeWidth={2} />
        Réservé aux abonnés
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border/80" />
    </div>
    <p
      className="mt-3 text-center text-[11px] text-muted-foreground/70 transition-opacity duration-200 data-[visible=false]:opacity-0"
      data-visible={Boolean(selected)}
    >
      Tout ce qui suit reste masqué pour les lecteurs non abonnés.
    </p>
  </NodeViewWrapper>
);
