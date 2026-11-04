'use client';

import { useRef, type ReactNode } from 'react';
import { Dialog as AriaDialog, Popover as AriaPopover } from 'react-aria-components';
import { cn } from '@qoe/utils';

export interface PopoverPanelProps {
  /** Panneau ouvert. La fermeture remonte par `onClose` (Échap, clic extérieur). */
  open: boolean;
  /** Appelé quand react-aria ferme le panneau (Échap, clic extérieur, focus perdu). */
  onClose: () => void;
  /**
   * Nom accessible du panneau. Obligatoire : sans lui, le dialogue est
   * annoncé « dialogue » et le contexte de la note ou du lien est perdu.
   */
  label: string;
  /**
   * Point d'ancrage en coordonnées viewport (top / left). `null` centre le
   * panneau en haut de l'écran — le repli quand l'éditeur n'a pas su
   * mesurer la sélection.
   */
  anchor?: { top: number; left: number } | null;
  className?: string;
  children: ReactNode;
}

/**
 * Panneau flottant ancré à un point de l'écran.
 *
 * Le comportement (Échap, clic extérieur, focus déplacé dans le panneau,
 * focus rendu à l'origine, positionnement avec repli aux bords) vient de
 * react-aria : on ne le réimplémente pas. Ce qui est à nous : la peau.
 *
 * Pourquoi une ancre d'1 px plutôt qu'un `position: absolute` calculé :
 * l'éditeur connaît des coordonnées viewport, pas un élément déclencheur.
 * On pose donc une ancre invisible au point mesuré et on laisse react-aria
 * positionner le panneau — il gère alors le retournement quand le panneau
 * sortirait par le bas de la fenêtre.
 */
export function PopoverPanel({
  open,
  onClose,
  label,
  anchor,
  className,
  children,
}: PopoverPanelProps) {
  const anchorRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  return (
    <>
      <div
        ref={anchorRef}
        aria-hidden
        style={{
          position: 'fixed',
          top: anchor?.top ?? 96,
          left: anchor?.left ?? '50%',
          width: 1,
          height: 1,
          pointerEvents: 'none',
        }}
      />

      <AriaPopover
        triggerRef={anchorRef}
        isOpen={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
        placement="bottom start"
        offset={8}
        className={cn(
          'z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border/80',
          'bg-card/95 p-4 font-sans shadow-[0_20px_50px_rgba(0,0,0,0.18)] backdrop-blur-xl',
          'outline-hidden',
          className
        )}
      >
        <AriaDialog aria-label={label} className="space-y-3 outline-hidden">
          {children}
        </AriaDialog>
      </AriaPopover>
    </>
  );
}
