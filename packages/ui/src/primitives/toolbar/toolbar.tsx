'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Toolbar as AriaToolbar, type ToolbarProps } from 'react-aria-components';

import { cn } from '@qoe/utils';

// =====================================================================
// 🧰 Toolbar — barre d'outils au clavier
// =====================================================================
// 📖 Une barre d'outils n'est pas une `div` avec des boutons : react-aria
//    pose `role="toolbar"`, gère les flèches gauche/droite (une seule
//    tabulation pour entrer dans la barre, les flèches ensuite), et le
//    `aria-orientation` qui va avec.
//
// 🎯 Le regroupement visuel et le séparateur sont des slots : une barre
//    d'outils dense a besoin de respirer par groupes, pas par marges.
// =====================================================================

export interface ToolbarPrimitiveProps extends Omit<ToolbarProps, 'className'> {
  className?: string;
  children: ReactNode;
}

export function Toolbar({ className, children, ...props }: ToolbarPrimitiveProps) {
  return (
    <AriaToolbar
      {...props}
      className={cn(
        'flex flex-wrap items-center gap-1 rounded-panel border border-border bg-card p-1',
        'aria-[orientation=vertical]:flex-col',
        className
      )}
    >
      {children}
    </AriaToolbar>
  );
}

/** Séparateur vertical entre deux groupes d'actions. */
export function ToolbarSeparator({ className }: { className?: string }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      className={cn('mx-0.5 h-4 w-px shrink-0 bg-border', className)}
    />
  );
}

/** Groupe logique : la tabulation entre d'un coup dans le groupe. */
export function ToolbarGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center gap-0.5', className)}>{children}</div>;
}

// =====================================================================
// 🌫️ ScrollShadow — un bord qui dit « il y a encore du contenu »
// =====================================================================
// 📖 Une liste qui déborde sans indice laisse croire qu'elle est finie. Un
//    fondu n'est pas décoratif : c'est l'affordance du défilement.
//
// 🎯 Le fondu ne s'affiche que du côté qui cache encore du contenu, et il
//    disparaît en butée. Rien à installer : on mesure `scrollTop` et
//    `scrollHeight` au défilement et au redimensionnement.
// =====================================================================

export interface ScrollShadowProps {
  children: ReactNode;
  className?: string;
  /** Hauteur maximale avant défilement. `none` pour suivre le parent. */
  maxHeight?: string;
  orientation?: 'vertical' | 'horizontal';
}

export function ScrollShadow({
  children,
  className,
  maxHeight = '20rem',
  orientation = 'vertical',
}: ScrollShadowProps) {
  const [edges, setEdges] = useState({ start: false, end: false });
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  /** Mesure les deux bords ; appelée au défilement et au changement de taille. */
  const measure = useCallback(() => {
    if (!node) return;
    if (orientation === 'vertical') {
      setEdges({
        start: node.scrollTop > 1,
        end: node.scrollTop + node.clientHeight < node.scrollHeight - 1,
      });
    } else {
      setEdges({
        start: node.scrollLeft > 1,
        end: node.scrollLeft + node.clientWidth < node.scrollWidth - 1,
      });
    }
  }, [node, orientation]);

  // Le contenu peut changer de hauteur sans que la fenêtre bouge : sans
  // ResizeObserver, un fondu resterait affiché après l'ajout d'un item.
  useEffect(() => {
    measure();
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, measure]);

  const vertical = orientation === 'vertical';

  return (
    <div className={cn('relative', className)}>
      <div
        ref={setNode}
        onScroll={measure}
        style={{ maxHeight: maxHeight === 'none' ? undefined : maxHeight }}
        className={cn('overflow-auto overscroll-contain', vertical ? 'pr-0.5' : 'pb-0.5')}
      >
        {children}
      </div>

      {/* Les fondus sont posés sur le conteneur, pas dans le flux : ils ne
          décalent pas le contenu quand ils apparaissent. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-card to-transparent transition-opacity duration-150',
          vertical && edges.start ? 'opacity-100' : 'opacity-0',
          !vertical && 'hidden'
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card to-transparent transition-opacity duration-150',
          vertical && edges.end ? 'opacity-100' : 'opacity-0',
          !vertical && 'hidden'
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-card to-transparent transition-opacity duration-150',
          !vertical && edges.start ? 'opacity-100' : 'opacity-0',
          vertical && 'hidden'
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-card to-transparent transition-opacity duration-150',
          !vertical && edges.end ? 'opacity-100' : 'opacity-0',
          vertical && 'hidden'
        )}
      />
    </div>
  );
}
