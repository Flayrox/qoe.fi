import type { ReactNode } from 'react';
import { cn } from '@qoe/utils';

// =====================================================================
// ⌨️ Kbd — la touche qu'on montre, pas celle qu'on devine
// =====================================================================
// 📖 Trois écrans affichaient `⌘S`, `Ctrl+S` et `Cmd+S` dans le même
//    produit. `Kbd` ne devine pas la plateforme : il affiche ce que
//    l'appelant lui donne, et `KbdGroup` assemble une combinaison avec un
//    séparateur lisible (`+` ou `puis`).
//
// 🎯 `<kbd>` est l'élément HTML prévu pour ça — un lecteur d'écran
//    l'annonce comme une touche, ce qu'un `<span>` stylé ne fait pas.
// =====================================================================

export type KbdSize = 'xs' | 'sm';

const SIZES: Record<KbdSize, string> = {
  xs: 'h-4 min-w-4 px-1 text-[10px]',
  sm: 'h-5 min-w-5 px-1.5 text-[10.5px]',
};

export interface KbdProps {
  children: ReactNode;
  size?: KbdSize;
  /** Retire le relief quand la touche est déjà dans un bloc coloré. */
  flat?: boolean;
  className?: string;
}

export function Kbd({ children, size = 'sm', flat = false, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex select-none items-center justify-center rounded-tag border border-border/70',
        'bg-muted/60 font-mono font-medium text-muted-foreground',
        !flat && 'shadow-[inset_0_-1px_0_var(--border)]',
        SIZES[size],
        className
      )}
    >
      {children}
    </kbd>
  );
}

export interface KbdGroupProps {
  /** Les touches dans l'ordre : `['Mod', 'S']` ou `['Échap']`. */
  keys: string[];
  separator?: '+' | 'puis' | '·';
  size?: KbdSize;
  /** Nom lisible de la combinaison, si les touches seules ne suffisent pas. */
  label?: string;
  className?: string;
}

/**
 * Une combinaison de touches. Le séparateur est décoratif : il est
 * `aria-hidden`, sinon un lecteur d'écran énonce « plus » entre chaque
 * touche alors que `keys` suffit.
 */
export function KbdGroup({ keys, separator = '+', size = 'sm', label, className }: KbdGroupProps) {
  return (
    <span
      role={label ? 'group' : undefined}
      aria-label={label}
      className={cn('inline-flex items-center gap-1', className)}
    >
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 && (
            <span aria-hidden className="font-mono text-[10px] text-muted-foreground/70">
              {separator === 'puis' ? 'puis' : separator}
            </span>
          )}
          <Kbd size={size}>{key}</Kbd>
        </span>
      ))}
    </span>
  );
}
